const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');

const SETTINGS_FILE = 'telegram-settings.json';

const DEFAULTS = {
  botToken: '',
  // Empty means unpaired: the bot answers nobody until a chat is explicitly approved.
  allowedChatId: '',
  enabled: false,
  lastUpdateId: 0
};

function getUserDataDir() {
  return app && typeof app.getPath === 'function'
    ? app.getPath('userData')
    : path.join(os.homedir(), 'Library', 'Application Support', 'vyapar-clone');
}

function getSettingsPath() {
  return path.join(getUserDataDir(), SETTINGS_FILE);
}

function readSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8'));
    return { ...DEFAULTS, ...parsed };
  } catch (_error) {
    return { ...DEFAULTS };
  }
}

function writeSettings(next) {
  const dir = getUserDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const merged = { ...readSettings(), ...next };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

// What the renderer is allowed to see. The token itself never crosses the IPC boundary — only
// whether one is present and its last few characters, enough to tell two bots apart.
function readPublicSettings() {
  const settings = readSettings();
  const token = String(settings.botToken || '');
  return {
    hasToken: Boolean(token),
    tokenHint: token ? `…${token.slice(-6)}` : '',
    allowedChatId: settings.allowedChatId || '',
    enabled: Boolean(settings.enabled)
  };
}

function getInboxDir() {
  const dir = path.join(getUserDataDir(), 'tg-inbox');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  readSettings,
  writeSettings,
  readPublicSettings,
  getSettingsPath,
  getInboxDir
};
