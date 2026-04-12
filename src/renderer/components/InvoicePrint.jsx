import React, { useMemo } from 'react';
import { numberToWords } from '../utils/numberToWords';

const MAX_ROWS = 20;

function formatDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  return raw;
}

function formatExpiryMonthYear(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (isoMatch) return `${isoMatch[2]}/${isoMatch[1]}`;
  const slashMonthMatch = raw.match(/^(\d{2})\/(\d{4})$/);
  if (slashMonthMatch) return `${slashMonthMatch[1]}/${slashMonthMatch[2]}`;
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(date.getUTCFullYear());
    return `${mm}/${yyyy}`;
  }
  return raw;
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '';
  return `₹ ${Number(amount).toFixed(2)}`;
}

export default function InvoicePrint({ company, party, order, orderItems, totals, itemMap }) {
  const displayInvoiceNo = String(
    order?.invoice_no || order?.ref_number || order?.id || ''
  ).trim();

  const partyCustomProperties = useMemo(() => {
    if (!party?.extra_properties || typeof party.extra_properties !== 'object') return [];
    return Object.entries(party.extra_properties).filter(([key, value]) => {
      if (!key || value == null || String(value).trim() === '') return false;
      return true;
    });
  }, [party]);

  const rows = useMemo(() => {
    return orderItems.map((line, index) => {
      const qty = Number(line.qty || 0);
      const rate = Number(line.rate || 0);
      const gstRate = Number(line.gst_rate || 0);
      const amount = qty * rate;
      const gstAmount = amount * (gstRate / 100);
      const item = itemMap.get(String(line.item_id));
      return {
        sno: index + 1,
        name: item?.name || 'Item',
        hsn: line.hsn || item?.hsn || '',
        batch: line.batch_no || '',
        expiry: formatExpiryMonthYear(line.expiry_date || ''),
        mrp: line.mrp ?? '',
        qty,
        unit: line.unit || item?.base_unit || '',
        price: rate,
        gstAmount,
        gstRate,
        amount
      };
    });
  }, [orderItems, itemMap]);

  const hasMrpColumn = useMemo(
    () => rows.some((row) => row.mrp !== '' && row.mrp !== null && Number(row.mrp) !== 0),
    [rows]
  );
  const hasExpiryColumn = useMemo(
    () => rows.some((row) => row.expiry && String(row.expiry).trim() !== ''),
    [rows]
  );

  const emptyRowCount = Math.max(0, MAX_ROWS - rows.length);

  const totalQty = rows.reduce((sum, r) => sum + r.qty, 0);
  const totalGst = rows.reduce((sum, r) => sum + r.gstAmount, 0);
  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);

  const roundedTotal = Math.round(totals.invoiceTotal);
  const roundOff = (roundedTotal - totals.invoiceTotal).toFixed(2);

  return (
    <div className="invoice-print-wrapper">
      <div className="invoice-print">
        {/* ── HEADER ── */}
        <p className="inv-label">GST Invoice</p>
        <div className="inv-company-box">
          <h1>{company?.name || 'Company Name'}</h1>
          <p>{company?.address || ''}</p>
          {company?.phone && <p>Phone no.: {company.phone}</p>}
          {company?.email && <p>Email: {company.email}</p>}
          {(company?.gst_number || company?.state) && (
            <p>
              {company?.gst_number ? `GSTIN: ${company.gst_number}` : ''}
              {company?.gst_number && company?.state ? ' | ' : ''}
              {company?.state ? `State: ${company.state}` : ''}
            </p>
          )}
          {company?.drug_license && <p>DL No.: {company.drug_license}</p>}
        </div>

        {/* ── BILL TO / INVOICE DETAILS ── */}
        <div className="inv-parties">
          <div className="inv-bill-to">
            <p className="inv-section-label">Bill To</p>
            {party && (
              <>
                <p className="inv-party-name">{party.name}</p>
                {party.address && <p>{party.address}</p>}
                {party.phone && <p>Contact No. : {party.phone}</p>}
                {(party.gst_number || party.state_of_supply) && (
                  <p>
                    {party.gst_number ? `GSTIN: ${party.gst_number}` : ''}
                    {party.gst_number && party.state_of_supply ? ' | ' : ''}
                    {party.state_of_supply ? `State: ${party.state_of_supply}` : ''}
                  </p>
                )}
                {partyCustomProperties.map(([key, value]) => (
                  <p key={key}>
                    {key}: {value}
                  </p>
                ))}
              </>
            )}
          </div>
          <div className="inv-invoice-details">
            <p className="inv-section-label">Invoice Details</p>
            <p>Invoice No. : {displayInvoiceNo}</p>
            <p>Date : {formatDate(order?.order_date)}</p>
            {order?.place_of_supply && <p>Place of Supply : {order.place_of_supply}</p>}
          </div>
        </div>

        {/* ── ITEM TABLE ── */}
        <table className="inv-table">
          <thead>
            <tr>
              <th className="col-sno">#</th>
              <th className="col-item">Item name</th>
              <th className="col-hsn">HSN/SAC</th>
              <th className="col-batch">Batch No.</th>
              {hasExpiryColumn && <th className="col-expiry">Exp. Date</th>}
              {hasMrpColumn && <th className="col-mrp text-right">MRP</th>}
              <th className="col-qty text-right">Qty</th>
              <th className="col-unit">Unit</th>
              <th className="col-price text-right">Price/unit</th>
              <th className="col-gst text-right">GST</th>
              <th className="col-amount text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sno}>
                <td>{row.sno}</td>
                <td>{row.name}</td>
                <td>{row.hsn}</td>
                <td>{row.batch}</td>
                {hasExpiryColumn && <td>{row.expiry}</td>}
                {hasMrpColumn && (
                  <td className="text-right">{row.mrp !== '' ? formatCurrency(row.mrp) : ''}</td>
                )}
                <td className="text-right">{row.qty}</td>
                <td>{row.unit}</td>
                <td className="text-right">{formatCurrency(row.price)}</td>
                <td className="text-right">
                  {formatCurrency(row.gstAmount)}
                  {row.gstRate > 0 && ` (${row.gstRate}%)`}
                </td>
                <td className="text-right">{formatCurrency(row.amount)}</td>
              </tr>
            ))}
            {/* Empty filler rows */}
            {Array.from({ length: emptyRowCount }).map((_, i) => (
              <tr className="empty-row" key={`empty-${i}`}>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                {hasExpiryColumn && <td>&nbsp;</td>}
                {hasMrpColumn && <td>&nbsp;</td>}
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>Total</strong></td>
              <td></td>
              <td></td>
              {hasExpiryColumn && <td></td>}
              {hasMrpColumn && <td></td>}
              <td className="text-right"><strong>{totalQty}</strong></td>
              <td></td>
              <td></td>
              <td className="text-right"><strong>{formatCurrency(totalGst)}</strong></td>
              <td className="text-right"><strong>{formatCurrency(totalAmount)}</strong></td>
            </tr>
          </tfoot>
        </table>

        {/* ── AMOUNT IN WORDS + AMOUNTS ── */}
        <div className="inv-summary">
          <div className="inv-words">
            <p className="inv-section-label">Invoice Amount In Words</p>
            <p>{numberToWords(roundedTotal)}</p>
          </div>
          <div className="inv-amounts">
            <p className="inv-section-label">Amounts</p>
            <table>
              <tbody>
                <tr>
                  <td>Sub Total</td>
                  <td>{formatCurrency(totals.invoiceTotal)}</td>
                </tr>
                <tr>
                  <td>Round off</td>
                  <td>{formatCurrency(roundOff)}</td>
                </tr>
                <tr className="inv-grand-total">
                  <td>Total</td>
                  <td>{formatCurrency(roundedTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── TERMS + SIGNATURE ── */}
        <div className="inv-footer">
          <div className="inv-terms">
            <p className="inv-section-label">Terms and Conditions</p>
            <p>All disputes are subject to Delhi jurisdiction.</p>
            <p>Goods once sold will not be taken back.</p>
            <p>Reverse charge applicable.</p>
          </div>
          <div className="inv-signatory">
            <p className="inv-for-company">For : {company?.name || 'Company Name'}</p>
            <p className="inv-auth-label">Authorized Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
