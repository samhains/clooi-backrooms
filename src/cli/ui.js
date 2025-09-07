import { tryBoxen } from './boxen.js';

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

export function suggestionsBoxes(suggestions) {
  return suggestions.map(suggestion => suggestionBox(suggestion)).join('\n');
}

export function replaceWhitespace(str) {
  // replaces all space characters with ⠀ to prevent trimming
  return str.replace(/\n /g, '\n⠀');
}

