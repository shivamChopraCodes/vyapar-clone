const { generateGeminiResponse } = require('./geminiService');
const { SALE_SLIP_PROMPT, parseJsonResponse } = require('./prompts/saleSlipPrompt');
const { normalizeSlip } = require('./slipNormalizer');
const { matchParty, matchItems } = require('./matchingService');
const { resolveLineQuantity } = require('./packResolver');
const db = require('./db');

const SLIP_MODEL = 'gemini-3.5-flash';

// Standard pharmaceutical GST in India. Applied only when the slip states no rate and the
// matched item carries none — confirmed as the right fallback for this business.
const DEFAULT_GST_RATE = 5;

const round2 = (value) => Math.round(value * 100) / 100;

// Mirrors createOrder's round-off rule so the preview shows the figure the invoice will actually
// carry, and so payment maths uses that same number rather than the unrounded one.
function applyRoundOff(total) {
  const decimal = total - Math.floor(total);
  return decimal > 0.5 ? Math.ceil(total) : Math.floor(total);
}

// Reads a photographed slip into a reviewable draft. Deliberately performs no writes — every
// database change waits for an explicit human confirmation downstream.
async function buildDraftFromImage(imagePath) {
  const response = await generateGeminiResponse({
    prompt: SALE_SLIP_PROMPT,
    imagePath,
    model: SLIP_MODEL
  });

  const extracted = parseJsonResponse(response.text);
  const slip = normalizeSlip(extracted);

  const parties = db.listParties();
  const items = db.listItems();

  const partyMatch = matchParty(slip.party, parties);
  const itemMatches = matchItems(
    slip.items.map((line) => ({ item_name: line.item_name, hsn: line.hsn })),
    items
  );

  // Fold match results back onto the normalized lines so the preview has one object per line.
  // Ambiguous pack quantities are only resolvable here, once the master item is known.
  const lines = slip.items.map((line, index) => {
    const match = itemMatches[index] || {};
    const matchedName = match.matched_item?.name || '';
    const history = match.matched_item?.id ? db.listItemSaleHistory(match.matched_item.id) : [];
    const resolved = resolveLineQuantity(line, matchedName, history);

    // GST: what the slip states wins; otherwise the matched item's own tax code; otherwise the
    // 5% standard pharmaceutical rate. Recorded so the review step can show where it came from.
    let gstRate = line.gst_rate;
    let gstBasis = 'slip';
    if (!Number.isFinite(gstRate) || gstRate <= 0) {
      const masterRate = Number(match.matched_item?.gst_rate || 0);
      if (masterRate > 0) {
        gstRate = masterRate;
        gstBasis = 'item-master';
      } else {
        gstRate = DEFAULT_GST_RATE;
        gstBasis = 'default';
      }
    }

    return {
      ...line,
      qty: resolved.qty ?? line.qty,
      rate: resolved.rate ?? line.rate,
      gst_rate: gstRate,
      gst_basis: gstBasis,
      hsn: line.hsn || match.matched_item?.hsn || '',
      qty_basis: resolved.basis,
      qty_uncertain: Boolean(resolved.uncertain),
      qty_alternatives: resolved.alternatives || [],
      // The normalizer's generic "could also be" note is superseded by the resolver's reasoning.
      warnings: [
        ...line.warnings.filter((warning) => !warning.startsWith('"')),
        ...resolved.warnings
      ],
      match_action: match.action || 'create_new',
      match_confidence: match.confidence || 0,
      matched_item_id: match.matched_item?.id || null,
      matched_item_name: match.matched_item?.name || '',
      candidates: (match.candidates || []).slice(0, 5).map((c) => ({
        id: c.item.id,
        name: c.item.name,
        confidence: c.confidence
      }))
    };
  });

  // The handwritten total is the pre-GST subtotal — verified against invoice 1933, whose lines
  // sum to 2942.96 and whose header total is 3090.00 (= x1.05, less an 0.11 round-off). So the
  // slip's total checks the lines, and GST is added on top when the invoice is created.
  const gstTotal = round2(
    lines.reduce((sum, line) => {
      const base = (Number(line.qty) || 0) * (Number(line.rate) || 0);
      return sum + (base * (Number(line.gst_rate) || 0)) / 100;
    }, 0)
  );

  return {
    image_path: imagePath,
    mode: db.getMode(),
    gst_total: gstTotal,
    invoice_total: round2(slip.computed_total + gstTotal),
    party: {
      ...slip.party,
      matched_id: partyMatch.matched?.id || null,
      matched_name: partyMatch.matched?.name || '',
      confidence: partyMatch.confidence || 0,
      action: partyMatch.action,
      candidates: (partyMatch.candidates || []).slice(0, 5).map((c) => ({
        id: c.party.id,
        name: c.party.name,
        confidence: c.confidence
      }))
    },
    letterhead: slip.letterhead,
    // The number printed on the slip is the supplier's own order-pad serial (e.g. 11359) and must
    // never become our invoice number — createOrder derives the next number from MAX(ref), so
    // adopting it would jump this firm's sequence by thousands and never recover. Kept for
    // reference only; invoice_no stays blank so the firm's own sequence is used.
    bill: {
      invoice_no: '',
      order_date: slip.bill.order_date,
      slip_no: slip.bill.invoice_no || '',
      next_number: db.peekNextInvoiceNumber('sale'),
      // Null means "not chosen yet"; recomputeTotals seeds it to the full invoice, so an
      // unanswered draft records a credit sale rather than falsely claiming payment.
      balance_amount: null
    },
    lines,
    stated_total: slip.stated_total,
    computed_total: slip.computed_total,
    total_check: slip.total_check,
    warnings: slip.warnings,
    raw_text: response.text
  };
}

// Recomputes every derived total from the current lines. Called after each edit so the preview
// and the eventual invoice can never drift from what the user actually approved.
function recomputeTotals(draft) {
  const subtotal = round2(
    draft.lines.reduce((sum, line) => {
      const lineAmount =
        Number.isFinite(Number(line.qty)) && Number.isFinite(Number(line.rate))
          ? Number(line.qty) * Number(line.rate)
          : Number(line.amount) || 0;
      return sum + lineAmount;
    }, 0)
  );
  const gstTotal = round2(
    draft.lines.reduce((sum, line) => {
      const base = (Number(line.qty) || 0) * (Number(line.rate) || 0);
      return sum + (base * (Number(line.gst_rate) || 0)) / 100;
    }, 0)
  );

  draft.computed_total = subtotal;
  draft.gst_total = gstTotal;
  draft.invoice_total = round2(subtotal + gstTotal);
  // What the invoice will actually be billed at, once createOrder applies its round-off.
  draft.payable_total = applyRoundOff(draft.invoice_total);

  // An untouched draft is a credit sale; once the user has chosen, only clamp so an edit that
  // lowers the invoice cannot leave a balance larger than the invoice itself.
  if (draft.bill) {
    // Test for "not chosen" before coercing: Number(null) is 0, which would silently record an
    // untouched draft as paid in full — the opposite of the intended default.
    const raw = draft.bill.balance_amount;
    const chosen = raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw));
    draft.bill.balance_amount = chosen
      ? round2(Math.min(Math.max(Number(raw), 0), draft.payable_total))
      : draft.payable_total;
  }

  if (draft.stated_total === null || draft.stated_total === undefined) {
    draft.total_check = 'unknown';
  } else {
    draft.total_check = Math.abs(draft.stated_total - subtotal) < 0.02 ? 'match' : 'mismatch';
  }
  return draft;
}

// Everything that must be true before a draft may become a real invoice. Recomputed from the
// draft itself rather than read off warning text, so editing a field clears its blocker.
function draftBlockers(draft) {
  const blockers = [];

  if (!draft.lines.length) blockers.push('No item lines.');

  draft.lines.forEach((line, index) => {
    const label = line.matched_item_name || line.item_name || `line ${index + 1}`;
    if (!Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0) {
      blockers.push(`${index + 1}. ${label}: quantity missing.`);
    }
    if (!Number.isFinite(Number(line.rate)) || Number(line.rate) < 0) {
      blockers.push(`${index + 1}. ${label}: rate missing.`);
    }
    // 99% of this firm's items carry an HSN; a new one without it breaks the GSTR-1 HSN summary.
    if (line.match_action === 'create_new' && !String(line.hsn || '').trim()) {
      blockers.push(`${index + 1}. ${label}: new item needs an HSN.`);
    }
    if (line.match_action === 'create_new' && !String(line.item_name || '').trim()) {
      blockers.push(`${index + 1}. new item needs a name.`);
    }
  });

  // Creating a customer must be as deliberate as creating an item. Without this gate a garbled
  // name goes straight into the party master — which is exactly how a scribbled "ENT" note
  // became a customer record.
  if (!draft.party.matched_id) {
    if (!String(draft.party.name || '').trim()) {
      blockers.push('No customer set.');
    } else if (!draft.party.confirmed_new) {
      blockers.push(`Customer "${draft.party.name}" is not in your list — confirm or pick one.`);
    }
  }

  // A misread year is invisible to the total checksum but files the invoice in the wrong
  // financial period, and it has been wrong often enough to warrant blocking rather than warning.
  const orderDate = String(draft.bill.order_date || '').trim();
  if (!orderDate) {
    blockers.push('Invoice date not set.');
  } else {
    const parsed = new Date(`${orderDate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      blockers.push(`Invoice date "${orderDate}" is not a valid date.`);
    } else {
      const days = (parsed.getTime() - Date.now()) / 86400000;
      if (days > 30) blockers.push(`Date ${orderDate} is in the future — confirm the year.`);
      else if (days < -365) blockers.push(`Date ${orderDate} is over a year old — confirm the year.`);
    }
  }

  return blockers;
}

const rupees = (value) =>
  value === null || value === undefined ? '—' : `₹${Number(value).toFixed(2)}`;

function confidenceIcon(action, confidence) {
  if (action === 'matched' && confidence >= 0.85) return '✅';
  if (action === 'create_new') return '🆕';
  return '⚠️';
}

// Telegram message body. Plain text, because HTML/Markdown parse modes turn a stray character
// in a drug name into a failed send.
function renderDraftMessage(draft) {
  const tag = draft.mode === 'dev' ? '🧪 DEV · ' : '';
  const out = [`${tag}📄 Draft Sale Invoice`, ''];

  const partyLabel = draft.party.matched_name || draft.party.name || '(not read)';
  const partyIcon = draft.party.matched_id ? '✅' : '⚠️';
  out.push(`Party: ${partyLabel} ${partyIcon}`);
  if (draft.party.matched_id && draft.party.name && draft.party.matched_name !== draft.party.name) {
    out.push(`  (slip says "${draft.party.name}")`);
  }
  out.push(`Date:    ${draft.bill.order_date || '⚠️ not read'}`);
  out.push(
    `Invoice: ${draft.bill.invoice_no || `auto (${draft.bill.next_number || '?'})`}`
  );
  if (draft.bill.slip_no) out.push(`Slip#:   ${draft.bill.slip_no} (supplier's own number)`);
  out.push('');

  draft.lines.forEach((line, index) => {
    const name = line.matched_item_name || line.item_name || '(unreadable)';
    out.push(`${index + 1}. ${name} ${confidenceIcon(line.match_action, line.match_confidence)}`);
    if (line.matched_item_name && line.item_name) {
      out.push(`   slip: "${line.item_name}"`);
    }
    // Derive the line total rather than echoing the extracted amount, so an edited quantity is
    // reflected here instead of silently disagreeing with the recomputed invoice total.
    const lineTotal =
      Number.isFinite(Number(line.qty)) && Number.isFinite(Number(line.rate))
        ? round2(Number(line.qty) * Number(line.rate))
        : line.amount;
    out.push(
      `   ${line.qty ?? '?'} ${line.unit_label || 'pc'} × ${rupees(line.rate)} = ${rupees(lineTotal)}`
    );
    // The total checksum validates amounts, not the qty/rate split — a misread quantity yields a
    // compensating rate and still sums correctly. Showing the raw text is the only way to catch it.
    if (line.qty_raw && line.qty_raw.replace(/\s/g, '') !== String(line.qty)) {
      out.push(`   qty as written: "${line.qty_raw}"`);
    }
    line.warnings.forEach((warning) => out.push(`   ⚠️ ${warning}`));
  });

  out.push('');
  out.push(`Subtotal: ${rupees(draft.computed_total)}`);
  if (draft.total_check === 'match') {
    out.push(`✓ matches the ${rupees(draft.stated_total)} written on the slip`);
  } else if (draft.total_check === 'mismatch') {
    out.push(`✗ slip says ${rupees(draft.stated_total)} — check the lines`);
  }
  out.push(`GST:      ${rupees(draft.gst_total)}`);
  const payable = Number(draft.payable_total ?? draft.invoice_total);
  const roundOff = round2(payable - Number(draft.invoice_total));
  if (Math.abs(roundOff) >= 0.005) {
    out.push(`Round off:${roundOff > 0 ? ' +' : ' '}${rupees(roundOff).replace('₹', '₹')}`);
  }
  out.push(`INVOICE:  ${rupees(payable)}`);

  const balance = Number(draft.bill?.balance_amount ?? payable);
  if (balance <= 0.005) {
    out.push('Payment:  ✅ paid in full');
  } else if (balance >= payable - 0.005) {
    out.push('Payment:  📋 on credit — nothing received');
  } else {
    out.push(`Payment:  ➗ ${rupees(payable - balance)} received, ${rupees(balance)} outstanding`);
  }

  if (draft.warnings.length) {
    out.push('');
    draft.warnings.forEach((warning) => out.push(`⚠️ ${warning}`));
  }

  return out.join('\n');
}

module.exports = {
  buildDraftFromImage,
  renderDraftMessage,
  recomputeTotals,
  draftBlockers,
  SLIP_MODEL
};
