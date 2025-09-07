import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getClient, getClientSettings } from '../cli/util.js';
import { createSessionManager } from '../utils/sessionEngine.js';
import { getMessagesForConversation } from '../utils/conversation.js';

export function registerDreamSim(server, settings) {
  const clientToUse = settings.apiOptions?.clientToUse || settings.clientToUse || 'openrouter';
  const serverClient = getClient(clientToUse, settings);
  const serverClientSettings = getClientSettings(clientToUse, settings);
  const manager = createSessionManager({
    client: serverClient,
    settings,
    systemMessage: (settings?.cliOptions?.openRouterOptions?.messageOptions?.systemMessage)
      || (fs.existsSync('./contexts/dreamsim.txt') ? fs.readFileSync('./contexts/dreamsim.txt', 'utf8') : ''),
  });

  server.post('/v1/dreamsim/stream', async (request, reply) => {
    try {
      const { sessionId: qid } = request.query || {};
      const body = request.body || {};
      const input = (body.input || '').toString();
      const sessionId = qid || 'local';

      if (!input) {
        reply.code(400).send('Missing input');
        return;
      }

      // Switch to manual streaming mode
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no',
      });
      // Lower latency for small chunks
      try { res.flushHeaders?.(); } catch {}
      try { res.socket?.setNoDelay(true); } catch {}
      // Prime the stream so intermediaries start forwarding chunks
      try { res.write('\n'); } catch {}

      // Abort on client disconnect
      const abortController = new AbortController();
      res.on('close', () => {
        if (!abortController.signal.aborted) abortController.abort();
      });

      const result = await manager.handleInput(sessionId, input, {
        onToken: (t) => { try { res.write(t); } catch (_) {} },
        abortController,
        clientOptions: serverClientSettings,
      });

      if (result.type === 'command') {
        res.write(`${result.text}\n`);
      } else {
        res.write('\n');
      }
      res.end();
    } catch (err) {
      reply.code(500).send('Internal error');
      if (settings.apiOptions?.debug) {
        console.error(err);
      }
    }
  });

  // Basic static file serving for web/index.html and web/app.js (no build step)
  server.get('/', async (request, reply) => {
    try {
      const file = await fsp.readFile(path.resolve('web/index.html'), 'utf8');
      reply.header('Content-Type', 'text/html; charset=utf-8');
      reply.send(file);
    } catch (e) {
      reply.code(404).send('Not found');
    }
  });

  server.get('/app.js', async (request, reply) => {
    try {
      const file = await fsp.readFile(path.resolve('web/app.js'), 'utf8');
      reply.header('Content-Type', 'application/javascript; charset=utf-8');
      reply.send(file);
    } catch (e) {
      reply.code(404).send('Not found');
    }
  });

  // Minimal history endpoint: returns linear path to current cursor
  server.get('/v1/dreamsim/history', async (request, reply) => {
    const { sessionId: qid } = request.query || {};
    const sessionId = qid || 'local';
    try {
      const { conversationId, cursorId, messages } = await manager.getHistory(sessionId);
      const path = getMessagesForConversation(messages, cursorId).map(m => ({
        id: m.id,
        parentMessageId: m.parentMessageId,
        role: m.role,
        message: m.message,
      }));
      reply.send({ conversationId, cursorId, path });
    } catch (e) {
      reply.code(500).send({ error: 'Failed to fetch history' });
      if (settings.apiOptions?.debug) console.error(e);
    }
  });
}
