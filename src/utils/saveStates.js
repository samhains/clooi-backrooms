import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const SAVE_STATES_DIR = path.resolve(process.cwd(), 'saved_states');
const SAVE_FILE_EXTENSION = '.json';
const SAVE_FILE_VERSION = 1;

function toRelativePath(filePath) {
  return path.relative(process.cwd(), filePath);
}

export function getSaveStatesDir() {
  return SAVE_STATES_DIR;
}

export async function ensureSaveStatesDir() {
  await fs.mkdir(SAVE_STATES_DIR, { recursive: true });
  return SAVE_STATES_DIR;
}

export function slugifySaveName(name) {
  if (!name) {
    return 'save';
  }
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'save';
}

export function summarizeConversation(conversation) {
  if (!conversation) {
    return null;
  }
  if (conversation.name) {
    return conversation.name;
  }
  const firstMessage = conversation.messages?.find?.(msg => typeof msg?.message === 'string' && msg.message.trim());
  if (firstMessage) {
    const compact = firstMessage.message.trim().replace(/\s+/g, ' ');
    return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
  }
  return null;
}

export function formatSaveChoiceLabel(state) {
  const timestamp = state.savedAt ? new Date(state.savedAt).toLocaleString() : 'unknown time';
  const summary = state.summary || state.conversation?.name || state.conversationData?.conversationId || '';
  const suffix = summary ? ` — ${summary}` : '';
  return `${state.name}${suffix} (${timestamp})`;
}

function buildFilePathFromSlug(slug) {
  return path.join(SAVE_STATES_DIR, `${slug}${SAVE_FILE_EXTENSION}`);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function generateUniqueSlug(name, existingStates = []) {
  const base = slugifySaveName(name);
  const existingSlugs = new Set(existingStates.map(state => state.slug));
  if (!existingSlugs.has(base)) {
    return base;
  }
  let suffix = 2;
  while (existingSlugs.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export async function writeSaveState({
  name,
  slug,
  conversationData,
  conversation,
  summary,
}) {
  await ensureSaveStatesDir();
  const filePath = buildFilePathFromSlug(slug);
  const payload = {
    version: SAVE_FILE_VERSION,
    name,
    slug,
    savedAt: new Date().toISOString(),
    conversationId: conversationData?.conversationId ?? null,
    summary,
    conversationData,
    conversation,
  };
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(tempPath, json, 'utf8');
  await fs.rename(tempPath, filePath);
  return {
    filePath,
    relativePath: toRelativePath(filePath),
    payload,
  };
}

export async function listSaveStates() {
  await ensureSaveStatesDir();
  let dirEntries = [];
  try {
    dirEntries = await fs.readdir(SAVE_STATES_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const states = [];
  for (const entry of dirEntries) {
    if (!entry.isFile() || !entry.name.endsWith(SAVE_FILE_EXTENSION)) {
      continue;
    }
    const filePath = path.join(SAVE_STATES_DIR, entry.name);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const slug = parsed.slug || entry.name.replace(new RegExp(`${SAVE_FILE_EXTENSION}$`), '');
      const stat = await fs.stat(filePath);
      states.push({
        ...parsed,
        slug,
        name: parsed.name || slug,
        savedAt: parsed.savedAt || stat.mtime.toISOString(),
        filePath,
        relativePath: toRelativePath(filePath),
      });
    } catch (error) {
      // Skip unreadable save files but continue listing others.
      continue;
    }
  }
  states.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  return states;
}

export async function findSaveState(identifier) {
  if (!identifier) {
    return null;
  }
  const states = await listSaveStates();
  const normalized = identifier.trim().toLowerCase();
  const slugCandidate = slugifySaveName(identifier);
  return states.find(state => state.slug === slugCandidate)
    || states.find(state => state.name.trim().toLowerCase() === normalized)
    || null;
}

export async function readSaveStateBySlug(slug) {
  if (!slug) {
    return null;
  }
  const filePath = buildFilePathFromSlug(slug);
  if (!(await fileExists(filePath))) {
    return null;
  }
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    ...parsed,
    slug,
    name: parsed.name || slug,
    filePath,
    relativePath: toRelativePath(filePath),
  };
}
