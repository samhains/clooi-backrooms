import { encoding_for_model as encodingForModel, get_encoding as getEncoding } from '@dqbd/tiktoken';

/** In-memory tokenizer cache keyed by encoding or model name. */
const tokenizersCache = {};

/**
 * Return a cached tokenizer instance for an encoding or model name.
 * @param {string} encoding
 * @param {boolean} [isModelName]
 * @param {object} [extendSpecialTokens]
 */
export function getTokenizer(encoding, isModelName = false, extendSpecialTokens = {}) {
  if (tokenizersCache[encoding]) {
    return tokenizersCache[encoding];
  }
  let tokenizer;
  if (isModelName) {
    tokenizer = encodingForModel(encoding, extendSpecialTokens);
  } else {
    tokenizer = getEncoding(encoding, extendSpecialTokens);
  }
  tokenizersCache[encoding] = tokenizer;
  return tokenizer;
}
