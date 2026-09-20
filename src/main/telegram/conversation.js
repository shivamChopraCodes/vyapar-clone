const { renderDraftMessage, recomputeTotals, draftBlockers } = require('../slipPipeline');
const { resolveLineQuantity } = require('../packResolver');
const { matchItems, diceCoefficient } = require('../matchingService');
const draftStore = require('./draftStore');
const db = require('../db');

// Accepts the two forms a person actually types. Indian day-first order is assumed for the
// slash form, matching how these slips are written.
function parseDateInput(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  let year;
  let month;
  let day;
  if (iso) {
    [, year, month, day] = iso.map(Number);
  } else if (slash) {
    [, day, month, year] = slash.map(Number);
    if (year < 100) year += 2000;
  } else {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

// Telegram caps callback_data at 64 bytes, so the payload is a compact pipe-delimited tuple
// rather than JSON: "<draftId>|<verb>|<a>|<b>".
function cb(draftId, verb, a = '', b = '') {
  return `${draftId}|${verb}|${a}|${b}`;
}

function parseCallback(data) {
  const [draftId, verb, a, b] = String(data || '').split('|');
  return { draftId: Number(draftId), verb: verb || '', a: a || '', b: b || '' };
}

// Telegram rejects button labels beyond a certain width far less gracefully than it truncates,
// so long drug names are shortened here.
function truncate(text, max = 32) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function mainKeyboard(draftId, draft) {
  const blockers = draftBlockers(draft);
  const rows = [];
  rows.push([
    blockers.length
      ? { text: `⚠️ ${blockers.length} to fix`, callback_data: cb(draftId, 'blk') }
      : { text: '✅ Generate', callback_data: cb(draftId, 'gen') },
    { text: '✏️ Fix', callback_data: cb(draftId, 'fix') }
  ]);
  rows.push([{ text: '❌ Cancel', callback_data: cb(draftId, 'cxl') }]);
  return { inline_keyboard: rows };
}

function fixKeyboard(draftId, draft) {
  const rows = draft.lines.map((line, index) => {
    const name = line.matched_item_name || line.item_name || 'unreadable';
    const flag = line.match_action === 'matched' && line.match_confidence >= 0.85 ? '' : ' ⚠️';
    return [{ text: `${index + 1}. ${truncate(name)}${flag}`, callback_data: cb(draftId, 'ln', index) }];
  });
  // Header fields are as wrong-able as the lines: a misread year lands the invoice in the wrong
  // financial period, and the party decides whose ledger it hits.
  rows.push([
    { text: `👤 ${truncate(draft.party.matched_name || draft.party.name || 'no party', 18)}`, callback_data: cb(draftId, 'pty') },
    { text: `📅 ${draft.bill.order_date || 'set date'}`, callback_data: cb(draftId, 'dt') }
  ]);
  rows.push([
    {
      text: `🔢 Invoice: ${draft.bill.invoice_no || `auto (${draft.bill.next_number || '?'})`}`,
      callback_data: cb(draftId, 'inv')
    },
    { text: `💵 ${paymentLabel(draft)}`, callback_data: cb(draftId, 'pay') }
  ]);
  rows.push([{ text: '⬅️ Back', callback_data: cb(draftId, 'back') }]);
  return { inline_keyboard: rows };
}

// Payment state is the cash/balance split on the invoice header. Defaulting to "on credit" is the
// safer assumption: 70 of the existing sale invoices carry an outstanding balance, so recording a
// sale as settled when it isn't is the more likely error.
function paymentLabel(draft) {
  const balance = Number(draft.bill.balance_amount);
  if (!Number.isFinite(balance) || balance <= 0) return 'Paid';
  const total = Number(draft.payable_total ?? draft.invoice_total ?? 0);
  if (balance >= total - 0.005) return 'On credit';
  return `Part paid`;
}

function paymentKeyboard(draftId, draft) {
  const total = Number(draft.payable_total ?? draft.invoice_total ?? 0);
  return {
    inline_keyboard: [
      [{ text: `💵 Paid in full (₹${total.toFixed(2)})`, callback_data: cb(draftId, 'payfull') }],
      [{ text: '📋 On credit — nothing received', callback_data: cb(draftId, 'paynone') }],
      [{ text: '➗ Part paid — type the amount', callback_data: cb(draftId, 'paypart') }],
      [{ text: '⬅️ Back', callback_data: cb(draftId, 'fix') }]
    ]
  };
}

function paymentText(draft) {
  const total = Number(draft.payable_total ?? draft.invoice_total ?? 0);
  const balance = Number(draft.bill.balance_amount || 0);
  const received = Math.max(0, total - balance);
  return [
    'Payment for this invoice',
    '',
    `Invoice total: ₹${total.toFixed(2)}`,
    `Received now:  ₹${received.toFixed(2)}`,
    `Outstanding:   ₹${balance.toFixed(2)}`
  ].join('\n');
}

function partyKeyboard(draftId, draft) {
  const rows = (draft.party.candidates || []).map((candidate) => [
    {
      text: `${truncate(candidate.name)}  ${(candidate.confidence * 100).toFixed(0)}%`,
      callback_data: cb(draftId, 'ppick', candidate.id)
    }
  ]);
  rows.push([{ text: '🔍 Search parties', callback_data: cb(draftId, 'psrch') }]);
  rows.push([{ text: '🆕 Create new party', callback_data: cb(draftId, 'pnew') }]);
  rows.push([{ text: '⬅️ Back', callback_data: cb(draftId, 'fix') }]);
  return { inline_keyboard: rows };
}

function partyText(draft) {
  const out = ['Party for this invoice', ''];
  out.push(`Slip reads: "${draft.party.name || '(not read)'}"`);
  out.push(
    `Matched:    ${draft.party.matched_name || '(none — would create new)'}` +
      (draft.party.matched_id ? ` [#${draft.party.matched_id}]` : '')
  );
  out.push(`Confidence: ${((draft.party.confidence || 0) * 100).toFixed(0)}%`);
  if (!draft.party.matched_id) {
    out.push('');
    out.push('⚠️ No existing party matched. Creating one adds a permanent customer record.');
  }
  return out.join('\n');
}

function relinkParty(draft, partyId) {
  const party = db.listParties().find((p) => String(p.id) === String(partyId));
  if (!party) return draft;
  draft.party.matched_id = party.id;
  draft.party.matched_name = party.name;
  draft.party.confidence = 1;
  draft.party.action = 'matched';
  delete draft.party.confirmed_new;
  return draft;
}

const PARTY_SEARCH_MIN_CONFIDENCE = 0.25;

function searchParties(draft, term) {
  const ranked = db
    .listParties()
    .map((party) => ({ party, confidence: diceCoefficient(term, party.name || '') }))
    .filter((entry) => entry.confidence >= PARTY_SEARCH_MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6)
    .map((entry) => ({ id: entry.party.id, name: entry.party.name, confidence: entry.confidence }));
  if (ranked.length) draft.party.candidates = ranked;
  return { draft, candidates: ranked };
}

function lineKeyboard(draftId, draft, index) {
  const line = draft.lines[index];
  const rows = [[{ text: '🔄 Change item', callback_data: cb(draftId, 'itm', index) }]];

  // Only offer the flip when the pack reading was genuinely ambiguous.
  (line.qty_alternatives || []).forEach((alt) => {
    rows.push([
      {
        text: `🔢 Use ${alt.qty} × ₹${Number(alt.rate).toFixed(2)}`,
        callback_data: cb(draftId, 'qty', index, alt.qty)
      }
    ]);
  });

  rows.push([{ text: '🗑 Delete line', callback_data: cb(draftId, 'del', index) }]);
  rows.push([{ text: '⬅️ Back', callback_data: cb(draftId, 'fix') }]);
  return { inline_keyboard: rows };
}

function candidateKeyboard(draftId, draft, index) {
  const line = draft.lines[index];
  const rows = (line.candidates || []).map((candidate) => [
    {
      text: `${truncate(candidate.name)}  ${(candidate.confidence * 100).toFixed(0)}%`,
      callback_data: cb(draftId, 'pick', index, candidate.id)
    }
  ]);
  // Only 5 of ~1,700 items are ranked here, so there must always be a way out: search the full
  // master, or declare the item genuinely new.
  rows.push([{ text: '🔍 Search by name', callback_data: cb(draftId, 'srch', index) }]);
  rows.push([{ text: '🆕 Create new item', callback_data: cb(draftId, 'new', index) }]);
  rows.push([{ text: '⬅️ Back', callback_data: cb(draftId, 'ln', index) }]);
  return { inline_keyboard: rows };
}

// Shown once a line is destined to create a new item. Name, HSN and GST must all be settable:
// an OCR typo would otherwise become a permanent junk entry, and a handwritten slip never
// carries an HSN at all — yet 99% of this firm's items have one, so blank is plainly wrong.
function newItemKeyboard(draftId, draft, index) {
  const line = draft.lines[index];
  return {
    inline_keyboard: [
      [{ text: `✏️ Name: ${truncate(line.item_name || 'not set', 24)}`, callback_data: cb(draftId, 'ren', index) }],
      [{ text: `🏷 HSN: ${line.hsn || '⚠️ not set'}`, callback_data: cb(draftId, 'hsn', index) }],
      [{ text: `％ GST: ${line.gst_rate}%`, callback_data: cb(draftId, 'gst', index) }],
      [{ text: '🔍 Search existing instead', callback_data: cb(draftId, 'srch', index) }],
      [{ text: '⬅️ Back', callback_data: cb(draftId, 'ln', index) }]
    ]
  };
}

function hsnKeyboard(draftId, index) {
  const common = db.listCommonHsnCodes(6);
  const rows = [];
  for (let i = 0; i < common.length; i += 3) {
    rows.push(
      common.slice(i, i + 3).map((entry) => ({
        text: entry.hsn,
        callback_data: cb(draftId, 'shsn', index, entry.hsn)
      }))
    );
  }
  rows.push([{ text: '⌨️ Type another HSN', callback_data: cb(draftId, 'thsn', index) }]);
  rows.push([{ text: '⬅️ Back', callback_data: cb(draftId, 'new', index) }]);
  return { inline_keyboard: rows };
}

function gstKeyboard(draftId, index) {
  const rates = db.listUsedTaxRates().filter((rate) => rate >= 0);
  const choices = rates.length ? rates : [0, 5, 12, 18, 28];
  const rows = [];
  for (let i = 0; i < choices.length; i += 4) {
    rows.push(
      choices.slice(i, i + 4).map((rate) => ({
        text: `${rate}%`,
        callback_data: cb(draftId, 'sgst', index, rate)
      }))
    );
  }
  rows.push([{ text: '⬅️ Back', callback_data: cb(draftId, 'new', index) }]);
  return { inline_keyboard: rows };
}

function newItemText(draft, index) {
  const line = draft.lines[index];
  const out = [`${lineDetailText(draft, index)}`, ''];
  out.push('🆕 This line will CREATE a new item:');
  out.push(`   Name: ${line.item_name || '(not set)'}`);
  out.push(`   HSN:  ${line.hsn || '(not set)'}`);
  out.push(`   GST:  ${line.gst_rate}%`);
  out.push('');
  if (!line.hsn) {
    out.push('⚠️ HSN is required for GST invoices and the GSTR-1 HSN summary.');
  }
  out.push('These become a permanent entry in your item list.');
  return out.join('\n');
}

// Marks a line as creating a new item rather than linking to an existing one.
function markAsNewItem(draft, index) {
  const line = draft.lines[index];
  line.matched_item_id = null;
  line.matched_item_name = '';
  line.match_action = 'create_new';
  line.match_confidence = 0;
  return recomputeTotals(draft);
}

function renameLineItem(draft, index, name) {
  const line = draft.lines[index];
  line.item_name = String(name || '').trim().toUpperCase();
  line.warnings = [`Name set by hand: "${line.item_name}".`];
  return recomputeTotals(draft);
}

// A deliberately typed search term deserves a stricter floor than OCR text: anything weaker is
// noise, and showing it hides the "nothing matched, create it" answer the user actually needs.
const SEARCH_MIN_CONFIDENCE = 0.3;

// Re-ranks the whole master against a term the user typed, rather than the OCR text.
function searchItems(draft, index, term) {
  const line = draft.lines[index];
  const matches = matchItems([{ item_name: term, hsn: line.hsn }], db.listItems());
  const candidates = (matches[0]?.candidates || [])
    .filter((c) => c.confidence >= SEARCH_MIN_CONFIDENCE)
    .slice(0, 6)
    .map((c) => ({
      id: c.item.id,
      name: c.item.name,
      confidence: c.confidence
    }));
  if (candidates.length) line.candidates = candidates;
  return { draft, candidates };
}

function lineDetailText(draft, index) {
  const line = draft.lines[index];
  const out = [`Line ${index + 1}`, ''];
  out.push(`Slip text:  "${line.item_name || '(unreadable)'}"`);
  out.push(`Matched:    ${line.matched_item_name || '(none — would create new)'}`);
  out.push(`Confidence: ${(line.match_confidence * 100).toFixed(0)}%`);
  out.push(`Quantity:   ${line.qty ?? '?'} (written "${line.qty_raw || '—'}")`);
  out.push(`Rate:       ₹${Number(line.rate || 0).toFixed(2)}`);
  out.push(`HSN:        ${line.hsn || '(not set)'}`);
  out.push(`GST:        ${line.gst_rate}% (${line.gst_basis})`);
  if (line.notes) out.push(`Notes:      ${line.notes}`);
  (line.warnings || []).forEach((warning) => out.push(`⚠️ ${warning}`));
  return out.join('\n');
}

// Re-derives a line after its matched item changed, because the pack reading and GST both depend
// on which master item it is.
function relinkLine(draft, index, itemId) {
  const line = draft.lines[index];
  const items = db.listItems();
  const item = items.find((candidate) => String(candidate.id) === String(itemId));
  if (!item) return draft;

  line.matched_item_id = item.id;
  line.matched_item_name = item.name;
  line.match_action = 'matched';
  line.match_confidence = 1;
  line.hsn = line.hsn || item.hsn || '';
  if (Number(item.gst_rate) > 0) {
    line.gst_rate = Number(item.gst_rate);
    line.gst_basis = 'item-master';
  }

  // A quantity the user set by hand outranks anything re-derivation would produce — silently
  // reverting their explicit choice because the item changed would be worse than not re-deriving.
  if (line.qty_basis !== 'manual') {
    const history = db.listItemSaleHistory(item.id);
    const resolved = resolveLineQuantity(line, item.name, history);
    if (resolved.qty) {
      line.qty = resolved.qty;
      line.rate = resolved.rate;
      line.qty_basis = resolved.basis;
      line.qty_uncertain = Boolean(resolved.uncertain);
      line.qty_alternatives = resolved.alternatives || [];
    }
    line.warnings = resolved.warnings || [];
  }
  return recomputeTotals(draft);
}

function setLineQuantity(draft, index, qty) {
  const line = draft.lines[index];
  const amount = Number(line.amount);
  const nextQty = Number(qty);
  if (!Number.isFinite(nextQty) || nextQty <= 0) return draft;

  const previousQty = line.qty;
  line.qty = nextQty;
  if (Number.isFinite(amount) && amount > 0) {
    line.rate = Math.round((amount / nextQty) * 100) / 100;
  }
  line.qty_basis = 'manual';
  line.qty_uncertain = false;
  // Offer the previous reading back, so a mis-tap is one tap to undo.
  line.qty_alternatives = [{ qty: previousQty, rate: Math.round((amount / previousQty) * 100) / 100 }];
  line.warnings = [`Quantity set to ${nextQty} by hand.`];
  return recomputeTotals(draft);
}

function deleteLine(draft, index) {
  draft.lines.splice(index, 1);
  return recomputeTotals(draft);
}

/**
 * Applies one button press. Returns what the bot should display next.
 * Performs no database writes — 'gen' is handled by the caller.
 */
function handleCallback(data) {
  const { draftId, verb, a, b } = parseCallback(data);
  const record = draftStore.getDraft(draftId);
  if (!record) {
    return { alert: 'That draft is no longer available.', done: true };
  }
  if (record.status !== 'review' && verb !== 'noop') {
    return { alert: `This draft is already ${record.status}.`, done: true };
  }

  let draft = record.draft;
  const index = Number(a);

  switch (verb) {
    case 'fix':
      return { text: renderDraftMessage(draft), keyboard: fixKeyboard(draftId, draft), toast: 'Pick a line' };

    case 'back':
      return { text: renderDraftMessage(draft), keyboard: mainKeyboard(draftId, draft) };

    case 'ln':
      return { text: lineDetailText(draft, index), keyboard: lineKeyboard(draftId, draft, index) };

    case 'itm':
      return {
        text: `${lineDetailText(draft, index)}\n\nPick the correct item:`,
        keyboard: candidateKeyboard(draftId, draft, index)
      };

    case 'pick':
      draft = relinkLine(draft, index, b);
      draftStore.saveDraft(draftId, draft);
      return {
        text: renderDraftMessage(draft),
        keyboard: mainKeyboard(draftId, draft),
        toast: 'Item updated'
      };

    case 'qty':
      draft = setLineQuantity(draft, index, b);
      draftStore.saveDraft(draftId, draft);
      return {
        text: renderDraftMessage(draft),
        keyboard: mainKeyboard(draftId, draft),
        toast: `Quantity set to ${b}`
      };

    case 'del':
      draft = deleteLine(draft, index);
      draftStore.saveDraft(draftId, draft);
      if (!draft.lines.length) {
        draftStore.setStatus(draftId, 'cancelled');
        return { text: 'All lines removed — draft cancelled.', done: true, toast: 'Draft cancelled' };
      }
      return {
        text: renderDraftMessage(draft),
        keyboard: mainKeyboard(draftId, draft),
        toast: 'Line deleted'
      };

    case 'srch':
      draft._awaiting = { type: 'search', index };
      draftStore.saveDraft(draftId, draft);
      return {
        text:
          `Line ${index + 1} — slip reads "${draft.lines[index].item_name}".\n\n` +
          'Reply with part of the correct item name and I will search all items.',
        keyboard: { inline_keyboard: [[{ text: '⬅️ Cancel search', callback_data: cb(draftId, 'ln', index) }]] },
        toast: 'Type a name'
      };

    case 'new':
      draft = markAsNewItem(draft, index);
      draftStore.saveDraft(draftId, draft);
      return {
        text: newItemText(draft, index),
        keyboard: newItemKeyboard(draftId, draft, index),
        toast: 'Will create new item'
      };

    case 'hsn':
      return {
        text: `Line ${index + 1} — pick the HSN code:\n\nMost used in your item list first.`,
        keyboard: hsnKeyboard(draftId, index)
      };

    case 'shsn':
      draft.lines[index].hsn = String(b).trim();
      draftStore.saveDraft(draftId, draft);
      return {
        text: newItemText(draft, index),
        keyboard: newItemKeyboard(draftId, draft, index),
        toast: `HSN ${b}`
      };

    case 'thsn':
      draft._awaiting = { type: 'hsn', index };
      draftStore.saveDraft(draftId, draft);
      return {
        text: `Reply with the HSN code for line ${index + 1}.`,
        keyboard: { inline_keyboard: [[{ text: '⬅️ Cancel', callback_data: cb(draftId, 'new', index) }]] },
        toast: 'Type the HSN'
      };

    case 'gst':
      return {
        text: `Line ${index + 1} — pick the GST rate:`,
        keyboard: gstKeyboard(draftId, index)
      };

    case 'sgst':
      draft.lines[index].gst_rate = Number(b);
      draft.lines[index].gst_basis = 'manual';
      draft = recomputeTotals(draft);
      draftStore.saveDraft(draftId, draft);
      return {
        text: newItemText(draft, index),
        keyboard: newItemKeyboard(draftId, draft, index),
        toast: `GST ${b}%`
      };

    case 'ren':
      draft._awaiting = { type: 'rename', index };
      draftStore.saveDraft(draftId, draft);
      return {
        text: `Reply with the correct name for line ${index + 1}.\n\nCurrently: "${draft.lines[index].item_name}"`,
        keyboard: { inline_keyboard: [[{ text: '⬅️ Cancel', callback_data: cb(draftId, 'ln', index) }]] },
        toast: 'Type the name'
      };

    case 'blk': {
      const blockers = draftBlockers(draft);
      return {
        text:
          'These must be fixed before the invoice can be created:\n\n' +
          blockers.map((reason) => `• ${reason}`).join('\n'),
        keyboard: fixKeyboard(draftId, draft)
      };
    }

    case 'pty':
      return { text: partyText(draft), keyboard: partyKeyboard(draftId, draft) };

    case 'ppick':
      draft = relinkParty(draft, a);
      draftStore.saveDraft(draftId, draft);
      return {
        text: renderDraftMessage(draft),
        keyboard: mainKeyboard(draftId, draft),
        toast: 'Party updated'
      };

    case 'psrch':
      draft._awaiting = { type: 'party_search' };
      draftStore.saveDraft(draftId, draft);
      return {
        text: 'Reply with part of the customer name and I will search your parties.',
        keyboard: { inline_keyboard: [[{ text: '⬅️ Cancel', callback_data: cb(draftId, 'pty') }]] },
        toast: 'Type a name'
      };

    case 'pnew':
      draft.party.matched_id = null;
      draft.party.matched_name = '';
      draft.party.confidence = 0;
      draft.party.action = 'create_new';
      draft.party.confirmed_new = true;
      draftStore.saveDraft(draftId, draft);
      return {
        text:
          `${partyText(draft)}\n\n🆕 Will create a new party named "${draft.party.name}".\n` +
          'Reply with a different name to correct it, or go back to pick an existing one.',
        keyboard: {
          inline_keyboard: [
            [{ text: '✏️ Correct the name', callback_data: cb(draftId, 'pren') }],
            [{ text: '🔍 Search existing instead', callback_data: cb(draftId, 'psrch') }],
            [{ text: '⬅️ Back', callback_data: cb(draftId, 'fix') }]
          ]
        },
        toast: 'Will create new party'
      };

    case 'pren':
      draft._awaiting = { type: 'party_rename' };
      draftStore.saveDraft(draftId, draft);
      return {
        text: `Reply with the correct customer name.\n\nCurrently: "${draft.party.name}"`,
        keyboard: { inline_keyboard: [[{ text: '⬅️ Cancel', callback_data: cb(draftId, 'pty') }]] },
        toast: 'Type the name'
      };

    case 'inv':
      draft._awaiting = { type: 'invoice_no' };
      draftStore.saveDraft(draftId, draft);
      return {
        text:
          `Invoice number.\n\nLeaving it automatic uses your next number: ${draft.bill.next_number}.\n` +
          (draft.bill.slip_no
            ? `The slip's own number (${draft.bill.slip_no}) is the supplier's serial, not yours.\n`
            : '') +
          '\nReply with a number to override, or tap Automatic.',
        keyboard: {
          inline_keyboard: [
            [{ text: `🔄 Automatic (${draft.bill.next_number})`, callback_data: cb(draftId, 'invauto') }],
            [{ text: '⬅️ Cancel', callback_data: cb(draftId, 'fix') }]
          ]
        },
        toast: 'Type a number'
      };

    case 'invauto':
      draft.bill.invoice_no = '';
      delete draft._awaiting;
      draftStore.saveDraft(draftId, draft);
      return {
        text: renderDraftMessage(draft),
        keyboard: mainKeyboard(draftId, draft),
        toast: 'Using automatic number'
      };

    case 'pay':
      return { text: paymentText(draft), keyboard: paymentKeyboard(draftId, draft) };

    case 'payfull':
      draft.bill.balance_amount = 0;
      delete draft._awaiting;
      draftStore.saveDraft(draftId, draft);
      return {
        text: renderDraftMessage(draft),
        keyboard: mainKeyboard(draftId, draft),
        toast: 'Marked paid in full'
      };

    case 'paynone':
      draft.bill.balance_amount = Number(draft.payable_total ?? draft.invoice_total ?? 0);
      delete draft._awaiting;
      draftStore.saveDraft(draftId, draft);
      return {
        text: renderDraftMessage(draft),
        keyboard: mainKeyboard(draftId, draft),
        toast: 'Marked on credit'
      };

    case 'paypart':
      draft._awaiting = { type: 'payment' };
      draftStore.saveDraft(draftId, draft);
      return {
        text:
          `Reply with the amount received now.\n\n` +
          `Invoice total is ₹${Number(draft.payable_total ?? draft.invoice_total ?? 0).toFixed(2)}.`,
        keyboard: { inline_keyboard: [[{ text: '⬅️ Cancel', callback_data: cb(draftId, 'pay') }]] },
        toast: 'Type the amount'
      };

    case 'dt':
      draft._awaiting = { type: 'date' };
      draftStore.saveDraft(draftId, draft);
      return {
        text:
          `Invoice date.\n\nCurrently: ${draft.bill.order_date || '(not read)'}\n\n` +
          'Reply in DD/MM/YYYY or YYYY-MM-DD, or tap Today.',
        keyboard: {
          inline_keyboard: [
            [{ text: `📅 Today (${new Date().toISOString().slice(0, 10)})`, callback_data: cb(draftId, 'dttoday') }],
            [{ text: '⬅️ Cancel', callback_data: cb(draftId, 'fix') }]
          ]
        },
        toast: 'Type a date'
      };

    case 'dttoday':
      draft.bill.order_date = new Date().toISOString().slice(0, 10);
      draft.warnings = (draft.warnings || []).filter((w) => !w.startsWith('Date'));
      delete draft._awaiting;
      draftStore.saveDraft(draftId, draft);
      return {
        text: renderDraftMessage(draft),
        keyboard: mainKeyboard(draftId, draft),
        toast: 'Date set to today'
      };

    case 'cxl':
      draftStore.setStatus(draftId, 'cancelled');
      return {
        text: `${renderDraftMessage(draft)}\n\n❌ Cancelled — nothing was saved.`,
        done: true,
        toast: 'Cancelled'
      };

    case 'gen': {
      // Re-check rather than trusting the button: the draft may have been edited in another
      // message since this keyboard was rendered.
      const blockers = draftBlockers(draft);
      if (blockers.length) {
        return {
          alert: `Cannot generate:\n\n${blockers.join('\n')}`,
          text: renderDraftMessage(draft),
          keyboard: mainKeyboard(draftId, draft)
        };
      }
      // Signals the caller to run the import; kept out of here so this module stays write-free.
      return { generate: true, draftId, draft };
    }

    default:
      return { alert: 'Unknown action.' };
  }
}

/**
 * Consumes a plain text reply when the bot has asked for one (a search term or a corrected
 * name). Returns null when nothing was pending, so ordinary chatter falls through untouched.
 */
function handleTextReply(chatId, text) {
  const record = draftStore.findActiveDraft(chatId);
  if (!record) return null;

  let draft = record.draft;
  const awaiting = draft._awaiting;
  if (!awaiting) return null;

  const draftId = record.id;
  const index = Number(awaiting.index);
  const value = String(text || '').trim();
  if (!value) return null;

  delete draft._awaiting;

  if (awaiting.type === 'search') {
    const { candidates } = searchItems(draft, index, value);
    draftStore.saveDraft(draftId, draft);
    if (!candidates.length) {
      return {
        messageId: record.messageId,
        text: `No items matched "${value}". Try fewer letters, or create a new item.`,
        keyboard: newItemKeyboard(draftId, index)
      };
    }
    return {
      messageId: record.messageId,
      text: `Results for "${value}" — pick the right one:`,
      keyboard: candidateKeyboard(draftId, draft, index)
    };
  }

  if (awaiting.type === 'rename') {
    draft = renameLineItem(draft, index, value);
    draftStore.saveDraft(draftId, draft);
    // A renamed line that is creating a new item still needs HSN and GST confirmed.
    const isNew = draft.lines[index].match_action === 'create_new';
    return {
      messageId: record.messageId,
      text: isNew ? newItemText(draft, index) : renderDraftMessage(draft),
      keyboard: isNew ? newItemKeyboard(draftId, draft, index) : mainKeyboard(draftId, draft)
    };
  }

  if (awaiting.type === 'party_search') {
    const { candidates } = searchParties(draft, value);
    draftStore.saveDraft(draftId, draft);
    if (!candidates.length) {
      return {
        messageId: record.messageId,
        text: `No parties matched "${value}".`,
        keyboard: partyKeyboard(draftId, draft)
      };
    }
    return {
      messageId: record.messageId,
      text: `Parties matching "${value}":`,
      keyboard: partyKeyboard(draftId, draft)
    };
  }

  if (awaiting.type === 'party_rename') {
    draft.party.name = value;
    draft.party.matched_id = null;
    draft.party.matched_name = '';
    draft.party.action = 'create_new';
    draftStore.saveDraft(draftId, draft);
    return {
      messageId: record.messageId,
      text: renderDraftMessage(draft),
      keyboard: mainKeyboard(draftId, draft)
    };
  }

  if (awaiting.type === 'invoice_no') {
    draft.bill.invoice_no = value;
    draftStore.saveDraft(draftId, draft);
    return {
      messageId: record.messageId,
      text: renderDraftMessage(draft),
      keyboard: mainKeyboard(draftId, draft)
    };
  }

  if (awaiting.type === 'date') {
    const parsed = parseDateInput(value);
    if (!parsed) {
      draft._awaiting = awaiting;
      draftStore.saveDraft(draftId, draft);
      return {
        messageId: record.messageId,
        text: `"${value}" is not a date I can read. Use DD/MM/YYYY or YYYY-MM-DD.`,
        keyboard: { inline_keyboard: [[{ text: '⬅️ Cancel', callback_data: cb(draftId, 'fix') }]] }
      };
    }
    draft.bill.order_date = parsed;
    draft.warnings = (draft.warnings || []).filter((w) => !w.startsWith('Date'));
    draftStore.saveDraft(draftId, draft);
    return {
      messageId: record.messageId,
      text: renderDraftMessage(draft),
      keyboard: mainKeyboard(draftId, draft)
    };
  }

  if (awaiting.type === 'payment') {
    const total = Number(draft.payable_total ?? draft.invoice_total ?? 0);
    // Strip currency noise, but require what remains to actually be a number — stripping "abc"
    // leaves an empty string, and Number('') is 0, which would quietly mean "on credit".
    const cleaned = value.replace(/[^0-9.]/g, '');
    const received = /^\d*\.?\d+$/.test(cleaned) ? Number(cleaned) : NaN;
    if (!Number.isFinite(received) || received < 0 || received > total + 0.005) {
      draft._awaiting = awaiting;
      draftStore.saveDraft(draftId, draft);
      return {
        messageId: record.messageId,
        text: `"${value}" is not a valid amount. Enter between 0 and ₹${total.toFixed(2)}.`,
        keyboard: { inline_keyboard: [[{ text: '⬅️ Cancel', callback_data: cb(draftId, 'pay') }]] }
      };
    }
    draft.bill.balance_amount = Math.round((total - received) * 100) / 100;
    draftStore.saveDraft(draftId, draft);
    return {
      messageId: record.messageId,
      text: renderDraftMessage(draft),
      keyboard: mainKeyboard(draftId, draft)
    };
  }

  if (awaiting.type === 'hsn') {
    const hsn = value.replace(/[^0-9]/g, '');
    if (!hsn) {
      draft._awaiting = awaiting;
      draftStore.saveDraft(draftId, draft);
      return {
        messageId: record.messageId,
        text: `"${value}" is not a valid HSN code. Reply with digits only, e.g. 3004.`,
        keyboard: { inline_keyboard: [[{ text: '⬅️ Cancel', callback_data: cb(draftId, 'new', index) }]] }
      };
    }
    draft.lines[index].hsn = hsn;
    draftStore.saveDraft(draftId, draft);
    return {
      messageId: record.messageId,
      text: newItemText(draft, index),
      keyboard: newItemKeyboard(draftId, draft, index)
    };
  }

  return null;
}

module.exports = {
  cb,
  parseCallback,
  handleTextReply,
  markAsNewItem,
  renameLineItem,
  searchItems,
  mainKeyboard,
  fixKeyboard,
  lineKeyboard,
  candidateKeyboard,
  handleCallback,
  relinkLine,
  setLineQuantity,
  deleteLine
};
