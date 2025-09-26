import crypto from 'crypto';

import Keyv from 'keyv';
import { fetchEventSource } from '@waylaidwanderer/fetch-event-source';
import { Agent } from 'undici';
import { getMessagesForConversation } from '../utils/conversation.js';
import { DEFAULT_API_MESSAGE_SCHEMA, DEFAULT_MODEL_INFO, DEFAULT_PARTICIPANTS } from './constants.js';
import { getTokenizer as getTokenizerImpl } from './tokenizer.js';
import * as conversions from '../utils/typeConversion.js';

// constants and tokenizer cache moved to dedicated modules

export default class ChatClient {
    constructor(options) {
        if (options.keyv) {
            if (!options.keyv.namespace) {
                console.warn(
                    'The given Keyv object has no namespace. This is a bad idea if you share a database.',
                );
            }
            this.conversationsCache = options.keyv;
        } else {
            const cacheOptions = options.cache || {};
            cacheOptions.namespace = cacheOptions.namespace || 'default';
            this.conversationsCache = new Keyv(cacheOptions);
        }
        this.isChatGptModel = false;
        this.endToken = '';
        this.apiMessageSchema = DEFAULT_API_MESSAGE_SCHEMA;
        this.modelInfo = DEFAULT_MODEL_INFO;
        this.modelPointers = {};
        this.n = null;
        this.setOptions(options);
        // this.options.debug = true;
    }

    setOptions(options) {
        // don't allow overriding cache options for consistency with other clients
        delete options.cache;
        if (this.options && !this.options.replaceOptions) {
            this.options = {
                ...this.options,
                ...options,
            };
        } else {
            this.options = {
                ...options,
            };
        }
        if (this.options.apiKey) {
            this.apiKey = this.options.apiKey;
        }
        if (this.options.completionsUrl) {
            this.completionsUrl = this.options.completionsUrl;
        }
        if (this.options.n) {
            this.n = this.options.n;
        }
        const modelOptions = this.options.modelOptions || {};
        this.modelOptions = {
            ...this.modelOptions,
            ...modelOptions,
        };
        const participants = this.options.participants || {};
        this.participants = {
            ...DEFAULT_PARTICIPANTS,
            ...this.participants,
            ...participants,
        };
        const modelInfo = this.modelInfo[this.modelOptions.model] ||
        this.modelInfo[this.modelPointers[this.modelOptions.model]] ||
        this.modelInfo.default;
        this.maxContextTokens = modelInfo.contextLength;
        this.maxResponseTokens = this.modelOptions.max_tokens || modelInfo.maxResponseTokens || 400;
        this.maxPromptTokens = this.options.maxPromptTokens || (this.maxContextTokens - this.maxResponseTokens);

        if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
            throw new Error(`maxPromptTokens + max_tokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${this.maxPromptTokens + this.maxResponseTokens}) must be less than or equal to maxContextTokens (${this.maxContextTokens})`);
        }
        return this;
    }

    get names() {
        return this.participants;
    }

    convertAlias(sourceType, targetType, alias) {
        // console.log('sourceType:', sourceType);
        for (const participant in this.participants) {
            if (this.participants[participant][sourceType] === alias) {
                return this.participants[participant][targetType];
            }
        }
        return alias;
    }

    // TODO trim prompt to fit context length
    async buildConversationHistory(conversationId, parentMessageId = null) {
        const conversation = (await this.conversationsCache.get(conversationId)) || {
            messages: [],
            createdAt: Date.now(),
        };

        const previousMessages = getMessagesForConversation(
            conversation.messages,
            parentMessageId,
        ).map(msg => this.toBasicMessage(msg));

        const parentId = parentMessageId || previousMessages[conversation.messages.length - 1]?.id || crypto.randomUUID();

        return {
            parentId,
            previousMessages,
            conversation,
        };
    }

    buildMessage(message = '', author = null, type = null, opts={}) {
        const text = message?.text || message;
        author = message?.author || author;
        type = message?.type || type;
        const basicMessage = {
            author: author || this.participants.user.author,
            text,
            type: type || this.participants[author]?.defaultMessageType || 'message',
            ...opts,
        };
        return basicMessage;
    }

    buildApiParams(userMessage = null, previousMessages = [], systemMessage = null) {
        const history = [
            ...userMessage ? [userMessage] : [],
            ...previousMessages,
        ];
        const messages = history.map(msg => this.toAPImessage(msg));
        return {
            messages,
            system: systemMessage?.text || null,
        };
    }

    async yieldGenContext(userMessage, modelOptions = {}, opts = {}) {
        if (opts.clientOptions && typeof opts.clientOptions === 'object') {
            this.setOptions(opts.clientOptions);
        }

        let {
            conversationId,
            systemMessage,
        } = opts;

        const {
            saveToCache = false,
            parentMessageId,
        } = opts;

        if (conversationId === null) {
            conversationId = crypto.randomUUID();
        }

        const {
            parentId,
            previousMessages,
            conversation,
        } = await this.buildConversationHistory(conversationId, parentMessageId);

        if (typeof systemMessage === 'string' && systemMessage.length) {
            systemMessage = this.buildMessage(systemMessage, this.participants.system.author);
        }
        if (typeof userMessage === 'string' && userMessage.length) {
            userMessage = this.buildMessage(userMessage, this.participants.user.author);
        }

        let userConversationMessage;
        if (userMessage && saveToCache) {
            userConversationMessage = this.createConversationMessage(userMessage, parentId);
            conversation.messages.push(userConversationMessage);
            await this.conversationsCache.set(conversationId, conversation);
        }

        const completionParentId = userConversationMessage ? userConversationMessage.id : parentId;

        const apiParams = {
            ...modelOptions,
            ...this.buildApiParams(userMessage, previousMessages, systemMessage, { ...modelOptions, ...opts }),
        };

        return {
            apiParams,
            conversationId,
            completionParentId,
            userConversationMessage,
            conversation,
        };
    }

    async sendMessage(message, modelOptions = {}, opts = {}) {
        const {
            apiParams,
            conversationId,
            completionParentId,
            userConversationMessage,
            conversation,
        } = await this.yieldGenContext(message, modelOptions, opts);

        const { result, replies } = await this.callAPI(apiParams, opts);

        const newConversationMessages = [];
        if (opts.saveToCache) {
            for (const text of Object.values(replies)) {
                const simpleMessage = this.buildMessage(text.trim(), this.participants.bot.author);
                newConversationMessages.push(this.createConversationMessage(simpleMessage, completionParentId));
            }
            conversation.messages.push(...newConversationMessages);
            await this.conversationsCache.set(conversationId, conversation);
        }
        // const botConversationMessage = newConversationMessages[0];

        return {
            result,
            replies,
            conversationId,
            apiParams,
            opts,
            completionParentId,
            userConversationMessage,
            newConversationMessages,
        };
    }

    async standardCompletion(messages={}, modelOptions = {}, opts = {}) {
        const {
            userMessage,
            previousMessages,
            systemMessage,
        } = messages;
        
        const apiParams = {
            ...modelOptions,
            ...this.buildApiParams(userMessage, previousMessages, systemMessage, { ...modelOptions, ...opts }),
        };

        const { result } = await this.callAPI(apiParams, opts);
        return result
    }

    getHeaders() {
        return {
            Authorization: `Bearer ${this.apiKey}`,
        };
    }

    onProgressWrapper(message, replies, opts) {
        if (message === '[DONE]') {
            return;
        }
        if (!message.choices) {
            // console.debug('no choices, message:', message);
            return;
        }
        const idx = message.choices[0]?.index;

        this.onProgressIndexical(message, replies, idx, opts);
    }

    onProgressIndexical(message, replies, idx, opts) {
        const token = this.isChatGptModel ? message.choices[0]?.delta.content : message.choices[0]?.text;

        if (idx !== undefined) {
            if (token && token !== this.endToken) {
                if (!replies[idx]) {
                    replies[idx] = '';
                }
                replies[idx] += token;
                opts.onProgress(token, idx);
            }
        }

        if (message.choices[0]?.finish_reason) {
            opts.onFinished(idx, null, message.choices[0]?.finish_reason);
        }
    }

    parseReplies(result, replies) {
        Array.from(result.choices).forEach((choice, index) => {
            replies[index] = this.isChatGptModel ? choice.message.content : choice.text;
        });
    }

    async callAPI(params, opts = {}) {
        // let reply = '';

        const modelOptions = {
            ...this.modelOptions,
            ...params,
        };
        const modelName = modelOptions.model;
        const extendSpecialTokens = modelOptions.extendSpecialTokens || {};
        const isChatGptModel = this.isChatGptModel;

        const debug = this.options.debug || false;

        const n = modelOptions.n || this.n || 1;
        if (n > 1) {
            modelOptions.stream = true;
        }

        const replies = {};

        const onProgress = (opts.onProgress) ? (message) => this.onProgressWrapper(message, replies, opts) : null;

        const onFinished = (opts.onFinished) ? opts.onFinished : null;

        const signals = (opts.abortController) ? [opts.abortController.signal] : [];

        if (debug) {
            console.debug('Sending request');
        }

        const agent = new Agent({ keepAliveTimeout: 10, keepAliveMaxTimeout: 10 });
        const body = {
            ...modelOptions,
        };
        const headers = {
            ...this.getHeaders(),
            'Content-Type': 'application/json',
        };

        const url = this.completionsUrl;
        const bodyString = JSON.stringify(body);
        if (debug) {
            console.debug(url);
            console.debug(this.completionsUrl);
            console.debug(bodyString);
        }

        let done = false;
        const abortController = new AbortController();
        signals.push(abortController.signal);
        const onAbortControllerUpdate = (signal) => {
            if (signal.aborted) {
                abortController.abort();
            }
        }
        for (const signal of signals) {
            if (signal.aborted) {
                abortController.abort();
            }
            signal.addEventListener('abort', onAbortControllerUpdate);
        }

        if (onProgress) {
            await new Promise((resolve, reject) => {
                try {
                    fetchEventSource(url, {
                        method: 'POST',
                        headers,
                        body: bodyString,
                        dispatcher: agent,
                        signal: abortController.signal,
                        async onopen(response) {
                            if (response.ok && response.headers.get('content-type').includes('text/event-stream')) {
                                return; // everything's good
                            }
                            const contentType = response.headers.get('content-type');
                            if (debug) {
                                console.debug('Error opening event stream. content-type:', contentType);
                            }
                            if (contentType === 'application/json') {
                                const data = await response.json();
                                const error = new Error('Streaming error');
                                error.data = data;
                                throw error;
                            }
                            throw new Error(`Streaming error: content-type ${contentType}`);
                        },
                        onclose() {
                            if (!done) {
                                if (debug) {
                                    console.debug('Server closed the connection unexpectedly');
                                }
                                throw new Error('Connection closed prematurely');
                            }
                        },
                        onerror(err) {
                            if (debug) {
                                console.debug(err);
                            }
                            // rethrow to stop the operation
                            throw err;
                        },
                        onmessage(message) {
                            if (debug) {
                                console.debug(message);
                            }
                            if (!message.data || message.event === 'ping') {
                                return;
                            }
                            if (message.data === '[DONE]') {
                                onProgress('[DONE]');
                                // abortController.abort();
                                resolve(message);
                                done = true;
                                return;
                            }
                            onProgress(JSON.parse(message.data));
                        },
                    });
                } catch (err) {
                    reject(err);
                }
            });
            // Build a minimal result object from aggregated replies, to avoid a second POST
            const resultFromStream = {
                choices: Object.keys(replies).sort((a,b)=>Number(a)-Number(b)).map((k) => {
                    const index = Number(k);
                    const text = replies[k] || '';
                    return this.isChatGptModel
                        ? { index, message: { role: 'assistant', content: text } }
                        : { index, text };
                }),
            };
            return { result: resultFromStream, results: resultFromStream, replies };
        }

        // Non-streaming request path
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: bodyString,
            dispatcher: agent,
            signal: abortController.signal,
        });
        if (response.status !== 200) {
            const bodyText = await response.text();
            const error = new Error(`Failed to send message. HTTP ${response.status} - ${bodyText}`);
            error.status = response.status;
            try {
                error.json = JSON.parse(bodyText);
            } catch {
                error.body = bodyText;
            }
            throw error;
        }
        const json = await response.json();
        this.parseReplies(json, replies);
        return { result: json, results: json, replies };
    }

    async addMessages(conversationId, messages, parentMessageId = null, chain = true) {
        // if chain is true, messages will be added in a consecutive chain
        // otherwise, they will be added in parallel to the same parent
        if (!conversationId) {
            conversationId = crypto.randomUUID();
        }
        const conversation = (await this.conversationsCache.get(conversationId)) || {
            messages: [],
            createdAt: Date.now(),
        };
        parentMessageId = parentMessageId || conversation.messages[conversation.messages.length - 1]?.id || crypto.randomUUID();

        let newConversationMessages;
        if (chain) {
            newConversationMessages = this.createConversationMessages(
                messages,
                parentMessageId,
            );
            conversation.messages = conversation.messages.concat(newConversationMessages);
            // messageId = conversation.messages[conversation.messages.length - 1].id;
        } else {
            newConversationMessages = [];
            for (const message of messages) {
                const conversationMessage = this.createConversationMessage(
                    message,
                    parentMessageId,
                );
                newConversationMessages.push(conversationMessage);
            }
            conversation.messages.push(...newConversationMessages);
        }
        const messageId = newConversationMessages[newConversationMessages.length - 1].id;

        await this.conversationsCache.set(conversationId, conversation);
        return {
            conversationId,
            messageId,
            newConversationMessages,
            messages: conversation.messages,
            parentMessageId,
        };
    }

    toAPImessage(message) {
        const apiMessage = {};
        const schema = this.apiMessageSchema || {};

        if (schema.author && message.author) {
            apiMessage[schema.author] = message.author;
        }

        const contentParts = this.buildContentParts(message);
        if (contentParts) {
            apiMessage.content = contentParts;
        } else if (schema.text && (message.text !== undefined)) {
            apiMessage[schema.text] = message.text;
        }

        for (const key in schema) {
            if (key === 'author' || key === 'text') {
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(message, key)) {
                apiMessage[schema[key]] = message[key];
            }
        }

        return apiMessage;
    }

    buildContentParts(message) {
        const details = message?.details;
        if (!details) {
            return null;
        }

        if (Array.isArray(details.contentParts) && details.contentParts.length) {
            return details.contentParts;
        }

        const parts = [];
        const prompt = typeof details.prompt === 'string' ? details.prompt : null;
        if (prompt) {
            parts.push({ type: 'text', text: prompt });
        }

        if (Array.isArray(details.attachments)) {
            for (const attachment of details.attachments) {
                if (attachment?.type === 'image') {
                    const imageSource = attachment.dataUrl || attachment.url;
                    if (imageSource) {
                        parts.push({
                            type: 'input_image',
                            image_url: { url: imageSource },
                        });
                    }
                }
            }
        }

        if (!parts.some(part => part.type === 'text') && typeof message?.text === 'string' && message.text.trim()) {
            parts.unshift({ type: 'text', text: message.text });
        }

        return parts.length ? parts : null;
    }

    toBasicMessage(conversationMessage) {
        const author = this.convertAlias('display', 'author', conversationMessage.role);
        const basicMessage = {
            text: conversationMessage.message || '',
            author,
            type: conversationMessage.type || this.participants[author]?.defaultMessageType || 'message',
        };
        if (conversationMessage.details) {
            basicMessage.details = conversationMessage.details;
        }
        return basicMessage;
    }

    toMessages(history) {
        switch (conversions.getDataType(history)) {
            case '[basicMessage]': return history;
            case 'transcript': return conversions.parseTranscript(history);
            // case 'xml': return conversions.parseXml(history);
            case 'basicMessage': return [history];
            case 'conversationMessage': return [this.toBasicMessage(history)];
            case '[conversationMessage]': return history.map(message => this.toBasicMessage(message));
            case 'xml':
            case 'string': return [{ text: history, author: this.participants.user.author }];
            default:
                return [];
                // throw new Error('Invalid history data type:', typeof history); // return null;
        }
    }

    toTranscript(history) {
        return conversions.toTranscript(this.toMessages(history));
    }

    createConversationMessage(message, parentMessageId, opts = {}) {
        const role = this.convertAlias('author', 'display', message.author);
        return {
            id: crypto.randomUUID(),
            parentMessageId,
            role,
            message: message.text,
            unvisited: true,
            ...(message.type ? { type: message.type } : {}),
            ...(message.details ? { details: message.details } : {}),
            ...opts,
            // ...(opts || {}),
        };
    }

    createConversationMessages(messages, rootMessageId) {
        messages = this.toMessages(messages);
        const conversationMessages = [];
        let parentMessageId = rootMessageId;
        for (const message of messages) {
            const conversationMessage = this.createConversationMessage(
                message,
                parentMessageId,
            );
            conversationMessages.push(conversationMessage);
            parentMessageId = conversationMessage.id;
        }
        return conversationMessages;
    }

    static getTokenizer(encoding, isModelName = false, extendSpecialTokens = {}) {
        return getTokenizerImpl(encoding, isModelName, extendSpecialTokens);
    }

    getTokenCount(text) {
        return this.gptEncoder.encode(text, 'all').length;
    }

    static getUserSuggestions(message) {
        return message?.suggestedResponses || null;
    }
}
