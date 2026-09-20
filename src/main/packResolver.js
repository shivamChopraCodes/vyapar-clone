// Settles ambiguous pack quantities on handwritten slips.
//
// A slip line reading "24x10" can mean 24 packs or 240 pieces, and both often divide the line
// amount into clean money, so arithmetic alone cannot choose. The order of evidence, strongest
// first:
//
//   1. MRP  — selling above MRP is not legal, so any reading implying that is discarded.
//   2. HISTORY — how this exact item was actually billed before. Decisive when present.
//   3. ITEM NAME — a master name carrying its own pack ("MOVEXX PLUS 20*10") means the selling
//      unit is already a pack, so the slip's pack count is the quantity.
//   4. FALLBACK — no pack in the name means the unit is a single piece, so the count expands.
//
// Rule 2 outranks rule 3 by explicit decision: ONDANAUS DROP carries no pack in its name yet is
// genuinely billed 24 @ ₹22.00, so the naming convention alone would have produced a wrong bill.

const PACK_IN_NAME = /(\d+)\s*[*x×]\s*(\d+)/i;

// Historical rates drift, so match on proximity rather than equality.
const RATE_TOLERANCE = 0.02;

const round2 = (value) => Math.round(value * 100) / 100;

function itemNameHasPack(name) {
  return PACK_IN_NAME.test(String(name || ''));
}

function rateMatchesHistory(rate, history) {
  let best = null;
  history.forEach((row) => {
    const historicRate = Number(row.rate || 0);
    if (!Number.isFinite(historicRate) || historicRate <= 0) return;
    const delta = Math.abs(historicRate - rate) / historicRate;
    if (delta <= RATE_TOLERANCE && (best === null || delta < best.delta)) {
      best = { delta, rate: historicRate, date: row.order_date };
    }
  });
  return best;
}

/**
 * Chooses between candidate quantities for one slip line.
 *
 * @param {object} line          normalized slip line (qty_options, amount, mrp)
 * @param {string} matchedName   master item name, empty when unmatched
 * @param {Array}  history       rows from db.listItemSaleHistory for the matched item
 */
function resolveLineQuantity(line, matchedName = '', history = []) {
  const options = (line.qty_options || []).filter((qty) => Number.isFinite(qty) && qty > 0);
  const amount = Number(line.amount);
  const warnings = [];

  if (options.length <= 1 || !Number.isFinite(amount) || amount <= 0) {
    return { qty: line.qty, rate: line.rate, basis: 'unambiguous', warnings };
  }

  let choices = options.map((qty) => ({ qty, rate: round2(amount / qty) }));

  // 1. MRP ceiling. An MRP on the line bounds what any unit rate can legally be.
  const mrp = Number(line.mrp);
  if (Number.isFinite(mrp) && mrp > 0) {
    const legal = choices.filter((choice) => choice.rate <= mrp + 0.005);
    if (legal.length && legal.length < choices.length) {
      const dropped = choices.filter((c) => !legal.includes(c));
      warnings.push(
        `Ruled out ${dropped.map((c) => `${c.qty} @ ₹${c.rate.toFixed(2)}`).join(', ')} — above MRP ₹${mrp.toFixed(2)}.`
      );
      choices = legal;
    }
  }
  if (choices.length === 1) {
    return { qty: choices[0].qty, rate: choices[0].rate, basis: 'mrp', warnings };
  }

  // 2. Billing history for this exact item.
  const historyHits = choices
    .map((choice) => ({ choice, hit: rateMatchesHistory(choice.rate, history) }))
    .filter((entry) => entry.hit);
  if (historyHits.length) {
    historyHits.sort((a, b) => a.hit.delta - b.hit.delta);
    const { choice, hit } = historyHits[0];
    warnings.push(
      `Read as ${choice.qty} @ ₹${choice.rate.toFixed(2)} — matches ₹${hit.rate.toFixed(2)} billed on ${String(hit.date).slice(0, 10)}.`
    );
    return { qty: choice.qty, rate: choice.rate, basis: 'history', warnings };
  }

  // 3 & 4. Fall back to what the master item name implies about the selling unit.
  const nameHasPack = matchedName && itemNameHasPack(matchedName);
  const chosen = nameHasPack ? choices[0] : choices[choices.length - 1];
  const alternatives = choices
    .filter((choice) => choice !== chosen)
    .map((choice) => `${choice.qty} @ ₹${choice.rate.toFixed(2)}`);

  warnings.push(
    `Read as ${chosen.qty} @ ₹${chosen.rate.toFixed(2)} — ` +
      (matchedName
        ? nameHasPack
          ? `"${matchedName}" is sold by the pack.`
          : `"${matchedName}" has no pack size in its name, so counted as pieces.`
        : 'no matching item, counted as pieces.') +
      (alternatives.length ? ` Could also be ${alternatives.join(', ')}.` : '')
  );

  return {
    qty: chosen.qty,
    rate: chosen.rate,
    basis: nameHasPack ? 'item-name-pack' : 'expanded',
    warnings,
    // Nothing decisive backed this up, so the review step should make it easy to flip.
    uncertain: true,
    alternatives: choices.filter((choice) => choice !== chosen)
  };
}

module.exports = { resolveLineQuantity, itemNameHasPack, RATE_TOLERANCE };
