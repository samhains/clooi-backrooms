import boxen from 'boxen';

/**
 * Boxen can throw an error if the input is malformed, so this function wraps it in a try/catch.
 * @param {string} input
 * @param {*} options
 */
export function tryBoxen(input, options) {
  try {
    return boxen(input, options);
  } catch {
    return input;
  }
}

