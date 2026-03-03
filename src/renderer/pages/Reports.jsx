import React, { useEffect, useMemo, useState } from 'react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import SearchableSelect from '../components/ui/SearchableSelect';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import { buildGstr1WorkbookBlob } from '../utils/xlsxExport';

const REPORT_OPTIONS = [{ value: 'gstr1', label: 'GSTR-1' }];

function monthStart(monthValue) {
  const [year, month] = String(monthValue).split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return new Date(year, month - 1, 1);
}

function monthEnd(monthValue) {
  const [year, month] = String(monthValue).split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function toIsoDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseOrderDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);
  const slashMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) return new Date(`${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}T00:00:00`);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function displayDate(value) {
  const date = parseOrderDate(value);
  if (!date) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function monthYearLabel(value) {
  const date = monthStart(value);
  if (!date) return '';
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function fileNameForRange(startMonth, endMonth) {
  const [sy, sm] = String(startMonth).split('-');
  const [ey, em] = String(endMonth).split('-');
  const sm2 = String(sm || '').padStart(2, '0');
  const em2 = String(em || '').padStart(2, '0');
  const sy2 = String(sy || '').slice(-2);
  const ey2 = String(ey || '').slice(-2);
  return `GSTR1 Report_${sm2}_${sy2}_to_${em2}_${ey2}.xlsx`;
}

export default function Reports() {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [reportType, setReportType] = useState('gstr1');
  const [startMonthValue, setStartMonthValue] = useState(thisMonth);
  const [endMonthValue, setEndMonthValue] = useState(thisMonth);
  const [reportRows, setReportRows] = useState([]);
  const [companyMeta, setCompanyMeta] = useState({ gstin: '', legal_name: '', trade_name: '' });
  const [loading, setLoading] = useState(false);

  const hasRangeError = monthStart(startMonthValue) > monthEnd(endMonthValue);
  const fromDate = monthStart(startMonthValue);
  const toDate = monthEnd(endMonthValue);

  useEffect(() => {
    const load = async () => {
      if (hasRangeError || !fromDate || !toDate) {
        setReportRows([]);
        return;
      }
      setLoading(true);
      try {
        const data = await window.vyapar.getGstr1SalesReport({
          from_date: toIsoDate(fromDate),
          to_date: toIsoDate(toDate)
        });
        setReportRows(data?.rows || []);
        setCompanyMeta(data?.company || { gstin: '', legal_name: '', trade_name: '' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [startMonthValue, endMonthValue, hasRangeError, reportType]);

  const totals = useMemo(
    () =>
      reportRows.reduce(
        (acc, row) => {
          acc.invoice += Number(row.invoice_value || 0);
          acc.taxable += Number(row.taxable_value || 0);
          acc.tax +=
            Number(row.integrated_tax_amount || 0) +
            Number(row.central_tax_amount || 0) +
            Number(row.state_ut_tax_amount || 0);
          return acc;
        },
        { invoice: 0, taxable: 0, tax: 0 }
      ),
    [reportRows]
  );

  const periodLabel = useMemo(() => {
    if (!fromDate || !toDate) return '';
    return `${monthYearLabel(startMonthValue)} - ${monthYearLabel(endMonthValue)}`;
  }, [startMonthValue, endMonthValue]);

  const hasRows = reportRows.length > 0;

  const downloadReport = () => {
    if (!hasRows || hasRangeError) return;
    const rows = [
      ['Period', periodLabel],
      [''],
      ['1. GSTIN', companyMeta.gstin || ''],
      ['2.a Legal name of the registered person.', companyMeta.legal_name || ''],
      ['2.b Trade name, if any', companyMeta.trade_name || ''],
      ['3.a Aggregate turnover of the preceeding Financial Year', ''],
      ['3.b Aggregate turnover, April to June 2017', ''],
      [''],
      [
        'GSTIN/UIN',
        'Party Name',
        'Transaction Type',
        'Invoice No.',
        'Invoice Date',
        'Invoice Value',
        'Rate',
        'Cess Rate',
        'Taxable value',
        'Reverse Charge',
        'Integrated Tax Amount',
        'Central Tax Amount',
        'State/UT Tax Amount',
        'Cess Amount',
        'Place of Supply(Name of state)'
      ]
    ];
    reportRows.forEach((row) => {
      rows.push([
        row.gstin_uin || '',
        row.party_name || '',
        row.transaction_type || 'Sale',
        row.invoice_no || '',
        displayDate(row.invoice_date),
        Number(row.invoice_value || 0),
        Number(row.rate || 0),
        Number(row.cess_rate || 0),
        Number(row.taxable_value || 0),
        row.reverse_charge || 'N',
        Number(row.integrated_tax_amount || 0),
        Number(row.central_tax_amount || 0),
        Number(row.state_ut_tax_amount || 0),
        Number(row.cess_amount || 0),
        row.place_of_supply || ''
      ]);
    });
    const blob = buildGstr1WorkbookBlob(rows);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileNameForRange(startMonthValue, endMonthValue);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const previewRows = reportRows;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title text-3xl font-semibold">Reports</h2>
        <p className="text-muted">Generate period-wise GST reports from sales orders.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <Label>Report Type</Label>
              <SearchableSelect
                value={reportType}
                options={REPORT_OPTIONS}
                onChange={(value) => setReportType(String(value || 'gstr1'))}
                placeholder="Select report"
              />
            </div>
            <div>
              <Label>Start Month/Year</Label>
              <Input type="month" value={startMonthValue} onChange={(event) => setStartMonthValue(event.target.value)} />
            </div>
            <div>
              <Label>End Month/Year</Label>
              <Input type="month" value={endMonthValue} onChange={(event) => setEndMonthValue(event.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={downloadReport} disabled={hasRangeError || !hasRows || loading}>
                Download XLSX
              </Button>
            </div>
          </div>
          {hasRangeError && (
            <p className="mt-3 text-sm text-red-600">Start month must be before or equal to end month.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GSTR-1 Sales Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-muted">Rows</p>
              <p className="text-base font-semibold">{previewRows.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-muted">Invoice | Taxable | Tax</p>
              <p className="text-base font-semibold">
                {totals.invoice.toFixed(2)} | {totals.taxable.toFixed(2)} | {totals.tax.toFixed(2)}
              </p>
            </div>
          </div>

          <Table>
            <THead>
              <TR>
                <TH>GSTIN/UIN</TH>
                <TH>Party Name</TH>
                <TH>Type</TH>
                <TH>Invoice No.</TH>
                <TH>Date</TH>
                <TH>Invoice Value</TH>
                <TH>Rate</TH>
                <TH>Taxable Value</TH>
                <TH>IGST</TH>
                <TH>CGST</TH>
                <TH>SGST</TH>
                <TH>Place of Supply</TH>
              </TR>
            </THead>
            <TBody>
              {previewRows.map((row) => (
                <TR key={`${row.order_id}-${row.invoice_no}-${row.rate}`}>
                  <TD>{row.gstin_uin || '—'}</TD>
                  <TD>{row.party_name || '—'}</TD>
                  <TD>{row.transaction_type || 'Sale'}</TD>
                  <TD>{row.invoice_no || row.order_id}</TD>
                  <TD>{displayDate(row.invoice_date)}</TD>
                  <TD>{Number(row.invoice_value || 0).toFixed(2)}</TD>
                  <TD>{Number(row.rate || 0).toFixed(2)}</TD>
                  <TD>{Number(row.taxable_value || 0).toFixed(2)}</TD>
                  <TD>{Number(row.integrated_tax_amount || 0).toFixed(2)}</TD>
                  <TD>{Number(row.central_tax_amount || 0).toFixed(2)}</TD>
                  <TD>{Number(row.state_ut_tax_amount || 0).toFixed(2)}</TD>
                  <TD>{row.place_of_supply || '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {!previewRows.length && !hasRangeError && !loading && (
            <p className="mt-3 text-sm text-muted">No sale orders found for selected month range.</p>
          )}
          {loading && <p className="mt-3 text-sm text-muted">Loading report...</p>}
        </CardContent>
      </Card>
    </div>
  );
}
