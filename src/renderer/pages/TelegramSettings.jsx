import React, { useEffect, useRef, useState } from 'react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';

export default function TelegramSettings() {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pollRef = useRef(null);

  const refresh = async () => {
    const [nextSettings, nextStatus] = await Promise.all([
      window.vyapar.getTelegramSettings(),
      window.vyapar.getTelegramStatus()
    ]);
    setSettings(nextSettings);
    setStatus(nextStatus);
  };

  useEffect(() => {
    refresh().catch((err) => setError(err?.message || 'Failed to load Telegram settings.'));
    // The bot runs in the main process, so the only way to see a chat waiting for approval or a
    // poll error is to ask periodically while this page is open.
    pollRef.current = setInterval(() => {
      window.vyapar.getTelegramStatus().then(setStatus).catch(() => {});
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, []);

  const run = async (name, fn, successMessage) => {
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await fn();
      if (successMessage) setNotice(successMessage);
      await refresh();
    } catch (err) {
      setError(err?.message || 'Action failed.');
    } finally {
      setBusy('');
    }
  };

  const saveToken = () =>
    run('token', async () => {
      await window.vyapar.setTelegramToken(token);
      setToken('');
    }, 'Token verified and saved.');

  if (!settings) return <p className="text-muted">Loading…</p>;

  const pending = status?.pendingChat;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title text-3xl font-semibold">Telegram Bot</h2>
        <p className="text-muted">
          Photograph an order slip in Telegram and turn it into a sale invoice.
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-green-700">{notice}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>1 · Bot token</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted">
            Message <strong>@BotFather</strong> on Telegram, send <code>/newbot</code>, and paste the
            token it gives you. The token is stored outside this project and never shown again.
          </p>
          {settings.hasToken ? (
            <p className="text-sm">
              Saved token: <code>{settings.tokenHint}</code>{' '}
              {status?.botUsername ? <span className="text-muted">· {status.botUsername}</span> : null}
            </p>
          ) : (
            <p className="text-sm text-muted">No token saved yet.</p>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="tg-token">
                {settings.hasToken ? 'Replace token' : 'Bot token'}
              </Label>
              <Input
                id="tg-token"
                type="password"
                value={token}
                placeholder="123456789:AA..."
                onChange={(event) => setToken(event.target.value)}
              />
            </div>
            <Button type="button" onClick={saveToken} disabled={!token.trim() || busy === 'token'}>
              {busy === 'token' ? 'Verifying…' : 'Verify & Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2 · Approve your chat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted">
            Only one approved chat can talk to this bot. Anyone else is ignored — without this, a
            stranger who found the bot could write invoices into your books.
          </p>
          {settings.allowedChatId ? (
            <div className="flex items-center gap-3">
              <p className="text-sm">
                Approved chat: <code>{settings.allowedChatId}</code>
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => run('clear', () => window.vyapar.clearTelegramChat(), 'Chat unpaired.')}
                disabled={busy === 'clear'}
              >
                Unpair
              </Button>
            </div>
          ) : pending ? (
            <div className="space-y-2">
              <p className="text-sm">
                <strong>{pending.name}</strong> {pending.username} (chat <code>{pending.chatId}</code>)
                messaged the bot.
              </p>
              <Button
                type="button"
                onClick={() => run('approve', () => window.vyapar.approveTelegramChat(), 'Chat approved.')}
                disabled={busy === 'approve'}
              >
                Approve this chat
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Start the bot below, then send it any message from Telegram. It will appear here for
              approval.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3 · Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted">
            The app polls Telegram over an outgoing connection — no hosting, no public address. It
            only receives while Vyapar Desk is running; Telegram holds messages for 24 hours.
          </p>
          <div className="text-xs text-muted space-y-1">
            <div>
              <span className="font-medium">Status:</span>{' '}
              {status?.running ? '🟢 Listening' : '⚪️ Stopped'}
            </div>
            <div>
              <span className="font-medium">Last poll:</span>{' '}
              {status?.lastPollAt ? new Date(status.lastPollAt).toLocaleTimeString() : '—'}
            </div>
            <div>
              <span className="font-medium">Last message:</span>{' '}
              {status?.lastMessageAt ? new Date(status.lastMessageAt).toLocaleTimeString() : '—'}
            </div>
            {status?.rejectedCount ? (
              <div>
                <span className="font-medium">Ignored from other chats:</span> {status.rejectedCount}
              </div>
            ) : null}
            {status?.lastError ? (
              <div className="text-red-700">
                <span className="font-medium">Error:</span> {status.lastError}
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            {status?.running ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => run('stop', () => window.vyapar.stopTelegramBot())}
                disabled={busy === 'stop'}
              >
                {busy === 'stop' ? 'Stopping…' : 'Stop listening'}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => run('start', () => window.vyapar.startTelegramBot())}
                disabled={!settings.hasToken || busy === 'start'}
              >
                {busy === 'start' ? 'Starting…' : 'Start listening'}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => run('test', () => window.vyapar.sendTelegramTest(), 'Test message sent.')}
              disabled={!settings.allowedChatId || busy === 'test'}
            >
              Send test message
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
