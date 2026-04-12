import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import SearchableSelect from '../components/ui/SearchableSelect';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';

const ORDER_FILTERS_STORAGE_KEY = 'orders.filters.v1';

const formatOrderDate = (value) => {
  if (!value) return '—';
  const raw = String(value).trim();

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;

  const slashMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) return `${slashMatch[1]}/${slashMatch[2]}/${slashMatch[3]}`;

  return raw;
};

const normalizeDateForCompare = (value) => {
  if (!value) return null;
  const raw = String(value).trim();

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);

  const slashMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) return new Date(`${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}T00:00:00`);

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatCurrency = (value) => `₹ ${Number(value || 0).toFixed(2)}`;

const toInputDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthRange = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from: toInputDate(start), to: toInputDate(end) };
};

const getQuarterRange = (date) => {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  const start = new Date(date.getFullYear(), quarterStartMonth, 1);
  const end = new Date(date.getFullYear(), quarterStartMonth + 3, 0);
  return { from: toInputDate(start), to: toInputDate(end) };
};

const getLastMonthRange = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const end = new Date(date.getFullYear(), date.getMonth(), 0);
  return { from: toInputDate(start), to: toInputDate(end) };
};

const getLastQuarterRange = (date) => {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  const start = new Date(date.getFullYear(), quarterStartMonth - 3, 1);
  const end = new Date(date.getFullYear(), quarterStartMonth, 0);
  return { from: toInputDate(start), to: toInputDate(end) };
};

const getPresetRange = (preset) => {
  const now = new Date();
  if (preset === 'this_month') return getMonthRange(now);
  if (preset === 'this_quarter') return getQuarterRange(now);
  if (preset === 'last_month') return getLastMonthRange(now);
  if (preset === 'last_quarter') return getLastQuarterRange(now);
  return { from: '', to: '' };
};

const getInvoiceNo = (order) => {
  if (!order) return '';
  return order.invoice_prefix
    ? `${order.invoice_prefix}${order.ref_number || ''}`
    : String(order.ref_number || order.id || '');
};

const getDefaultFilters = () => {
  const range = getPresetRange('this_month');
  return {
    preset: 'this_month',
    order_type: '',
    party_id: '',
    order_date_from: range.from,
    order_date_to: range.to,
    query: ''
  };
};

const sanitizeFilters = (value) => {
  const defaults = getDefaultFilters();
  if (!value || typeof value !== 'object') return defaults;
  return {
    preset: String(value.preset || defaults.preset),
    order_type: String(value.order_type || ''),
    party_id: String(value.party_id || ''),
    order_date_from: String(value.order_date_from || ''),
    order_date_to: String(value.order_date_to || ''),
    query: String(value.query || '')
  };
};

const loadStoredFilters = () => {
  const defaults = getDefaultFilters();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.sessionStorage.getItem(ORDER_FILTERS_STORAGE_KEY);
    if (!raw) return defaults;
    return sanitizeFilters(JSON.parse(raw));
  } catch (_error) {
    return defaults;
  }
};

export default function Orders({ mode = 'sale' }) {
  const navigate = useNavigate();
  const fixedOrderType = mode === 'purchase' ? 'purchase' : mode === 'sale' ? 'sale' : '';
  const isPurchaseMode = fixedOrderType === 'purchase';
  const pageTitle = isPurchaseMode ? 'Purchase Invoices' : 'Sale Invoices';
  const summaryLabel = isPurchaseMode ? 'Total Purchase Amount' : 'Total Sales Amount';
  const createPath = isPurchaseMode ? '/purchase/new' : '/sales/new';
  const [parties, setParties] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [filters, setFilters] = useState(loadStoredFilters);

  const load = async () => {
    const [partyData, orderData] = await Promise.all([
      window.vyapar.listParties(),
      window.vyapar.listOrders()
    ]);
    setParties(partyData);
    setOrders(orderData);
  };

  const deleteOrder = async (order) => {
    if (!order) return;
    const invoiceNo = getInvoiceNo(order) || order.id;
    const confirmed = window.confirm(`Delete ${order.order_type} order ${invoiceNo}? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await window.vyapar.deleteOrder(order.id);
      setSelectedOrderId(null);
      await load();
    } catch (error) {
      window.alert(`Failed to delete order: ${error?.message || 'Unknown error'}`);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(ORDER_FILTERS_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const partiesMap = useMemo(() => {
    const map = new Map();
    parties.forEach((party) => map.set(String(party.id), party));
    return map;
  }, [parties]);

  const partyOptions = useMemo(
    () => parties.map((party) => ({ value: String(party.id), label: party.name })),
    [parties]
  );

  const typeOptions = useMemo(
    () => [
      { value: 'sale', label: 'Sale' },
      { value: 'purchase', label: 'Purchase' }
    ],
    []
  );

  const presetOptions = useMemo(
    () => [
      { value: 'this_month', label: 'This Month' },
      { value: 'this_quarter', label: 'This Quarter' },
      { value: 'last_month', label: 'Last Month' },
      { value: 'last_quarter', label: 'Last Quarter' },
      { value: 'custom', label: 'Custom' }
    ],
    []
  );

  const filteredOrders = useMemo(() => {
    const from = filters.order_date_from ? normalizeDateForCompare(filters.order_date_from) : null;
    const to = filters.order_date_to ? normalizeDateForCompare(filters.order_date_to) : null;
    const query = filters.query.trim().toLowerCase();

    return orders
      .filter((order) => {
        const activeType = fixedOrderType || filters.order_type;
        if (activeType && order.order_type !== activeType) return false;
        if (filters.party_id && String(order.party_id || '') !== String(filters.party_id)) return false;

        const orderDate = normalizeDateForCompare(order.order_date);
        if (from && orderDate && orderDate < from) return false;
        if (to && orderDate) {
          const inclusiveTo = new Date(to);
          inclusiveTo.setHours(23, 59, 59, 999);
          if (orderDate > inclusiveTo) return false;
        }

        if (query) {
          const invoiceNo = getInvoiceNo(order);
          const partyName = order.party_name || partiesMap.get(String(order.party_id))?.name || '';
          const haystack = [invoiceNo, partyName, order.notes || '', order.order_type || '']
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(query)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dateA = normalizeDateForCompare(a.order_date);
        const dateB = normalizeDateForCompare(b.order_date);
        if (dateA && dateB && dateA.getTime() !== dateB.getTime()) return dateB - dateA;
        if (dateA && !dateB) return -1;
        if (!dateA && dateB) return 1;
        const byInvoice = getInvoiceNo(b).localeCompare(getInvoiceNo(a), undefined, {
          numeric: true,
          sensitivity: 'base'
        });
        if (byInvoice !== 0) return byInvoice;
        return Number(b.id || 0) - Number(a.id || 0);
      });
  }, [orders, filters, partiesMap, fixedOrderType]);

  const summary = useMemo(() => {
    return filteredOrders.reduce(
      (acc, order) => {
        const amount = Number(order.header_total || 0);
        const received = Number(order.paid_amount || 0);
        const balance = Number(order.outstanding_amount || 0);
        acc.total += amount;
        acc.received += received;
        acc.balance += balance;
        return acc;
      },
      { total: 0, received: 0, balance: 0 }
    );
  }, [filteredOrders]);

  const updateFilter = (field) => (eventOrValue) => {
    const value =
      eventOrValue && typeof eventOrValue === 'object' && eventOrValue.target
        ? eventOrValue.target.value
        : String(eventOrValue ?? '');
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setFilters(getDefaultFilters());
  };

  const updatePreset = (value) => {
    const preset = String(value || 'custom');
    if (preset === 'custom') {
      setFilters((prev) => ({ ...prev, preset }));
      return;
    }
    const range = getPresetRange(preset);
    setFilters((prev) => ({
      ...prev,
      preset,
      order_date_from: range.from,
      order_date_to: range.to
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title text-3xl font-semibold">{pageTitle}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/orders/import-ocr?type=${isPurchaseMode ? 'purchase' : 'sale'}`)}
          >
            Import from Invoice
          </Button>
          {!isPurchaseMode && (
            <Button type="button" variant="outline" onClick={() => navigate('/sales/bulk')}>
              Bulk Generate
            </Button>
          )}
          <Button type="button" onClick={() => navigate(createPath)}>
            {isPurchaseMode ? '+ Add Purchase' : '+ Add Sale'}
          </Button>
        </div>
      </div>

      <Card className='relative z-10' >
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-20">
              <Label>Filter by</Label>
              <select
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={filters.preset}
                onChange={(event) => updatePreset(event.target.value)}
              >
                {presetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>From</Label>
              <Input
                type="date"
                value={filters.order_date_from}
                onChange={(event) => {
                  updateFilter('order_date_from')(event);
                  setFilters((prev) => ({ ...prev, preset: 'custom' }));
                }}
              />
            </div>
            <div>
              <Label>To</Label>
              <Input
                type="date"
                value={filters.order_date_to}
                onChange={(event) => {
                  updateFilter('order_date_to')(event);
                  setFilters((prev) => ({ ...prev, preset: 'custom' }));
                }}
              />
            </div>
            <div className="min-w-44">
              <Label>Party</Label>
              <SearchableSelect
                value={filters.party_id}
                options={partyOptions}
                onChange={updateFilter('party_id')}
                placeholder="All firms"
              />
            </div>
            {!fixedOrderType && (
              <div className="min-w-36">
                <Label>Type</Label>
                <SearchableSelect
                  value={filters.order_type}
                  options={typeOptions}
                  onChange={updateFilter('order_type')}
                  placeholder="All types"
                />
              </div>
            )}
            <div className="min-w-56 flex-1">
              <Label>Search</Label>
              <Input
                value={filters.query}
                onChange={updateFilter('query')}
                placeholder="Invoice no, party, notes"
              />
            </div>
            <div>
              <Button type="button" variant="outline" onClick={clearFilters}>
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="max-w-xs rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{summaryLabel}</p>
            <p className="mt-1 text-3xl font-semibold">{formatCurrency(summary.total)}</p>
            <p className="mt-2 text-xs text-muted">
              Received: {formatCurrency(summary.received)} | Balance: {formatCurrency(summary.balance)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Transactions</CardTitle>
            <p className="text-xs text-muted">Sorted by Invoice no (default)</p>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Invoice no</TH>
                <TH>Party Name</TH>
                <TH>Transaction</TH>
                <TH>Payment Type</TH>
                <TH>Amount</TH>
                <TH>Balance</TH>
                <TH>Due date</TH>
                <TH>Status</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filteredOrders.map((order) => {
                const invoiceNo = getInvoiceNo(order);
                const partyName = order.party_name || partiesMap.get(String(order.party_id))?.name || '—';
                const amount = Number(order.header_total || 0);
                const balance = Number(order.outstanding_amount || 0);
                const isPaid = balance <= 0;

                return (
                  <TR
                    key={order.id}
                    className={selectedOrderId === order.id ? 'bg-accentSoft' : ''}
                    onClick={() => setSelectedOrderId(order.id)}
                    onDoubleClick={() => navigate(`/orders/${order.id}/edit`)}
                  >
                    <TD>{formatOrderDate(order.order_date)}</TD>
                    <TD>{invoiceNo}</TD>
                    <TD>{partyName}</TD>
                    <TD className="capitalize">{order.order_type}</TD>
                    <TD>Cash</TD>
                    <TD>{formatCurrency(amount)}</TD>
                    <TD>{formatCurrency(balance)}</TD>
                    <TD>—</TD>
                    <TD>
                      <span className={isPaid ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                        {isPaid ? 'Paid' : 'Pending'}
                      </span>
                    </TD>
                    <TD>
                      <div className="flex gap-2">
                        <Button type="button" variant="ghost" onClick={() => navigate(`/orders/${order.id}/edit`)}>
                          Edit
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => deleteOrder(order)}>
                          Delete
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {!filteredOrders.length && (
            <p className="mt-4 text-sm text-muted">No transactions found for selected filters.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
