import '../polyfills/fetch.js';
import ChatClient from './ChatClient.js';
import { loadModelPresets, resolveModelAlias } from '../modelPresets.js';

//TODO: add support for other models
const MODEL_INFO = {
    default: {
        contextLength: 8192,
        vision: false,
        json: false,
        maxResponseTokens: 4096,
    },
    'meta-llama/llama-3.1-8b-instruct': {
        contextLength: 131072,
    },
    'meta-llama/llama-3.1-405b-instruct': {
        contextLength: 131072,
    },
};

const OPENROUTER_DEFAULT_MODEL_OPTIONS = {
    model: 'meta-llama/llama-3.1-405b-instruct',
    temperature: 1,
    stream: true,
    max_tokens: 600,
};

const OPENROUTER_PARTICIPANTS = {
    bot: {
        display: 'OpenRouter',
        author: 'assistant',
        defaultMessageType: 'message',
    },
    user: {
        display: 'You',
        author: 'user',
        defaultMessageType: 'message',
    },
};

export default class OpenRouterClient extends ChatClient {
    constructor(options = {}) {
        options.cache = options.cache || {};
        options.cache.namespace = options.cache.namespace || 'openrouter';

        // Resolve alias to model slug before parent constructor applies options
        const alias = options?.modelOptions?.modelAlias || options?.modelAlias;
        if (!alias) {
            throw new Error('OpenRouterClient requires modelOptions.modelAlias');
        }
        const mapped = resolveModelAlias(alias);
        if (!mapped) {
            throw new Error(`Unknown model alias: ${alias}`);
        }
        options.modelOptions = {
            ...options.modelOptions,
            model: mapped,
        };

        super(options);
        this.apiKey = process.env.OPENROUTER_API_KEY || '';
        this.completionsUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.isChatGptModel = true;
        this.modelInfo = MODEL_INFO;
        this.modelOptions = { ...OPENROUTER_DEFAULT_MODEL_OPTIONS, ...this.modelOptions };
        this.participants = OPENROUTER_PARTICIPANTS;

        // Load shared presets (model aliases + optional globals)
        const { globals } = loadModelPresets();
        if (globals?.context_length && Number.isFinite(globals.context_length)) {
            this.modelInfo.default.contextLength = globals.context_length;
        }
        if (globals?.max_tokens && Number.isFinite(globals.max_tokens) && (this.modelOptions.max_tokens == null)) {
            this.modelOptions.max_tokens = globals.max_tokens;
        }

        // Re-apply options to ensure max token computations use our modelInfo and resolved model
        this.setOptions(options);
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
