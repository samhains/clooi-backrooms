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
 * Parse Backrooms .txt log content into message objects using simple
 * header heuristics ("### ... 1 ###" => user, "... 2" => assistant).
 * @param {string} content
 * @param {{user:string, bot:string}} roles
 * @returns {{author:string,text:string,type:'message'}[]}
 */
export function parseBackroomsLog(content, roles) {
  const lines = content.split(/\r?\n/);
  const headerRegex = /^###\s+(.+?)\s+###\s*$/;
  let currentHeader = null;
  let buffer = [];
  const messages = [];

  function flush() {
    if (!currentHeader) return;
    const text = buffer.join('\n').trim();
    buffer = [];
    if (!text) return;
    const isOne = /(^|\s)1(\s|$)/.test(currentHeader);
    const isTwo = /(^|\s)2(\s|$)/.test(currentHeader);
    let author = roles.user;
    if (isTwo) author = roles.bot;
    else if (isOne) author = roles.user;
    messages.push({ author, text, type: 'message' });
  }

  for (const line of lines) {
    const m = line.match(headerRegex);
    if (m) {
      flush();
      currentHeader = m[1];
    } else {
      buffer.push(line);
    }
  }
  flush();
  return messages;
}
