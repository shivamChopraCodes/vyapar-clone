import React, { useEffect, useMemo, useState } from 'react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import SearchableSelect from '../components/ui/SearchableSelect';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import { buildMultiSheetWorkbookBlob } from '../utils/xlsxExport';

const REPORT_OPTIONS = [{ value: 'gstr1', label: 'GSTR-1' }];

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

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

/** Format date as DD-Mon-YYYY for B2B sheet (e.g. 01-Oct-2025) */
function displayDateB2B(value) {
  const date = parseOrderDate(value);
  if (!date) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mon = MONTH_NAMES[date.getMonth() + 1] || '';
  const yyyy = date.getFullYear();
  return `${dd}-${mon}-${yyyy}`;
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

/* ========================================================================
 * Sheet builder functions — one per GSTR-1 tab
 * ======================================================================== */

function buildMainSheet(data, periodLabel) {
  const { company, mainRows } = data;
  const rows = [
    ['Period', periodLabel, '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['1. GSTIN', company.gstin || '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['2.a Legal name of the registered person.', company.legal_name || '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['2.b Trade name, if any', company.trade_name || '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['3.a Aggregate turnover of the preceeding Financial Year', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['3.b Aggregate turnover, April to June 2017', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    [
      'GSTIN/UIN', 'Party Name', 'Transaction Type', 'Invoice No.', 'Invoice Date',
      'Invoice Value', 'Rate', 'Cess Rate', 'Taxable value', 'Reverse Charge',
      'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount',
      'Cess Amount', 'Place of Supply(Name of state)'
    ],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
  ];

  let totInvoice = 0;
  let totTaxable = 0;
  let totIgst = 0;
  let totCgst = 0;
  let totSgst = 0;
  let totCess = 0;

  mainRows.forEach((row) => {
    const iv = Math.round(Number(row.invoice_value || 0));
    totInvoice += iv;
    totTaxable += Number(row.taxable_value || 0);
    totIgst += Number(row.integrated_tax_amount || 0);
    totCgst += Number(row.central_tax_amount || 0);
    totSgst += Number(row.state_ut_tax_amount || 0);
    totCess += Number(row.cess_amount || 0);

    rows.push([
      row.gstin_uin || '',
      row.party_name || '',
      row.transaction_type || 'Sale',
      row.invoice_no || '',
      displayDate(row.invoice_date),
      iv,
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

  // Blank row + total row
  rows.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  rows.push([
    'Total', '', '', '', '',
    totInvoice, '', '',
    Number(totTaxable.toFixed(2)), '',
    Number(totIgst.toFixed(2)),
    Number(totCgst.toFixed(2)),
    Number(totSgst.toFixed(2)),
    Number(totCess.toFixed(2)),
    ''
  ]);

  return rows;
}

function buildB2BSheet(b2bRows) {
  // Summary band
  const uniqueGstins = new Set(b2bRows.map((r) => r.gstin_uin)).size;
  const count = b2bRows.length;
  const totInvoice = b2bRows.reduce((s, r) => s + Math.round(Number(r.invoice_value || 0)), 0);
  const totTaxable = b2bRows.reduce((s, r) => s + Number(r.taxable_value || 0), 0);
  const totCess = b2bRows.reduce((s, r) => s + Number(r.cess_amount || 0), 0);

  const rows = [
    ['Summary For B2B, SEZ, DE (4A, 4B, 6B, 6C)', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['No. of Recipients', '', 'No. of Invoices', '', 'Total Invoice Value', '', '', '', '', '', '', 'Total Taxable Value', 'Total Cess'],
    [uniqueGstins, '', count, '', totInvoice, '', '', '', '', '', '', Number(totTaxable.toFixed(2)), Number(totCess.toFixed(2))],
    [
      'GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date',
      'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate',
      'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount'
    ]
  ];

  b2bRows.forEach((row) => {
    rows.push([
      row.gstin_uin || '',
      row.party_name || '',
      row.invoice_no || '',
      displayDateB2B(row.invoice_date),
      Math.round(Number(row.invoice_value || 0)),
      row.place_of_supply || '',
      row.reverse_charge || 'N',
      '',
      'Regular B2B',
      '',
      Number(row.rate || 0),
      Number(row.taxable_value || 0),
      Number(row.cess_amount || 0)
    ]);
  });

  return rows;
}

function buildB2CLSheet(b2clRows) {
  const count = b2clRows.length;
  const totInvoice = b2clRows.reduce((s, r) => s + Math.round(Number(r.invoice_value || 0)), 0);
  const totTaxable = b2clRows.reduce((s, r) => s + Number(r.taxable_value || 0), 0);
  const totCess = b2clRows.reduce((s, r) => s + Number(r.cess_amount || 0), 0);

  const rows = [
    ['Summary For B2CL(5)', '', '', '', '', '', '', '', ''],
    ['No. of Invoices', '', 'Total Invoice Value', '', '', '', 'Total Taxable Value', 'Total Cess', ''],
    [count, '', totInvoice, '', '', '', Number(totTaxable.toFixed(2)), Number(totCess.toFixed(2)), ''],
    [
      'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply',
      'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'
    ]
  ];

  b2clRows.forEach((row) => {
    rows.push([
      row.invoice_no || '',
      displayDateB2B(row.invoice_date),
      Math.round(Number(row.invoice_value || 0)),
      row.place_of_supply || '',
      '',
      Number(row.rate || 0),
      Number(row.taxable_value || 0),
      Number(row.cess_amount || 0),
      ''
    ]);
  });

  return rows;
}

function buildB2CSSheet(b2cs) {
  const totTaxable = b2cs.reduce((s, r) => s + Number(r.taxable_value || 0), 0);
  const totCess = b2cs.reduce((s, r) => s + Number(r.cess || 0), 0);

  const rows = [
    ['Summary For B2CS(7)', '', '', '', '', '', ''],
    ['', '', '', '', 'Total Taxable Value', 'Total Cess', ''],
    ['', '', '', '', Number(totTaxable.toFixed(2)), Number(totCess.toFixed(2)), ''],
    ['Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN']
  ];

  b2cs.forEach((row) => {
    rows.push([
      row.type || 'OE',
      row.place_of_supply || '',
      '',
      Number(row.rate || 0),
      Number(row.taxable_value || 0),
      Number(row.cess || 0),
      ''
    ]);
  });

  return rows;
}

function buildCdnrStub() {
  return [
    ['Summary For CDNR(9B)', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['No. of Recipients', '', 'No. of Notes', '', '', '', '', '', 'Total Note Value', '', '', 'Total Taxable Value', 'Total Cess'],
    [0, '', 0, '', '', '', '', '', 0, '', '', 0, 0],
    [
      'GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date', 'Note Type',
      'Place Of Supply', 'Reverse Charge', 'Note Supply Type', 'Note Value',
      'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'
    ]
  ];
}

function buildCdnurStub() {
  return [
    ['Summary For CDNUR(9B)', '', '', '', '', '', '', '', '', ''],
    ['', 'No. of Notes/Vouchers', '', '', '', 'Total Note Value', '', '', 'Total Taxable Value', 'Total Cess'],
    ['', 0, '', '', '', 0, '', '', 0, 0],
    [
      'UR Type', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply',
      'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'
    ]
  ];
}

function buildExpStub() {
  return [
    ['Summary For EXP(6)', '', '', '', '', '', '', '', ''],
    ['', 'No. of Invoices', '', 'Total Invoice Value', '', 'No. of Shipping Bill', '', '', 'Total Taxable Value'],
    ['', '', '', '', '', '', '', '', ''],
    [
      'Export Type', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Port Code',
      'Shipping Bill Number', 'Shipping Bill Date', 'Rate', 'Taxable Value'
    ]
  ];
}

function buildAtStub() {
  return [
    ['Summary For Advance Received(11B)', '', '', '', ''],
    ['', '', '', 'Total Advance Received', 'Total Cess'],
    ['', '', '', '', ''],
    ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Received', 'Cess Amount']
  ];
}

function buildAtadjStub() {
  return [
    ['Summary For Advance Adjusted(11B)', '', '', '', ''],
    ['', '', '', 'Total Advance Adjusted', 'Total Cess'],
    ['', '', '', '', ''],
    ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Adjusted', 'Cess Amount']
  ];
}

function buildExempSheet(exemp) {
  const e = exemp || {};
  const nilTotal = Number(e.interReg || 0) + Number(e.intraReg || 0) + Number(e.interUnreg || 0) + Number(e.intraUnreg || 0);
  return [
    ['Summary For Nil rated, exempted and non GST outward supplies (8)', '', '', ''],
    ['', 'Total Nil Rated Supplies', 'Total Exempted Supplies', 'Total Non-GST Supplies'],
    ['', Number(nilTotal.toFixed(2)), 0, 0],
    ['Description', 'Nil Rated Supplies', 'Exempted(other than nil rated/non GST supply)', 'Non-GST Supplies'],
    ['Inter-State supplies to registered persons', Number(e.interReg || 0), 0, 0],
    ['Intra-State supplies to registered persons', Number(e.intraReg || 0), 0, 0],
    ['Inter-State supplies to unregistered persons', Number(e.interUnreg || 0), 0, 0],
    ['Intra-State supplies to unregistered persons', Number(e.intraUnreg || 0), 0, 0]
  ];
}

function buildHsnSheet(hsnRows) {
  const count = hsnRows.length;
  const totValue = hsnRows.reduce((s, r) => s + Number(r.totalValue || 0), 0);
  const totTaxable = hsnRows.reduce((s, r) => s + Number(r.taxableValue || 0), 0);
  const totIgst = hsnRows.reduce((s, r) => s + Number(r.igst || 0), 0);
  const totCgst = hsnRows.reduce((s, r) => s + Number(r.cgst || 0), 0);
  const totSgst = hsnRows.reduce((s, r) => s + Number(r.sgst || 0), 0);
  const totCess = hsnRows.reduce((s, r) => s + Number(r.cess || 0), 0);

  const rows = [
    ['Summary For HSN(12)', '', '', '', '', '', '', '', '', '', ''],
    ['No. of HSN', '', '', '', 'Total Value', '', 'Total Taxable Value', 'Total Integrated Tax', 'Total Central Tax', 'Total State/UT Tax', 'Total Cess'],
    [count, '', '', '', Number(totValue.toFixed(2)), '', Number(totTaxable.toFixed(2)), Number(totIgst.toFixed(2)), Number(totCgst.toFixed(2)), Number(totSgst.toFixed(2)), Number(totCess.toFixed(2))],
    ['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount']
  ];

  hsnRows.forEach((row) => {
    rows.push([
      row.hsn || '',
      row.description || '',
      row.uqc || 'OTH-OTHERS',
      Number(row.qty || 0),
      Number(row.totalValue || 0),
      Number(row.rate || 0),
      Number(row.taxableValue || 0),
      Number(row.igst || 0),
      Number(row.cgst || 0),
      Number(row.sgst || 0),
      Number(row.cess || 0)
    ]);
  });

  return rows;
}

function buildDocsSheet(docs) {
  const d = docs || {};
  return [
    ['Summary of documents issued during the tax period (13)', '', '', '', ''],
    ['', '', '', 'Total Number', 'Total Cancelled'],
    ['', '', '', d.total || '0', d.cancelled || '0'],
    ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'],
    ['Invoices for outward supply', d.from || '', d.to || '', d.total || '0', d.cancelled || '0']
  ];
}

/* ======================================================================== */

export default function Reports() {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [reportType, setReportType] = useState('gstr1');
  const [startMonthValue, setStartMonthValue] = useState(thisMonth);
  const [endMonthValue, setEndMonthValue] = useState(thisMonth);
  const [reportRows, setReportRows] = useState([]);
  const [companyMeta, setCompanyMeta] = useState({ gstin: '', legal_name: '', trade_name: '' });
  const [validations, setValidations] = useState([]);
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

  const downloadReport = async () => {
    if (!hasRows || hasRangeError || !fromDate || !toDate) return;
    setLoading(true);
    try {
      const data = await window.vyapar.getGstr1FullReport({
        from_date: toIsoDate(fromDate),
        to_date: toIsoDate(toDate)
      });

      setValidations(data.validations || []);

      const sheets = [
        { name: 'GSTR1 Report', rows: buildMainSheet(data, periodLabel) },
        { name: 'b2b,sez,de', rows: buildB2BSheet(data.b2bRows || []) },
        { name: 'b2cl', rows: buildB2CLSheet(data.b2clRows || []) },
        { name: 'b2cs', rows: buildB2CSSheet(data.b2cs || []) },
        { name: 'cdnr', rows: buildCdnrStub() },
        { name: 'cdnur', rows: buildCdnurStub() },
        { name: 'exp', rows: buildExpStub() },
        { name: 'at', rows: buildAtStub() },
        { name: 'atadj', rows: buildAtadjStub() },
        { name: 'exemp', rows: buildExempSheet(data.exemp) },
        { name: 'hsn(b2b)', rows: buildHsnSheet(data.hsnB2B || []) },
        { name: 'hsn(b2c)', rows: buildHsnSheet(data.hsnB2C || []) },
        { name: 'itemSummary', rows: buildHsnSheet(data.itemSummary || []) },
        { name: 'docs', rows: buildDocsSheet(data.docs) }
      ];

      const blob = buildMultiSheetWorkbookBlob(sheets);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileNameForRange(startMonthValue, endMonthValue);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
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
          {validations.length > 0 && (
            <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
              <p className="font-semibold mb-1">⚠ Reconciliation Warnings</p>
              <ul className="list-disc pl-5 space-y-1">
                {validations.map((v, i) => (
                  <li key={i}>{v.msg}</li>
                ))}
              </ul>
            </div>
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
