import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import SearchableSelect from '../components/ui/SearchableSelect';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';

const toInputDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toMonthValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const parseItemTokens = (value) => {
  if (!value) return [];
  return String(value)
    .split(/[\n,]/)
    .map((token) => token.trim())
    .filter(Boolean);
};

const normalizeAmountBasis = (value) => (String(value || '').toLowerCase() === 'post_tax' ? 'post_tax' : 'pre_tax');

export default function BulkSales() {
  const navigate = useNavigate();
  const [parties, setParties] = useState([]);
  const [items, setItems] = useState([]);
  const [partyId, setPartyId] = useState('');
  const [selectedPartyIds, setSelectedPartyIds] = useState(new Set());
  const [partySearch, setPartySearch] = useState('');
  const [mode, setMode] = useState('range');
  const [amountBasisDefault, setAmountBasisDefault] = useState('post_tax');
  const [includeText, setIncludeText] = useState('');
  const [excludeText, setExcludeText] = useState('');

  // --- Range mode state ---
  const [rangeMonth, setRangeMonth] = useState(toMonthValue(new Date()));
  const [invoiceStart, setInvoiceStart] = useState('');
  const [invoiceEnd, setInvoiceEnd] = useState('');
  const [targetTotal, setTargetTotal] = useState('');
  const [rangeNotes, setRangeNotes] = useState('');

  // --- Manual mode state ---
  const [invoices, setInvoices] = useState([
    { date: toInputDate(new Date()), invoice_no: '', total_amount: '', amount_basis: 'post_tax', notes: '' }
  ]);

  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [partyData, itemData] = await Promise.all([
        window.vyapar.listParties(),
        window.vyapar.listItems()
      ]);
      setParties(partyData);
      setItems(itemData);
    };
    load();
  }, []);

  const partyOptions = useMemo(
    () => parties.map((party) => ({ value: String(party.id), label: party.name })),
    [parties]
  );

  const itemIndex = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    items.forEach((item) => {
      const id = Number(item.id);
      if (Number.isFinite(id)) byId.set(String(id), item);
      if (item.name) byName.set(String(item.name).toLowerCase().trim(), item);
    });
    return { byId, byName };
  }, [items]);

  const resolveItems = (text) => {
    const tokens = parseItemTokens(text);
    const ids = [];
    tokens.forEach((token) => {
      const direct = itemIndex.byId.get(token);
      if (direct) {
        ids.push(Number(direct.id));
        return;
      }
      const byName = itemIndex.byName.get(token.toLowerCase());
      if (byName) ids.push(Number(byName.id));
    });
    return Array.from(new Set(ids)).filter((id) => Number.isFinite(id));
  };

  const includeIds = useMemo(() => resolveItems(includeText), [includeText, itemIndex]);
  const excludeIds = useMemo(() => resolveItems(excludeText), [excludeText, itemIndex]);

  const updateInvoice = (index, field, value) => {
    setInvoices((prev) =>
      prev.map((invoice, idx) => (idx === index ? { ...invoice, [field]: value } : invoice))
    );
  };

  const addInvoice = () => {
    setInvoices((prev) => [
      ...prev,
      { date: toInputDate(new Date()), invoice_no: '', total_amount: '', amount_basis: amountBasisDefault, notes: '' }
    ]);
  };

  const removeInvoice = (index) => {
    setInvoices((prev) => prev.filter((_, idx) => idx !== index));
  };

  const rangeCount = useMemo(() => {
    const start = Number(invoiceStart);
    const end = Number(invoiceEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
    return end - start + 1;
  }, [invoiceStart, invoiceEnd]);

  const toggleParty = (id) => {
    setSelectedPartyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredPartyOptions = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    if (!q) return partyOptions;
    return partyOptions.filter((option) => option.label.toLowerCase().includes(q));
  }, [partyOptions, partySearch]);

  const partyNameById = useMemo(() => {
    const map = new Map();
    parties.forEach((party) => map.set(String(party.id), party.name));
    return map;
  }, [parties]);

  const submit = async () => {
    setError('');
    setResult(null);

    let payload;

    if (mode === 'range') {
      if (!selectedPartyIds.size) {
        setError('Select at least one party.');
        return;
      }
      if (!rangeMonth) {
        setError('Select a month.');
        return;
      }
      if (!invoiceStart || !invoiceEnd) {
        setError('Enter a valid invoice number range.');
        return;
      }
      const start = Number(invoiceStart);
      const end = Number(invoiceEnd);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        setError('Invoice End must be >= Invoice Start.');
        return;
      }
      if (end - start + 1 > 500) {
        setError('Range too large. Maximum 500 invoices at a time.');
        return;
      }
      payload = {
        party_ids: Array.from(selectedPartyIds).map(Number),
        month: rangeMonth,
        invoice_start: start,
        invoice_end: end,
        target_total: Number(targetTotal || 0),
        amount_basis: normalizeAmountBasis(amountBasisDefault),
        notes: rangeNotes,
        items_include: includeIds,
        items_exclude: excludeIds
      };
    } else {
      if (!partyId) {
        setError('Select a party before generating invoices.');
        return;
      }
      if (!invoices.length) {
        setError('Add at least one invoice.');
        return;
      }
      payload = {
        party_id: Number(partyId),
        amount_basis: normalizeAmountBasis(amountBasisDefault),
        invoices: invoices.map((invoice) => ({
          date: invoice.date,
          invoice_no: String(invoice.invoice_no || '').trim(),
          total_amount: Number(invoice.total_amount || 0),
          amount_basis: normalizeAmountBasis(invoice.amount_basis || amountBasisDefault),
          notes: String(invoice.notes || '').trim()
        })),
        items_include: includeIds,
        items_exclude: excludeIds
      };
    }

    try {
      setSubmitting(true);
      const res = await window.vyapar.bulkGenerateSalesOrders(payload);
      setResult(res);
    } catch (err) {
      setError(err?.message || 'Failed to generate invoices.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title text-3xl font-semibold">Bulk Sales Orders</h2>
          <p className="text-sm text-muted">Generate sales invoices using purchase availability and FIFO batches.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/sales')}>
            Back to Sales
          </Button>
        </div>
      </div>

      <Card>
        <CardContent>
          <div className="mb-4 flex items-center gap-4">
            <Label className="text-sm font-medium">Mode:</Label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="bulk-mode"
                value="range"
                checked={mode === 'range'}
                onChange={() => setMode('range')}
              />
              Monthly Range
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="bulk-mode"
                value="manual"
                checked={mode === 'manual'}
                onChange={() => setMode('manual')}
              />
              Manual Invoices
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {mode === 'range' ? (
              <div className="md:col-span-2">
                <Label>Parties ({selectedPartyIds.size} selected)</Label>
                <input
                  className="mb-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accentSoft"
                  value={partySearch}
                  onChange={(event) => setPartySearch(event.target.value)}
                  placeholder="Search parties..."
                />
                <div className="max-h-40 overflow-auto rounded-lg border border-border bg-white p-2">
                  {filteredPartyOptions.length ? (
                    filteredPartyOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accentSoft"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPartyIds.has(option.value)}
                          onChange={() => toggleParty(option.value)}
                        />
                        {option.label}
                      </label>
                    ))
                  ) : (
                    <p className="px-2 py-1.5 text-sm text-muted">No matches</p>
                  )}
                </div>
                {selectedPartyIds.size > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Array.from(selectedPartyIds).map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full bg-accentSoft px-2 py-0.5 text-xs"
                      >
                        {partyNameById.get(id) || id}
                        <button
                          type="button"
                          className="ml-0.5 text-xs text-muted hover:text-foreground"
                          onClick={() => toggleParty(id)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <Label>Party</Label>
                <SearchableSelect
                  value={partyId}
                  options={partyOptions}
                  onChange={setPartyId}
                  placeholder="Select party"
                />
              </div>
            )}
            <div>
              <Label>Amount Basis</Label>
              <select
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={amountBasisDefault}
                onChange={(event) => setAmountBasisDefault(event.target.value)}
              >
                <option value="pre_tax">Pre-tax</option>
                <option value="post_tax">Post-tax (incl. GST)</option>
              </select>
            </div>

            {mode === 'range' && (
              <>
                <div>
                  <Label>Month</Label>
                  <Input
                    type="month"
                    value={rangeMonth}
                    onChange={(event) => setRangeMonth(event.target.value)}
                  />
                </div>
                <div>
                  <Label>
                    Target Total (sum of all invoices)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={targetTotal}
                    onChange={(event) => setTargetTotal(event.target.value)}
                    placeholder="e.g. 50000"
                  />
                </div>
                <div>
                  <Label>Invoice Start</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={invoiceStart}
                    onChange={(event) => setInvoiceStart(event.target.value)}
                    placeholder="e.g. 1000"
                  />
                </div>
                <div>
                  <Label>Invoice End</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={invoiceEnd}
                    onChange={(event) => setInvoiceEnd(event.target.value)}
                    placeholder="e.g. 1020"
                  />
                  {rangeCount > 0 && (
                    <p className="mt-1 text-xs text-muted">{rangeCount} invoice(s) in range</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <Label>Notes (applied to all invoices)</Label>
                  <Input
                    value={rangeNotes}
                    onChange={(event) => setRangeNotes(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </>
            )}

            <div>
              <Label>Items Include (comma or new line)</Label>
              <textarea
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                rows={3}
                value={includeText}
                onChange={(event) => setIncludeText(event.target.value)}
                placeholder="Item ids or names"
              />
              <p className="mt-1 text-xs text-muted">Matched: {includeIds.length} items</p>
            </div>
            <div>
              <Label>Items Exclude (comma or new line)</Label>
              <textarea
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                rows={3}
                value={excludeText}
                onChange={(event) => setExcludeText(event.target.value)}
                placeholder="Item ids or names"
              />
              <p className="mt-1 text-xs text-muted">Matched: {excludeIds.length} items</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {mode === 'manual' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Invoices</CardTitle>
              <Button type="button" variant="outline" onClick={addInvoice}>
                + Add Invoice
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Invoice No</TH>
                  <TH>Total Amount</TH>
                  <TH>Amount Basis</TH>
                  <TH>Notes</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {invoices.map((invoice, index) => (
                  <TR key={`${invoice.date}-${index}`}>
                    <TD>
                      <Input
                        type="date"
                        value={invoice.date}
                        onChange={(event) => updateInvoice(index, 'date', event.target.value)}
                      />
                    </TD>
                    <TD>
                      <Input
                        value={invoice.invoice_no}
                        onChange={(event) => updateInvoice(index, 'invoice_no', event.target.value)}
                        placeholder="Auto"
                      />
                    </TD>
                    <TD>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={invoice.total_amount}
                        onChange={(event) => updateInvoice(index, 'total_amount', event.target.value)}
                        placeholder="Optional"
                      />
                    </TD>
                    <TD>
                      <select
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                        value={invoice.amount_basis || amountBasisDefault}
                        onChange={(event) => updateInvoice(index, 'amount_basis', event.target.value)}
                      >
                        <option value="pre_tax">Pre-tax</option>
                        <option value="post_tax">Post-tax</option>
                      </select>
                    </TD>
                    <TD>
                      <Input
                        value={invoice.notes || ''}
                        onChange={(event) => updateInvoice(index, 'notes', event.target.value)}
                        placeholder="Optional"
                      />
                    </TD>
                    <TD>
                      {invoices.length > 1 && (
                        <Button type="button" variant="ghost" onClick={() => removeInvoice(index)}>
                          Remove
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent>
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Generation Result</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted">
              Created {result.created?.length || 0} invoice(s).
              {result.skipped?.length > 0 && ` Skipped ${result.skipped.length} (already exist).`}
              {' '}Warnings: {result.warnings?.length || 0}.
            </p>
            {!!result.skipped?.length && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-amber-700">
                  {result.skipped.length} skipped invoice number(s)
                </summary>
                <p className="mt-1 text-xs text-muted">
                  {result.skipped.join(', ')}
                </p>
              </details>
            )}
            {!!result.created?.length && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {result.created.map((row, idx) => (
                  <li key={`${row.id || idx}`}>
                    {row.invoice_no || row.id} on {row.date}
                    {row.party_id ? ` — ${partyNameById.get(String(row.party_id)) || `Party #${row.party_id}`}` : ''}
                    {' '}with {row.items_count} items
                    {Number.isFinite(Number(row.amount)) ? ` — Amount: ${Number(row.amount).toFixed(2)} (${row.amount_basis || 'post_tax'})` : ''}
                  </li>
                ))}
              </ul>
            )}
            {!!result.warnings?.length && (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-700">
                {result.warnings.map((warn, idx) => (
                  <li key={`${warn.invoice_no || 'inv'}-${idx}`}>
                    {warn.invoice_no || 'Invoice'} ({warn.date || '—'}): {warn.message}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate('/sales')}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitting}>
          {submitting ? 'Generating...' : 'Generate Orders'}
        </Button>
      </div>
    </div>
  );
}
