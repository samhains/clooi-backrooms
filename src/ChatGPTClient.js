import { encoding_for_model as encodingForModel, get_encoding as getEncoding } from '@dqbd/tiktoken';
import { MODEL_INFO } from '../modelPresets.js';
import ChatClient from './ChatClient.js';
import './fetch-polyfill.js';

const CHATGPT_DEFAULT_MODEL_OPTIONS = {
    temperature: 1,
    stream: true,
    max_tokens: 600,
};

const CHATGPT_PARTICIPANTS = {
    bot: {
        display: 'ChatGPT',
        author: 'assistant',
        defaultMessageType: 'message',
    },
};

const tokenizersCache = {};

export default class ChatGPTClient extends ChatClient {
    constructor(options = {}) {
        options.cache.namespace = options.cache.namespace || 'chatgpt';
        super(options);
        this.apiKey = process.env.OPENAI_API_KEY || '';
        this.completionsUrl = 'https://api.openai.com/v1/chat/completions';
        this.isChatGptModel = true;
        this.modelOptions = CHATGPT_DEFAULT_MODEL_OPTIONS;
        this.participants = CHATGPT_PARTICIPANTS;

        this.setOptions(options);
    }

    getModelInfo(modelName) {
        // Find the model config in our centralized MODEL_INFO
        const modelConfig = Object.values(MODEL_INFO).find(m => 
            m.company === 'openai' && m.apiName === modelName
        );
        
        if (!modelConfig) {
            return {
                contextLength: 8192,  // default fallback values
                vision: false,
                json: false,
                maxResponseTokens: 4096,
            };
        }

        return {
            contextLength: modelConfig.contextLength,
            vision: modelConfig.vision,
            json: modelConfig.json,
            maxResponseTokens: modelConfig.maxResponseTokens,
        };
    }

    static getTokenizer(encoding, isModelName = false, extendSpecialTokens = {}) {
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

    buildApiParams(userMessage = null, previousMessages = [], systemMessage = null) {
        const history = [
            ...systemMessage ? [systemMessage] : [],
            ...previousMessages,
            ...userMessage ? [userMessage] : [],
        ];
        const messages = history.map(msg => this.toAPImessage(msg));
        return {
            messages,
        };
    }
}

