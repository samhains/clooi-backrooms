import { TITLE, WELCOME_LINES, HELP_LINES } from './config.js';

const term = document.getElementById('term');
const cmd = document.getElementById('cmd');
const header = document.getElementById('header');

function appendLine(text = '') {
  const div = document.createElement('div');
  div.className = 'line';
  div.textContent = text;
  term.appendChild(div);
  term.scrollTop = term.scrollHeight;
}

function appendToken(text) {
  if (!text) return;
  let last = term.lastElementChild;
  if (!last || !last.classList.contains('line')) {
    last = document.createElement('div');
    last.className = 'line';
    term.appendChild(last);
  }
  last.textContent += text;
  term.scrollTop = term.scrollHeight;
}

function getSessionId() {
  const k = 'dreamsim.sessionId';
  let id = localStorage.getItem(k);
  if (!id) {
    id = Math.random().toString(36).slice(2);
    localStorage.setItem(k, id);
  }
  return id;
}

async function streamLine(input) {
  // Echo locally on its own line
  appendLine(`$ ${input}`);

  // Create a fresh output line for the incoming stream
  const out = document.createElement('div');
  out.className = 'line';
  term.appendChild(out);
  term.scrollTop = term.scrollHeight;

  // Disable input during streaming
  cmd.disabled = true;

  const res = await fetch(`/v1/dreamsim/stream?sessionId=${encodeURIComponent(getSessionId())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!res.ok || !res.body) {
    out.textContent += `[error] HTTP ${res.status}`;
    cmd.disabled = false;
    cmd.focus();
    return;
  }
  // Stream using TextDecoderStream to avoid partial UTF-8 splits
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      out.textContent += value;
      term.scrollTop = term.scrollHeight;
    }
  }

  // After a rewind command, re-render conversation to reflect new cursor
  if (input.startsWith('!rw')) {
    await renderConversation();
  }

  // Signal readiness and re-enable input
  appendLine('');
  cmd.disabled = false;
  cmd.focus();
}

function truncate(s, n = 120) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function renderConversation() {
  try {
    const res = await fetch(`/v1/dreamsim/history?sessionId=${encodeURIComponent(getSessionId())}`);
    if (!res.ok) {
      appendLine(`[error] history HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const { cursorId, path } = data || {};
    // Clear terminal and rewrite full conversation path
    term.innerHTML = '';
    const label = (role) => {
      const r = (role || '').toLowerCase();
      if (r.includes('user') || r.includes('you')) return 'You';
      if (r.includes('assistant') || r.includes('bot')) return 'Sim';
      if (r.includes('system')) return 'System';
      return role || '';
    };
    for (const m of path) {
      appendLine(`${label(m.role)}:`);
      const lines = (m.message || '').split('\n');
      for (const line of lines) appendLine('  ' + line);
      appendLine('');
    }
    // omit explicit cursor id line to keep output clean
  } catch (e) {
    appendLine(`[error] history ${e?.message || e}`);
  }
}

cmd.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const input = cmd.value.trim();
    if (!input) return;
    cmd.value = '';
    // Client-side handled commands
    if (input === '!help' || input === 'help' || input === '!commands') {
      renderHelp();
      return;
    }
    streamLine(input).then(() => {
      if (input.startsWith('!load')) {
        renderConversation();
      }
    }).catch(err => appendLine(`[error] ${err?.message || err}`));
  }
});

if (header && TITLE) header.textContent = TITLE;
for (const line of WELCOME_LINES) appendLine(line);

function renderHelp() {
  const lines = HELP_LINES();
  lines.forEach(l => appendLine(l));
}
