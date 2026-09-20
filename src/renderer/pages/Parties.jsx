import React, { useEffect, useMemo, useState } from 'react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';

const emptyForm = {
  name: '',
  phone: '',
  address: '',
  gst_number: '',
  state_of_supply: ''
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString();
};

export default function Parties() {
  const [form, setForm] = useState(emptyForm);
  const [parties, setParties] = useState([]);
  const [inactive, setInactive] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [details, setDetails] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [dumpPath, setDumpPath] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [rate, setRate] = useState('');
  const [partyRates, setPartyRates] = useState([]);

  const load = async () => {
    const [partyData, itemData, inactiveData] = await Promise.all([
      window.vyapar.listParties(),
      window.vyapar.listItems(),
      window.vyapar.listInactiveParties()
    ]);
    setParties(partyData || []);
    setItems(itemData || []);
    setInactive(inactiveData || []);
  };

  useEffect(() => {
    load().catch((err) => setError(err?.message || 'Failed to load parties.'));
  }, []);

  // Detail and party-rates both follow the selected row, so one click populates the whole panel.
  useEffect(() => {
    if (!selectedId) {
      setDetails(null);
      setPartyRates([]);
      return;
    }
    let active = true;
    (async () => {
      const [detail, rates] = await Promise.all([
        window.vyapar.getPartyDetails(Number(selectedId)),
        window.vyapar.listPartyRates(Number(selectedId))
      ]);
      if (!active) return;
      setDetails(detail);
      setPartyRates(rates || []);
      setEditForm({
        name: detail?.name || '',
        phone: detail?.phone || '',
        address: detail?.address || '',
        gst_number: detail?.gst_number || '',
        state_of_supply: detail?.state_of_supply || ''
      });
    })().catch((err) => setError(err?.message || 'Failed to load party.'));
    return () => {
      active = false;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return parties;
    return parties.filter((party) =>
      [party.name, party.phone, party.gst_number, party.state_of_supply]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    );
  }, [parties, search]);

  const run = async (name, fn, successMessage) => {
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await fn();
      if (successMessage) setNotice(successMessage);
      await load();
    } catch (err) {
      setError(err?.message || 'Action failed.');
    } finally {
      setBusy('');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    await run('create', async () => {
      await window.vyapar.createParty(form);
      setForm(emptyForm);
    }, 'Party added.');
  };

  const saveEdit = () =>
    run('save', async () => {
      await window.vyapar.updateParty(Number(selectedId), editForm);
      const refreshed = await window.vyapar.getPartyDetails(Number(selectedId));
      setDetails(refreshed);
    }, 'Changes saved.');

  const removeParty = () => {
    if (!details) return;
    const question =
      details.txn_count > 0
        ? `"${details.name}" has ${details.txn_count} transaction(s).\n\nIt will be hidden from your party list, but its invoices stay intact.\n\nContinue?`
        : `Permanently delete "${details.name}"?\n\nIt has no transactions, so this cannot be undone.`;
    if (!window.confirm(question)) return;
    run('delete', async () => {
      const result = await window.vyapar.deleteParty(Number(selectedId));
      setNotice(result?.message || 'Party removed.');
      setSelectedId('');
    });
  };

  const saveRate = () =>
    run('rate', async () => {
      if (!selectedId || !selectedItem) throw new Error('Pick a party and an item first.');
      await window.vyapar.upsertPartyRate({
        party_id: Number(selectedId),
        item_id: Number(selectedItem),
        rate: Number(rate || 0)
      });
      setRate('');
      setPartyRates(await window.vyapar.listPartyRates(Number(selectedId)));
    }, 'Rate saved.');

  const importDump = async () => {
    if (!dumpPath.trim()) return;
    setImportStatus('Importing… this may take a minute.');
    try {
      const result = await window.vyapar.importVyaparDump(dumpPath.trim());
      setImportStatus(
        `Imported ${result.parties} parties, ${result.items} items, ${result.partyRates} party-wise rates, ${result.partyCustomValues || 0} party custom values.`
      );
      await load();
    } catch (err) {
      setImportStatus(`Import failed: ${err.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title text-3xl font-semibold">Party Master</h2>
        <p className="text-muted">View, edit and remove customers and suppliers.</p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-green-700">{notice}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Parties ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, phone, GST or state"
            />
            <div className="max-h-[420px] overflow-y-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Phone</TH>
                    <TH>State</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((party) => (
                    <TR
                      key={party.id}
                      onClick={() => setSelectedId(String(party.id))}
                      className={`cursor-pointer ${
                        String(party.id) === String(selectedId) ? 'bg-accentSoft' : ''
                      }`}
                    >
                      <TD>{party.name}</TD>
                      <TD>{party.phone || '—'}</TD>
                      <TD>{party.state_of_supply || '—'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {!filtered.length ? (
                <p className="py-4 text-sm text-muted">No parties match that search.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{details ? details.name : 'Party details'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!details ? (
              <p className="text-sm text-muted">Select a party on the left to view or edit it.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs text-muted">
                  <div>
                    <span className="font-medium">Sales:</span> {details.sale_count}
                  </div>
                  <div>
                    <span className="font-medium">Purchases:</span> {details.purchase_count}
                  </div>
                  <div>
                    <span className="font-medium">Last activity:</span>{' '}
                    {formatDate(details.last_txn_date)}
                  </div>
                  <div>
                    <span className="font-medium">Added:</span> {formatDate(details.date_created)}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={editForm.phone}
                      onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>GST Number</Label>
                    <Input
                      value={editForm.gst_number}
                      onChange={(e) => setEditForm((p) => ({ ...p, gst_number: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>State Of Supply</Label>
                    <Input
                      value={editForm.state_of_supply}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, state_of_supply: e.target.value }))
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Address</Label>
                    <Input
                      value={editForm.address}
                      onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="button" onClick={saveEdit} disabled={busy === 'save'}>
                    {busy === 'save' ? 'Saving…' : 'Save changes'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={removeParty}
                    disabled={busy === 'delete'}
                  >
                    {details.txn_count > 0 ? 'Hide party' : 'Delete party'}
                  </Button>
                </div>

                {details.recent_orders?.length ? (
                  <div>
                    <p className="mb-2 text-sm font-semibold">Recent transactions</p>
                    <Table>
                      <THead>
                        <TR>
                          <TH>Type</TH>
                          <TH>Invoice</TH>
                          <TH>Date</TH>
                          <TH>Total</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {details.recent_orders.map((order) => (
                          <TR key={order.id}>
                            <TD>{order.txn_type === 3 ? 'Purchase' : 'Sale'}</TD>
                            <TD>{order.ref_number || order.id}</TD>
                            <TD>{formatDate(order.order_date)}</TD>
                            <TD>₹ {Number(order.total || 0).toFixed(2)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-xs text-muted">No transactions yet.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {inactive.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Hidden parties ({inactive.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted">
              These are hidden from the list above but still referenced by their old invoices.
            </p>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Phone</TH>
                  <TH>GST</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {inactive.map((party) => (
                  <TR key={party.id}>
                    <TD>{party.name}</TD>
                    <TD>{party.phone || '—'}</TD>
                    <TD>{party.gst_number || '—'}</TD>
                    <TD>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          run('restore', () => window.vyapar.restoreParty(party.id), 'Party restored.')
                        }
                        disabled={busy === 'restore'}
                      >
                        Restore
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Party</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submit}>
              <div>
                <Label>Party Name</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Noble Traders" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+91 98xxxxxx" />
              </div>
              <div>
                <Label>GST Number</Label>
                <Input value={form.gst_number} onChange={(e) => setForm((p) => ({ ...p, gst_number: e.target.value }))} placeholder="27ABCDE1234F1Z5" />
              </div>
              <div>
                <Label>State Of Supply</Label>
                <Input value={form.state_of_supply} onChange={(e) => setForm((p) => ({ ...p, state_of_supply: e.target.value }))} placeholder="Delhi" />
              </div>
              <div className="md:col-span-2">
                <Label>Address</Label>
                <Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Address" />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={busy === 'create'}>Save Party</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Party-wise Rates</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedId ? (
              <p className="text-sm text-muted">Select a party above to manage its rates.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Item</Label>
                  <select
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    value={selectedItem}
                    onChange={(event) => setSelectedItem(event.target.value)}
                  >
                    <option value="">Choose item</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Rate</Label>
                  <Input value={rate} onChange={(event) => setRate(event.target.value)} placeholder="e.g. 120.50" />
                </div>
                <Button type="button" onClick={saveRate} disabled={busy === 'rate'}>
                  Save Party Rate
                </Button>

                <Table>
                  <THead>
                    <TR>
                      <TH>Item</TH>
                      <TH>HSN</TH>
                      <TH>GST</TH>
                      <TH>Rate</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {partyRates.map((row) => (
                      <TR key={row.id}>
                        <TD>{row.item_name}</TD>
                        <TD>{row.hsn || '—'}</TD>
                        <TD>{row.gst_rate}%</TD>
                        <TD>{row.rate}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import From Vyapar SQL Dump</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <Label>Dump File Path</Label>
              <Input
                value={dumpPath}
                onChange={(event) => setDumpPath(event.target.value)}
                placeholder="/Users/shivam/Downloads/vyapar_db.sql"
              />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={importDump} className="w-full">
                Import &amp; Overwrite
              </Button>
            </div>
          </div>
          {importStatus && <p className="mt-3 text-sm text-muted">{importStatus}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
