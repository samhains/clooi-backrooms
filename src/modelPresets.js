import fs from 'fs';
import path from 'path';

// Hardwired path: project root `model_presets.json`
const PRESETS_PATH = path.resolve(process.cwd(), 'model_presets.json');

const DEFAULTS = {
  globals: {},
  models: {},
};

let cached = null;

export function loadModelPresets() {
  if (cached) return cached;
  try {
    if (!fs.existsSync(PRESETS_PATH)) {
      cached = DEFAULTS;
      return cached;
    }
    const raw = fs.readFileSync(PRESETS_PATH, 'utf8');
    const data = JSON.parse(raw);
    const globals = (data && typeof data === 'object' && data.globals && typeof data.globals === 'object') ? data.globals : {};
    const models = (data && typeof data === 'object' && data.models && typeof data.models === 'object') ? data.models : {};
    cached = { globals, models };
    return cached;
  } catch (e) {
    console.warn(`[modelPresets] Failed to load ${PRESETS_PATH}:`, e?.message || e);
    cached = DEFAULTS;
    return cached;
  }
}

export function resolveModelAlias(alias) {
  if (!alias) return null;
  const { models } = loadModelPresets();
  const rec = models[alias];
  if (rec && rec.api_name) return rec.api_name;
  return null;
}

export function getDefaultModelAlias(preferredCompany = null) {
  const { globals, models } = loadModelPresets();

  if (preferredCompany) {
    const match = Object.entries(models).find(([, details]) => details?.company === preferredCompany);
    if (match) {
      return match[0];
    }
  }

  if (globals?.default_model_alias && models[globals.default_model_alias]) {
    return globals.default_model_alias;
  }

  const [firstAlias] = Object.keys(models);
  return firstAlias || null;
}
