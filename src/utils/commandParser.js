/**
 * Minimal command parser shared by CLI/server.
 * Returns either a command object or a plain message.
 */
export function parseInput(input = '') {
  const line = String(input || '').trim();
  if (!line) return { kind: 'empty' };
  if (line.startsWith('!')) {
    const parts = line.split(/\s+/);
    const head = parts[0].slice(1).toLowerCase();
    const args = parts.slice(1);
    switch (head) {
      case 'rw':
      case 'rewind':
        return { kind: 'command', cmd: 'rw', args };
      case 'save':
        return { kind: 'command', cmd: 'save', args };
      case 'load':
        return { kind: 'command', cmd: 'load', args };
      default:
        return { kind: 'command', cmd: head, args };
    }
  }
  return { kind: 'message', text: line };
}
