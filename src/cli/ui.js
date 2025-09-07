import { tryBoxen } from './boxen.js';

/**
 * UI helpers for CLI rendering (system/user/ai boxes, suggestions, whitespace handling).
 */

/**
 * Render a system message box.
 * @param {string} message
 * @param {string|null} [title]
 */
export function systemMessageBox(message, title = null) {
  return tryBoxen(`${message}`, {
    title: title || 'System',
    padding: 0.7,
    margin: {
      top: 1,
      bottom: 0,
      left: 1,
      right: 2,
    },
    float: 'center',
    borderColor: 'white',
    dimBorder: true,
  });
}

/** Render a single suggestion box. */
export function suggestionBox(suggestion) {
  return tryBoxen(suggestion, {
    title: 'Suggestion',
    padding: 0.7,
    margin: {
      top: 0,
      bottom: 0,
      left: 1,
      right: 1,
    },
    titleAlignment: 'right',
    float: 'right',
    dimBorder: true,
    borderColor: 'blue',
  });
}

/** Render multiple suggestions as a single string. */
export function suggestionsBoxes(suggestions) {
  return suggestions.map(suggestion => suggestionBox(suggestion)).join('\n');
}

/**
 * Prevent trimming by replacing some whitespace with invisibles.
 * @param {string} str
 */
export function replaceWhitespace(str) {
  // replaces all space characters with ⠀ to prevent trimming
  return str.replace(/\n /g, '\n⠀');
}
