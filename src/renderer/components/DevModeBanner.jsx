import React, { useEffect, useState } from 'react';

// Always-visible proof of which database you are writing to. Without this the dangerous failure
// is believing you are sandboxed while generating invoices against the real books.
export default function DevModeBanner() {
  const [mode, setMode] = useState(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const current = await window.vyapar.getDbMode();
        if (mounted) setMode(current);
      } catch (_err) {
        if (mounted) setMode('live');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('dev-mode', mode === 'dev');
  }, [mode]);

  const switchToLive = async () => {
    if (!window.confirm('Switch to LIVE data? Changes will affect your real books.')) return;
    setSwitching(true);
    try {
      // The main process reloads the window once the database handle has been swapped.
      await window.vyapar.setDbMode('live');
    } finally {
      setSwitching(false);
    }
  };

  if (mode !== 'dev') return null;

  return (
    <div className="dev-banner">
      <span className="dev-banner-text">
        🧪 <strong>DEV MODE</strong> — sandbox copy · live books untouched
      </span>
      <button type="button" className="dev-banner-btn" onClick={switchToLive} disabled={switching}>
        {switching ? 'Switching…' : 'Switch to Live'}
      </button>
    </div>
  );
}
