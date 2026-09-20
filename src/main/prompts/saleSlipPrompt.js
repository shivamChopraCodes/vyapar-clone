// Prompt for photographed HANDWRITTEN order slips / sale bills.
//
// The governing idea: the model transcribes, it does not compute. Rates, pack expansion and
// totals are derived by slipNormalizer from values we can check, because a model that quietly
// invents a plausible rate produces an invoice that looks right and is wrong.
const SALE_SLIP_PROMPT = `You are reading a photograph of a handwritten order slip or sale bill from an Indian pharmaceutical distributor.

Return ONLY a JSON object matching this shape. No markdown fences, no commentary, no trailing text.

{
  "party": { "name": "", "address": "", "phone": "", "gst_number": "" },
  "letterhead": { "name": "", "address": "", "gst_number": "" },
  "invoice_no": "",
  "order_date": "YYYY-MM-DD",
  "stated_total": null,
  "items": [
    {
      "item_name": "",
      "qty_raw": "",
      "qty": null,
      "pack": "",
      "rate": null,
      "amount": null,
      "mrp": null,
      "batch_no": "",
      "expiry_raw": "",
      "hsn": "",
      "gst_rate": null,
      "confidence": 0.0,
      "notes": ""
    }
  ]
}

RULES — follow exactly:

1. TRANSCRIBE, DO NOT INFER. If a value is not written or not legible, use null (or "" for text).
   Never fill a field by guessing what it "should" be.

2. "qty_raw" is the quantity EXACTLY as written, preserving notation such as "24x10", "20 pc.",
   "2 box", "1/2". Set the numeric "qty" ONLY when the quantity is a plain number with no pack
   notation. If it contains x, *, or a unit word, leave "qty" null and let qty_raw carry it.

3. NEVER CALCULATE "rate". If the rate column is blank on that line, "rate" MUST be null.
   Do not divide amount by quantity — the application does that and cross-checks the result.

4. "amount" is the money value written on that line, null if blank. Ignore decorative strokes
   and the tick/cross marks used to strike through empty columns.

5. "stated_total" is the total written at the bottom of the slip, null if absent. This is
   important: it is used to verify the extraction.

6. "letterhead" is the PRE-PRINTED business at the top of the pad. "party" is the HANDWRITTEN
   customer, usually written after "M/s", "To", or on the name line. They are different
   businesses — never merge them, never copy one into the other.

7. Handwritten drug names are routinely abbreviated ("Ondansu" for Ondansetron, "E.C.G. Gel"
   for ECG gel). Transcribe the abbreviation AS WRITTEN. Do not expand or correct it.

8. "confidence" is 0.0-1.0 for how clearly THAT line could be read. Be honest; a low score
   sends the line to a human instead of onto an invoice.

9. "notes" holds anything written on the line you could not map to a field (scribbled MRP
   workings, phone numbers, expiry jottings).

9a. A PERSON'S NAME written on an item line is the customer that line is for, NOT part of the
    product. Put it in "notes" and keep it out of "item_name". Example: a line reading
    "E.C.G. Gel  m.jain" has item_name "E.C.G. GEL" and notes "m.jain". Including the name
    corrupts the product match.

9b. Read the marginal scribbles around a line and map them to their fields:
    - "MRP = 40/23" or "MRP 40.23"  -> mrp: 40.23
    - "EXP 02/28", "E+P = 02/028"   -> expiry_raw: "02/28"
    - a long circled digit string    -> batch_no
    Only do this when the label makes the meaning unambiguous; otherwise leave it in "notes".

9c. ITEM NAME CONVENTIONS, so names line up with the product master:
    - Output "item_name" in UPPERCASE.
    - Expand these standard fluid abbreviations:
        "D.N.S" / "DNS" -> "DEXT&NORMAL SALINE"
        "N.S." / "NS"   -> "NORMAL SALINE"
        "R.L." / "RL"   -> "RINGER ACATE"
    - Do NOT expand or correct brand names; transcribe those exactly as written.

9d. RATE SHORTHAND: a trailing slash or plus in the rate column is notation, not a fraction.
    "18/+" means 18, "19/50+" means 19.50. Read those as written into "rate". This is the one
    case where a rate IS present — rule 3 still forbids computing a rate that is absent.

10. Dates use Indian day-first order: DD/MM/YY or DD/MM/YYYY becomes YYYY-MM-DD.
    A bare MM/YY on an item line is an expiry — put it in "expiry_raw", not "order_date".

11. Ignore anything that is not part of the slip (hands, table, other papers).`;

// The printed-invoice prompt, previously inlined in the ocr:processImage IPC handler.
const PURCHASE_INVOICE_PROMPT = `You are an expert invoice data extractor. Extract the invoice details accurately from the provided image and return ONLY a valid JSON object matching exactly this structure with no markdown formatting or extra text:
{
  "seller": { "name": "", "phone": "", "gst_number": "", "address": "" },
  "buyer": { "name": "", "phone": "", "gst_number": "", "address": "" },
  "invoice_no": "",
  "order_date": "YYYY-MM-DD",
  "items": [
    { "item_name": "", "hsn": "", "qty": 0, "rate": 0, "amount": 0, "batch_no": "", "expiry_date": "YYYY-MM-DD", "mrp": 0, "gst_rate": 0, "pack": "", "discount_pct": 0 }
  ]
}`;

// Models wrap JSON in fences despite instructions often enough that stripping them is routine.
function parseJsonResponse(rawText) {
  let text = String(rawText || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(text);
  } catch (_error) {
    // Fall back to the outermost braces in case the model added prose around the object.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('Model did not return valid JSON.');
  }
}

module.exports = { SALE_SLIP_PROMPT, PURCHASE_INVOICE_PROMPT, parseJsonResponse };
