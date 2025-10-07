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

/**
 * Convert stored ANSI codes to proper escape sequences
 */
function restoreAnsiCodes(str) {
  // Convert [38;5;XXXm, [0m, etc. to proper ESC sequences
  return str.replace(/\[(\d+(?:;\d+)*m)/g, '\u001b[$1');
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
    const cleanInput = restoreAnsiCodes(rawInput);

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
