import '../polyfills/fetch.js';
import { Agent } from 'undici';
import { fetchEventSource } from '@waylaidwanderer/fetch-event-source';

import ChatClient from './ChatClient.js';
import { loadModelPresets, resolveModelAlias, getDefaultModelAlias } from '../modelPresets.js';

const CLAUDE_MODEL_INFO = {
    default: {
        contextLength: 200000,
        maxResponseTokens: 8192,
    },
};

const CLAUDE_PARTICIPANTS = {
    bot: {
        display: 'Claude',
        author: 'assistant',
        defaultMessageType: 'message',
    },
};

const CLAUDE_DEFAULT_MODEL_OPTIONS = {
    temperature: 1,
    max_tokens: 4096,
    stream: true,
};

export default class ClaudeClient extends ChatClient {
    constructor(options = {}) {
        options.cache = options.cache || {};
        options.cache.namespace = options.cache.namespace || 'claude';

        const providedModelOptions = options.modelOptions || {};
        const fallbackAlias = getDefaultModelAlias('anthropic')
      || getDefaultModelAlias()
      || 'opus4';
        const modelAlias = providedModelOptions.modelAlias
      || options.modelAlias
      || fallbackAlias;
        const resolvedModel = resolveModelAlias(modelAlias) || providedModelOptions.model;
        if (!resolvedModel) {
            throw new Error(`Unknown model alias: ${modelAlias}`);
        }

        options.modelOptions = {
            ...CLAUDE_DEFAULT_MODEL_OPTIONS,
            ...providedModelOptions,
            modelAlias,
            model: resolvedModel,
        };

        options.participants = {
            ...CLAUDE_PARTICIPANTS,
            ...options.participants,
        };

        super(options);

        this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || '';
        this.completionsUrl = options.completionsUrl || 'https://api.anthropic.com/v1/messages';
        this.modelInfo = CLAUDE_MODEL_INFO;
        this.modelOptions = {
            ...CLAUDE_DEFAULT_MODEL_OPTIONS,
            ...this.modelOptions,
        };
        this.participants = {
            ...this.participants,
            ...CLAUDE_PARTICIPANTS,
        };
        this.n = 1;

        const { globals } = loadModelPresets();
        if (globals?.context_length && Number.isFinite(globals.context_length)) {
            this.modelInfo.default.contextLength = globals.context_length;
        }
        if (globals?.max_tokens && Number.isFinite(globals.max_tokens) && (this.modelOptions.max_tokens == null)) {
            this.modelOptions.max_tokens = globals.max_tokens;
        }

        // Re-apply options so that ChatClient recomputes token limits with our overrides.
        this.setOptions({
            ...this.options,
            modelOptions: this.modelOptions,
            participants: this.participants,
            n: this.n,
        });
    }

    getHeaders() {
        const anthropicBeta = this.options?.steering
            ? 'steering-2024-06-04'
            : 'messages-2023-12-15';

        return {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': anthropicBeta,
        };
    }

    buildApiParams(userMessage = null, previousMessages = [], systemMessage = null) {
        const history = [
            ...previousMessages,
            ...userMessage ? [userMessage] : [],
        ];
        const messages = history.map(msg => this.toAPImessage(msg));

        // Merge consecutive messages from the same role to stay within Anthropic's expectations.
        const mergedHistory = [];
        for (const message of messages) {
            const normalized = {
                ...message,
                content: Array.isArray(message.content)
                    ? message.content
                    : [{ type: 'text', text: message.content }],
            };

            const lastMessage = mergedHistory[mergedHistory.length - 1];
            const lastIsTextOnly = lastMessage?.content?.every?.(part => part.type === 'text') ?? false;
            const currentIsTextOnly = normalized.content.every(part => part.type === 'text');

            if (lastMessage && lastMessage.role === normalized.role && lastIsTextOnly && currentIsTextOnly) {
                const existing = lastMessage.content?.[lastMessage.content.length - 1]?.text || '';
                const addition = normalized.content?.[0]?.text || '';
                lastMessage.content = [{ type: 'text', text: `${existing}${addition}` }];
            } else {
                mergedHistory.push(normalized);
            }
        }

        const anthropicReadyHistory = mergedHistory.map((message) => {
            const content = message.content
                .map(part => this.#toAnthropicContentPart(part))
                .filter(Boolean);

            return {
                ...message,
                content: content.length ? content : [{ type: 'text', text: '' }],
            };
        });

        const system = systemMessage?.text || null;

        return {
            messages: anthropicReadyHistory,
            ...(system ? { system } : {}),
        };
    }

    // eslint-disable-next-line class-methods-use-this
    #toAnthropicContentPart(part) {
        if (!part) {
            return null;
        }

        if (part.type === 'input_image') {
            const sourceUrl = part.image_url?.url || part.url;
            if (!sourceUrl) {
                return null;
            }

            if (sourceUrl.startsWith('data:')) {
                const match = sourceUrl.match(/^data:(.+?);base64,(.+)$/);
                if (!match) {
                    return null;
                }
                const [, mediaType, base64Data] = match;
                return {
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: mediaType,
                        data: base64Data,
                    },
                };
            }

            return {
                type: 'image',
                source: {
                    type: 'url',
                    url: sourceUrl,
                },
            };
        }

        if (part.type === 'text') {
            return { type: 'text', text: part.text ?? '' };
        }

        return part;
    }

    async callAPI(params, opts = {}) {
        const modelOptions = {
            ...this.modelOptions,
            ...params,
        };

        const {
            modelAlias,
            stream: streamPref,
            n,
            ...restOptions
        } = modelOptions;

        const shouldStream = streamPref !== false;
        const body = {
            ...restOptions,
            stream: shouldStream,
        };

        // Anthropic does not support parallel samples via `n` yet.
        delete body.n;

        const replies = {};
        const agent = new Agent({ keepAliveTimeout: 10, keepAliveMaxTimeout: 10 });
        const headers = {
            ...this.getHeaders(),
            'Content-Type': 'application/json',
        };

        const debug = this.options?.debug;

        const abortController = new AbortController();
        const signals = [];
        if (opts.abortController) {
            signals.push(opts.abortController.signal);
        }
        signals.push(abortController.signal);
        for (const signal of signals) {
            if (signal !== abortController.signal) {
                if (signal.aborted) {
                    abortController.abort();
                } else {
                    signal.addEventListener('abort', () => abortController.abort());
                }
            }
        }

        if (shouldStream && opts.onProgress) {
            return this.#callStreaming(body, headers, agent, abortController, replies, opts, debug);
        }

        const response = await fetch(this.completionsUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                ...body,
                stream: false,
            }),
            dispatcher: agent,
            signal: abortController.signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Failed to send message. HTTP ${response.status} - ${errorText}`);
            error.status = response.status;
            try {
                error.json = JSON.parse(errorText);
            } catch {
                error.body = errorText;
            }
            throw error;
        }

        const json = await response.json();
        replies[0] = this.#extractTextFromContent(json.content);
        return { result: json, results: json, replies };
    }

    async #callStreaming(body, headers, agent, abortController, replies, opts, debug = false) {
        let done = false;
        let stopReason = null;
        let usage = null;
        let messageMeta = null;

        await new Promise((resolve, reject) => {
            fetchEventSource(this.completionsUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                dispatcher: agent,
                signal: abortController.signal,
                async onopen(response) {
                    const contentType = response.headers.get('content-type');
                    if (response.ok && contentType?.includes('text/event-stream')) {
                        return;
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
                        reject(new Error('Connection closed prematurely'));
                    }
                },
                onerror(err) {
                    if (debug) {
                        console.debug(err);
                    }
                    reject(err);
                },
                onmessage: (message) => {
                    if (!message?.data) {
                        return;
                    }
                    if (message.event === 'ping') {
                        return;
                    }
                    if (message.data === '[DONE]') {
                        done = true;
                        resolve(message);
                        return;
                    }

                    const data = JSON.parse(message.data);
                    if (debug) {
                        console.debug(data);
                    }

                    switch (data.type) {
                        case 'message_start':
                            messageMeta = data.message;
                            break;
                        case 'content_block_delta': {
                            const text = data.delta?.text || '';
                            if (text) {
                                replies[0] = (replies[0] || '') + text;
                                if (opts.onProgress) {
                                    opts.onProgress(text, 0, data);
                                }
                            }
                            break;
                        }
                        case 'message_delta':
                            if (data.delta?.stop_reason) {
                                stopReason = data.delta.stop_reason;
                            }
                            if (data.delta?.usage) {
                                usage = data.delta.usage;
                            }
                            if (opts.onProgress) {
                                opts.onProgress('', 0, data);
                            }
                            break;
                        case 'message_stop':
                            done = true;
                            stopReason = stopReason || data.stop_reason || null;
                            usage = usage || data.usage || null;
                            if (opts.onFinished) {
                                opts.onFinished(0, { usage, stopReason: stopReason ?? undefined }, stopReason);
                            }
                            resolve(data);
                            break;
                        default:
                            if (opts.onProgress) {
                                opts.onProgress('', 0, data);
                            }
                            break;
                    }
                },
            }).catch(reject);
        });

        const content = replies[0] || '';
        const resultMessage = {
            ...(messageMeta || {}),
            role: messageMeta?.role || 'assistant',
            content: [{ type: 'text', text: content }],
            stop_reason: stopReason,
            usage,
        };

        return { result: resultMessage, results: resultMessage, replies };
    }

    // eslint-disable-next-line class-methods-use-this
    #extractTextFromContent(content) {
        if (!Array.isArray(content)) {
            return content || '';
        }
        return content
            .filter(block => block?.type === 'text')
            .map(block => block.text || '')
            .join('');
    }
}
