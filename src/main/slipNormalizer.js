// Turns a raw handwritten-slip extraction into billable lines.
//
// The model is told never to compute a rate. This module derives it from qty and amount, and
// records a warning wherever the derivation was ambiguous, so the review step can show a human
// exactly which numbers were inferred rather than read.

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(next) ? next : null;
};

const round2 = (value) => Math.round(value * 100) / 100;

// A money value that lands exactly on paise. Used to test whether a candidate quantity divides
// the line amount cleanly.
const isCleanMoney = (value) =>
  Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

// "24x10" -> 24 packs of 10; "20 pc." -> 20; "2 box" -> 2.
function parseQuantity(qtyRaw, qtyNumeric) {
  const text = String(qtyRaw || '').trim().toLowerCase();

  const multi = text.match(/^(\d+(?:\.\d+)?)\s*[x*×]\s*(\d+(?:\.\d+)?)/);
  if (multi) {
    const packs = Number(multi[1]);
    const perPack = Number(multi[2]);
    return {
      packs,
      perPack,
      // Order matters: the pack count is written first and is what the customer ordered, so it
      // is the default. The expanded count is offered as the alternative.
      candidates: [packs, round2(packs * perPack)],
      unitLabel: 'pkt',
      ambiguous: true
    };
  }

  const plain = text.match(/(\d+(?:\.\d+)?)/);
  if (plain) {
    const unit = text.replace(/[\d.\s]/g, '').replace(/[^a-z]/g, '');
    return {
      packs: Number(plain[1]),
      perPack: null,
      candidates: [Number(plain[1])],
      unitLabel: unit || '',
      ambiguous: false
    };
  }

  const fallback = toNumber(qtyNumeric);
  return {
    packs: fallback,
    perPack: null,
    candidates: fallback ? [fallback] : [],
    unitLabel: '',
    ambiguous: false
  };
}

// Picks quantity and rate together, because on these slips only one of them is ever written and
// the other has to follow from the line amount.
function resolveQtyAndRate(line) {
  const warnings = [];
  const amount = toNumber(line.amount);
  const statedRate = toNumber(line.rate);
  const parsed = parseQuantity(line.qty_raw, line.qty);

  if (!parsed.candidates.length) {
    warnings.push('Quantity could not be read.');
    return { qty: null, rate: statedRate, amount, unitLabel: parsed.unitLabel, warnings, parsed };
  }

  // A rate written on the slip always wins over anything derived.
  if (statedRate !== null && statedRate > 0) {
    const qty = parsed.candidates[0];
    if (parsed.ambiguous) {
      warnings.push(`Pack notation "${line.qty_raw}" read as ${qty} — confirm.`);
    }
    return { qty, rate: statedRate, amount, unitLabel: parsed.unitLabel, warnings, parsed };
  }

  if (amount === null || amount <= 0) {
    warnings.push('No rate and no amount on this line — rate must be entered.');
    return {
      qty: parsed.candidates[0],
      rate: null,
      amount,
      unitLabel: parsed.unitLabel,
      warnings,
      parsed
    };
  }

  // Derive the rate. Prefer a candidate quantity that divides the amount into whole paise.
  const clean = parsed.candidates.filter((qty) => qty > 0 && isCleanMoney(amount / qty));
  const chosen = clean.length ? clean[0] : parsed.candidates[0];
  const rate = round2(amount / chosen);

  if (parsed.ambiguous) {
    const alternatives = parsed.candidates
      .filter((qty) => qty !== chosen && qty > 0)
      .map((qty) => `${qty} @ ₹${round2(amount / qty).toFixed(2)}`);
    warnings.push(
      `"${line.qty_raw}" read as ${chosen} @ ₹${rate.toFixed(2)}` +
        (alternatives.length ? ` (could also be ${alternatives.join(', ')})` : '')
    );
  }
  if (!clean.length) {
    warnings.push(`₹${amount} ÷ ${chosen} is not an exact rate — rounded to ₹${rate.toFixed(2)}.`);
  }

  return { qty: chosen, rate, amount, unitLabel: parsed.unitLabel, warnings, parsed };
}

// "02/28", "02/2028", "MM/YY" -> MM/YYYY, matching normalizeExpiryMonthValue's input format.
function normalizeExpiry(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const match = text.match(/(\d{1,2})\s*[/\-]\s*(\d{2,4})/);
  if (!match) return '';
  const month = Math.max(1, Math.min(12, Number(match[1])));
  let year = Number(match[2]);
  if (year < 100) year += 2000;
  return `${String(month).padStart(2, '0')}/${year}`;
}

function normalizeSlip(extracted) {
  const rawItems = Array.isArray(extracted?.items) ? extracted.items : [];
  const warnings = [];

  const items = rawItems.map((line, index) => {
    const resolved = resolveQtyAndRate(line);
    const confidence = toNumber(line.confidence);
    const lineWarnings = [...resolved.warnings];
    if (confidence !== null && confidence < 0.6) {
      lineWarnings.push('Handwriting on this line was unclear.');
    }
    return {
      index,
      item_name: String(line.item_name || '').trim(),
      qty_raw: String(line.qty_raw || '').trim(),
      qty: resolved.qty,
      rate: resolved.rate,
      amount: resolved.amount,
      pack: String(line.pack || '').trim(),
      unit_label: resolved.unitLabel,
      qty_options: resolved.parsed.candidates,
      mrp: toNumber(line.mrp),
      batch_no: String(line.batch_no || '').trim(),
      expiry_date: normalizeExpiry(line.expiry_raw),
      hsn: String(line.hsn || '').trim(),
      gst_rate: toNumber(line.gst_rate),
      confidence: confidence === null ? 0.5 : confidence,
      notes: String(line.notes || '').trim(),
      warnings: lineWarnings
    };
  });

  // The handwritten total independently verifies the whole extraction — if the lines add up to
  // it, every quantity, rate and amount above is almost certainly right.
  const statedTotal = toNumber(extracted?.stated_total);
  const computedTotal = round2(
    items.reduce((sum, item) => {
      const lineAmount =
        item.amount !== null
          ? item.amount
          : item.qty !== null && item.rate !== null
            ? item.qty * item.rate
            : 0;
      return sum + lineAmount;
    }, 0)
  );

  let totalCheck = 'unknown';
  if (statedTotal !== null) {
    const diff = round2(Math.abs(statedTotal - computedTotal));
    if (diff < 0.02) {
      totalCheck = 'match';
    } else {
      totalCheck = 'mismatch';
      warnings.push(
        `Lines add to ₹${computedTotal.toFixed(2)} but the slip says ₹${statedTotal.toFixed(2)} (off by ₹${diff.toFixed(2)}).`
      );
    }
  } else {
    warnings.push('No total written on the slip — nothing to check the lines against.');
  }

  if (!items.length) warnings.push('No item lines could be read.');

  // A misread year is invisible to the total checksum but lands the invoice in the wrong
  // financial period and breaks GSTR-1 reconciliation, so it gets its own range check.
  const orderDate = String(extracted?.order_date || '').trim();
  if (!orderDate) {
    warnings.push('Date could not be read — set it before generating.');
  } else {
    const parsed = new Date(`${orderDate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      warnings.push(`Date "${orderDate}" is not a valid date.`);
    } else {
      const daysFromNow = (parsed.getTime() - Date.now()) / 86400000;
      if (daysFromNow > 30) {
        warnings.push(`Date ${orderDate} is in the future — check the year.`);
      } else if (daysFromNow < -365) {
        warnings.push(`Date ${orderDate} is over a year old — check the year.`);
      }
    }
  }

  return {
    type: 'sale',
    party: extracted?.party || {},
    letterhead: extracted?.letterhead || {},
    bill: {
      invoice_no: String(extracted?.invoice_no || '').trim(),
      order_date: String(extracted?.order_date || '').trim()
    },
    items,
    stated_total: statedTotal,
    computed_total: computedTotal,
    total_check: totalCheck,
    warnings
  };
}

module.exports = {
  normalizeSlip,
  parseQuantity,
  resolveQtyAndRate,
  normalizeExpiry,
  isCleanMoney
};
