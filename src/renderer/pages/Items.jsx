import React, { useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
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
  const [itemForm, setItemForm] = useState(emptyItem);
  const [batchForm, setBatchForm] = useState(emptyBatch);
  const [items, setItems] = useState([]);
  const [batches, setBatches] = useState([]);

  const load = async () => {
    const data = await window.vyapar.listItems();
    setItems(data);
  };

  const loadBatches = async (itemId) => {
    if (!itemId) {
      setBatches([]);
      return;
    }
    const data = await window.vyapar.listBatches(Number(itemId));
    setBatches(data);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadBatches(batchForm.item_id);
  }, [batchForm.item_id]);

  const updateItem = (field) => (event) => {
    setItemForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const updateBatch = (field) => (event) => {
    setBatchForm((prev) => ({ ...prev, [field]: event.target.value }));
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
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>HSN</TH>
                <TH>GST</TH>
                <TH>Base Rate</TH>
                <TH>Base Unit</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.id}>
                  <TD>{item.name}</TD>
                  <TD>{item.hsn || '—'}</TD>
                  <TD>{item.gst_rate}%</TD>
                  <TD>{item.base_rate}</TD>
                  <TD>{item.base_unit || '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Batches for Selected Item</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Batch</TH>
                <TH>Expiry</TH>
                <TH>MRP</TH>
                <TH>Rate</TH>
                <TH>Qty</TH>
              </TR>
            </THead>
            <TBody>
              {batches.map((batch) => (
                <TR key={batch.id}>
                  <TD>{batch.batch_no || '—'}</TD>
                  <TD>{batch.expiry_date || '—'}</TD>
                  <TD>{batch.mrp}</TD>
                  <TD>{batch.rate}</TD>
                  <TD>{batch.qty ?? 0}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
