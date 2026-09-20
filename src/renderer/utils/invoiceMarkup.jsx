import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InvoicePrint from '../components/InvoicePrint';
import invoicePrintCss from '../invoice-print.css?inline';

const firstWord = (value) => String(value || '').trim().split(/\s+/)[0] || '';

export const buildInvoiceFileName = (order) => {
  const parts = [
    firstWord(order.party_name),
    String(order.order_date || '').slice(0, 10),
    String(order.ref_number || order.id || '')
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : `Invoice ${order.id}`;
};

/**
 * Renders one order to print-ready HTML, fetching everything it needs itself.
 *
 * Lives in the renderer because it reuses the InvoicePrint component — the main process has no
 * React, and duplicating the invoice layout there would guarantee the two drift apart.
 */
export async function buildInvoiceMarkup(orderId) {
  const [order, lines, parties, items, companies] = await Promise.all([
    window.vyapar.getOrder(orderId),
    window.vyapar.listOrderItems(orderId),
    window.vyapar.listParties(),
    window.vyapar.listItems(),
    window.vyapar.listCompanies()
  ]);
  if (!order) throw new Error(`Order ${orderId} not found.`);

  const partiesMap = new Map((parties || []).map((party) => [String(party.id), party]));
  const itemMap = new Map((items || []).map((item) => [String(item.id), item]));
  const company = (companies || [])[0] || null;
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

  const orderForPrint = { ...order, invoice_no: order?.ref_number || '' };
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

  return {
    markup,
    css: invoicePrintCss,
    filename: buildInvoiceFileName({ ...order, party_name: party?.name })
  };
}

// The main process drives PDF generation for the Telegram bot and reaches this through
// webContents.executeJavaScript, which can only see globals.
export function installInvoiceMarkupBridge() {
  window.__buildInvoiceMarkup = (orderId) => buildInvoiceMarkup(orderId);
}
