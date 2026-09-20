import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import SearchableSelect from '../components/ui/SearchableSelect';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import './OcrImport.css';

const STEP_UPLOAD = 1;
const STEP_REVIEW = 2;
const STEP_CONFIRM = 3;

const toNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const formatCurrency = (value) => `₹ ${toNumber(value).toFixed(2)}`;

// Pre-GST line amount: qty × rate (after any line discount), before GST is added.
const linePreGstAmount = (row) => {
  const qty = toNumber(row.qty);
  const rawRate = toNumber(row.rate);
  const discountPct = toNumber(row.discount_pct);
  const effectiveRate =
    discountPct > 0 ? Number((rawRate * (1 - discountPct / 100)).toFixed(2)) : rawRate;
  return qty > 0 || effectiveRate > 0 ? qty * effectiveRate : toNumber(row.amount);
};

const toExpiryMonthValue = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  const monthMatch = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  if (monthMatch) return `${monthMatch[2]}/${monthMatch[1]}`;
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const mm = String(Math.max(1, Math.min(12, Number(slashMatch[1])))).padStart(2, '0');
    return `${mm}/${slashMatch[2]}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${mm}/${yyyy}`;
};

// Canonicalize only fully-recognized expiry input (MM/YYYY or YYYY-MM); otherwise keep as typed.
const canonicalizeExpiryInput = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}/.test(raw) || /^\d{1,2}\/\d{4}$/.test(raw)) return toExpiryMonthValue(raw);
  return raw;
};

const confidenceClass = (value) => {
  if (value >= 0.85) return 'ocr-badge ocr-badge-green';
  if (value >= 0.5) return 'ocr-badge ocr-badge-yellow';
  return 'ocr-badge ocr-badge-red';
};

export default function OcrImport() {
  const navigate = useNavigate();
  const location = useLocation();
  const defaultType = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    const raw = String(params.get('type') || '').toLowerCase().trim();
    return raw === 'sale' || raw === 'purchase' ? raw : '';
  }, [location.search]);
  const [step, setStep] = useState(STEP_UPLOAD);
  const [engine, setEngine] = useState('tesseract');
  const [apiKey, setApiKey] = useState('');
  const [fileName, setFileName] = useState('');
  const [filePath, setFilePath] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [manualJson, setManualJson] = useState('');
  const [ocrResult, setOcrResult] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [applyRoundOff, setApplyRoundOff] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('0');
  const [parties, setParties] = useState([]);
  const [items, setItems] = useState([]);
  const [batchOptionsByItemId, setBatchOptionsByItemId] = useState({});
  const [supplierDraft, setSupplierDraft] = useState({
    party_id: '',
    create_new: false,
    name: '',
    phone: '',
    gst_number: '',
    address: '',
    state_of_supply: ''
  });
  const [billDraft, setBillDraft] = useState({
    invoice_no: '',
    order_date: ''
  });
  const [itemDrafts, setItemDrafts] = useState([]);

  useEffect(() => {
    let mounted = true;
    const loadBaseData = async () => {
      const [partyData, itemData, key] = await Promise.all([
        window.vyapar.listParties(),
        window.vyapar.listItems(),
        window.vyapar.getOcrApiKey()
      ]);
      if (!mounted) return;
      setParties(partyData || []);
      setItems(itemData || []);
      setApiKey(key || '');
    };
    loadBaseData();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const partyOptions = useMemo(
    () => [
      { value: '', label: 'Unassigned' },
      ...parties.map((party) => ({ value: String(party.id), label: party.name || `Party ${party.id}` }))
    ],
    [parties]
  );

  const itemOptions = useMemo(
    () => [{ value: '', label: 'Create New Item' }, ...items.map((item) => ({ value: String(item.id), label: item.name }))],
    [items]
  );

  const initializeDrafts = (parsed, matched) => {
    const partyMatch = matched?.party_match || {};
    const suggestedParty = partyMatch?.matched?.id ? String(partyMatch.matched.id) : '';
    const resolvedType = parsed?.type || defaultType || 'purchase';
    const targetParty =
      resolvedType === 'sale'
        ? parsed?.buyer || parsed?.customer || parsed?.party || {}
        : parsed?.supplier || parsed?.seller || parsed?.party || parsed?.buyer || {};
    setSupplierDraft({
      party_id: suggestedParty,
      create_new: !suggestedParty,
      name: targetParty.name || '',
      phone: targetParty.phone || '',
      gst_number: targetParty.gst_number || '',
      address: targetParty.address || '',
      state_of_supply: ''
    });
    setBillDraft({
      invoice_no: parsed?.bill?.invoice_no || parsed?.invoice_no || '',
      order_date:
        parsed?.bill?.order_date || parsed?.order_date || new Date().toISOString().slice(0, 10)
    });
    setItemDrafts(
      (matched?.item_matches || []).map((match, index) => {
        const source = match?.ocr_item || {};
        const matchedItemId = match?.matched_item?.id ? String(match.matched_item.id) : '';
        const matchedItem = matchedItemId
          ? items.find((item) => String(item.id) === matchedItemId)
          : null;
        return {
          key: `${index}-${source.item_name || 'line'}`,
          confidence: toNumber(match?.confidence),
          selected_item_id: matchedItemId,
          action: match?.action || (matchedItemId ? 'matched' : 'create_new'),
          item_name: source?.item_name || '',
          ocr_hsn: source?.hsn || '',
          hsn: matchedItem ? matchedItem.hsn || '' : source?.hsn || '',
          qty: toNumber(source?.qty),
          rate: toNumber(source?.rate),
          amount: toNumber(source?.amount),
          batch_no: source?.batch_no || '',
          expiry_date: toExpiryMonthValue(source?.expiry_date || ''),
          mrp: source?.mrp ?? '',
          gst_rate: toNumber(source?.gst_rate),
          pack: source?.pack || '',
          discount_pct: toNumber(source?.discount_pct)
        };
      })
    );
  };

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const fileUrl = URL.createObjectURL(file);
    setPreviewUrl(fileUrl);
    setFileName(file.name || '');
    setFilePath(file.path || '');
    setError('');
  };

  const processInvoice = async () => {
    if (engine === 'manual') {
      if (!manualJson.trim()) {
        setError('Please paste JSON data.');
        return;
      }
      setProcessing(true);
      setError('');
      try {
        const parsed = JSON.parse(manualJson);
        const normalized = {
          ...parsed,
          type: defaultType || parsed.type || 'purchase'
        };
        const matched = await window.vyapar.matchInvoiceEntities(normalized);
        setOcrResult({ parsed: normalized, rawText: manualJson });
        setMatchResult(matched);
        initializeDrafts(normalized, matched);
        setStep(STEP_REVIEW);
      } catch (err) {
        setError(err?.message || 'Invalid JSON format.');
      } finally {
        setProcessing(false);
      }
      return;
    }

    if (!filePath) {
      setError('Select a file first. In Electron, file path access is required for OCR.');
      return;
    }
    setProcessing(true);
    setError('');
    try {
      if (engine === 'google') {
        await window.vyapar.setOcrApiKey(apiKey);
      }
      const processed = await window.vyapar.processInvoiceImage(filePath, engine);
      const normalized = {
        ...processed.parsed,
        type: defaultType || processed.parsed?.type || 'purchase'
      };
      const matched = await window.vyapar.matchInvoiceEntities(normalized);
      setOcrResult({ ...processed, parsed: normalized });
      setMatchResult(matched);
      initializeDrafts(normalized, matched);
      setStep(STEP_REVIEW);
    } catch (err) {
      setError(err?.message || 'Failed to process invoice.');
    } finally {
      setProcessing(false);
    }
  };

  const updateItemDraft = (index, field, value) => {
    setItemDrafts((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, [field]: value };
        if (field === 'selected_item_id') {
          next.action = value ? 'matched' : 'create_new';
          if (value) {
            const matchedItem = items.find((item) => String(item.id) === String(value));
            if (matchedItem) {
              next.hsn = matchedItem.hsn || '';
            }
          } else {
            next.hsn = next.ocr_hsn || '';
          }
        }
        if (field === 'qty' || field === 'rate') {
          next.amount = toNumber(next.qty) * toNumber(next.rate);
        }
        if (field === 'batch_no') {
          const batches = batchOptionsByItemId[String(next.selected_item_id || '')] || [];
          const matched = batches.find((b) => String(b.batch_no || '') === String(value || ''));
          if (matched) {
            next.expiry_date = toExpiryMonthValue(matched.expiry_date || '');
            if (matched.mrp !== undefined && matched.mrp !== null) next.mrp = matched.mrp;
          }
        }
        return next;
      })
    );
  };

  const currentImportType = (ocrResult?.parsed?.type || defaultType || 'purchase') === 'sale' ? 'sale' : 'purchase';

  useEffect(() => {
    setBatchOptionsByItemId({});
  }, [billDraft.order_date, currentImportType]);

  useEffect(() => {
    const ids = new Set();
    itemDrafts.forEach((row) => {
      if (row.selected_item_id) ids.add(String(row.selected_item_id));
    });
    const missing = [...ids].filter((id) => id && !batchOptionsByItemId[id]);
    if (!missing.length) return;
    const asOfDate = currentImportType === 'sale' ? billDraft.order_date : undefined;
    let active = true;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (id) => [id, await window.vyapar.listBatchAvailability(Number(id), asOfDate)])
      );
      if (!active) return;
      setBatchOptionsByItemId((prev) => {
        const next = { ...prev };
        entries.forEach(([id, data]) => {
          next[id] = data || [];
        });
        return next;
      });
    })();
    return () => {
      active = false;
    };
  }, [itemDrafts, batchOptionsByItemId, billDraft.order_date, currentImportType]);

  useEffect(() => {
    const partyId = Number(supplierDraft.party_id || 0);
    if (!Number.isFinite(partyId) || partyId <= 0) return;
    const orderType = (ocrResult?.parsed?.type || defaultType || 'purchase') === 'sale' ? 'sale' : 'purchase';
    let active = true;
    (async () => {
      const rates = await window.vyapar.listPartyRatesForOrder(partyId, orderType);
      if (!active) return;
      const rateByItemId = new Map();
      (rates || []).forEach((row) => {
        const itemId = Number(row?.item_id);
        const rate = toNumber(row?.rate);
        if (!Number.isFinite(itemId) || itemId <= 0) return;
        if (!Number.isFinite(rate) || rate <= 0) return;
        rateByItemId.set(String(itemId), rate);
      });
      if (!rateByItemId.size) return;
      setItemDrafts((prev) =>
        prev.map((row) => {
          const itemId = String(row.selected_item_id || '');
          if (!itemId) return row;
          const currentRate = toNumber(row.rate);
          if (currentRate > 0) return row;
          const partyRate = rateByItemId.get(itemId);
          if (!Number.isFinite(partyRate) || partyRate <= 0) return row;
          const qty = toNumber(row.qty);
          return {
            ...row,
            rate: partyRate,
            amount: qty * partyRate
          };
        })
      );
    })();
    return () => {
      active = false;
    };
  }, [supplierDraft.party_id, ocrResult?.parsed?.type, defaultType]);

  const goToConfirm = () => {
    if (!itemDrafts.length) {
      setError('No items parsed from invoice.');
      return;
    }
    if (!supplierDraft.create_new && !supplierDraft.party_id) {
      setError('Select a supplier or switch to create new.');
      return;
    }
    setError('');
    setStep(STEP_CONFIRM);
  };

  const importInvoice = async () => {
    setImporting(true);
    setError('');
    try {
      const parsedPartyId = supplierDraft.party_id ? Number(supplierDraft.party_id) : null;
      const finalPartyId = supplierDraft.create_new ? null : (Number.isNaN(parsedPartyId) ? null : parsedPartyId);
      
      const importType = ocrResult?.parsed?.type || defaultType || 'purchase';
      const partyDraft = {
        id: finalPartyId,
        name: supplierDraft.name || '',
        phone: supplierDraft.phone || '',
        gst_number: supplierDraft.gst_number || '',
        address: supplierDraft.address || '',
        state_of_supply: supplierDraft.state_of_supply || ''
      };
      const payload = {
        party_id: finalPartyId,
        apply_round_off: Boolean(applyRoundOff),
        ...(importType === 'sale' ? { buyer: partyDraft } : { supplier: partyDraft }),
        bill: {
          invoice_no: billDraft.invoice_no || '',
          order_date: billDraft.order_date || '',
          notes: `OCR import from ${fileName}`,
          discount_amount: Number.isFinite(Number(discountAmount)) ? Math.max(0, Number(discountAmount)) : 0
        },
        items: itemDrafts.map((row) => {
          const parsedItemId = row.selected_item_id ? Number(row.selected_item_id) : null;
          const finalItemId = Number.isNaN(parsedItemId) ? null : parsedItemId;
          const qty = toNumber(row.qty);
          const rawRate = toNumber(row.rate);
          const discountPct = toNumber(row.discount_pct);
          const effectiveRate =
            discountPct > 0 ? Number((rawRate * (1 - discountPct / 100)).toFixed(2)) : rawRate;
          const amount =
            discountPct > 0 && qty > 0 ? Number((qty * effectiveRate).toFixed(2)) : toNumber(row.amount);
          return {
            item_id: finalItemId,
            item_name: row.item_name || '',
            hsn: row.hsn || '',
            qty,
            rate: effectiveRate,
            amount,
            batch_no: row.batch_no || '',
            expiry_date: row.expiry_date || '',
            mrp: row.mrp === '' ? null : toNumber(row.mrp),
            gst_rate: toNumber(row.gst_rate),
            pack: row.pack || '',
            discount_pct: discountPct
          };
        })
      };
      let result;
      if (importType === 'sale') {
        result = await window.vyapar.importSaleBillOcr(payload);
      } else {
        result = await window.vyapar.importPurchaseBillOcr(payload);
      }
      navigate(importType === 'sale' ? '/sales' : '/purchase');
    } catch (err) {
      setError(err?.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const summary = useMemo(() => {
    const matchedItems = itemDrafts.filter((item) => item.selected_item_id).length;
    return {
      totalItems: itemDrafts.length,
      matchedItems,
      newItems: itemDrafts.length - matchedItems,
      supplierMode: supplierDraft.create_new ? 'Create New Supplier' : 'Use Existing Supplier'
    };
  }, [itemDrafts, supplierDraft.create_new]);

  const totals = useMemo(() => {
    return itemDrafts.reduce(
      (acc, row) => {
        const amount = linePreGstAmount(row);
        const gstRate = toNumber(row.gst_rate);
        const gstAmount = amount * (gstRate / 100);
        acc.itemsTotal += amount;
        acc.gstTotal += gstAmount;
        acc.grandTotal += amount + gstAmount;
        return acc;
      },
      { itemsTotal: 0, gstTotal: 0, grandTotal: 0 }
    );
  }, [itemDrafts]);

  const discountValue = useMemo(() => {
    const raw = Number(discountAmount);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.min(raw, totals.grandTotal);
  }, [discountAmount, totals.grandTotal]);

  const afterDiscountTotal = Math.max(0, totals.grandTotal - discountValue);

  const roundOffValue = useMemo(() => {
    if (!applyRoundOff) return 0;
    const decimal = afterDiscountTotal - Math.floor(afterDiscountTotal);
    const rounded = decimal > 0.5 ? Math.ceil(afterDiscountTotal) : Math.floor(afterDiscountTotal);
    return Number((rounded - afterDiscountTotal).toFixed(2));
  }, [applyRoundOff, afterDiscountTotal]);

  const finalTotal = afterDiscountTotal + roundOffValue;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title text-3xl font-semibold">
          Import {(ocrResult?.parsed?.type || defaultType || 'purchase') === 'sale' ? 'Sale' : 'Purchase'} Invoice
          (OCR)
        </h2>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            navigate((ocrResult?.parsed?.type || defaultType || 'purchase') === 'sale' ? '/sales' : '/purchase')
          }
        >
          Back to {(ocrResult?.parsed?.type || defaultType || 'purchase') === 'sale' ? 'Sales' : 'Purchase'}
        </Button>
      </div>

      <Card>
        <CardContent>
          <div className="ocr-steps">
            <span className={step >= STEP_UPLOAD ? 'ocr-step active' : 'ocr-step'}>1. Upload</span>
            <span className={step >= STEP_REVIEW ? 'ocr-step active' : 'ocr-step'}>2. Review & Match</span>
            <span className={step >= STEP_CONFIRM ? 'ocr-step active' : 'ocr-step'}>3. Confirm</span>
          </div>
        </CardContent>
      </Card>

      {step === STEP_UPLOAD && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>OCR Engine</Label>
                <select
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  value={engine}
                  onChange={(event) => setEngine(event.target.value)}
                >
                  <option value="tesseract">Tesseract (Local)</option>
                  <option value="google">Google Vision (Cloud)</option>
                  <option value="gemini">Gemini AI (Cloud)</option>
                  <option value="manual">Manual JSON Input</option>
                </select>
              </div>
              {engine === 'google' && (
                <div>
                  <Label>Google Vision API Key</Label>
                  <Input
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="AIza..."
                    type="password"
                  />
                </div>
              )}
            </div>

            {engine === 'manual' ? (
              <div className="space-y-2">
                <Label>Paste OCR JSON</Label>
                <textarea
                  className="w-full h-48 rounded-lg border border-border px-3 py-2 text-sm font-mono"
                  placeholder='{"type": "purchase", "supplier": {...}, "bill": {...}, "items": [...]}'
                  value={manualJson}
                  onChange={(e) => setManualJson(e.target.value)}
                />
              </div>
            ) : (
              <div className="ocr-dropzone">
                <Label>Invoice Image or PDF</Label>
                <Input type="file" accept=".pdf,image/*" onChange={onFileChange} />
                {fileName ? <p className="text-sm text-muted">Selected: {fileName}</p> : null}
              </div>
            )}

            {previewUrl ? (
              <div className="ocr-preview-box">
                <iframe title="Invoice preview" src={previewUrl} className="ocr-preview-frame" />
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <Button type="button" onClick={processInvoice} disabled={processing}>
                {processing ? 'Processing...' : 'Process Invoice'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === STEP_REVIEW && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Supplier & Bill</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Supplier Mode</Label>
                  <select
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    value={supplierDraft.create_new ? 'new' : 'existing'}
                    onChange={(event) =>
                      setSupplierDraft((prev) => ({ ...prev, create_new: event.target.value === 'new' }))
                    }
                  >
                    <option value="existing">Use Existing Party</option>
                    <option value="new">Create New Party</option>
                  </select>
                </div>
                {!supplierDraft.create_new && (
                  <div>
                    <Label>Matched Party</Label>
                    <SearchableSelect
                      value={supplierDraft.party_id}
                      options={partyOptions}
                      onChange={(next) => {
                        const nextId = String(next || '');
                        const matched = parties.find((party) => String(party.id) === nextId);
                        setSupplierDraft((prev) => ({
                          ...prev,
                          party_id: nextId,
                          name: matched?.name || prev.name,
                          phone: matched?.phone || prev.phone,
                          gst_number: matched?.gst_number || prev.gst_number,
                          address: matched?.address || prev.address,
                          state_of_supply: matched?.state_of_supply || prev.state_of_supply
                        }));
                      }}
                      placeholder="Search party"
                    />
                    <div className={confidenceClass(toNumber(matchResult?.party_match?.confidence || 0))}>
                      Confidence: {(toNumber(matchResult?.party_match?.confidence || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Supplier Name</Label>
                  <Input
                    value={supplierDraft.name}
                    onChange={(event) => setSupplierDraft((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div>
                  <Label>GST Number</Label>
                  <Input
                    value={supplierDraft.gst_number}
                    onChange={(event) => setSupplierDraft((prev) => ({ ...prev, gst_number: event.target.value }))}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={supplierDraft.phone}
                    onChange={(event) => setSupplierDraft((prev) => ({ ...prev, phone: event.target.value }))}
                  />
                </div>
                <div>
                  <Label>Address</Label>
                  <Input
                    value={supplierDraft.address}
                    onChange={(event) => setSupplierDraft((prev) => ({ ...prev, address: event.target.value }))}
                  />
                </div>
                <div>
                  <Label>Invoice No</Label>
                  <Input
                    value={billDraft.invoice_no}
                    onChange={(event) => setBillDraft((prev) => ({ ...prev, invoice_no: event.target.value }))}
                  />
                </div>
                <div>
                  <Label>Invoice Date</Label>
                  <Input
                    type="date"
                    value={billDraft.order_date}
                    onChange={(event) => setBillDraft((prev) => ({ ...prev, order_date: event.target.value }))}
                  />
                </div>
                <div>
                  <Label>Discount on Invoice</Label>
                  <Input
                    type="number"
                    value={discountAmount}
                    onChange={(event) => setDiscountAmount(event.target.value)}
                    placeholder="0.00"
                  />
                  <label className="mt-2 flex items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={applyRoundOff}
                      onChange={(event) => setApplyRoundOff(event.target.checked)}
                    />
                    Round off final amount
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items Review</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-x-auto">
                <Table className="ocr-table whitespace-nowrap">
                  <THead>
                  <TR>
                    <TH>OCR Item</TH>
                    <TH>Match</TH>
                    <TH>Confidence</TH>
                    <TH>HSN</TH>
                    <TH>Batch</TH>
                    <TH>Expiry</TH>
                    <TH>MRP</TH>
                    <TH>Qty</TH>
                    <TH>Rate</TH>
                    <TH>GST%</TH>
                    <TH className="text-right">Amount (Pre-GST)</TH>
                  </TR>
                </THead>
                <TBody>
                  {itemDrafts.map((row, index) => (
                    <TR key={row.key}>
                      <TD>
                        <Input
                          value={row.item_name}
                          onChange={(event) => updateItemDraft(index, 'item_name', event.target.value)}
                        />
                      </TD>
                      <TD>
                        <SearchableSelect
                          value={row.selected_item_id}
                          options={itemOptions}
                          onChange={(next) => updateItemDraft(index, 'selected_item_id', String(next || ''))}
                          placeholder="Match or create"
                        />
                      </TD>
                      <TD>
                        <span className={confidenceClass(toNumber(row.confidence))}>
                          {(toNumber(row.confidence) * 100).toFixed(1)}%
                        </span>
                      </TD>
                      <TD>
                        <Input
                          value={row.hsn}
                          onChange={(event) => updateItemDraft(index, 'hsn', event.target.value)}
                          readOnly={row.action === 'matched'}
                          className={
                            row.action === 'matched' ? 'bg-muted text-muted cursor-not-allowed' : ''
                          }
                        />
                      </TD>
                      <TD>
                        <Input
                          value={row.batch_no}
                          onChange={(event) => updateItemDraft(index, 'batch_no', event.target.value)}
                          list={`batch-options-${row.selected_item_id || row.key}`}
                        />
                        <datalist id={`batch-options-${row.selected_item_id || row.key}`}>
                          {(batchOptionsByItemId[String(row.selected_item_id || '')] || []).map((batch) => (
                            <option
                              key={batch.batch_no}
                              value={batch.batch_no}
                              label={`${batch.is_expired ? '⚠ EXPIRED · ' : ''}Qty: ${Number(batch.available_qty || 0)}${
                                batch.expiry_date ? ` · Exp ${toExpiryMonthValue(batch.expiry_date)}` : ''
                              }`}
                            />
                          ))}
                        </datalist>
                      </TD>
                      <TD>
                        <Input
                          value={row.expiry_date}
                          onChange={(event) => updateItemDraft(index, 'expiry_date', event.target.value)}
                          onBlur={() => updateItemDraft(index, 'expiry_date', canonicalizeExpiryInput(row.expiry_date || ''))}
                          inputMode="numeric"
                          placeholder="MM/YYYY"
                        />
                      </TD>
                      <TD>
                        <Input value={row.mrp} onChange={(event) => updateItemDraft(index, 'mrp', event.target.value)} />
                      </TD>
                      <TD>
                        <Input value={row.qty} onChange={(event) => updateItemDraft(index, 'qty', event.target.value)} />
                      </TD>
                      <TD>
                        <Input
                          value={row.rate}
                          onChange={(event) => updateItemDraft(index, 'rate', event.target.value)}
                        />
                      </TD>
                      <TD>
                        <Input
                          value={row.gst_rate}
                          onChange={(event) => updateItemDraft(index, 'gst_rate', event.target.value)}
                        />
                      </TD>
                      <TD className="text-right font-medium tabular-nums">
                        {formatCurrency(linePreGstAmount(row))}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              </div>
              <div className="mt-4 ocr-summary-grid">
                <div className="ocr-summary-box">
                  <p className="text-xs uppercase text-muted">Total Items</p>
                  <p className="font-semibold">{summary.totalItems}</p>
                </div>
                <div className="ocr-summary-box">
                  <p className="text-xs uppercase text-muted">Items Total</p>
                  <p className="font-semibold">{formatCurrency(totals.itemsTotal)}</p>
                </div>
                <div className="ocr-summary-box">
                  <p className="text-xs uppercase text-muted">GST Total</p>
                  <p className="font-semibold">{formatCurrency(totals.gstTotal)}</p>
                </div>
                <div className="ocr-summary-box">
                  <p className="text-xs uppercase text-muted">Discount</p>
                  <p className="font-semibold">- {formatCurrency(discountValue)}</p>
                </div>
                <div className="ocr-summary-box">
                  <p className="text-xs uppercase text-muted">Grand Total</p>
                  <p className="font-semibold">{formatCurrency(finalTotal)}</p>
                  {roundOffValue !== 0 && (
                    <p className="text-xs text-muted">Round off: {formatCurrency(roundOffValue)}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={() => setStep(STEP_UPLOAD)}>
              Back
            </Button>
            <Button type="button" onClick={goToConfirm}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === STEP_CONFIRM && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">Discount on Invoice</span>
                <Input
                  type="number"
                  className="w-32"
                  value={discountAmount}
                  onChange={(event) => setDiscountAmount(event.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={applyRoundOff}
                  onChange={(event) => setApplyRoundOff(event.target.checked)}
                />
                Round off final amount
              </label>
            </div>
            <div className="ocr-summary-grid">
              <div className="ocr-summary-box">
                <p className="text-xs uppercase text-muted">Supplier</p>
                <p className="font-semibold">{summary.supplierMode}</p>
              </div>
              <div className="ocr-summary-box">
                <p className="text-xs uppercase text-muted">Items</p>
                <p className="font-semibold">{summary.totalItems}</p>
              </div>
              <div className="ocr-summary-box">
                <p className="text-xs uppercase text-muted">Matched</p>
                <p className="font-semibold">{summary.matchedItems}</p>
              </div>
              <div className="ocr-summary-box">
                <p className="text-xs uppercase text-muted">Create New</p>
                <p className="font-semibold">{summary.newItems}</p>
              </div>
              <div className="ocr-summary-box">
                <p className="text-xs uppercase text-muted">Items Total</p>
                <p className="font-semibold">{formatCurrency(totals.itemsTotal)}</p>
              </div>
              <div className="ocr-summary-box">
                <p className="text-xs uppercase text-muted">GST Total</p>
                <p className="font-semibold">{formatCurrency(totals.gstTotal)}</p>
              </div>
              <div className="ocr-summary-box">
                <p className="text-xs uppercase text-muted">Discount</p>
                <p className="font-semibold">- {formatCurrency(discountValue)}</p>
              </div>
              <div className="ocr-summary-box">
                <p className="text-xs uppercase text-muted">Grand Total</p>
                <p className="font-semibold">{formatCurrency(finalTotal)}</p>
                {roundOffValue !== 0 && (
                  <p className="text-xs text-muted">Round off: {formatCurrency(roundOffValue)}</p>
                )}
              </div>
            </div>

            <div className="mt-4 w-full overflow-x-auto">
              <Table className="ocr-table min-w-[600px] whitespace-nowrap">
                <THead>
                  <TR>
                    <TH>Item Name</TH>
                    <TH>Match / Action</TH>
                    <TH>Qty</TH>
                    <TH>Rate</TH>
                    <TH>Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {itemDrafts.map((row, index) => (
                    <TR key={row.key}>
                      <TD>{row.item_name}</TD>
                      <TD>
                        <SearchableSelect
                          value={row.selected_item_id}
                          options={itemOptions}
                          onChange={(next) => updateItemDraft(index, 'selected_item_id', String(next || ''))}
                          placeholder="Match or create"
                        />
                      </TD>
                      <TD>{row.qty}</TD>
                      <TD>{row.rate}</TD>
                      <TD>{row.amount}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setStep(STEP_REVIEW)} disabled={importing}>
                Back
              </Button>
              <Button type="button" onClick={importInvoice} disabled={importing}>
                {importing
                  ? 'Importing...'
                  : `Import ${ocrResult?.parsed?.type === 'sale' ? 'Sale' : 'Purchase'} Bill`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      {ocrResult?.rawText ? (
        <Card>
          <CardHeader>
            <CardTitle>OCR Raw Text</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="ocr-raw-text">{ocrResult.rawText}</pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
