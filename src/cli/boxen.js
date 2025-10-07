import boxen from 'boxen';
import stripAnsi from 'strip-ansi';

/**
 * Calculate the visual width of a string (ignoring ANSI codes)
 */
function getVisualWidth(str) {
  return stripAnsi(str).length;
}

/**
 * Find the maximum visual line width in a multi-line string
 */
function getMaxLineWidth(str) {
  const lines = str.split('\n');
  return Math.max(...lines.map(line => getVisualWidth(line)));
}

const DOUBLE_ESC_SEQUENCE = /\u001b{2,}\[/g;
const STORED_ANSI_SEQUENCE = /(?<!\u001b)\[(?:\??\d+(?:;\d+)*)[A-Za-z~]/g;
const ANSI_COLOR_SEQUENCE = /\u001b\[[0-9;]*m/;
const ANSI_RESET_SEQUENCE = /\u001b\[(?:0|22|39|49)m/;

/**
 * Convert stored ANSI codes to proper escape sequences without corrupting
 * already-correct escape codes (duplication of ESC can freeze streaming output).
 */
function restoreAnsiCodes(str) {
  if (!str) {
    return '';
  }

  // Collapse accidental double-ESC sequences that would otherwise render literally.
  let normalized = str.replace(DOUBLE_ESC_SEQUENCE, '\u001b[');

  // Convert stored CSI fragments (missing ESC) into proper escape sequences.
  normalized = normalized.replace(STORED_ANSI_SEQUENCE, (match, offset, source) => {
    if (offset > 0 && source.charCodeAt(offset - 1) === 0x1b) {
      return match;
    }
    return `\u001b${match}`;
  });

  return normalized;
}

/**
 * Ensure ANSI color sequences are balanced with a trailing reset so that
 * partially streamed output does not leak styles into the spinner/terminal.
 */
function ensureTrailingReset(str) {
  if (!ANSI_COLOR_SEQUENCE.test(str)) {
    return str;
  }
  if (ANSI_RESET_SEQUENCE.test(str)) {
    return str;
  }
  return `${str}\u001b[0m`;
}

/**
 * Boxen can throw an error if the input is malformed, so this function wraps it in a try/catch.
 * @param {string} input
 * @param {*} options
 * @returns {string}
 */
export function tryBoxen(input, options) {
  try {
    // Ensure input is properly formatted for terminal display
    const rawInput = typeof input === 'string' ? input : String(input);

    // Restore ANSI escape codes that may have been stored without ESC character
    const cleanInputWithAnsi = restoreAnsiCodes(rawInput);
    const cleanInput = ensureTrailingReset(cleanInputWithAnsi);

    // Calculate proper width for content with ANSI codes
    const maxContentWidth = getMaxLineWidth(cleanInput);
    const terminalWidth = process.stdout.columns || 80;
    const padding = (options?.padding || 0) * 2;
    const margin = ((options?.margin?.left || 0) + (options?.margin?.right || 0)) || 0;
    const borderWidth = 2; // left and right borders

    // Use content width but cap at terminal width
    const calculatedWidth = Math.min(maxContentWidth + padding + borderWidth, terminalWidth - margin - 2);

    return boxen(cleanInput, {
      ...options,
      // Set width to accommodate the content properly
      width: options?.width || (calculatedWidth > 20 ? calculatedWidth : undefined),
      // Ensure proper handling of Unicode and ANSI codes
      fullscreen: false,
      height: options?.height || undefined
    });
  } catch (error) {
    // If boxen fails, return the input with minimal formatting
    console.warn('Boxen rendering failed:', error.message);
    return input;
  }
}
