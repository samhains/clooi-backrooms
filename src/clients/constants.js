export const DEFAULT_MODEL_INFO = {
  default: {
    contextLength: 8192,
    maxResponseTokens: 4096,
  },
};

export const DEFAULT_PARTICIPANTS = {
  user: {
    display: 'User',
    author: 'user',
    defaultMessageType: 'message',
  },
  bot: {
    display: 'Assistant',
    author: 'assistant',
    defaultMessageType: 'message',
  },
  system: {
    display: 'System',
    author: 'system',
    defaultMessageType: 'message',
  },
};

export const DEFAULT_API_MESSAGE_SCHEMA = {
  author: 'role',
  text: 'content',
};

