// Simple, editable config for DreamSim web UI
export const TITLE = 'DreamSim • browser CLI';

export const WELCOME_LINES = [
  'Welcome to DreamSim.',
  'Type a dream or action to begin.',
  'Commands: !rw [id|-1], !save [name], !load <name>, !help',
];

export const COMMANDS = [
  { cmd: '!rw [id|-1]', desc: 'Rewind to a message (or parent with -1).' },
  { cmd: '!save [name]', desc: 'Save a checkpoint at the current cursor.' },
  { cmd: '!load <name>', desc: 'Load a previously saved checkpoint.' },
  // Dream navigation (client-only help, server just treats as text):
  { cmd: 'move <dir>', desc: 'Move around (e.g., north, south, east, west).' },
  { cmd: 'look', desc: 'Look around and get more detail.' },
  { cmd: 'use <thing>', desc: 'Use or interact with an item.' },
];

export function HELP_LINES() {
  const lines = ['DreamSim commands:', ''];
  for (const { cmd, desc } of COMMANDS) {
    lines.push(`${cmd.padEnd(16)} ${desc}`);
  }
  lines.push('');
  lines.push('Tips:');
  lines.push('- After rewind or load, the view updates to the active path.');
  return lines;
}

