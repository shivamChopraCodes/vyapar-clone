function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function diceCoefficient(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map();
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2);
    bigrams.set(gram, (bigrams.get(gram) || 0) + 1);
  }

  let overlap = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    const count = bigrams.get(gram) || 0;
    if (count > 0) {
      bigrams.set(gram, count - 1);
      overlap += 1;
    }
  }

  return (2 * overlap) / (a.length + b.length - 2);
}

function matchParty(ocrSupplier, dbParties) {
  const gst = String(ocrSupplier?.gst_number || '').trim().toUpperCase();
  if (gst) {
    const exact = dbParties.find(
      (party) => String(party?.gst_number || '').trim().toUpperCase() === gst
    );
    if (exact) {
      return {
        matched: exact,
        confidence: 1,
        action: 'matched',
        candidates: [{ party: exact, confidence: 1 }]
      };
    }
  }

  const sourceName = String(ocrSupplier?.name || '').trim();
  const ranked = dbParties
    .map((party) => ({
      party,
      confidence: diceCoefficient(sourceName, party?.name || '')
    }))
    .filter((entry) => entry.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  const best = ranked[0] || null;
  return {
    matched: best && best.confidence >= 0.85 ? best.party : null,
    confidence: best ? best.confidence : 0,
    action: best && best.confidence >= 0.85 ? 'matched' : 'review',
    candidates: ranked
  };
}

function buildItemCandidates(ocrItem, dbItems, limit = 5) {
  const sourceName = String(ocrItem?.item_name || '').trim();
  return dbItems
    .map((item) => {
      const byName = diceCoefficient(sourceName, item?.name || '');
      const byHsn =
        ocrItem?.hsn && item?.hsn && String(ocrItem.hsn).trim() === String(item.hsn).trim()
          ? 0.2
          : 0;
      return {
        item,
        confidence: Math.min(1, byName + byHsn)
      };
    })
    .filter((entry) => entry.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

function matchItems(ocrItems, dbItems) {
  return (ocrItems || []).map((ocrItem, index) => {
    const candidates = buildItemCandidates(ocrItem, dbItems);
    const best = candidates[0] || null;
    const confidence = best ? best.confidence : 0;
    let action = 'create_new';
    if (confidence >= 0.85) action = 'matched';
    else if (confidence >= 0.5) action = 'review';

    return {
      index,
      ocr_item: ocrItem,
      matched_item: action === 'create_new' ? null : best.item,
      confidence,
      action,
      candidates
    };
  });
}

module.exports = {
  diceCoefficient,
  matchParty,
  matchItems
};
