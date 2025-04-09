export const MODEL_INFO = {
    "sonnet": {
        apiName: "claude-3-sonnet-20240229",
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
                systemMessage: '',
                n: 2,
            }
        }
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
                systemMessage: '',
                n: 2,
            }
        }
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
            messageOptions: {
                systemMessage: '',
            }
        }
    },
  
};

export function getModelConfig(modelName) {
    const config = MODEL_INFO[modelName];
    if (!config) {
        throw new Error(`Model configuration not found for: ${modelName}`);
    }
    
    // Add model name to modelOptions if the company requires it
    if (config.company === 'anthropic' || config.company === 'openai') {
        return {
            ...config,
            defaultOptions: {
                ...config.defaultOptions,
                modelOptions: {
                    ...config.defaultOptions.modelOptions,
                    model: config.apiName
                }
            }
        };
    }
    
    return config;
}

export function getClientConfig(modelName) {
    const config = getModelConfig(modelName);
    switch (config.company) {
        case 'anthropic':
            return {
                apiKey: process.env.ANTHROPIC_API_KEY || '',
                completionsUrl: 'https://api.anthropic.com/v1/messages',
                debug: false,
            };
        case 'openai':
            return {
                apiKey: process.env.OPENAI_API_KEY || '',
                completionsUrl: 'https://api.openai.com/v1/chat/completions',
                debug: false,
            };
        // Add other cases as needed
        default:
            throw new Error(`Unknown company: ${config.company}`);
    }
} 