import fs from 'fs';
import crypto from 'crypto';
import { parseInput } from './commandParser.js';
import { getMessagesForConversation } from './conversation.js';

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

  function pruneLinearTail(conversation, newCursorId, oldCursorId) {
    if (!oldCursorId || !newCursorId) return;
    const path = getMessagesForConversation(conversation.messages, oldCursorId);
    const idx = path.findIndex(m => m.id === newCursorId);
    if (idx === -1) return;
    const toRemove = path.slice(idx + 1).map(m => m.id);
    if (!toRemove.length) return;
    const rm = new Set(toRemove);
    conversation.messages = conversation.messages.filter(m => !rm.has(m.id));
  }

  async function rewind(session, arg, { pruneTail = false } = {}) {
    const conversation = (await client.conversationsCache.get(session.conversationId)) || { messages: [] };
    const prevCursor = session.parentMessageId;
    if (!arg || arg === '-1') {
      const current = conversation.messages.find(m => m.id === session.parentMessageId);
      if (current && current.parentMessageId) {
        session.parentMessageId = current.parentMessageId;
        if (pruneTail) {
          pruneLinearTail(conversation, session.parentMessageId, prevCursor);
          await client.conversationsCache.set(session.conversationId, conversation);
        }
        return { ok: true, text: `Rewound to parent: ${session.parentMessageId}` };
      }
      return { ok: false, text: 'Already at root; no parent to rewind to.' };
    }
    const target = conversation.messages.find(m => m.id === arg);
    if (!target) {
      return { ok: false, text: `Message not found: ${arg}` };
    }
    session.parentMessageId = target.id;
    if (pruneTail) {
      pruneLinearTail(conversation, session.parentMessageId, prevCursor);
      await client.conversationsCache.set(session.conversationId, conversation);
    }
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
          const res = await rewind(session, arg, { pruneTail: true });
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
