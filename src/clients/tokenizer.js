import { encoding_for_model as encodingForModel, get_encoding as getEncoding } from '@dqbd/tiktoken';

const tokenizersCache = {};

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

