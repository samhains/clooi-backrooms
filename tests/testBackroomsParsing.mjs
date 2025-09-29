import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { parseBackroomsLog } from '../src/cli/backrooms.js';

const roles = { user: 'user', bot: 'assistant', system: 'system' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const asMessage = (author, text) => ({ author, text, type: 'message' });

// Basic ### headers with closing markers
const tripleHashLog = `### User ###\nHello there.\n\n### Assistant ###\nGeneral Kenobi.`;
assert.deepStrictEqual(
  parseBackroomsLog(tripleHashLog, roles),
  [
    asMessage('user', 'Hello there.'),
    asMessage('assistant', 'General Kenobi.'),
  ],
  'Should parse ### headers with closing markers.',
);

// Loose ### header without trailing hashes
const looseAssistantLog = `### User ###\nPing\n\n### Assistant \nPong`;
assert.deepStrictEqual(
  parseBackroomsLog(looseAssistantLog, roles),
  [
    asMessage('user', 'Ping'),
    asMessage('assistant', 'Pong'),
  ],
  'Should parse ### headers without trailing hashes.',
);

// Double-hash style used by emoji_dreamsim log
const doubleHashLog = `## user\nhey\n\n## assistant\nhello\n\n## USER\nbye`;
assert.deepStrictEqual(
  parseBackroomsLog(doubleHashLog, roles),
  [
    asMessage('user', 'hey'),
    asMessage('assistant', 'hello'),
    asMessage('user', 'bye'),
  ],
  'Should parse ## role headers case-insensitively.',
);

// Numeric headers (Claude 1 / Claude 2)
const numericHeaderLog = `### Claude 1 ###\nDescribe a frog.\n\n### Claude 2 ###\nThe frog is green.`;
assert.deepStrictEqual(
  parseBackroomsLog(numericHeaderLog, roles),
  [
    asMessage('user', 'Describe a frog.'),
    asMessage('assistant', 'The frog is green.'),
  ],
  'Should map numeric headers to alternating participants.',
);

// System header detection
const systemLog = `## system\nSimulation booting.\n\n## user\nReady.`;
assert.deepStrictEqual(
  parseBackroomsLog(systemLog, roles),
  [
    asMessage('system', 'Simulation booting.'),
    asMessage('user', 'Ready.'),
  ],
  'Should map system headers to system author when available.',
);

// Regression: ensure real emoji_dreamsim log parses
const emojiPath = path.resolve(__dirname, '../import/emoji_dreamsim_3.txt');
const emojiRaw = fs.readFileSync(emojiPath, 'utf8');
const emojiParsed = parseBackroomsLog(emojiRaw, roles);
assert.strictEqual(emojiParsed.length, 4, 'emoji_dreamsim_3 should produce four messages.');
assert.deepStrictEqual(
  emojiParsed.map(msg => msg.author),
  ['user', 'assistant', 'user', 'assistant'],
  'emoji_dreamsim_3 author sequence should alternate user/assistant.',
);
assert.strictEqual(
  emojiParsed.at(-1).text,
  'gallery@excalibur:~/$',
  'emoji_dreamsim_3 trailing prompt should be preserved.',
);

console.log('Backrooms parsing tests passed.');
