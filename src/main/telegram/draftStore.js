const db = require('../db');

// Drafts live in the active database, so a draft created while testing in dev mode never leaks
// into the live books and vice versa.
let ensuredForPath = null;

function ensureTable() {
  const database = db.getDbHandle();
  const info = db.getDbInfo();
  if (ensuredForPath === info.path) return database;
  database.exec(`
    CREATE TABLE IF NOT EXISTS kb_tg_drafts (
      draft_id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      message_id INTEGER,
      photo_path TEXT,
      status TEXT NOT NULL DEFAULT 'review',
      draft_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tg_drafts_chat ON kb_tg_drafts (chat_id, status);
  `);
  ensuredForPath = info.path;
  return database;
}

function createDraft({ chatId, photoPath, draft }) {
  const database = ensureTable();
  const info = database
    .prepare(
      `INSERT INTO kb_tg_drafts (chat_id, photo_path, status, draft_json)
       VALUES (?, ?, 'review', ?)`
    )
    .run(String(chatId), String(photoPath || ''), JSON.stringify(draft));
  return Number(info.lastInsertRowid);
}

function attachMessage(draftId, messageId) {
  ensureTable()
    .prepare('UPDATE kb_tg_drafts SET message_id = ?, updated_at = datetime(\'now\') WHERE draft_id = ?')
    .run(Number(messageId), Number(draftId));
}

function getDraft(draftId) {
  const row = ensureTable()
    .prepare('SELECT * FROM kb_tg_drafts WHERE draft_id = ?')
    .get(Number(draftId));
  if (!row) return null;
  return {
    id: row.draft_id,
    chatId: row.chat_id,
    messageId: row.message_id,
    photoPath: row.photo_path,
    status: row.status,
    draft: JSON.parse(row.draft_json),
    createdAt: row.created_at
  };
}

function saveDraft(draftId, draft) {
  ensureTable()
    .prepare(
      `UPDATE kb_tg_drafts SET draft_json = ?, updated_at = datetime('now') WHERE draft_id = ?`
    )
    .run(JSON.stringify(draft), Number(draftId));
}

function setStatus(draftId, status) {
  ensureTable()
    .prepare(`UPDATE kb_tg_drafts SET status = ?, updated_at = datetime('now') WHERE draft_id = ?`)
    .run(String(status), Number(draftId));
}

// The newest draft still under review for this chat. Used to route a plain text reply (a search
// term, a corrected name) to whatever the user was last asked for.
function findActiveDraft(chatId) {
  const row = ensureTable()
    .prepare(
      `SELECT draft_id FROM kb_tg_drafts
       WHERE chat_id = ? AND status = 'review'
       ORDER BY draft_id DESC LIMIT 1`
    )
    .get(String(chatId));
  return row ? getDraft(row.draft_id) : null;
}

function listRecent(limit = 20) {
  return ensureTable()
    .prepare(
      `SELECT draft_id AS id, chat_id, status, photo_path, created_at, updated_at
       FROM kb_tg_drafts ORDER BY draft_id DESC LIMIT ?`
    )
    .all(Number(limit) || 20);
}

module.exports = {
  createDraft,
  attachMessage,
  getDraft,
  saveDraft,
  setStatus,
  findActiveDraft,
  listRecent
};
