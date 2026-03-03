import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

const confidenceClass = (value) => {
  if (value >= 0.85) return 'ocr-badge ocr-badge-green';
  if (value >= 0.5) return 'ocr-badge ocr-badge-yellow';
  return 'ocr-badge ocr-badge-red';
};

export default function OcrImport() {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEP_UPLOAD);
  const [engine, setEngine] = useState('tesseract');
  const [apiKey, setApiKey] = useState('');
  const [fileName, setFileName] = useState('');
  const [filePath, setFilePath] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [ocrResult, setOcrResult] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [parties, setParties] = useState([]);
  const [items, setItems] = useState([]);
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
    setSupplierDraft({
      party_id: suggestedParty,
      create_new: !suggestedParty,
      name: parsed?.supplier?.name || '',
      phone: parsed?.supplier?.phone || '',
      gst_number: parsed?.supplier?.gst_number || '',
      address: parsed?.supplier?.address || '',
      state_of_supply: ''
    });
    setBillDraft({
      invoice_no: parsed?.bill?.invoice_no || '',
      order_date: parsed?.bill?.order_date || new Date().toISOString().slice(0, 10)
    });
    setItemDrafts(
      (matched?.item_matches || []).map((match, index) => {
        const source = match?.ocr_item || {};
        const matchedItemId = match?.matched_item?.id ? String(match.matched_item.id) : '';
        return {
          key: `${index}-${source.item_name || 'line'}`,
          confidence: toNumber(match?.confidence),
          selected_item_id: matchedItemId,
          action: match?.action || (matchedItemId ? 'matched' : 'create_new'),
          item_name: source?.item_name || '',
          hsn: source?.hsn || '',
          qty: toNumber(source?.qty),
          rate: toNumber(source?.rate),
          amount: toNumber(source?.amount),
          batch_no: source?.batch_no || '',
          expiry_date: source?.expiry_date || '',
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
      const matched = await window.vyapar.matchInvoiceEntities(processed.parsed);
      setOcrResult(processed);
      setMatchResult(matched);
      initializeDrafts(processed.parsed, matched);
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
        }
        if (field === 'qty' || field === 'rate') {
          next.amount = toNumber(next.qty) * toNumber(next.rate);
        }
        return next;
      })
    );
  };

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
      const payload = {
        party_id: supplierDraft.create_new ? null : Number(supplierDraft.party_id || 0),
        supplier: {
          id: supplierDraft.create_new ? null : Number(supplierDraft.party_id || 0),
          name: supplierDraft.name || '',
          phone: supplierDraft.phone || '',
          gst_number: supplierDraft.gst_number || '',
          address: supplierDraft.address || '',
          state_of_supply: supplierDraft.state_of_supply || ''
        },
        bill: {
          invoice_no: billDraft.invoice_no || '',
          order_date: billDraft.order_date || '',
          notes: `OCR import from ${fileName}`
        },
        items: itemDrafts.map((row) => ({
          item_id: row.selected_item_id ? Number(row.selected_item_id) : null,
          item_name: row.item_name || '',
          hsn: row.hsn || '',
          qty: toNumber(row.qty),
          rate: toNumber(row.rate),
          amount: toNumber(row.amount),
          batch_no: row.batch_no || '',
          expiry_date: row.expiry_date || '',
          mrp: row.mrp === '' ? null : toNumber(row.mrp),
          gst_rate: toNumber(row.gst_rate),
          pack: row.pack || '',
          discount_pct: toNumber(row.discount_pct)
        }))
      };
      const result = await window.vyapar.importPurchaseBillOcr(payload);
      const orderId = result?.order?.id;
      if (orderId) navigate(`/orders/${orderId}/edit`);
      else navigate('/purchase');
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title text-3xl font-semibold">Import Purchase Invoice (OCR)</h2>
        <Button type="button" variant="outline" onClick={() => navigate('/purchase')}>
          Back to Purchase
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

            <div className="ocr-dropzone">
              <Label>Invoice Image or PDF</Label>
              <Input type="file" accept=".pdf,image/*" onChange={onFileChange} />
              {fileName ? <p className="text-sm text-muted">Selected: {fileName}</p> : null}
            </div>

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
                      onChange={(next) => setSupplierDraft((prev) => ({ ...prev, party_id: String(next || '') }))}
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items Review</CardTitle>
            </CardHeader>
            <CardContent>
              <Table className="ocr-table">
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
                        <Input value={row.hsn} onChange={(event) => updateItemDraft(index, 'hsn', event.target.value)} />
                      </TD>
                      <TD>
                        <Input
                          value={row.batch_no}
                          onChange={(event) => updateItemDraft(index, 'batch_no', event.target.value)}
                        />
                      </TD>
                      <TD>
                        <Input
                          type="date"
                          value={row.expiry_date}
                          onChange={(event) => updateItemDraft(index, 'expiry_date', event.target.value)}
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
                    </TR>
                  ))}
                </TBody>
              </Table>
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
            </div>

            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(STEP_REVIEW)} disabled={importing}>
                Back
              </Button>
              <Button type="button" onClick={importInvoice} disabled={importing}>
                {importing ? 'Importing...' : 'Import Purchase Bill'}
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
