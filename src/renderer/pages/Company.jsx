import React, { useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';

const emptyForm = {
  name: '',
  gst_number: '',
  state: '',
  drug_license: '',
  address: '',
  phone: '',
  other_details: ''
};

export default function Company() {
  const [form, setForm] = useState(emptyForm);
  const [companies, setCompanies] = useState([]);

  const load = async () => {
    const data = await window.vyapar.listCompanies();
    setCompanies(data);
  };

  useEffect(() => {
    load();
  }, []);

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    await window.vyapar.createCompany(form);
    setForm(emptyForm);
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title text-3xl font-semibold">Company Setup</h2>
        <p className="text-muted">Add GST, drug license, and business details for each company.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Company</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submit}>
            <div>
              <Label>Company Name</Label>
              <Input value={form.name} onChange={update('name')} placeholder="Shivam Pharma" />
            </div>
            <div>
              <Label>GST Number</Label>
              <Input value={form.gst_number} onChange={update('gst_number')} placeholder="27ABCDE1234F1Z5" />
            </div>
            <div>
              <Label>Drug License</Label>
              <Input value={form.drug_license} onChange={update('drug_license')} placeholder="DL-123456" />
            </div>
            <div>
              <Label>State</Label>
              <Input value={form.state} onChange={update('state')} placeholder="Delhi" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={update('phone')} placeholder="+91 98xxxxxx" />
            </div>
            <div className="md:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={update('address')} placeholder="Full address" />
            </div>
            <div className="md:col-span-2">
              <Label>Other Details</Label>
              <Input value={form.other_details} onChange={update('other_details')} placeholder="Optional notes" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Save Company</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved Companies</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>GST</TH>
                <TH>State</TH>
                <TH>Drug License</TH>
                <TH>Phone</TH>
                <TH>Other Details</TH>
              </TR>
            </THead>
            <TBody>
              {companies.map((company) => (
                <TR key={company.id}>
                  <TD>{company.name}</TD>
                  <TD>{company.gst_number || '—'}</TD>
                  <TD>{company.state || '—'}</TD>
                  <TD>{company.drug_license || '—'}</TD>
                  <TD>{company.phone || '—'}</TD>
                  <TD>{company.other_details || '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
