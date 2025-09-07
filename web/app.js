const term = document.getElementById('term');
const cmd = document.getElementById('cmd');

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

  const res = await fetch(`/v1/dreamsim/stream?sessionId=${encodeURIComponent(getSessionId())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!res.ok || !res.body) {
    out.textContent += `[error] HTTP ${res.status}`;
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
    appendLine('Conversation (to cursor)');
    appendLine('');
    path.forEach((m) => {
      appendLine(`${m.role}:`);
      // Render multi-line content
      (m.message || '').split('\n').forEach(line => appendLine('  ' + line));
      appendLine('');
    });
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
    streamLine(input).catch(err => appendLine(`[error] ${err?.message || err}`));
  }
});

appendLine('Welcome to DreamSim. Type a dream to begin, or !rw -1 to rewind.');
