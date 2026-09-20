import React, { useEffect, useMemo, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import SearchableSelect from '../components/ui/SearchableSelect';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import InvoicePrint from '../components/InvoicePrint';
import invoicePrintCss from '../invoice-print.css?inline';

const normalizeDateForCompare = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);
  const slashMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) return new Date(`${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}T00:00:00`);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatCurrency = (value) => `₹ ${Number(value || 0).toFixed(2)}`;

const firstWord = (value) => {
  const name = String(value || '').trim();
  return name ? name.split(/\s+/)[0] : '';
};

// party-first-word + date + invoice-no; sanitized further in the main process.
const buildInvoiceFileName = (order) => {
  const parts = [
    firstWord(order.party_name),
    String(order.order_date || '').slice(0, 10),
    String(order.ref_number || order.id || '')
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : `Invoice ${order.id}`;
};

export default function ExportInvoices({ forcedOrderType = 'sale' }) {
  const [parties, setParties] = useState([]);
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [company, setCompany] = useState(null);
  const [filters, setFilters] = useState({ order_date_from: '', order_date_to: '', party_id: '' });
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [partyData, orderData, itemData, companyData] = await Promise.all([
        window.vyapar.listParties(),
        window.vyapar.listOrders(),
        window.vyapar.listItems(),
        window.vyapar.listCompanies()
      ]);
      setParties(partyData || []);
      setOrders(orderData || []);
      setItems(itemData || []);
      setCompany((companyData && companyData[0]) || null);
    })();
  }, []);

  const partiesMap = useMemo(() => {
    const map = new Map();
    parties.forEach((party) => map.set(String(party.id), party));
    return map;
  }, [parties]);

  const itemMap = useMemo(() => {
    const map = new Map();
    items.forEach((item) => map.set(String(item.id), item));
    return map;
  }, [items]);

  const partyOptions = useMemo(
    () => [{ value: '', label: 'All parties' }, ...parties.map((p) => ({ value: String(p.id), label: p.name }))],
    [parties]
  );

  const updateFilter = (field) => (value) => {
    const next = value && value.target ? value.target.value : value;
    setFilters((prev) => ({ ...prev, [field]: String(next ?? '') }));
  };

  const filteredOrders = useMemo(() => {
    const from = filters.order_date_from ? normalizeDateForCompare(filters.order_date_from) : null;
    const to = filters.order_date_to ? normalizeDateForCompare(filters.order_date_to) : null;
    return orders
      .filter((order) => order.order_type === forcedOrderType)
      .filter((order) => {
        if (filters.party_id && String(order.party_id || '') !== String(filters.party_id)) return false;
        const orderDate = normalizeDateForCompare(order.order_date);
        if (from && (!orderDate || orderDate < from)) return false;
        if (to && (!orderDate || orderDate > to)) return false;
        return true;
      });
  }, [orders, filters, forcedOrderType]);

  const allVisibleSelected =
    filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(o.id));

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredOrders.forEach((o) => next.delete(o.id));
      } else {
        filteredOrders.forEach((o) => next.add(o.id));
      }
      return next;
    });
  };

  const buildMarkupForOrder = async (summaryOrder) => {
    const [order, lines] = await Promise.all([
      window.vyapar.getOrder(summaryOrder.id),
      window.vyapar.listOrderItems(summaryOrder.id)
    ]);
    const party = order?.party_id ? partiesMap.get(String(order.party_id)) || null : null;
    const orderItems = (lines || []).map((line) => ({
      item_id: line.item_id,
      hsn: line.hsn || itemMap.get(String(line.item_id))?.hsn || '',
      qty: Number(line.qty || 0),
      rate: Number(line.rate || 0),
      gst_rate: Number(line.gst_rate || 0),
      batch_no: line.batch_no || '',
      expiry_date: line.expiry_date || '',
      mrp: line.mrp,
      unit: line.unit || ''
    }));
    const totals = orderItems.reduce(
      (acc, line) => {
        const amount = line.qty * line.rate;
        const gstAmount = amount * (line.gst_rate / 100);
        acc.itemsTotal += amount;
        acc.gstTotal += gstAmount;
        acc.invoiceTotal += amount + gstAmount;
        return acc;
      },
      { itemsTotal: 0, gstTotal: 0, invoiceTotal: 0 }
    );
    const orderForPrint = { ...order, invoice_no: order?.ref_number || summaryOrder.ref_number || '' };
    const markup = renderToStaticMarkup(
      <InvoicePrint
        company={company}
        party={party}
        order={orderForPrint}
        orderItems={orderItems}
        totals={totals}
        itemMap={itemMap}
      />
    );
    return { filename: buildInvoiceFileName({ ...summaryOrder, ...order }), markup };
  };

  const runExport = async () => {
    setError('');
    setResult(null);
    const selected = filteredOrders.filter((o) => selectedIds.has(o.id));
    if (!selected.length) {
      setError('Select at least one invoice to export.');
      return;
    }
    let folder = null;
    try {
      folder = await window.vyapar.chooseExportFolder();
    } catch (err) {
      setError(err?.message || 'Could not open folder picker.');
      return;
    }
    if (!folder) return; // user cancelled
    setExporting(true);
    try {
      const invoices = [];
      for (const summaryOrder of selected) {
        // eslint-disable-next-line no-await-in-loop
        invoices.push(await buildMarkupForOrder(summaryOrder));
      }
      const res = await window.vyapar.exportInvoicesPdf({
        folder,
        css: invoicePrintCss,
        invoices
      });
      setResult(res);
    } catch (err) {
      setError(err?.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const selectedCount = filteredOrders.filter((o) => selectedIds.has(o.id)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title text-3xl font-semibold">Export Invoices to PDF</h2>
        <Button type="button" onClick={runExport} disabled={exporting || selectedCount === 0}>
          {exporting ? 'Exporting…' : `Export ${selectedCount || ''} to Folder`}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label>From Date</Label>
              <Input type="date" value={filters.order_date_from} onChange={updateFilter('order_date_from')} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={filters.order_date_to} onChange={updateFilter('order_date_to')} />
            </div>
            <div>
              <Label>Party</Label>
              <SearchableSelect
                value={filters.party_id}
                options={partyOptions}
                onChange={updateFilter('party_id')}
                placeholder="All parties"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
          <p className="font-semibold">
            Exported {result.saved?.length || 0} of {result.total} invoice(s) to {result.folder}
          </p>
          {result.failed?.length > 0 && (
            <div className="mt-1 text-red-600">
              {result.failed.length} failed:
              <ul className="ml-4 list-disc">
                {result.failed.map((f, i) => (
                  <li key={i}>
                    {f.filename}: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Invoices ({filteredOrders.length}) — {selectedCount} selected
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[640px]">
              <THead>
                <TR>
                  <TH>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      aria-label="Select all"
                    />
                  </TH>
                  <TH>Invoice No</TH>
                  <TH>Date</TH>
                  <TH>Party</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {filteredOrders.map((order) => (
                  <TR key={order.id}>
                    <TD>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(order.id)}
                        onChange={() => toggleOne(order.id)}
                        aria-label={`Select invoice ${order.ref_number || order.id}`}
                      />
                    </TD>
                    <TD>{order.ref_number || order.id}</TD>
                    <TD>{String(order.order_date || '').slice(0, 10)}</TD>
                    <TD>{order.party_name || partiesMap.get(String(order.party_id))?.name || '—'}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(order.header_total)}</TD>
                  </TR>
                ))}
                {!filteredOrders.length && (
                  <TR>
                    <TD colSpan={5} className="text-center text-muted">
                      No invoices match the selected filters.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
