import React, { useEffect, useState } from 'react';

// Lives in the sidebar so the active database is visible from every screen. Burying this on one
// page invites the dangerous mistake: believing you are sandboxed while writing to real books.
export default function DbModeSwitch() {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    window.vyapar
      .getDbInfo()
      .then((data) => {
        if (mounted) setInfo(data);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (!info) return null;
  const isDev = info.mode === 'dev';

  const toggle = async () => {
    const target = isDev ? 'live' : 'dev';
    if (target === 'live') {
      const ok = window.confirm(
        'Switch to LIVE data?\n\nChanges from here on will affect your real books.\n\nThe app will reload.'
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      // Main swaps the database handle and reloads the window, so nothing after this runs.
      await window.vyapar.setDbMode(target);
    } catch (_err) {
      setBusy(false);
    }
  };

  return (
    <div className={`db-mode-switch ${isDev ? 'is-dev' : 'is-live'}`}>
      <div className="db-mode-row">
        <span className="db-mode-label">{isDev ? '🧪 Dev Mode' : '🔴 Live Data'}</span>
        <button type="button" className="db-mode-toggle" onClick={toggle} disabled={busy}>
          {busy ? '…' : isDev ? 'Go Live' : 'Go Dev'}
        </button>
      </div>
      <p className="db-mode-hint">
        {isDev ? 'Sandbox copy · real books untouched' : 'Writing to your real books'}
      </p>
    </div>
  );
}
