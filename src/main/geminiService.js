const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(process.cwd(), '.env');
const GEMINI_KEY = 'GEMINI_API_KEY';

function parseEnvFile(content) {
  const out = {};
  String(content || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index <= 0) return;
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      const unquoted =
        (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))
          ? rawValue.slice(1, -1)
          : rawValue;
      out[key] = unquoted;
    });
  return out;
}

function readEnvMap() {
  if (!fs.existsSync(ENV_FILE)) return {};
  try {
    const content = fs.readFileSync(ENV_FILE, 'utf8');
    return parseEnvFile(content);
  } catch (_error) {
    return {};
  }
}

function upsertEnvKey(key, value) {
  const nextLine = `${key}=${value}`;
  if (!fs.existsSync(ENV_FILE)) {
    fs.writeFileSync(ENV_FILE, `${nextLine}\n`, 'utf8');
    return;
  }
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  let found = false;
  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const index = line.indexOf('=');
    if (index <= 0) return line;
    const currentKey = line.slice(0, index).trim();
    if (currentKey !== key) return line;
    found = true;
    return nextLine;
  });
  if (!found) updated.push(nextLine);
  fs.writeFileSync(ENV_FILE, `${updated.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
}

function getGeminiApiKey() {
  const fromProcess = String(process.env[GEMINI_KEY] || '').trim();
  if (fromProcess) return fromProcess;
  const envMap = readEnvMap();
  return String(envMap[GEMINI_KEY] || '').trim();
}

function setGeminiApiKey(apiKey) {
  const value = String(apiKey || '').trim();
  process.env[GEMINI_KEY] = value;
  upsertEnvKey(GEMINI_KEY, value);
  return { ok: true };
}

function mimeTypeForImagePath(imagePath) {
  const ext = path.extname(String(imagePath || '')).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function readImageInlineData(imagePath) {
  if (!imagePath) return null;
  const resolved = String(imagePath).trim();
  if (!resolved) return null;
  if (!fs.existsSync(resolved)) {
    throw new Error('Image file not found.');
  }
  return {
    data: fs.readFileSync(resolved).toString('base64'),
    mimeType: mimeTypeForImagePath(resolved)
  };
}

async function generateWithGenAiSdk({ apiKey, prompt, imageInlineData, model }) {
  let mod;
  try {
    mod = require('@google/genai');
  } catch (_error) {
    return null;
  }
  const GoogleGenAI = mod.GoogleGenAI || mod.default?.GoogleGenAI;
  if (!GoogleGenAI) return null;

  const ai = new GoogleGenAI({ apiKey });
  const parts = [{ text: String(prompt || '') }];
  if (imageInlineData) {
    parts.push({
      inlineData: {
        data: imageInlineData.data,
        mimeType: imageInlineData.mimeType
      }
    });
  }

  const response = await ai.models.generateContent({
    model: model || 'gemini-2.5-flash',
    contents: [{ role: 'user', parts }]
  });

  const text = String(response?.text || '').trim();
  return {
    model: model || 'gemini-2.5-flash',
    text: text || JSON.stringify(response || {}, null, 2),
    raw: response
  };
}

async function generateWithLegacySdk({ apiKey, prompt, imageInlineData, model }) {
  let mod;
  try {
    mod = require('@google/generative-ai');
  } catch (_error) {
    return null;
  }
  const GoogleGenerativeAI = mod.GoogleGenerativeAI;
  if (!GoogleGenerativeAI) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const generativeModel = genAI.getGenerativeModel({ model: model || 'gemini-1.5-flash' });
  const requestParts = [String(prompt || '')];
  if (imageInlineData) {
    requestParts.push({
      inlineData: {
        data: imageInlineData.data,
        mimeType: imageInlineData.mimeType
      }
    });
  }
  const result = await generativeModel.generateContent(requestParts);
  const response = await result.response;
  const text = String(response?.text?.() || '').trim();
  return {
    model: model || 'gemini-1.5-flash',
    text: text || JSON.stringify(response || {}, null, 2),
    raw: response
  };
}

async function generateGeminiResponse({ prompt, imagePath, model }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is missing. Set it in the Gemini page first.');
  }
  const finalPrompt = String(prompt || '').trim();
  if (!finalPrompt) {
    throw new Error('Prompt is required.');
  }
  const imageInlineData = readImageInlineData(imagePath);

  const modern = await generateWithGenAiSdk({ apiKey, prompt: finalPrompt, imageInlineData, model });
  if (modern) return modern;
  const legacy = await generateWithLegacySdk({ apiKey, prompt: finalPrompt, imageInlineData, model });
  if (legacy) return legacy;
  throw new Error(
    'Gemini SDK not installed. Install either @google/genai (recommended) or @google/generative-ai.'
  );
}

module.exports = {
  getGeminiApiKey,
  setGeminiApiKey,
  generateGeminiResponse
};
