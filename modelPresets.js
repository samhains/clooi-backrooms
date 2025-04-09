export const MODEL_INFO = {
  "sonnet-35": {
    apiName: "claude-3-7-sonnet-latest",
    displayName: "Claude Sonnet",
    company: "anthropic",
    clientType: "claude",
    contextLength: 200000,
    vision: true,
    json: true,
    maxResponseTokens: 4096,
    defaultOptions: {
      modelOptions: {
        max_tokens: 4096,
        temperature: 1,
        stream: true,
      },
      messageOptions: {
        systemMessage: "",
        n: 2,
      },
    },
  },
  "sonnet-37": {
    apiName: "claude-3-5-sonnet-latest",
    displayName: "Claude Sonnet",
    company: "anthropic",
    clientType: "claude",
    contextLength: 200000,
    vision: true,
    json: true,
    maxResponseTokens: 4096,
    defaultOptions: {
      modelOptions: {
        max_tokens: 4096,
        temperature: 1,
        stream: true,
      },
      messageOptions: {
        systemMessage: "",
        n: 2,
      },
    },
  },
  "claude-3-opus": {
    apiName: "claude-3-opus-20240229",
    displayName: "Claude Opus",
    company: "anthropic",
    clientType: "claude",
    contextLength: 200000,
    vision: true,
    json: true,
    maxResponseTokens: 4096,
    defaultOptions: {
      modelOptions: {
        max_tokens: 4096,
        temperature: 1,
        stream: true,
      },
      messageOptions: {
        systemMessage: "",
        n: 2,
      },
    },
  },
  "gpt-45": {
    apiName: "gpt-4.5-preview-2025-02-27",
    displayName: "GPT 4.5-preview",
    company: "openai",
    clientType: "chatgpt",
    contextLength: 128000,
    vision: true,
    json: true,
    maxResponseTokens: 4096,
    defaultOptions: {
      modelOptions: {
        temperature: 1,
        max_tokens: 2048,
        n: 3,
        stream: true,
      },
    },
  },
  "gpt-4o": {
    apiName: "chatgpt-4o-latest",
    displayName: "GPT 4.5-preview",
    company: "openai",
    clientType: "chatgpt",
    contextLength: 128000,
    vision: true,
    json: true,
    maxResponseTokens: 4096,
    defaultOptions: {
      modelOptions: {
        temperature: 1,
        max_tokens: 2048,
        n: 3,
        stream: true,
      },
    },
  },

  "gemini-25-pro": {
    apiName: "gemini-2.5-pro-preview-03-25",
    displayName: "Gemini 2.5 Pro Preview",
    company: "google",
    clientType: "gemini",
    defaultOptions: {
      modelOptions: {
        model: "gemini-2.5-pro-preview-03-25",
        stream: true,
      },
    },
  },

  "gemini-2-flash": {
    apiName: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    company: "google",
    clientType: "gemini",
    defaultOptions: {
      modelOptions: {
        model: "gemini-2.0-flash",
        stream: true,
      },
    },
  },
};

export function getModelConfig(modelName) {
  const config = MODEL_INFO[modelName];
  if (!config) {
    throw new Error(`Model configuration not found for: ${modelName}`);
  }

  // Add model name to modelOptions if the company requires it
  if (config.company === "anthropic" || config.company === "openai") {
    return {
      ...config,
      defaultOptions: {
        ...config.defaultOptions,
        modelOptions: {
          ...config.defaultOptions.modelOptions,
          model: config.apiName,
        },
      },
    };
  }

  return config;
}

export function getClientConfig(modelName) {
  const config = getModelConfig(modelName);
  switch (config.company) {
    case "anthropic":
      return {
        apiKey: process.env.ANTHROPIC_API_KEY || "",
        completionsUrl: "https://api.anthropic.com/v1/messages",
        debug: false,
      };
    case "openai":
      return {
        apiKey: process.env.OPENAI_API_KEY || "",
        completionsUrl: "https://api.openai.com/v1/chat/completions",
        debug: false,
      };
    case "google":
      return {
        apiKey: process.env.GOOGLE_API_KEY || "",
        completionsUrl: `https://generativelanguage.googleapis.com/v1beta/models/${config.apiName}:generateContent`,
        debug: false,
      };
    // Add other cases as needed
    default:
      throw new Error(`Unknown company: ${config.company}`);
  }
}
