import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import SearchableSelect from '../components/ui/SearchableSelect';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import InvoicePrint from '../components/InvoicePrint';
import '../invoice-print.css';
import invoicePrintCss from '../invoice-print.css?inline';

const emptyLine = {
  item_id: '',
  hsn: '',
  unit_id: null,
  unit: '',
  batch_no: '',
  expiry_date: '',
  mrp: '',
  gst_rate: '',
  qty: '',
  rate: ''
};

const toInputDate = (value) => {
  if (!value) return '';
  const raw = String(value).trim();

  // Handles values like YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, YYYY-MM-DDTHH:mm:ss
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // Handles values like DD/MM/YYYY
  const slashMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;

  return '';
};

export default function OrderEdit() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const isEditMode = Boolean(orderId);
  const [loading, setLoading] = useState(true);
  const [orderType, setOrderType] = useState('sale');
  const [partyId, setPartyId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [balanceAmount, setBalanceAmount] = useState('0');
  const [useWholeAmountAsBalance, setUseWholeAmountAsBalance] = useState(false);
  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [parties, setParties] = useState([]);
  const [taxCodes, setTaxCodes] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [lineForm, setLineForm] = useState(emptyLine);
  const [company, setCompany] = useState(null);

  const load = async () => {
    setLoading(true);
    const baseRequests = [
      window.vyapar.listItems(),
      window.vyapar.listUnits(),
      window.vyapar.listParties(),
      window.vyapar.listTaxCodes(),
      window.vyapar.listCompanies()
    ];
    const editRequests = isEditMode
      ? [window.vyapar.getOrder(orderId), window.vyapar.listOrderItems(orderId)]
      : [];
    const [itemData, unitData, partyData, taxCodeData, companyData, order, lines] = await Promise.all([
      ...baseRequests,
      ...editRequests
    ]);
    setItems(itemData);
    setUnits(unitData || []);
    setParties(partyData);
    setTaxCodes(taxCodeData || []);
    setCompany(companyData?.[0] || null);
    if (!isEditMode) {
      setPlaceOfSupply('');
      setLoading(false);
      return;
    }
    if (!order) {
      setLoading(false);
      return;
    }
    setOrderType(order.order_type || 'sale');
    setPartyId(order.party_id ? String(order.party_id) : '');
    setInvoiceNo(order.ref_number || '');
    const matchedParty = partyData.find((party) => String(party.id) === String(order.party_id));
    setPlaceOfSupply(order.place_of_supply || matchedParty?.state_of_supply || '');
    setOrderDate(toInputDate(order.order_date));
    setNotes(order.notes || '');
    setBalanceAmount(String(Number(order.balance_amount || 0)));
    setOrderItems(
      (lines || []).map((line) => ({
        item_id: String(line.item_id),
        hsn: itemData.find((item) => String(item.id) === String(line.item_id))?.hsn || '',
        unit_id:
          line.unit_id ??
          itemData.find((item) => String(item.id) === String(line.item_id))?.base_unit_id ??
          null,
        unit:
          line.unit ||
          itemData.find((item) => String(item.id) === String(line.item_id))?.base_unit ||
          '',
        batch_no: line.batch_no || '',
        expiry_date: line.expiry_date || '',
        mrp: line.mrp ?? '',
        qty: Number(line.qty || 0),
        rate: Number(line.rate || 0),
        gst_rate: Number(line.gst_rate || 0),
        line_total: Number(line.line_total || 0)
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [orderId]);

  const itemMap = useMemo(() => {
    const map = new Map();
    items.forEach((item) => map.set(String(item.id), item));
    return map;
  }, [items]);

  const unitMap = useMemo(() => {
    const map = new Map();
    units.forEach((unit) =>
      map.set(
        String(unit.id),
        unit.short_name || unit.name || `Unit ${unit.id}`
      )
    );
    return map;
  }, [units]);

  const gstRates = useMemo(() => {
    const rates = new Set([0]);
    taxCodes.forEach((tax) => rates.add(Number(tax.rate || 0)));
    items.forEach((item) => rates.add(Number(item.gst_rate || 0)));
    orderItems.forEach((line) => rates.add(Number(line.gst_rate || 0)));
    rates.add(Number(lineForm.gst_rate || 0));
    return [...rates].filter((rate) => !Number.isNaN(rate)).sort((a, b) => a - b);
  }, [taxCodes, items, orderItems, lineForm.gst_rate]);

  const gstLabelByRate = useMemo(() => {
    const map = new Map();
    taxCodes.forEach((tax) => {
      const rate = Number(tax.rate || 0);
      if (!Number.isNaN(rate) && tax.name) map.set(rate, tax.name);
    });
    return map;
  }, [taxCodes]);

  const updateLineForm = (field) => (event) => {
    const value =
      event && typeof event === 'object' && event.target ? event.target.value : String(event ?? '');
    if (field === 'item_id') {
      const item = itemMap.get(value);
      const nextUnitId = item?.base_unit_id ?? null;
      setLineForm((prev) => ({
        ...prev,
        item_id: value,
        hsn: item ? item.hsn || '' : '',
        unit_id: nextUnitId,
        unit: nextUnitId !== null ? unitMap.get(String(nextUnitId)) || item?.base_unit || '' : '',
        gst_rate: item ? item.gst_rate : '',
        rate: item ? item.base_rate : ''
      }));
      return;
    }
    if (field === 'unit_id') {
      setLineForm((prev) => ({
        ...prev,
        unit_id: value ? Number(value) : null,
        unit: value ? unitMap.get(String(value)) || '' : ''
      }));
      return;
    }
    setLineForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateParty = (nextPartyId) => {
    const value = String(nextPartyId ?? '');
    setPartyId(value);
    const matchedParty = parties.find((party) => String(party.id) === value);
    if (matchedParty?.state_of_supply) {
      setPlaceOfSupply(matchedParty.state_of_supply);
    } else if (!value) {
      setPlaceOfSupply('');
    }
  };

  const addLine = () => {
    if (!lineForm.item_id || !lineForm.qty) return;
    const qty = Number(lineForm.qty || 0);
    const rate = Number(lineForm.rate || 0);
    const gst = Number(lineForm.gst_rate || itemMap.get(lineForm.item_id)?.gst_rate || 0);
    const line_total = qty * rate;
    setOrderItems((prev) => [
      ...prev,
      {
        item_id: String(lineForm.item_id),
        hsn: lineForm.hsn || itemMap.get(lineForm.item_id)?.hsn || '',
        unit_id: lineForm.unit_id ?? itemMap.get(lineForm.item_id)?.base_unit_id ?? null,
        unit: lineForm.unit || itemMap.get(lineForm.item_id)?.base_unit || '',
        batch_no: lineForm.batch_no || '',
        expiry_date: lineForm.expiry_date || '',
        mrp: lineForm.mrp,
        qty,
        rate,
        gst_rate: gst,
        line_total
      }
    ]);
    setLineForm(emptyLine);
  };

  const updateExistingLine = (index, field) => (event) => {
    const value =
      event && typeof event === 'object' && event.target ? event.target.value : String(event ?? '');
    setOrderItems((prev) => {
      const next = [...prev];
      const line = { ...next[index], [field]: value };
      if (field === 'unit_id') {
        line.unit_id = value ? Number(value) : null;
        line.unit = value ? unitMap.get(String(value)) || '' : '';
      }
      const qty = Number(line.qty || 0);
      const rate = Number(line.rate || 0);
      line.line_total = qty * rate;
      next[index] = line;
      return next;
    });
  };

  const removeLine = (index) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const saveOrder = async () => {
    if (!orderItems.length) return;
    const payload = {
      order_type: orderType,
      party_id: partyId ? Number(partyId) : null,
      order_date: orderDate,
      invoice_no: invoiceNo,
      notes,
      place_of_supply: placeOfSupply,
      balance_amount: Number.isFinite(Number(balanceAmount)) ? Number(balanceAmount) : 0,
      items: orderItems.map((line) => ({
        item_id: Number(line.item_id),
        unit_id:
          line.unit_id !== undefined && line.unit_id !== null
            ? Number(line.unit_id)
            : itemMap.get(String(line.item_id))?.base_unit_id ?? null,
        batch_no: line.batch_no || '',
        expiry_date: line.expiry_date || '',
        mrp: line.mrp,
        gst_rate: Number(line.gst_rate || 0),
        qty: Number(line.qty || 0),
        rate: Number(line.rate || 0)
      }))
    };
    if (isEditMode) {
      await window.vyapar.updateOrder(orderId, payload);
    } else {
      await window.vyapar.createOrder(payload);
    }
    navigate('/orders');
  };

  const totals = useMemo(() => {
    return orderItems.reduce(
      (acc, line) => {
        const qty = Number(line.qty || 0);
        const rate = Number(line.rate || 0);
        const gstRate = Number(line.gst_rate || 0);
        const amount = qty * rate;
        const gstAmount = amount * (gstRate / 100);
        acc.itemsTotal += amount;
        acc.gstTotal += gstAmount;
        acc.invoiceTotal += amount + gstAmount;
        return acc;
      },
      { itemsTotal: 0, gstTotal: 0, invoiceTotal: 0 }
    );
  }, [orderItems]);

  useEffect(() => {
    if (useWholeAmountAsBalance) {
      setBalanceAmount(totals.invoiceTotal.toFixed(2));
    }
  }, [useWholeAmountAsBalance, totals.invoiceTotal]);

  const numericBalanceAmount = Number.isFinite(Number(balanceAmount)) ? Number(balanceAmount) : 0;
  const remainingBalance = Math.max(totals.invoiceTotal - numericBalanceAmount, 0);

  const orderTypeOptions = useMemo(
    () => [
      { value: 'sale', label: 'Sale' },
      { value: 'purchase', label: 'Purchase' }
    ],
    []
  );

  const partyOptions = useMemo(
    () => parties.map((party) => ({ value: String(party.id), label: party.name })),
    [parties]
  );

  const placeOfSupplyOptions = useMemo(() => {
    const unique = new Set();
    parties.forEach((party) => {
      if (party.state_of_supply) unique.add(String(party.state_of_supply));
    });
    return [...unique].sort().map((state) => ({ value: state, label: state }));
  }, [parties]);

  const itemOptions = useMemo(
    () => items.map((item) => ({ value: String(item.id), label: item.name })),
    [items]
  );

  const unitOptions = useMemo(
    () =>
      units.map((unit) => ({
        value: String(unit.id),
        label: unit.short_name || unit.name || `Unit ${unit.id}`
      })),
    [units]
  );

  const gstOptions = useMemo(
    () =>
      gstRates.map((rate) => ({
        value: String(rate),
        label: gstLabelByRate.get(rate) || `${rate}%`
      })),
    [gstRates, gstLabelByRate]
  );

  const selectedParty = useMemo(
    () => parties.find((p) => String(p.id) === partyId) || null,
    [parties, partyId]
  );

  const previewInChrome = async () => {
    const markup = document.querySelector('.invoice-print-wrapper')?.outerHTML || '';
    if (!markup) return;
    try {
      await window.vyapar.previewInvoiceInChrome({
        markup,
        css: invoicePrintCss
      });
    } catch (error) {
      window.alert(error?.message || 'Could not open preview in Chrome.');
    }
  };

  if (loading) {
    return <p className="text-sm text-muted">Loading order...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title text-3xl font-semibold">
            {isEditMode ? `Edit Order #${orderId}` : 'Create Order'}
          </h2>
          <p className="text-muted">
            {isEditMode ? 'Update header details and line items.' : 'Add header details and line items.'}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => navigate('/orders')}>
          Back to Orders
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label>Order Type</Label>
              <SearchableSelect
                value={orderType}
                options={orderTypeOptions}
                onChange={(nextValue) => setOrderType(String(nextValue))}
                placeholder="Search order type"
              />
            </div>
            <div>
              <Label>Party</Label>
              <SearchableSelect
                value={partyId}
                options={partyOptions}
                onChange={updateParty}
                placeholder="Search party"
              />
            </div>
            <div>
              <Label>Order Date</Label>
              <Input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} />
            </div>
            <div>
              <Label>Invoice No</Label>
              <Input
                value={invoiceNo}
                onChange={(event) => setInvoiceNo(event.target.value)}
                placeholder="e.g. 1540"
              />
            </div>
            <div>
              <Label>State Of Supply</Label>
              <SearchableSelect
                value={placeOfSupply}
                options={placeOfSupplyOptions}
                onChange={(nextValue) => setPlaceOfSupply(String(nextValue ?? ''))}
                placeholder="Search state"
              />
            </div>
            <div className="md:col-span-3">
              <Label>Notes</Label>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" />
            </div>
            <div className="md:col-span-3">
              <Label>Balance Amount</Label>
              <Input
                value={balanceAmount}
                onChange={(event) => {
                  setBalanceAmount(event.target.value);
                  setUseWholeAmountAsBalance(false);
                }}
                placeholder="0.00"
              />
              <label className="mt-2 flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={useWholeAmountAsBalance}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setUseWholeAmountAsBalance(checked);
                    if (checked) setBalanceAmount(totals.invoiceTotal.toFixed(2));
                  }}
                />
                Use whole invoice amount
              </label>
              <p className="mt-1 text-xs text-muted">
                Remaining Balance: {remainingBalance.toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-11">
            <div className="md:col-span-2">
              <Label>Item</Label>
              <SearchableSelect
                value={lineForm.item_id}
                options={itemOptions}
                onChange={updateLineForm('item_id')}
                placeholder="Search item"
              />
            </div>
            <div>
              <Label>HSN</Label>
              <Input value={lineForm.hsn || ''} readOnly placeholder="Auto" />
            </div>
            <div>
              <Label>Batch</Label>
              <Input value={lineForm.batch_no} onChange={updateLineForm('batch_no')} placeholder="BATCH-01" />
            </div>
            <div>
              <Label>Expiry</Label>
              <Input value={lineForm.expiry_date} onChange={updateLineForm('expiry_date')} placeholder="2026-12" />
            </div>
            <div>
              <Label>MRP</Label>
              <Input value={lineForm.mrp} onChange={updateLineForm('mrp')} placeholder="150" />
            </div>
            <div>
              <Label>GST %</Label>
              <SearchableSelect
                value={lineForm.gst_rate}
                options={gstOptions}
                onChange={updateLineForm('gst_rate')}
                placeholder="Search GST"
              />
            </div>
            <div>
              <Label>Qty</Label>
              <Input value={lineForm.qty} onChange={updateLineForm('qty')} placeholder="10" />
            </div>
            <div>
              <Label>Unit</Label>
              <SearchableSelect
                value={lineForm.unit_id !== null && lineForm.unit_id !== undefined ? String(lineForm.unit_id) : ''}
                options={unitOptions}
                onChange={updateLineForm('unit_id')}
                placeholder="Search unit"
              />
            </div>
            <div>
              <Label>Rate</Label>
              <Input value={lineForm.rate} onChange={updateLineForm('rate')} placeholder="100" />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={addLine} className="w-full">
                Add Line
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <Table>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH>HSN</TH>
                  <TH>Batch</TH>
                  <TH>Expiry</TH>
                  <TH>MRP</TH>
                  <TH>Qty</TH>
                  <TH>Unit</TH>
                  <TH>Rate</TH>
                  <TH>Amount</TH>
                  <TH>GST</TH>
                  <TH>Total Amount</TH>
                  <TH>Action</TH>
                </TR>
              </THead>
              <TBody>
                {orderItems.map((line, index) => {
                  const qty = Number(line.qty || 0);
                  const rate = Number(line.rate || 0);
                  const gstRate = Number(line.gst_rate || 0);
                  const amount = qty * rate;
                  const totalAmount = amount * (1 + gstRate / 100);

                  return (
                    <TR key={`${line.item_id}-${index}`}>
                      <TD>{itemMap.get(String(line.item_id))?.name || 'Item'}</TD>
                      <TD>{line.hsn || itemMap.get(String(line.item_id))?.hsn || '—'}</TD>
                      <TD>
                        <Input value={line.batch_no || ''} onChange={updateExistingLine(index, 'batch_no')} />
                      </TD>
                      <TD>
                        <Input value={line.expiry_date || ''} onChange={updateExistingLine(index, 'expiry_date')} />
                      </TD>
                      <TD>
                        <Input value={line.mrp ?? ''} onChange={updateExistingLine(index, 'mrp')} />
                      </TD>
                      <TD>
                        <Input value={line.qty} onChange={updateExistingLine(index, 'qty')} />
                      </TD>
                      <TD>
                        <SearchableSelect
                          value={line.unit_id !== null && line.unit_id !== undefined ? String(line.unit_id) : ''}
                          options={unitOptions}
                          onChange={updateExistingLine(index, 'unit_id')}
                          placeholder="Search unit"
                        />
                      </TD>
                      <TD>
                        <Input value={line.rate} onChange={updateExistingLine(index, 'rate')} />
                      </TD>
                      <TD>{amount.toFixed(2)}</TD>
                      <TD>
                        <SearchableSelect
                          value={line.gst_rate ?? ''}
                          options={gstOptions}
                          onChange={updateExistingLine(index, 'gst_rate')}
                          placeholder="Search GST"
                        />
                      </TD>
                      <TD>{totalAmount.toFixed(2)}</TD>
                      <TD>
                        <Button type="button" variant="ghost" onClick={() => removeLine(index)}>
                          Remove
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-muted">Items Total</p>
              <p className="text-base font-semibold">{totals.itemsTotal.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-muted">GST Total</p>
              <p className="text-base font-semibold">{totals.gstTotal.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-muted">Invoice Total</p>
              <p className="text-base font-semibold">{totals.invoiceTotal.toFixed(2)}</p>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <Button type="button" onClick={saveOrder}>
              {isEditMode ? 'Save Changes' : 'Save Order'}
            </Button>
            {isEditMode && (
              <Button type="button" variant="outline" onClick={() => window.print()}>
                🖨 Print Invoice
              </Button>
            )}
            {isEditMode && (
              <Button type="button" variant="outline" onClick={previewInChrome}>
                Preview in Chrome
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isEditMode && (
        <InvoicePrint
          company={company}
          party={selectedParty}
          order={{ id: orderId, order_date: orderDate, place_of_supply: placeOfSupply }}
          orderItems={orderItems}
          totals={totals}
          itemMap={itemMap}
        />
      )}
    </div>
  );
}
