import { MODEL_INFO } from '../modelPresets.js';
import ChatClient from './ChatClient.js';

const CLAUDE_DEFAULT_MODEL_OPTIONS = {
    temperature: 1,
    stream: true,
    max_tokens: 4096,
};

const CLAUDE_PARTICIPANTS = {
    bot: {
        display: 'Claude',
        author: 'assistant',
        defaultMessageType: 'message',
    },
};

export default class ClaudeClient extends ChatClient {
    constructor(options = {}) {
        options.cache.namespace = options.cache.namespace || 'claude';
        super(options);
        this.apiKey = process.env.ANTHROPIC_API_KEY || '';
        this.completionsUrl = 'https://api.anthropic.com/v1/messages';
        this.modelOptions = CLAUDE_DEFAULT_MODEL_OPTIONS;
        this.participants = CLAUDE_PARTICIPANTS;

        this.setOptions(options);
    }

    getModelInfo(modelName) {
        // Find the model config in our centralized MODEL_INFO
        const modelConfig = Object.values(MODEL_INFO).find(m => 
            m.company === 'anthropic' && m.apiName === modelName
        );
        
        if (!modelConfig) {
            return {
                contextLength: 100000,  // default fallback values
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

    getHeaders() {
        let anthropicBeta
        if ('steering' in this.options && this.options.steering) {
            anthropicBeta = 'steering-2024-06-04';
        } else {
            anthropicBeta = 'messages-2023-12-15';
        }
        return {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': anthropicBeta,
        };
    }

    onProgressIndexical(message, replies, idx, opts) {
        if (message === '[DONE]') {
            // opts.onProgress('[DONE]', idx);
            opts.onFinished(idx);
        }
        if (message.type === 'message_start') {
            return;
        }
        if (message.type === 'message_end') {
            // opts.onProgress('message_end', idx);
            return;
        }
        if (message.type === 'content_block_start') {
            return;
        }
        if (message.type === 'content_block_delta') {
            if (message?.delta?.text) {
                if (!replies[idx]) {
                    replies[idx] = '';
                }
                replies[idx] += message.delta.text;
                opts.onProgress(message.delta.text, idx);
            }
            // if (idx === 0) {
            //     opts.onProgress(message.delta.text);
            // }
        } else {
            // console.debug(progressMessage);
        }
    }


    parseReplies(result, replies) {
        result.forEach((res, idx) => {
            replies[idx] = res.content[0].text;
        });
    }

    buildApiParams(userMessage = null, previousMessages = [], systemMessage = null) {
        // const maxHistoryLength = 20;
        const { messages: history, system } = super.buildApiParams(userMessage, previousMessages, systemMessage);
        // merge all consecutive messages from the same author
        const mergedMessageHistory = [];
        let lastMessage = null;
        for (const message of history) {
            if (lastMessage && lastMessage.role === message.role) {
                lastMessage.content += `${message.content}`;
            } else {
                lastMessage = message;
                mergedMessageHistory.push(message);
            }
        }
        return {
            messages: mergedMessageHistory, //.slice(-maxHistoryLength),
            ...(system ? { system } : {}),
        };
    }
}
