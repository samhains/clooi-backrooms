#!/usr/bin/env node

import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const USAGE = `
Usage:
  node scripts/capture-zellij-pane.mjs <mode> [--pane-id=<id>] [--output=<path>] [--list]

Modes:
  screenshot   Save a PNG of the pane exactly as rendered by WezTerm.
  ansi         Dump scrollback with ANSI escape sequences to a file.
  record       Capture a .wezrec event stream for later replay.
`;

const SUPPORTED_MODES = new Set(['screenshot', 'ansi', 'record']);

function logError(message) {
  console.error(`[capture-zellij-pane] ${message}`);
}

function parseArgs() {
  const [, , ...args] = process.argv;
  const result = {
    mode: null,
    paneId: null,
    output: null,
    listOnly: false,
  };

  for (const arg of args) {
    if (!result.mode && !arg.startsWith('--')) {
      result.mode = arg;
      continue;
    }
    if (arg === '--list') {
      result.listOnly = true;
      continue;
    }
    if (arg.startsWith('--pane-id=')) {
      result.paneId = arg.slice('--pane-id='.length);
      continue;
    }
    if (arg.startsWith('--output=')) {
      result.output = arg.slice('--output='.length);
      continue;
    }
    logError(`Unknown argument: ${arg}`);
    console.error(USAGE.trim());
    process.exit(1);
  }

  return result;
}

function runWezterm(args) {
  const { error, status, stdout, stderr } = spawnSync('wezterm', args, {
    encoding: 'utf8',
  });

  if (error) {
    if (error.code === 'ENOENT') {
      logError('wezterm is not on PATH. Install it or adjust your PATH.');
      process.exit(1);
    }
    logError(`Failed to run wezterm: ${error.message}`);
    process.exit(1);
  }

  if (status !== 0) {
    logError(`wezterm exited with status ${status}`);
    if (stderr) {
      process.stderr.write(stderr);
    }
    process.exit(status ?? 1);
  }

  return stdout;
}

function listPanes() {
  const stdout = runWezterm(['cli', 'list', '--format', 'json']);
  console.log(stdout.trim() || '[]');
}

function ensurePaneId(paneId) {
  if (paneId) {
    return paneId;
  }
  const stdout = runWezterm(['cli', 'list', '--format', 'json']);
  try {
    const panes = JSON.parse(stdout);
    if (!Array.isArray(panes) || panes.length === 0) {
      logError('No panes detected. Launch WezTerm and Zellij first.');
      process.exit(1);
    }

    // Prefer panes whose title mentions zellij (best effort heuristic).
    const zellijPane =
      panes.find((pane) => pane?.title?.toLowerCase()?.includes('zellij')) ??
      panes[0];
    if (!zellijPane?.pane_id) {
      throw new Error('Pane JSON missing pane_id');
    }
    console.warn(
      `[capture-zellij-pane] No --pane-id provided; defaulting to ${zellijPane.pane_id}`
    );
    return String(zellijPane.pane_id);
  } catch (error) {
    logError(`Unable to parse pane list: ${error.message}`);
    process.exit(1);
  }
}

function defaultOutputPath(mode) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  switch (mode) {
    case 'screenshot':
      return join(homedir(), 'Pictures', `zellij-${stamp}.png`);
    case 'ansi':
      return join(process.cwd(), `zellij-${stamp}.ansi`);
    case 'record':
      return join(process.cwd(), `zellij-${stamp}.wezrec`);
    default:
      throw new Error(`Unsupported mode: ${mode}`);
  }
}

function run() {
  const options = parseArgs();

  if (options.listOnly) {
    listPanes();
    return;
  }

  if (!options.mode || !SUPPORTED_MODES.has(options.mode)) {
    logError('Missing or invalid mode.');
    console.error(USAGE.trim());
    process.exit(1);
  }

  const paneId = ensurePaneId(options.paneId);
  const output = options.output ?? defaultOutputPath(options.mode);

  const weztermArgs = (() => {
    if (options.mode === 'screenshot') {
      return ['cli', 'screenshot', '--pane-id', paneId, '--output', output];
    }
    if (options.mode === 'ansi') {
      return ['cli', 'get-text', '--ansi', '--pane-id', paneId];
    }
    return ['record', '--pane-id', paneId, '--output', output];
  })();

  if (options.mode === 'ansi') {
    const stdout = runWezterm(weztermArgs);
    console.log(stdout);
    return;
  }

  runWezterm(weztermArgs);
  console.log(`[capture-zellij-pane] Saved ${options.mode} to ${output}`);
}

run();
