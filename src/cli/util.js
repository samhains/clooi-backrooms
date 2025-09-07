import OpenRouterClient from '../OpenRouterClient.js';

const settings = {
    clientToUse: {
        type: 'select',
        options: [
            { value: 'openrouter', description: 'OpenRouter API' }
        ],
        default: 'openrouter',
        description: 'API client to use',
    },
    namespace: {
        type: 'string',
        default: null,
        description: 'Namespace for cache. Defaults to name of API client.',
    },
    stream: {
        type: 'boolean',
        default: true,
        description: 'Stream responses from API.',
        advanced: true,
    },
    n: {
        type: 'int',
        default: 3,
        description: 'Number of responses to generate in parallel.',
    },
    systemMessage: {
        type: 'long string',
        default: '',
        description: 'System prompt which appears at beginning of conversation.',
    },
    // openrouter fields come from settings directly; keep generic fields minimal here
    showSuggestions: {
        type: 'boolean',
        default: true,
        description: 'Show user suggestions after AI messages.',
        validFor: ['bing'],
    },
    showSearches: {
        type: 'boolean',
        default: false,
        description: 'Show details of searches performed by AI.',
        validFor: ['bing'],
        advanced: true,
    },
    toneStyle: {
        type: 'select',
        options: [
            { value: 'creative', description: 'Creative GPT-4, aka Sydney' },
            { value: 'precise', description: 'Precise' },
            { value: 'balanced', description: 'Balanced' },
            { value: 'fast', description: 'Fast' },
        ],
        default: 'creative',
        description: 'Which Copilot model to use',
        validFor: ['bing'],
    },
    city: {
        type: 'string',
        default: 'between words',
        description: "string to inject into the city field of the location string that appears in Copilot's prompt if no dynamic content is injected there",
        validFor: ['bing'],
        advanced: true,
    },
    country: {
        type: 'string',
        default: 'United States',
        description: "string to inject into the country field of the location string that appears in Copilot's prompt if no dynamic content is injected there",
        validFor: ['bing'],
        advanced: true,
    },
    messageText: {
        type: 'string',
        default: 'Continue the conversation in context. Assistant:',
        description: "default content of mandatory user message if nothing else is put there",
        validFor: ['bing'],
        advanced: true,
    },
    systemInjectSite: {
        type: 'select',
        options: [
            { value: 'location', description: 'user location string' },
            { value: 'context', description: 'web page context' },
        ],
        default: 'location',
        description: 'Where in the prompt to inject the system message',
        validFor: ['bing'],
        advanced: true,
    },
    historyInjectSite: {
        type: 'select',
        options: [
            { value: 'location', description: 'user location string' },
            { value: 'context', description: 'web page context' },
        ],
        default: 'location',
        description: 'Where in the prompt to inject the previous messages of the conversation',
        validFor: ['bing'],
        advanced: true,
    },
    messageInjectSite: {
        type: 'select',
        options: [
            { value: 'message', description: 'user message' },
            { value: 'context', description: 'web page context' },
            { value: 'location', description: 'user location string' },
        ],
        default: 'message',
        description: 'Where in the prompt to inject the new user message',
        validFor: ['bing'],
        advanced: true,
    },
    censorMessageInjection: {
        type: 'string',
        default: '⚠',
        description: "String to append to Copilot's messages if they get censored",
        validFor: ['bing'],
        advanced: true,
    },
    stopToken: {
        type: 'string',
        default: '\n\n[user](#message)',
        description: '',
        validFor: ['bing'],
        advanced: true,
    },
    context: {
        type: 'long string',
        default: null,
        description: 'String to inject into the web page context',
        validFor: ['bing'],
        advanced: true,
    },
}

export function getClientSettings(clientToUse, settings) {
    if (clientToUse !== 'openrouter') {
        throw new Error('Only openrouter is supported by this build.');
    }
    return {
        ...settings.openRouterClient,
        ...settings.cliOptions.openRouterOptions,
    };
}

export function getClient(clientToUse, settings) {
    const clientOptions = {
        ...getClientSettings(clientToUse, settings),
        cache: settings.cacheOptions,
    };
    if (clientToUse !== 'openrouter') {
        throw new Error('Only openrouter is supported by this build.');
    }
    return new OpenRouterClient(clientOptions);
}
