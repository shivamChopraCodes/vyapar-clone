import React, { useEffect, useState } from 'react';
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

export default function Parties() {
  const [form, setForm] = useState(emptyForm);
  const [parties, setParties] = useState([]);
  const [items, setItems] = useState([]);
  const [dumpPath, setDumpPath] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [selectedParty, setSelectedParty] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [rate, setRate] = useState('');
  const [partyRates, setPartyRates] = useState([]);

  const load = async () => {
    const [partyData, itemData] = await Promise.all([
      window.vyapar.listParties(),
      window.vyapar.listItems()
    ]);
    setParties(partyData);
    setItems(itemData);
  };

  const loadPartyRates = async (partyId) => {
    if (!partyId) {
      setPartyRates([]);
      return;
    }
    const data = await window.vyapar.listPartyRates(Number(partyId));
    setPartyRates(data);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadPartyRates(selectedParty);
  }, [selectedParty]);

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    await window.vyapar.createParty(form);
    setForm(emptyForm);
    await load();
  };

  const saveRate = async () => {
    if (!selectedParty || !selectedItem) return;
    await window.vyapar.upsertPartyRate({
      party_id: Number(selectedParty),
      item_id: Number(selectedItem),
      rate: Number(rate || 0)
    });
    setRate('');
    await loadPartyRates(selectedParty);
  };

  const importDump = async () => {
    if (!dumpPath.trim()) return;
    setImportStatus('Importing... this may take a minute.');
    try {
      const result = await window.vyapar.importVyaparDump(dumpPath.trim());
      setImportStatus(
        `Imported ${result.parties} parties, ${result.items} items, ${result.partyRates} party-wise rates, ${result.partyCustomValues || 0} party custom values.`
      );
      await load();
      if (selectedParty) await loadPartyRates(selectedParty);
    } catch (err) {
      setImportStatus(`Import failed: ${err.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title text-3xl font-semibold">Party Master</h2>
        <p className="text-muted">Maintain customer/supplier details and party-wise rates.</p>
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
                placeholder="/Users/shivam/Downloads/vyapar_db__t_2024_02_17_22_38_47_hy7m.vyp.sql"
              />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={importDump} className="w-full">
                Import & Overwrite
              </Button>
            </div>
          </div>
          {importStatus && <p className="mt-3 text-sm text-muted">{importStatus}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Party</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submit}>
            <div>
              <Label>Party Name</Label>
              <Input value={form.name} onChange={update('name')} placeholder="Noble Traders" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={update('phone')} placeholder="+91 98xxxxxx" />
            </div>
            <div>
              <Label>GST Number</Label>
              <Input value={form.gst_number} onChange={update('gst_number')} placeholder="27ABCDE1234F1Z5" />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={update('address')} placeholder="Address" />
            </div>
            <div>
              <Label>State Of Supply</Label>
              <Input value={form.state_of_supply} onChange={update('state_of_supply')} placeholder="Delhi" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Save Party</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Saved Parties</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>State</TH>
                  <TH>GST</TH>
                  <TH>Phone</TH>
                </TR>
              </THead>
              <TBody>
                {parties.map((party) => (
                  <TR key={party.id}>
                    <TD>{party.name}</TD>
                    <TD>{party.state_of_supply || '—'}</TD>
                    <TD>{party.gst_number || '—'}</TD>
                    <TD>{party.phone || '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Party-wise Rates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <Label>Select Party</Label>
                <select
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  value={selectedParty}
                  onChange={(event) => setSelectedParty(event.target.value)}
                >
                  <option value="">Choose party</option>
                  {parties.map((party) => (
                    <option key={party.id} value={party.id}>
                      {party.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Select Item</Label>
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
              <Button type="button" onClick={saveRate}>
                Save Party Rate
              </Button>
            </div>

            <div className="mt-6">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
