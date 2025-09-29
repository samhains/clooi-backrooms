import fs from 'fs';
import path from 'path';

/**
 * Backrooms import helpers for parsing and listing .txt transcripts
 * from the repository's ./import directory.
 */

/**
 * Resolve the absolute path to the import directory.
 * @returns {string}
 */
export function getBackroomsDir() {
  return path.resolve('./import');
}

/**
 * List available .txt import files with file stats, newest first.
 * @returns {{name:string, full:string, mtime:number}[]}
 */
export function getBackroomsFiles() {
  const dir = getBackroomsDir();
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.txt'))
    .map(name => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return { name, full, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return entries;
}

/**
 * Parse Backrooms .txt logs into messages.
 * @param {string} content
 * @param {{user: string, bot: string}} roles - role author names
 */
/**
 * Parse Backrooms .txt log content into message objects using flexible
 * header heuristics (supports ###/## role headers, numeric suffixes, etc.).
 * @param {string} content
 * @param {{user:string, bot:string, system?:string}} roles
 * @returns {{author:string,text:string,type:'message'}[]}
 */
export function parseBackroomsLog(content, roles) {
  const lines = content.split(/\r?\n/);
  const headerRegex = /^#{2,}\s*(.+?)\s*(?:#{2,}\s*)?$/;
  const resolvedRoles = {
    user: roles.user || 'user',
    bot: roles.bot || 'assistant',
    system: roles.system || roles.bot || roles.user || 'system',
  };
  const messages = [];
  let currentAuthor = null;
  let buffer = [];
  let lastAuthor = null;

  const normalizeTokens = header =>
    header
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const inferAuthor = (rawHeader, previousAuthor) => {
    const header = rawHeader.trim();
    if (!header) {
      return previousAuthor && previousAuthor === resolvedRoles.user
        ? resolvedRoles.bot
        : resolvedRoles.user;
    }

    const tokens = normalizeTokens(header);
    const tokenSet = new Set(tokens);
    const hasAny = list => list.some(token => tokenSet.has(token));
    const headerStr = tokens.join(' ');

    if (hasAny(['system', 'meta', 'setup', 'context', 'ooc', 'narrator'])) {
      return resolvedRoles.system;
    }

    if (hasAny(['assistant', 'bot']) || /\bassistant\b/i.test(header)) {
      return resolvedRoles.bot;
    }

    if (hasAny(['user', 'you', 'human', 'player', 'dreamer', 'artist'])) {
      return resolvedRoles.user;
    }

    if (tokenSet.has('2') || /speaker\s*2/.test(headerStr)) {
      return resolvedRoles.bot;
    }

    if (tokenSet.has('1') || /speaker\s*1/.test(headerStr)) {
      return resolvedRoles.user;
    }

    if (tokenSet.has('0')) {
      return resolvedRoles.system;
    }

    if (previousAuthor === resolvedRoles.user) {
      return resolvedRoles.bot;
    }

    return resolvedRoles.user;
  };

  const flush = () => {
    if (!currentAuthor) return;
    const text = buffer.join('\n').trim();
    buffer = [];
    if (!text) {
      currentAuthor = null;
      return;
    }
    messages.push({ author: currentAuthor, text, type: 'message' });
    lastAuthor = currentAuthor;
    currentAuthor = null;
  };

  for (const line of lines) {
    const match = line.match(headerRegex);
    if (match) {
      flush();
      const inferredAuthor = inferAuthor(match[1], lastAuthor);
      currentAuthor = inferredAuthor;
      continue;
    }
    buffer.push(line);
  }

  flush();

  const trailing = buffer.join('\n').trim();
  if (trailing) {
    const fallbackAuthor = lastAuthor === resolvedRoles.user ? resolvedRoles.bot : resolvedRoles.user;
    messages.push({
      author: fallbackAuthor || resolvedRoles.user,
      text: trailing,
      type: 'message',
    });
  }

  return messages;
}
