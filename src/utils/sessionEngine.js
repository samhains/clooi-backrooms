import fs from 'fs';
import crypto from 'crypto';
import { parseInput } from './commandParser.js';

/**
 * Creates a session manager responsible for:
 * - Maintaining per-session cursor/conversation IDs (in-memory)
 * - Handling commands (!rw) and messages via the provided client
 * - Streaming tokens via onToken callback
 */
export function createSessionManager({ client, settings, systemMessagePath = './contexts/dreamsim.txt', systemMessage: systemMessageRaw } = {}) {
  if (!client) throw new Error('createSessionManager requires a client');
  const sessions = new Map();
  const systemMessage = systemMessageRaw || (fs.existsSync(systemMessagePath) ? fs.readFileSync(systemMessagePath, 'utf8') : '');

  function ensureSession(sessionId = 'local') {
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        sessionId,
        conversationId: crypto.randomUUID(),
        parentMessageId: null,
        createdAt: Date.now(),
      });
    }
    return sessions.get(sessionId);
  }

  async function rewind(session, arg) {
    const conversation = (await client.conversationsCache.get(session.conversationId)) || { messages: [] };
    if (!arg || arg === '-1') {
      const current = conversation.messages.find(m => m.id === session.parentMessageId);
      if (current && current.parentMessageId) {
        session.parentMessageId = current.parentMessageId;
        return { ok: true, text: `Rewound to parent: ${session.parentMessageId}` };
      }
      return { ok: false, text: 'Already at root; no parent to rewind to.' };
    }
    const target = conversation.messages.find(m => m.id === arg);
    if (!target) {
      return { ok: false, text: `Message not found: ${arg}` };
    }
    session.parentMessageId = target.id;
    return { ok: true, text: `Rewound to ${target.id}` };
  }

  async function handleInput(sessionId, input, { onToken, abortController, clientOptions } = {}) {
    const parsed = parseInput(input);
    const session = ensureSession(sessionId);
    if (parsed.kind === 'empty') return { type: 'noop' };

    if (parsed.kind === 'command') {
      switch (parsed.cmd) {
        case 'rw': {
          const [arg] = parsed.args || [];
          const res = await rewind(session, arg);
          return { type: 'command', command: 'rw', ok: res.ok, text: res.text, cursorId: session.parentMessageId };
        }
        default:
          return { type: 'command', command: parsed.cmd, ok: false, text: `Unknown command: !${parsed.cmd}` };
      }
    }

    // Normal message: build context and stream tokens
    const ctx = await client.yieldGenContext(
      parsed.text,
      { ...(client.options?.modelOptions || {}), stream: true },
      {
        saveToCache: true,
        conversationId: session.conversationId,
        parentMessageId: session.parentMessageId,
        systemMessage,
        clientOptions,
      },
    );

    const { apiParams, conversationId, completionParentId, conversation } = ctx;

    const { replies } = await client.callAPI(apiParams, {
      onProgress: (token) => { if (token && onToken) onToken(token); },
      onFinished: () => {},
      abortController,
    });

    const newMessages = [];
    for (const text of Object.values(replies)) {
      const convMsg = client.createConversationMessage({ text, author: client.participants.bot.author }, completionParentId);
      newMessages.push(convMsg);
    }
    if (newMessages.length) {
      conversation.messages.push(...newMessages);
      await client.conversationsCache.set(conversationId, conversation);
      session.parentMessageId = newMessages[newMessages.length - 1].id;
    }

    return {
      type: 'message',
      conversationId,
      cursorId: session.parentMessageId,
      replies,
    };
  }

  async function getHistory(sessionId) {
    const session = ensureSession(sessionId);
    const conversation = (await client.conversationsCache.get(session.conversationId)) || { messages: [] };
    return { conversationId: session.conversationId, cursorId: session.parentMessageId, messages: conversation.messages };
  }

  return { ensureSession, handleInput, getHistory };
}

