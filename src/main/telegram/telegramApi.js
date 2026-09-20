const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.telegram.org';

class TelegramError extends Error {
  constructor(method, description, code) {
    super(`Telegram ${method} failed: ${description}`);
    this.name = 'TelegramError';
    this.method = method;
    this.code = code || 0;
  }
}

// The bot token is a credential and appears in every request URL, so it must never reach a log
// line or an error message that could be surfaced or copied out of the app.
function redact(text, token) {
  if (!token) return text;
  return String(text || '').split(token).join('<token>');
}

function createTelegramApi(token) {
  if (!token) throw new Error('Telegram bot token is missing.');

  const methodUrl = (method) => `${API_BASE}/bot${token}/${method}`;

  async function call(method, params = {}, { timeoutMs = 20000, signal } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // An external signal (used to cancel a 30s long poll on shutdown) aborts the same request.
    const onExternalAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onExternalAbort, { once: true });
    }
    let response;
    try {
      response = await fetch(methodUrl(method), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal
      });
    } catch (error) {
      if (signal?.aborted) {
        const cancelled = new TelegramError(method, 'cancelled', 0);
        cancelled.cancelled = true;
        throw cancelled;
      }
      throw new TelegramError(method, redact(error?.message || 'network error', token), 0);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
    }

    const payload = await response.json().catch(() => null);
    if (!payload || payload.ok !== true) {
      throw new TelegramError(
        method,
        redact(payload?.description || `HTTP ${response.status}`, token),
        payload?.error_code || response.status
      );
    }
    return payload.result;
  }

  return {
    getMe: () => call('getMe'),

    // Long poll. The HTTP timeout must outlast the requested poll window, otherwise we abort
    // our own in-flight request and Telegram sees overlapping getUpdates calls (409 conflicts).
    getUpdates: (offset, timeoutSeconds = 30, signal) =>
      call(
        'getUpdates',
        { offset, timeout: timeoutSeconds, allowed_updates: ['message', 'callback_query'] },
        { timeoutMs: (timeoutSeconds + 15) * 1000, signal }
      ),

    sendMessage: (chatId, text, extra = {}) =>
      call('sendMessage', { chat_id: chatId, text, ...extra }),

    editMessageText: (chatId, messageId, text, extra = {}) =>
      call('editMessageText', { chat_id: chatId, message_id: messageId, text, ...extra }),

    answerCallbackQuery: (callbackQueryId, extra = {}) =>
      call('answerCallbackQuery', { callback_query_id: callbackQueryId, ...extra }),

    sendChatAction: (chatId, action) => call('sendChatAction', { chat_id: chatId, action }),

    getFile: (fileId) => call('getFile', { file_id: fileId }),

    // Downloads a file the bot has been sent. Telegram serves media from a separate host that
    // also carries the token in its path.
    async downloadFile(remoteFilePath, destPath) {
      const url = `${API_BASE}/file/bot${token}/${remoteFilePath}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new TelegramError('downloadFile', `HTTP ${response.status}`, response.status);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, buffer);
      return destPath;
    },

    async sendDocument(chatId, buffer, filename, caption = '') {
      const form = new FormData();
      form.append('chat_id', String(chatId));
      if (caption) form.append('caption', caption);
      form.append('document', new Blob([buffer]), filename);
      const response = await fetch(methodUrl('sendDocument'), { method: 'POST', body: form });
      const payload = await response.json().catch(() => null);
      if (!payload || payload.ok !== true) {
        throw new TelegramError(
          'sendDocument',
          redact(payload?.description || `HTTP ${response.status}`, token),
          payload?.error_code || response.status
        );
      }
      return payload.result;
    }
  };
}

module.exports = { createTelegramApi, TelegramError, redact };
