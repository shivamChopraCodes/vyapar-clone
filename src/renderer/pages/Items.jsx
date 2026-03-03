import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import SearchableSelect from '../components/ui/SearchableSelect';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import baseUnits from '../data/baseUnits';
import gstRates from '../data/gstRates';

const emptyItem = {
  name: '',
  hsn: '',
  gst_rate: '',
  base_rate: '',
  base_unit: ''
};

const emptyBatch = {
  item_id: '',
  batch_no: '',
  expiry_date: '',
  mrp: '',
  rate: '',
  qty: ''
};

export default function Items() {
  const navigate = useNavigate();
  const [itemForm, setItemForm] = useState(emptyItem);
  const [batchForm, setBatchForm] = useState(emptyBatch);
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [itemDetails, setItemDetails] = useState(null);
  const [nameFilter, setNameFilter] = useState('');
  const [gstFilter, setGstFilter] = useState('');
  const [hsnFilter, setHsnFilter] = useState('');

  const load = async () => {
    const data = await window.vyapar.listItems();
    setItems(data);
    if (!selectedItemId && data?.length) {
      const first = String(data[0].id);
      setSelectedItemId(first);
      setBatchForm((prev) => ({ ...prev, item_id: first }));
    }
  };

  const loadItemDetails = async (itemId) => {
    if (!itemId) {
      setItemDetails(null);
      return;
    }
    const data = await window.vyapar.getItemDetails(Number(itemId));
    setItemDetails(data);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selectedItemId && String(batchForm.item_id || '') !== String(selectedItemId)) {
      setBatchForm((prev) => ({ ...prev, item_id: String(selectedItemId) }));
    }
    loadItemDetails(selectedItemId);
  }, [selectedItemId]);

  const filteredItems = useMemo(() => {
    const nameText = nameFilter.trim().toLowerCase();
    const hsnText = hsnFilter.trim().toLowerCase();
    return items.filter((item) => {
      if (nameText && !String(item.name || '').toLowerCase().includes(nameText)) return false;
      if (hsnText && !String(item.hsn || '').toLowerCase().includes(hsnText)) return false;
      if (gstFilter && String(item.gst_rate) !== String(gstFilter)) return false;
      return true;
    });
  }, [items, nameFilter, hsnFilter, gstFilter]);

  const gstFilterOptions = useMemo(() => {
    const unique = new Set(items.map((item) => Number(item.gst_rate || 0)));
    return Array.from(unique)
      .sort((a, b) => a - b)
      .map((value) => ({ value: String(value), label: `${value}%` }));
  }, [items]);

  const updateItem = (field) => (event) => {
    setItemForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const updateBatch = (field) => (event) => {
    const value = event.target.value;
    setBatchForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'item_id') {
      setSelectedItemId(String(value || ''));
    }
  };

  const saveItem = async (event) => {
    event.preventDefault();
    if (!itemForm.name.trim()) return;
    await window.vyapar.createItem({
      ...itemForm,
      gst_rate: Number(itemForm.gst_rate || 0),
      base_rate: Number(itemForm.base_rate || 0),
      base_unit: itemForm.base_unit?.trim() || ''
    });
    setItemForm(emptyItem);
    await load();
  };

  const saveBatch = async (event) => {
    event.preventDefault();
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const raw = String(value).trim();
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    return raw;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title text-3xl font-semibold">Item & Batch Master</h2>
        <p className="text-muted">Save items with HSN/GST and manage batch-level pricing.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Item</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4" onSubmit={saveItem}>
              <div>
                <Label>Item Name</Label>
                <Input value={itemForm.name} onChange={updateItem('name')} placeholder="Paracetamol 500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>HSN</Label>
                  <Input value={itemForm.hsn} onChange={updateItem('hsn')} placeholder="3004" />
                </div>
                <div>
                  <Label>GST Rate (%)</Label>
                  <select
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    value={itemForm.gst_rate}
                    onChange={updateItem('gst_rate')}
                  >
                    <option value="">Select GST</option>
                    {gstRates.map((rate) => (
                      <option key={rate} value={rate}>
                        {rate === 0 ? '0 (N)' : rate}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label>Base Rate</Label>
                <Input value={itemForm.base_rate} onChange={updateItem('base_rate')} placeholder="100" />
              </div>
              <div>
                <Label>Base Unit</Label>
                <Input
                  list="base-unit-options"
                  value={itemForm.base_unit}
                  onChange={updateItem('base_unit')}
                  placeholder="PIECES"
                />
                <datalist id="base-unit-options">
                  {baseUnits.map((unit) => (
                    <option key={unit} value={unit} />
                  ))}
                </datalist>
              </div>
              <Button type="submit">Save Item</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add Batch</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4" onSubmit={saveBatch}>
              <div>
                <Label>Item</Label>
                <select
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  value={batchForm.item_id}
                  onChange={updateBatch('item_id')}
                >
                  <option value="">Choose item</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Batch No</Label>
                  <Input value={batchForm.batch_no} onChange={updateBatch('batch_no')} placeholder="BATCH-01" disabled />
                </div>
                <div>
                  <Label>Expiry Date</Label>
                  <Input value={batchForm.expiry_date} onChange={updateBatch('expiry_date')} placeholder="2026-12" disabled />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>MRP</Label>
                  <Input value={batchForm.mrp} onChange={updateBatch('mrp')} placeholder="150" disabled />
                </div>
                <div>
                  <Label>Batch Rate</Label>
                  <Input value={batchForm.rate} onChange={updateBatch('rate')} placeholder="110" disabled />
                </div>
              </div>
              <div>
                <Label>Opening Qty</Label>
                <Input value={batchForm.qty} onChange={updateBatch('qty')} placeholder="100" disabled />
              </div>
              <Button type="submit" disabled>
                Save Batch (read-only)
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted">
              Batches are derived from order line items in the Vyapar database.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <Label>Filter by Name</Label>
              <Input
                value={nameFilter}
                onChange={(event) => setNameFilter(event.target.value)}
                placeholder="Search item name"
              />
            </div>
            <div>
              <Label>Filter by GST</Label>
              <SearchableSelect
                value={gstFilter}
                options={gstFilterOptions}
                onChange={(value) => setGstFilter(String(value || ''))}
                placeholder="All GST rates"
              />
            </div>
            <div>
              <Label>Filter by HSN</Label>
              <Input
                value={hsnFilter}
                onChange={(event) => setHsnFilter(event.target.value)}
                placeholder="Search HSN"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNameFilter('');
                  setGstFilter('');
                  setHsnFilter('');
                }}
              >
                Reset Filters
              </Button>
            </div>
          </div>

          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>HSN</TH>
                <TH>GST</TH>
                <TH>Base Rate</TH>
                <TH>Base Unit</TH>
                <TH>Stock Qty</TH>
              </TR>
            </THead>
            <TBody>
              {filteredItems.map((item) => (
                <TR
                  key={item.id}
                  className={String(selectedItemId) === String(item.id) ? 'bg-accentSoft' : ''}
                  onClick={() => setSelectedItemId(String(item.id))}
                >
                  <TD>{item.name}</TD>
                  <TD>{item.hsn || '—'}</TD>
                  <TD>{item.gst_rate}%</TD>
                  <TD>{item.base_rate}</TD>
                  <TD>{item.base_unit || '—'}</TD>
                  <TD>{Number(item.stock_qty || 0)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {!filteredItems.length && (
            <p className="mt-3 text-sm text-muted">No items found for selected filters.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Item Details</CardTitle>
        </CardHeader>
        <CardContent>
          {itemDetails ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                  <p className="text-xs text-muted">System Stock</p>
                  <p className="text-lg font-semibold">{itemDetails.inventory.system_stock_qty}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                  <p className="text-xs text-muted">Batch Stock</p>
                  <p className="text-lg font-semibold">{itemDetails.inventory.batch_stock_qty}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                  <p className="text-xs text-muted">Batches</p>
                  <p className="text-lg font-semibold">{itemDetails.inventory.batches_count}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                  <p className="text-xs text-muted">OCR Import Lines</p>
                  <p className="text-lg font-semibold">{itemDetails.inventory.ocr_import_lines}</p>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Batches</h4>
                <Table>
                  <THead>
                    <TR>
                      <TH>Batch</TH>
                      <TH>Expiry</TH>
                      <TH>MRP</TH>
                      <TH>Qty</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(itemDetails.batches || []).map((batch) => (
                      <TR key={batch.id}>
                        <TD>{batch.batch_no || '—'}</TD>
                        <TD>{formatDate(batch.expiry_date)}</TD>
                        <TD>{Number(batch.mrp || 0).toFixed(2)}</TD>
                        <TD>{Number(batch.qty || 0)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {!itemDetails.batches?.length && (
                  <p className="mt-2 text-sm text-muted">No batches found for this item.</p>
                )}
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Linked Sales/Purchase Orders</h4>
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Type</TH>
                      <TH>Invoice</TH>
                      <TH>Party</TH>
                      <TH>Qty</TH>
                      <TH>Rate</TH>
                      <TH>Line Total</TH>
                      <TH>Source</TH>
                      <TH>Action</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(itemDetails.linked_orders || []).map((row) => (
                      <TR key={`${row.order_id}-${row.order_date}-${row.qty}`}>
                        <TD>{formatDate(row.order_date)}</TD>
                        <TD className="capitalize">{row.order_type}</TD>
                        <TD>{row.invoice_no || row.order_id}</TD>
                        <TD>{row.party_name || '—'}</TD>
                        <TD>{row.qty}</TD>
                        <TD>{row.rate.toFixed(2)}</TD>
                        <TD>{row.line_total.toFixed(2)}</TD>
                        <TD>{row.source === 'ocr_import' ? 'OCR Import' : 'Manual'}</TD>
                        <TD>
                          <Button type="button" variant="ghost" onClick={() => navigate(`/orders/${row.order_id}/edit`)}>
                            Open
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {!itemDetails.linked_orders?.length && (
                  <p className="mt-2 text-sm text-muted">No linked orders for this item yet.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Select an item to view inventory and linked order details.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
