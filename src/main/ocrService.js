const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseAmount(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const normalized = String(raw).replace(/[^0-9.-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function toIsoDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const ddmmyyyy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]);
    const year = Number(ddmmyyyy[3].length === 2 ? `20${ddmmyyyy[3]}` : ddmmyyyy[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getUTCFullYear();
    const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

function expiryToIso(expiry) {
  const raw = String(expiry || '').trim();
  if (!raw) return '';
  const mmYY = raw.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
  if (!mmYY) return toIsoDate(raw);
  const month = Number(mmYY[1]);
  const year = Number(mmYY[2].length === 2 ? `20${mmYY[2]}` : mmYY[2]);
  if (month < 1 || month > 12) return '';
  const lastDate = new Date(Date.UTC(year, month, 0));
  return `${lastDate.getUTCFullYear()}-${String(lastDate.getUTCMonth() + 1).padStart(2, '0')}-${String(
    lastDate.getUTCDate()
  ).padStart(2, '0')}`;
}

async function runTesseractOnImage(imagePath) {
  let tesseract;
  try {
    tesseract = require('tesseract.js');
  } catch (_error) {
    throw new Error('Missing dependency: tesseract.js. Run npm install tesseract.js');
  }
  const { data } = await tesseract.recognize(imagePath, 'eng');
  return String(data?.text || '').trim();
}

function fileToBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

async function runGoogleVisionOnImage(imagePath, apiKey) {
  if (!apiKey) {
    throw new Error('Google Vision API key is required for Google OCR engine.');
  }
  if (typeof fetch !== 'function') {
    throw new Error('Fetch is unavailable in current Electron runtime.');
  }
  const body = {
    requests: [
      {
        image: { content: fileToBase64(imagePath) },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
      }
    ]
  };
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OCR failed (${response.status}): ${text || 'unknown error'}`);
  }
  const data = await response.json();
  const block = data?.responses?.[0];
  return String(block?.fullTextAnnotation?.text || block?.textAnnotations?.[0]?.description || '').trim();
}

function convertPdfToPng(pdfPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyapar-ocr-'));
  const prefix = path.join(tempDir, 'page');
  try {
    execFileSync('pdftoppm', ['-png', pdfPath, prefix], { stdio: 'ignore' });
    const files = fs
      .readdirSync(tempDir)
      .filter((name) => name.endsWith('.png'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (files.length) return files.map((name) => path.join(tempDir, name));
  } catch (_error) {
    // fall through to sips fallback
  }

  if (process.platform === 'darwin') {
    const outputPath = `${prefix}-1.png`;
    execFileSync('sips', ['-s', 'format', 'png', pdfPath, '--out', outputPath], { stdio: 'ignore' });
    if (fs.existsSync(outputPath)) return [outputPath];
  }

  throw new Error('Unable to convert PDF to image. Install poppler (pdftoppm) for reliable PDF OCR.');
}

async function extractTextFromImage(inputPath, engine = 'tesseract', options = {}) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error('Invoice file not found.');
  }

  const extension = path.extname(inputPath).toLowerCase();
  const sourceImages = extension === '.pdf' ? convertPdfToPng(inputPath) : [inputPath];
  const chunks = [];

  for (const imagePath of sourceImages) {
    if (engine === 'google') {
      chunks.push(await runGoogleVisionOnImage(imagePath, options.apiKey || ''));
    } else {
      chunks.push(await runTesseractOnImage(imagePath));
    }
  }

  return chunks.filter(Boolean).join('\n');
}

function parseInvoiceHeader(lines) {
  const topLines = lines.slice(0, 24);
  const gstRegex = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/;
  const phoneRegex = /\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/;
  const dateRegex = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/;
  const invoiceRegex =
    /(invoice|bill)\s*(no|number)?\.?\s*[:\-]?\s*([A-Z0-9/-]*\d[A-Z0-9/-]*)/i;
  const supplier = { name: '', phone: '', gst_number: '', address: '' };
  const bill = { invoice_no: '', order_date: '' };

  for (const line of topLines) {
    if (!supplier.gst_number) {
      const gstMatch = line.match(gstRegex);
      if (gstMatch) supplier.gst_number = gstMatch[0];
    }
    if (!supplier.phone) {
      const phoneMatch = line.replace(/\s+/g, '').match(phoneRegex);
      if (phoneMatch) supplier.phone = phoneMatch[0];
    }
    if (!bill.invoice_no) {
      const invoiceMatch = line.match(invoiceRegex);
      if (invoiceMatch) bill.invoice_no = cleanText(invoiceMatch[3]);
    }
    if (!bill.order_date) {
      const dateMatch = line.match(dateRegex);
      if (dateMatch) bill.order_date = toIsoDate(dateMatch[1]);
    }
  }

  const gstIndex = topLines.findIndex((line) => gstRegex.test(line));
  if (gstIndex > 0) {
    supplier.name = cleanText(topLines[gstIndex - 1]);
  }
  if (!supplier.name || !/[A-Za-z]{3,}/.test(supplier.name) || supplier.name.length < 5) {
    const businessLine = topLines.find((line) =>
      /(trading|pharma|pharmaceutical|medical|distributor|agenc)/i.test(line)
    );
    if (businessLine) supplier.name = cleanText(businessLine);
  }
  if (!supplier.name || !/[A-Za-z]{3,}/.test(supplier.name)) {
    supplier.name =
      topLines.find((line) => /^[A-Z][A-Z .&'-]{6,}$/.test(cleanText(line))) || cleanText(topLines[0] || '');
  }

  const addressLines = topLines.filter((line) => {
    const text = cleanText(line);
    if (!text) return false;
    if (text === supplier.name) return false;
    if (supplier.gst_number && text.includes(supplier.gst_number)) return false;
    if (phoneRegex.test(text.replace(/\s+/g, ''))) return false;
    if (invoiceRegex.test(text)) return false;
    if (dateRegex.test(text)) return false;
    return true;
  });
  supplier.address = cleanText(addressLines.slice(0, 3).join(', '));

  return { supplier, bill };
}

function parseRowByColumns(line) {
  const segments = line
    .split(/\s{2,}/)
    .map((part) => cleanText(part))
    .filter(Boolean);
  if (segments.length < 8) return null;
  const amount = parseAmount(segments[segments.length - 1]);
  if (amount <= 0) return null;

  const sgst = parseAmount(segments[segments.length - 2]);
  const cgst = parseAmount(segments[segments.length - 3]);
  const discount = parseAmount(segments[segments.length - 4]);
  const rate = parseAmount(segments[segments.length - 5]);
  const mrp = parseAmount(segments[segments.length - 6]);
  const expiry = segments[segments.length - 7];
  const batch = segments[segments.length - 8];
  const hsn = segments[segments.length - 9] || '';
  const nameStart = 3;
  const nameEnd = Math.max(nameStart, segments.length - 9);
  const itemName = cleanText(segments.slice(nameStart, nameEnd).join(' '));
  const qty = parseAmount(segments[1]);
  const pack = segments[2] || '';
  if (!itemName || qty <= 0) return null;

  return {
    item_name: itemName,
    hsn: cleanText(hsn),
    qty,
    rate,
    amount,
    batch_no: cleanText(batch),
    expiry_date: expiryToIso(expiry),
    mrp,
    gst_rate: Number((cgst + sgst).toFixed(2)),
    pack: cleanText(pack),
    discount_pct: discount
  };
}

function parseRowFallback(line) {
  const regex =
    /^\s*\d+\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9.-]+)\s+(.+?)\s+(\d{4,8})\s+([A-Za-z0-9\/-]+)\s+(\d{1,2}[\/-]\d{2,4})\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/;
  const match = line.match(regex);
  if (!match) return null;
  const qty = parseAmount(match[1]);
  if (qty <= 0) return null;
  return {
    item_name: cleanText(match[3]),
    hsn: cleanText(match[4]),
    qty,
    rate: parseAmount(match[8]),
    amount: parseAmount(match[12]),
    batch_no: cleanText(match[5]),
    expiry_date: expiryToIso(match[6]),
    mrp: parseAmount(match[7]),
    gst_rate: Number((parseAmount(match[10]) + parseAmount(match[11])).toFixed(2)),
    pack: cleanText(match[2]),
    discount_pct: parseAmount(match[9])
  };
}

function isLikelyHsnToken(token) {
  const cleaned = String(token || '').replace(/[^0-9]/g, '');
  return /^\d{4,8}$/.test(cleaned);
}

function isLikelyExpiryToken(token) {
  const cleaned = String(token || '').replace(/^[^0-9]+|[^0-9/-]+$/g, '');
  return /^\d{1,2}[\/-]\d{2,4}$/.test(cleaned);
}

function parseSrAndQty(token) {
  const raw = String(token || '').trim();
  const merged = raw.match(/^(\d+)\.(\d+)$/);
  if (merged) return { sr: Number(merged[1]), qty: Number(merged[2]), consumed: true };
  const sr = raw.match(/^(\d+)\.?$/);
  if (sr) return { sr: Number(sr[1]), qty: null, consumed: false };
  return { sr: null, qty: null, consumed: false };
}

function tokenizeItemLine(line) {
  return String(line || '')
    .replace(/[|[\]]/g, ' ')
    .replace(/₹/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((token) => token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.%/*-]+$/g, ''))
    .filter(Boolean);
}

function parseRowByTokenAnchors(line) {
  const tokens = tokenizeItemLine(line);
  if (tokens.length < 8) return null;

  const amount = parseAmount(tokens[tokens.length - 1]);
  const sgst = parseAmount(tokens[tokens.length - 2]);
  const cgst = parseAmount(tokens[tokens.length - 3]);
  const discount = parseAmount(tokens[tokens.length - 4]);
  const rate = parseAmount(tokens[tokens.length - 5]);
  const mrp = parseAmount(tokens[tokens.length - 6]);
  if (amount <= 0) return null;

  let expiryIdx = -1;
  for (let i = tokens.length - 7; i >= 0; i -= 1) {
    if (isLikelyExpiryToken(tokens[i])) {
      expiryIdx = i;
      break;
    }
  }
  if (expiryIdx <= 1) return null;

  const expiry = tokens[expiryIdx].replace(/^[^0-9]+|[^0-9/-]+$/g, '');
  const batch = tokens[expiryIdx - 1] || '';

  let hsnIdx = -1;
  for (let i = expiryIdx - 2; i >= 0; i -= 1) {
    if (isLikelyHsnToken(tokens[i])) {
      hsnIdx = i;
      break;
    }
  }
  if (hsnIdx <= 1) return null;

  const hsn = tokens[hsnIdx].replace(/[^0-9]/g, '');
  const left = tokens.slice(0, hsnIdx);
  if (left.length < 2) return null;

  let cursor = 0;
  const first = parseSrAndQty(left[cursor]);
  if (first.sr !== null) {
    cursor += 1;
  }

  let qty = first.qty;
  if (qty === null && cursor < left.length) {
    qty = parseAmount(left[cursor]);
    cursor += 1;
  }
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const pack = cursor < left.length ? cleanText(left[cursor]) : '';
  if (cursor < left.length) cursor += 1;
  let itemName = cleanText(left.slice(cursor).join(' '));
  itemName = itemName.replace(/^\d{2,5}\s+/, '');
  if (!itemName) return null;

  return {
    item_name: itemName,
    hsn: cleanText(hsn),
    qty,
    rate,
    amount,
    batch_no: cleanText(batch),
    expiry_date: expiryToIso(expiry),
    mrp,
    gst_rate: Number((cgst + sgst).toFixed(2)),
    pack,
    discount_pct: discount
  };
}

function parseInvoiceItems(lines) {
  const headerIndex = lines.findIndex((line) =>
    /qty/i.test(line) &&
    /(particular|item|description)/i.test(line) &&
    /(batch|hsn|rate|amount)/i.test(line)
  );
  if (headerIndex < 0) return [];

  const stopWords = /(total|taxable|grand|net amount|amount in words|terms|bank|e\.?&?o\.?e)/i;
  const items = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (stopWords.test(line)) break;
    const parsed = parseRowByColumns(line) || parseRowByTokenAnchors(line) || parseRowFallback(line);
    if (parsed) items.push(parsed);
  }
  return items;
}

function parseInvoiceText(rawText) {
  const normalized = String(rawText || '').replace(/\r/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const normalizedLines = lines
    .map((line) => line.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const { supplier, bill } = parseInvoiceHeader(normalizedLines);
  const items = parseInvoiceItems(lines);
  return { supplier, bill, items };
}

async function processInvoiceFile(filePath, engine = 'tesseract', options = {}) {
  const rawText = await extractTextFromImage(filePath, engine, options);
  const parsed = parseInvoiceText(rawText);
  return { rawText, parsed };
}

module.exports = {
  extractTextFromImage,
  parseInvoiceText,
  processInvoiceFile
};
