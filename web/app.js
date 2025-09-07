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
  // Echo locally
  appendLine(`$ ${input}`);

  const res = await fetch(`/v1/dreamsim/stream?sessionId=${encodeURIComponent(getSessionId())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!res.ok || !res.body) {
    appendLine(`[error] HTTP ${res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    appendToken(decoder.decode(value));
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

