import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';

const LIMIT_OPTIONS = [25, 50, 100, 250, 1000];

const formatDate = (value) => {
  if (!value) return '—';
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  return raw;
};

const formatMoney = (value) => Number(value || 0).toFixed(2);

const formatQty = (value) => {
  const num = Number(value || 0);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

export default function ItemUsage() {
  const navigate = useNavigate();
  const { itemId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const batchNo = searchParams.get('batch') || '';
  const activeTab = searchParams.get('tab') || 'sale';

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await window.vyapar.getItemUsage(Number(itemId), {
        batchNo,
        fromDate,
        toDate,
        search,
        limit
      });
      setUsage(data);
      if (!data) setError('Item not found.');
    } catch (err) {
      setError(err?.message || 'Failed to load item usage.');
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, [itemId, batchNo, fromDate, toDate, search, limit]);

  useEffect(() => {
    load();
  }, [load]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const item = usage?.item || null;
  const summary = usage?.summary || null;
  const rows = useMemo(() => {
    if (!usage) return [];
    return activeTab === 'purchase' ? usage.purchases || [] : usage.sales || [];
  }, [usage, activeTab]);

  const filtersActive = Boolean(batchNo || fromDate || toDate || search);
  const shownSummary = summary ? summary[activeTab === 'purchase' ? 'purchase' : 'sale'] : null;
  const truncated = shownSummary ? shownSummary.line_count > rows.length : false;

  const resetFilters = () => {
    setFromDate('');
    setToDate('');
    setSearch('');
    setLimit(100);
    setParam('batch', '');
  };

  const tabs = [
    { key: 'sale', label: `Sales${summary ? ` (${summary.sale.line_count})` : ''}` },
    { key: 'purchase', label: `Purchases${summary ? ` (${summary.purchase.line_count})` : ''}` },
    { key: 'batches', label: `Batches${usage ? ` (${(usage.batches || []).length})` : ''}` }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="section-title text-3xl font-semibold">{item ? item.name : 'Item Usage'}</h2>
          <p className="text-muted">
            {item
              ? `HSN ${item.hsn || '—'} · GST ${item.gst_rate}% · Base Rate ${formatMoney(item.base_rate)} · Unit ${
                  item.base_unit || '—'
                } · Stock ${formatQty(item.stock_qty)}`
              : 'Where this item has been used across sales and purchase orders.'}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => navigate('/items')}>
          Back to Items
        </Button>
      </div>

      {batchNo && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-accentSoft px-4 py-2 text-sm">
          <span>
            Filtered to batch <strong>{batchNo}</strong>
          </span>
          <Button type="button" variant="ghost" onClick={() => setParam('batch', '')}>
            Clear batch filter
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {summary && (
        <div className="space-y-2">
          {filtersActive && <p className="text-xs text-muted">Totals below reflect the active filters.</p>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted">Sale Orders</p>
              <p className="text-lg font-semibold">{summary.sale.order_count}</p>
              <p className="text-xs text-muted">Last {formatDate(summary.sale.last_date)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted">Sold Qty / Value</p>
              <p className="text-lg font-semibold">{formatQty(summary.sale.qty)}</p>
              <p className="text-xs text-muted">₹ {formatMoney(summary.sale.amount)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted">Purchase Orders</p>
              <p className="text-lg font-semibold">{summary.purchase.order_count}</p>
              <p className="text-xs text-muted">Last {formatDate(summary.purchase.last_date)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted">Purchased Qty / Value</p>
              <p className="text-lg font-semibold">{formatQty(summary.purchase.qty)}</p>
              <p className="text-xs text-muted">₹ {formatMoney(summary.purchase.amount)}</p>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Where this item has been used</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <Button
                key={tab.key}
                type="button"
                variant={activeTab === tab.key ? 'default' : 'outline'}
                onClick={() => setParam('tab', tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {activeTab !== 'batches' && (
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
              <div>
                <Label>From Date</Label>
                <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </div>
              <div>
                <Label>To Date</Label>
                <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              </div>
              <div>
                <Label>Search</Label>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Party / invoice / batch"
                />
              </div>
              <div>
                <Label>Show Latest</Label>
                <select
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value))}
                >
                  {LIMIT_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value} rows
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={resetFilters}>
                  Reset Filters
                </Button>
              </div>
            </div>
          )}

          {loading && <p className="text-sm text-muted">Loading…</p>}

          {!loading && activeTab === 'batches' && (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Batch</TH>
                    <TH>Expiry</TH>
                    <TH>MRP</TH>
                    <TH>Stock Qty</TH>
                    <TH>Purchased Qty</TH>
                    <TH>Sold Qty</TH>
                    <TH>Orders</TH>
                    <TH>Last Used</TH>
                    <TH>Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {(usage?.batches || []).map((batch) => (
                    <TR
                      key={batch.id}
                      className="cursor-pointer hover:bg-accentSoft"
                      onClick={() => {
                        const next = new URLSearchParams(searchParams);
                        if (batch.batch_no) next.set('batch', batch.batch_no);
                        else next.delete('batch');
                        next.set('tab', 'sale');
                        setSearchParams(next, { replace: true });
                      }}
                    >
                      <TD>{batch.batch_no || '(no batch)'}</TD>
                      <TD>{formatDate(batch.expiry_date)}</TD>
                      <TD>{formatMoney(batch.mrp)}</TD>
                      <TD>{formatQty(batch.qty)}</TD>
                      <TD>{formatQty(batch.purchase_qty)}</TD>
                      <TD>{formatQty(batch.sale_qty)}</TD>
                      <TD>{batch.order_count}</TD>
                      <TD>{formatDate(batch.last_used_date)}</TD>
                      <TD>
                        <span className="text-xs text-muted">View orders →</span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {!usage?.batches?.length && <p className="mt-3 text-sm text-muted">No batches found for this item.</p>}
            </>
          )}

          {!loading && activeTab !== 'batches' && (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Invoice</TH>
                    <TH>Party</TH>
                    <TH>Batch</TH>
                    <TH>Expiry</TH>
                    <TH>Qty</TH>
                    <TH>Free</TH>
                    <TH>Rate</TH>
                    <TH>Line Total</TH>
                    <TH>Source</TH>
                    <TH>Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR
                      key={`${row.order_id}-${row.line_id}`}
                      className="cursor-pointer hover:bg-accentSoft"
                      onClick={() => navigate(`/orders/${row.order_id}/edit`)}
                    >
                      <TD>{formatDate(row.order_date)}</TD>
                      <TD>{row.invoice_no || row.order_id}</TD>
                      <TD>{row.party_name || '—'}</TD>
                      <TD>{row.batch_no || '—'}</TD>
                      <TD>{formatDate(row.expiry_date)}</TD>
                      <TD>{formatQty(row.qty)}</TD>
                      <TD>{formatQty(row.free_qty)}</TD>
                      <TD>{formatMoney(row.rate)}</TD>
                      <TD>{formatMoney(row.line_total)}</TD>
                      <TD>{row.source === 'ocr_import' ? 'OCR Import' : 'Manual'}</TD>
                      <TD>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/orders/${row.order_id}/edit`);
                          }}
                        >
                          Open
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {!rows.length && (
                <p className="mt-3 text-sm text-muted">
                  No {activeTab === 'purchase' ? 'purchase' : 'sale'} orders found for this item with the selected
                  filters.
                </p>
              )}
              {truncated && (
                <p className="mt-3 text-xs text-muted">
                  Showing latest {rows.length} of {shownSummary.line_count} lines. Increase &ldquo;Show Latest&rdquo; to
                  see more.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
