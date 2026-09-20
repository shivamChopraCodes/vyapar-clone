const path = require('path');
const { createTelegramApi } = require('./telegramApi');
const { readSettings, writeSettings, getInboxDir } = require('./telegramSettings');
const { buildDraftFromImage, renderDraftMessage } = require('../slipPipeline');
const draftStore = require('./draftStore');
const { mainKeyboard, handleCallback, handleTextReply } = require('./conversation');
const { renderInvoicePdf } = require('../invoicePdf');
const db = require('../db');

const POLL_TIMEOUT_SECONDS = 30;
const MAX_BACKOFF_MS = 60000;

let running = false;
let stopRequested = false;
let loopPromise = null;
let pollController = null;

const status = {
  running: false,
  botUsername: '',
  lastPollAt: null,
  lastMessageAt: null,
  lastError: '',
  // A message from an un-approved chat parks here so the user can approve it in the UI.
  pendingChat: null,
  rejectedCount: 0
};

function getStatus() {
  const settings = readSettings();
  return {
    ...status,
    enabled: Boolean(settings.enabled),
    hasToken: Boolean(settings.botToken),
    allowedChatId: settings.allowedChatId || ''
  };
}

function describeSender(message) {
  const from = message?.from || {};
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ').trim();
  return {
    chatId: String(message?.chat?.id || ''),
    name: name || from.username || 'Unknown',
    username: from.username ? `@${from.username}` : ''
  };
}

function modeTag() {
  return db.getMode() === 'dev' ? '🧪 DEV · ' : '';
}

// Picks the largest available rendition. Telegram sends several sizes and the smallest ones are
// far too low-resolution for handwriting.
function largestPhoto(message) {
  const sizes = Array.isArray(message?.photo) ? message.photo : [];
  if (!sizes.length) return null;
  return sizes.reduce((best, size) => (size.file_size > (best?.file_size || 0) ? size : best), null);
}

async function handleMessage(api, message) {
  const sender = describeSender(message);
  const settings = readSettings();
  const allowed = String(settings.allowedChatId || '');

  if (!allowed) {
    // Unpaired. Never auto-trust the first chat that shows up — surface it for approval instead.
    status.pendingChat = { ...sender, at: new Date().toISOString() };
    await api.sendMessage(
      sender.chatId,
      'This bot is not paired yet. Open Vyapar Desk → Telegram and approve this chat to continue.'
    );
    return;
  }

  if (sender.chatId !== allowed) {
    status.rejectedCount += 1;
    console.warn(
      `[telegram] ignored message from unapproved chat ${sender.chatId} (${sender.username || sender.name})`
    );
    return;
  }

  status.lastMessageAt = new Date().toISOString();

  const photo = largestPhoto(message);
  if (photo) {
    const file = await api.getFile(photo.file_id);
    const ext = path.extname(file.file_path || '') || '.jpg';
    const destPath = path.join(getInboxDir(), `slip_${Date.now()}${ext}`);
    await api.downloadFile(file.file_path, destPath);

    const progress = await api.sendMessage(sender.chatId, `${modeTag()}📸 Reading slip…`);
    try {
      await api.sendChatAction(sender.chatId, 'typing');
      const draft = await buildDraftFromImage(destPath);
      const draftId = draftStore.createDraft({
        chatId: sender.chatId,
        photoPath: destPath,
        draft
      });
      draftStore.attachMessage(draftId, progress.message_id);
      await api.editMessageText(sender.chatId, progress.message_id, renderDraftMessage(draft), {
        reply_markup: mainKeyboard(draftId, draft)
      });
    } catch (error) {
      console.error('[telegram] extraction failed:', error?.message || error);
      await api.editMessageText(
        sender.chatId,
        progress.message_id,
        `${modeTag()}❌ Could not read that slip.\n\n${error?.message || 'Unknown error'}\n\n` +
          'Try a straighter, better-lit photo of just the slip.'
      );
    }
    return;
  }

  const text = String(message?.text || '').trim();
  if (text === '/start' || text === '/status') {
    const info = db.getDbInfo();
    await api.sendMessage(
      sender.chatId,
      `${modeTag()}Vyapar Desk is connected.\n\n` +
        `Mode: ${info.mode}\n` +
        `Orders in this database: ${info.ordersCount}\n\n` +
        'Send a photo of an order slip to begin.'
    );
    return;
  }

  // A plain reply may be answering a question the bot asked about a draft (a search term or a
  // corrected item name). Only falls through to the generic hint when nothing was pending.
  const pending = handleTextReply(sender.chatId, text);
  if (pending) {
    if (pending.messageId) {
      try {
        await api.editMessageText(sender.chatId, pending.messageId, pending.text, {
          reply_markup: pending.keyboard
        });
        return;
      } catch (error) {
        // The original draft message may be too old to edit; fall back to a fresh one.
        console.warn('[telegram] could not edit draft message:', error?.message || error);
      }
    }
    await api.sendMessage(sender.chatId, pending.text, { reply_markup: pending.keyboard });
    return;
  }

  await api.sendMessage(
    sender.chatId,
    `${modeTag()}Send a photo of an order slip. (/status shows the connection.)`
  );
}

// Shapes an approved draft into the payload importSaleBillFromOcr expects.
function toImportPayload(draft) {
  return {
    party_id: draft.party.matched_id || null,
    buyer: {
      id: draft.party.matched_id || null,
      name: draft.party.matched_name || draft.party.name || '',
      phone: draft.party.phone || '',
      gst_number: draft.party.gst_number || '',
      address: draft.party.address || '',
      state_of_supply: draft.party.state_of_supply || ''
    },
    bill: {
      // Blank means createOrder assigns the firm's own next number. The slip's serial is only
      // ever recorded as a note.
      invoice_no: draft.bill.invoice_no || '',
      order_date: draft.bill.order_date,
      notes: draft.bill.slip_no ? `Telegram slip #${draft.bill.slip_no}` : 'Telegram slip',
      // Outstanding amount; createOrder derives the cash figure from it.
      balance_amount: Number(draft.bill.balance_amount ?? draft.payable_total ?? draft.invoice_total ?? 0)
    },
    apply_round_off: true,
    items: draft.lines.map((line) => ({
      item_id: line.matched_item_id || null,
      item_name: line.matched_item_name || line.item_name || '',
      hsn: line.hsn || '',
      qty: Number(line.qty),
      rate: Number(line.rate),
      amount: Number(line.qty) * Number(line.rate),
      gst_rate: Number(line.gst_rate) || 0,
      batch_no: line.batch_no || '',
      expiry_date: line.expiry_date || '',
      mrp: line.mrp === undefined || line.mrp === null ? null : Number(line.mrp)
    }))
  };
}

async function generateInvoice(api, chatId, messageId, draftId, draft) {
  try {
    await api.editMessageText(chatId, messageId, `${modeTag()}⏳ Creating invoice…`, {
      reply_markup: { inline_keyboard: [] }
    });
  } catch (_error) {
    /* the edit is cosmetic; carry on */
  }

  let created;
  try {
    // Same pre-write snapshot the IPC handlers take, so a bad slip is one rollback away.
    db.createSnapshot('Before: telegram invoice', 'telegram:generate', true);
    created = db.importSaleBillFromOcr(toImportPayload(draft));
  } catch (error) {
    console.error('[telegram] import failed:', error?.message || error);
    draftStore.setStatus(draftId, 'review');
    await api.sendMessage(
      chatId,
      `${modeTag()}❌ Could not create the invoice.\n\n${error?.message || 'Unknown error'}\n\n` +
        'Nothing was saved. Send the slip again or fix it in the app.'
    );
    return;
  }

  const orderId = created?.order?.id;
  draftStore.setStatus(draftId, 'generated');
  draft.order_id = orderId;
  draftStore.saveDraft(draftId, draft);

  const order = orderId ? db.getOrder(orderId) : null;
  const invoiceNo = order?.ref_number || draft.bill.invoice_no || String(orderId || '?');

  await api.editMessageText(
    chatId,
    messageId,
    `${renderDraftMessage(draft)}\n\n✅ Invoice ${invoiceNo} created · ${draft.mode === 'dev' ? 'SANDBOX' : 'LIVE'}`,
    { reply_markup: { inline_keyboard: [] } }
  );

  // The invoice exists either way; a PDF failure must not read as the invoice having failed.
  try {
    await api.sendChatAction(chatId, 'upload_document');
    const { buffer, filename } = await renderInvoicePdf(orderId);
    await api.sendDocument(chatId, buffer, filename, `Invoice ${invoiceNo}`);
  } catch (error) {
    console.error('[telegram] pdf failed:', error?.message || error);
    await api.sendMessage(
      chatId,
      `${modeTag()}Invoice ${invoiceNo} was created, but the PDF could not be generated ` +
        `(${error?.message || 'unknown error'}). You can export it from the app.`
    );
  }
}

async function handleCallbackQuery(api, query) {
  const settings = readSettings();
  const chatId = String(query?.message?.chat?.id || '');
  if (!settings.allowedChatId || chatId !== String(settings.allowedChatId)) {
    status.rejectedCount += 1;
    await api.answerCallbackQuery(query.id, { text: 'Not authorised.' });
    return;
  }

  let result;
  try {
    result = handleCallback(query.data);
  } catch (error) {
    console.error('[telegram] callback failed:', error?.message || error);
    await api.answerCallbackQuery(query.id, { text: 'Something went wrong.', show_alert: true });
    return;
  }

  if (result.generate) {
    await api.answerCallbackQuery(query.id, { text: 'Creating invoice…' });
    await generateInvoice(api, chatId, query.message.message_id, result.draftId, result.draft);
    return;
  }

  // An alert interrupts with a dialog; a toast is a quiet confirmation. Every callback must be
  // answered or Telegram leaves the button spinning.
  await api.answerCallbackQuery(
    query.id,
    result.alert
      ? { text: result.alert, show_alert: true }
      : { text: result.toast || '' }
  );

  if (!result.text) return;
  try {
    await api.editMessageText(chatId, query.message.message_id, result.text, {
      reply_markup: result.done ? { inline_keyboard: [] } : result.keyboard
    });
  } catch (error) {
    // Telegram rejects an edit that would not change the message; that is not a real failure.
    if (!String(error?.message || '').includes('message is not modified')) throw error;
  }
}

async function handleUpdate(api, update) {
  if (update.message) {
    await handleMessage(api, update.message);
  }
  if (update.callback_query) {
    await handleCallbackQuery(api, update.callback_query);
  }
}

async function pollLoop() {
  let backoffMs = 1000;

  while (!stopRequested) {
    const settings = readSettings();
    if (!settings.enabled || !settings.botToken) {
      break;
    }

    let api;
    try {
      api = createTelegramApi(settings.botToken);
    } catch (error) {
      status.lastError = error.message;
      break;
    }

    try {
      pollController = new AbortController();
      const updates = await api.getUpdates(
        Number(settings.lastUpdateId || 0) + 1,
        POLL_TIMEOUT_SECONDS,
        pollController.signal
      );
      status.lastPollAt = new Date().toISOString();
      status.lastError = '';
      backoffMs = 1000;

      for (const update of updates) {
        if (stopRequested) break;
        try {
          await handleUpdate(api, update);
        } catch (error) {
          console.error('[telegram] update handler failed:', error?.message || error);
        }
        // Persist the offset per update so a crash mid-batch never replays a processed slip.
        writeSettings({ lastUpdateId: update.update_id });
      }
    } catch (error) {
      if (error?.cancelled || stopRequested) {
        break;
      }
      status.lastError = error?.message || 'poll failed';

      if (error?.code === 401) {
        // Invalid token: retrying cannot help, and it burns requests.
        writeSettings({ enabled: false });
        status.lastError = 'Invalid bot token — polling disabled.';
        break;
      }
      if (error?.code === 409) {
        // Another getUpdates consumer (a second app instance, or a webhook) holds the stream.
        status.lastError = 'Another instance is polling this bot. Close it and re-enable.';
      }

      console.warn(`[telegram] ${status.lastError} — retrying in ${backoffMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  }

  running = false;
  status.running = false;
}

async function start() {
  if (running) return getStatus();
  const settings = readSettings();
  if (!settings.botToken) {
    status.lastError = 'No bot token configured.';
    return getStatus();
  }

  const api = createTelegramApi(settings.botToken);
  const me = await api.getMe();
  status.botUsername = me?.username ? `@${me.username}` : '';
  status.lastError = '';

  writeSettings({ enabled: true });
  running = true;
  stopRequested = false;
  status.running = true;
  loopPromise = pollLoop();
  return getStatus();
}

/**
 * @param {boolean} userInitiated  true when the user pressed Stop. Closing the app must NOT
 *   persist enabled:false, or the bot silently fails to resume on the next launch.
 */
async function stop(userInitiated = true) {
  stopRequested = true;
  if (userInitiated) writeSettings({ enabled: false });
  // Cancel the in-flight long poll, otherwise stopping would block for up to 30s and a quick
  // restart would leave two loops polling the same bot (Telegram answers that with 409s).
  if (pollController) pollController.abort();
  const pending = loopPromise;
  loopPromise = null;
  if (pending) {
    try {
      await pending;
    } catch (_error) {
      /* the loop reports its own errors through status */
    }
  }
  pollController = null;
  status.running = false;
  running = false;
  return getStatus();
}

async function testConnection(token) {
  const api = createTelegramApi(token || readSettings().botToken);
  const me = await api.getMe();
  return { ok: true, username: me?.username ? `@${me.username}` : '', name: me?.first_name || '' };
}

async function sendTestMessage() {
  const settings = readSettings();
  if (!settings.allowedChatId) throw new Error('No approved chat yet.');
  const api = createTelegramApi(settings.botToken);
  await api.sendMessage(
    settings.allowedChatId,
    `${modeTag()}✅ Test message from Vyapar Desk.`
  );
  return { ok: true };
}

function approvePendingChat() {
  if (!status.pendingChat?.chatId) throw new Error('No chat waiting for approval.');
  const chatId = status.pendingChat.chatId;
  writeSettings({ allowedChatId: chatId });
  status.pendingChat = null;
  return { ok: true, allowedChatId: chatId };
}

// Restarting after a settings change keeps the loop reading the values it was started with.
async function restart() {
  await stop();
  return start();
}

module.exports = {
  start,
  stop,
  restart,
  toImportPayload,
  getStatus,
  testConnection,
  sendTestMessage,
  approvePendingChat
};
