import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table';

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
};

const formatTimestamp = (isoString) => {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${day} ${month} ${year}, ${h12}:${minutes}:${seconds} ${ampm}`;
};

const getTimeAgo = (isoString) => {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 0) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function Snapshots() {
  const navigate = useNavigate();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [rollingBack, setRollingBack] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [dbInfo, setDbInfo] = useState(null);
  const [switchingMode, setSwitchingMode] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [data, info] = await Promise.all([
        window.vyapar.listSnapshots(),
        window.vyapar.getDbInfo()
      ]);
      setSnapshots(data || []);
      setDbInfo(info || null);
    } catch (err) {
      setError(err?.message || 'Failed to load snapshots.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    setError('');
    setSuccessMsg('');
    try {
      setCreating(true);
      const result = await window.vyapar.createSnapshot(snapshotLabel || 'Manual snapshot');
      setSnapshotLabel('');
      setSuccessMsg(`Snapshot created: ${result?.label || 'Done'}`);
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to create snapshot.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (snapshot) => {
    const confirmed = window.confirm(
      `Delete snapshot "${snapshot.label}" from ${formatTimestamp(snapshot.timestamp)}?\n\nThis cannot be undone.`
    );
    if (!confirmed) return;
    setError('');
    setSuccessMsg('');
    try {
      await window.vyapar.deleteSnapshot(snapshot.id);
      setSuccessMsg('Snapshot deleted.');
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to delete snapshot.');
    }
  };

  const handleRollback = async (snapshot) => {
    const confirmed = window.confirm(
      `Rollback to "${snapshot.label}" from ${formatTimestamp(snapshot.timestamp)}?\n\nYour current database will be replaced. A safety snapshot will be created first.\n\nThe page will reload after rollback.`
    );
    if (!confirmed) return;
    setError('');
    setSuccessMsg('');
    try {
      setRollingBack(snapshot.id);
      await window.vyapar.rollbackToSnapshot(snapshot.id);
      window.location.reload();
    } catch (err) {
      setError(err?.message || 'Failed to rollback.');
      setRollingBack(null);
    }
  };

  const isDev = dbInfo?.mode === 'dev';

  const handleSwitchMode = async () => {
    const target = isDev ? 'live' : 'dev';
    if (target === 'live') {
      const confirmed = window.confirm(
        'Switch to LIVE data?\n\nChanges from here on will affect your real books.\n\nThe page will reload.'
      );
      if (!confirmed) return;
    }
    setError('');
    setSuccessMsg('');
    try {
      setSwitchingMode(true);
      // Main reloads the window once the handle is swapped, so nothing after this runs.
      await window.vyapar.setDbMode(target);
    } catch (err) {
      setError(err?.message || 'Failed to switch mode.');
      setSwitchingMode(false);
    }
  };

  const handleResetDev = async () => {
    const confirmed = window.confirm(
      'Reset the sandbox database?\n\nAll test data created in dev mode is discarded and a fresh copy is taken from your live books.\n\nThe page will reload.'
    );
    if (!confirmed) return;
    setError('');
    setSuccessMsg('');
    try {
      setSwitchingMode(true);
      await window.vyapar.resetDevDb();
    } catch (err) {
      setError(err?.message || 'Failed to reset dev database.');
      setSwitchingMode(false);
    }
  };

  const autoCount = snapshots.filter((s) => s.auto).length;
  const manualCount = snapshots.filter((s) => !s.auto).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title text-3xl font-semibold">Database Snapshots</h2>
          <p className="text-sm text-muted">
            Save checkpoints and rollback to any previous state.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/')}>
            Back to Overview
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {isDev ? '🧪 Dev Mode — sandbox database' : '🔴 Live Mode — real books'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted">
            {isDev
              ? 'Every read and write goes to a sandbox copy. Your live books are untouched, and snapshots taken here are kept separate.'
              : 'Every read and write goes to your real books. Switch to dev mode to try things out safely.'}
          </p>
          <div className="text-xs text-muted space-y-1">
            <div>
              <span className="font-medium">Active database:</span> {dbInfo?.path || '—'}
            </div>
            <div>
              <span className="font-medium">Live database:</span> {dbInfo?.livePath || '—'}
            </div>
            <div>
              <span className="font-medium">Orders in this database:</span>{' '}
              {dbInfo?.ordersCount ?? '—'}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={handleSwitchMode} disabled={switchingMode}>
              {switchingMode ? 'Switching…' : isDev ? 'Switch to Live' : 'Switch to Dev Mode'}
            </Button>
            {isDev && (
              <Button
                type="button"
                variant="outline"
                onClick={handleResetDev}
                disabled={switchingMode}
              >
                Reset sandbox from live
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create Manual Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Label (optional)</Label>
              <Input
                value={snapshotLabel}
                onChange={(e) => setSnapshotLabel(e.target.value)}
                placeholder="e.g. Before monthly closing"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
              />
            </div>
            <Button type="button" onClick={handleCreate} disabled={creating}>
              {creating ? 'Saving...' : 'Save Snapshot'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent>
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {successMsg && (
        <Card>
          <CardContent>
            <p className="text-sm text-emerald-600">{successMsg}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              Snapshots ({snapshots.length})
            </CardTitle>
            <p className="text-xs text-muted">
              {autoCount} auto · {manualCount} manual
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted">Loading snapshots...</p>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-muted">
              No snapshots yet. Create one manually or they will be auto-created when you make changes.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date & Time</TH>
                  <TH>Label</TH>
                  <TH>Type</TH>
                  <TH>Size</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {snapshots.map((snap) => (
                  <TR key={snap.id}>
                    <TD>
                      <div>
                        <span className="font-semibold text-accent">
                          {formatTimestamp(snap.timestamp)}
                        </span>
                        <span className="ml-2 text-xs text-muted">
                          {getTimeAgo(snap.timestamp)}
                        </span>
                      </div>
                    </TD>
                    <TD>
                      <span className="text-sm">{snap.label}</span>
                    </TD>
                    <TD>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          snap.auto
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {snap.auto ? 'Auto' : 'Manual'}
                      </span>
                    </TD>
                    <TD>
                      <span className="text-xs text-muted">{formatBytes(snap.size_bytes)}</span>
                    </TD>
                    <TD>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleRollback(snap)}
                          disabled={rollingBack === snap.id}
                        >
                          {rollingBack === snap.id ? 'Restoring...' : 'Rollback'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleDelete(snap)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
