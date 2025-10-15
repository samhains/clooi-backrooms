#!/usr/bin/env node
import 'dotenv/config';
import fs, { existsSync, realpathSync } from 'fs';
import { pathToFileURL } from 'url';
import { KeyvFile } from 'keyv-file';
import { spawn } from 'child_process';
import Convert from 'ansi-to-html';
import {
    writeFile,
    readFile,
    unlink,
    mkdir,
} from 'fs/promises';

import chokidar from 'chokidar';
import ora from 'ora';
import clipboard from 'clipboardy';
import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import crypto from 'crypto';
import readline from 'readline';
import path from 'path';
import os from 'os';
import { getClient, getClientSettings } from './util.js';
import applyTemplateVariables from '../utils/templateVars.js';
import { getCid } from '../utils/cache.js';
import {
    getMessagesForConversation,
    getChildren,
    getSiblings,
    getSiblingIndex,
    getParent,
} from '../utils/conversation.js';
import {
    listSaveStates,
    findSaveState,
    writeSaveState,
    generateUniqueSlug,
    formatSaveChoiceLabel,
    summarizeConversation,
} from '../utils/saveStates.js';
import tryBoxen from './boxen.js';
import { getBackroomsFiles, parseBackroomsLog } from './backrooms.js';
import { systemMessageBox, suggestionsBoxes, replaceWhitespace } from './ui.js';
import { logError, logSuccess, logWarning } from './logging.js';
import { conversationStart as conversationStartBox, historyBoxes as renderHistoryBoxes, conversationMessageBox } from './history.js';

import buildCommands from './commands.js';

const arg = process.argv.find(_arg => _arg.startsWith('--settings'));
const pathToSettings = arg?.split('=')[1] ?? './settings.js';

const CONTEXTS_DIR = path.resolve('./contexts');
const CONTEXT_EXTENSION = '.txt';
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*]\(([^)]+)\)/g;
const INLINE_QUOTED_REGEX = /(["'`])([\s\S]*?)\1/g;

let settings;
let watcher;

let conversationData = {};
let responseData = {};
let clientToUse;
let client;
let clientOptions;
const navigationHistory = [];
let localConversation = {};
let steeringFeatures = {};
let currentLoadedSave = null;

class AttachmentError extends Error {
    constructor(message, severity = 'warning') {
        super(message);
        this.name = 'AttachmentError';
        this.severity = severity;
    }
}

function getStreamingPreviewLimit() {
    const candidate = Number(clientOptions?.modelOptions?.max_tokens)
        || Number(clientOptions?.modelOptions?.max_output_tokens)
        || Number(settings?.maxTokens);
    return Number.isFinite(candidate) && candidate > 0 ? candidate : Infinity;
}

function createStreamingPreview(prefixLabel, limit = Infinity) {
    let lineCount = 0;
    let active = false;

    const isTTY = () => Boolean(process.stdout && process.stdout.isTTY);

    const truncateContent = (input) => {
        if (!input) {
            return '';
        }
        const normalized = typeof input === 'string' ? input : String(input ?? '');
        if (!Number.isFinite(limit) || normalized.length <= limit) {
            return normalized;
        }
        const sliceLength = Math.max(1, limit - 1);
        return `…${normalized.slice(-sliceLength)}`;
    };

    const render = (content) => {
        const truncated = truncateContent(content);
        const boxedOutput = aiMessageBox(replaceWhitespace(truncated));
        const fullOutput = `${prefixLabel}\n${boxedOutput}`;

        if (isTTY() && lineCount > 0) {
            readline.moveCursor(process.stdout, 0, -lineCount);
            readline.clearScreenDown(process.stdout);
        } else if (!isTTY() && active) {
            // In non-TTY scenarios we cannot rewrite in place, so add spacing between updates.
            process.stdout.write('\n');
        }

        process.stdout.write(`${fullOutput}\n`);
        lineCount = fullOutput.split('\n').length + 1;
        active = true;
    };

    return {
        isActive: () => active,
        render,
        clear() {
            if (isTTY() && lineCount > 0) {
                readline.moveCursor(process.stdout, 0, -lineCount);
                readline.clearScreenDown(process.stdout);
            }
            lineCount = 0;
            active = false;
        },
    };
}

async function initializeSettingsWatcher(settingsPath) {
    await updateSettings(settingsPath);

    // stop the previous watcher if it exists
    await stopSettingsWatcher();

    watcher = chokidar.watch(settingsPath);
    watcher.on('change', () => updateSettings(settingsPath));

    return watcher;
}

async function stopSettingsWatcher() {
    if (watcher) {
        await watcher.close();
        // console.log('Settings watcher stopped');
    }
}

async function updateSettings(settingsPath) {
    if (existsSync(settingsPath)) {
        const fullPath = realpathSync(settingsPath);

        try {
            // Read the file contents
            const fileContent = await readFile(fullPath, 'utf8');

            // Create a temporary file with a unique name
            const tempPath = `${fullPath}.${Date.now()}.tmp.js`;
            await writeFile(tempPath, fileContent);

            // Import the temporary file
            const module = await import(pathToFileURL(tempPath).toString());
            settings = module.default;

            // Delete the temporary file
            await unlink(tempPath);

            // console.log('Settings reloaded');
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    } else {
        if (arg) {
            console.error('Error: the file specified by the --settings parameter does not exist.');
        } else {
            console.error('Error: the settings.js file does not exist.');
        }
        process.exit(1);
    }

    if (settings.storageFilePath && !settings.cacheOptions.store) {
        // make the directory and file if they don't exist
        const dir = settings.storageFilePath.split('/').slice(0, -1).join('/');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(settings.storageFilePath)) {
            fs.writeFileSync(settings.storageFilePath, '');
        }

        settings.cacheOptions.store = new KeyvFile({ filename: settings.storageFilePath });
    }

    // // Disable the image generation in cli mode always.
    // settings.bingAiClient.features = settings.bingAiClient.features || {};
    // settings.bingAiClient.features.genImage = false;

    clientToUse = settings.cliOptions?.clientToUse || settings.clientToUse || 'openrouter';
    // console.log(settings)

    clientOptions = getClientSettings(clientToUse, settings);
    client = getClient(clientToUse, settings);
}

function sanitizeContextSlug(rawSlug) {
    if (!rawSlug) {
        return null;
    }
    const trimmed = rawSlug.trim();
    if (!trimmed) {
        return null;
    }
    const withoutExt = trimmed.toLowerCase().endsWith(CONTEXT_EXTENSION)
        ? trimmed.slice(0, -CONTEXT_EXTENSION.length)
        : trimmed;
    if (!/^[A-Za-z0-9_-]+$/.test(withoutExt)) {
        throw new Error('Context name may only include letters, numbers, underscores, or hyphens.');
    }
    return withoutExt;
}

async function loadContextPrompt(slug) {
    const normalized = sanitizeContextSlug(slug);
    if (!normalized) {
        throw new Error('No context slug provided.');
    }
    const contextPath = path.resolve(CONTEXTS_DIR, `${normalized}${CONTEXT_EXTENSION}`);
    const template = await readFile(contextPath, 'utf8');
    const templateVars = settings?.templateVariables || {};
    return {
        prompt: applyTemplateVariables(template, templateVars),
        slug: normalized,
        path: contextPath,
    };
}

async function loadSettings() {
    await initializeSettingsWatcher(pathToSettings);

    conversationData = settings.cliOptions?.conversationData || settings.conversationData || {};

    responseData = {};

    if (clientToUse === 'claude') {
        const claudeAscii = fs.readFileSync('./contexts/claudeLoomAscii.txt', 'utf8');
        // console.log(claudeAscii);
        console.log(tryBoxen(claudeAscii, {
            padding: 0, margin: 1, borderStyle: 'none', float: 'center',
        }));
    } else {
        console.log(tryBoxen(`${getAILabel()} CLooI`, {
            padding: 0.7, margin: 1, borderStyle: 'double', dimBorder: true,
        }));
    }
    const { systemMessage } = clientOptions.messageOptions;
    if (systemMessage) {
        console.log(systemMessageBox(systemMessage));
    }
    return conversation();
}

async function hasChildren() {
    if (!conversationData.parentMessageId) {
        return false;
    }
    return getChildren(localConversation.messages, conversationData.parentMessageId).length > 0;
}

async function hasSiblings() {
    if (!conversationData.parentMessageId) {
        return false;
    }
    return getSiblings(localConversation.messages, conversationData.parentMessageId).length > 1;
}

let availableCommands = buildCommands({
    showCommandDocumentation,
    importBackroomsLogFlow,
    retryResponse,
    generateMessage,
    composeAiMessage,
    saveConversationState,
    loadSavedState,
    systemPromptSelection,
    newConversation,
    rewind,
    selectChildMessage,
    selectSiblingMessage,
    rewindTo,
    printOrCopyData,
    renderLastMessage,
    useEditor,
    useEditorPlain,
    editMessage,
    addMessages,
    sendImageMessage,
    mergeUp,
    showHistory,
    stopSettingsWatcher,
    loadConversationState,
    exportConversation,
    loadConversation,
    debug,
    steerCommand: async (args = []) => {
        if (args.length === 1) {
            steeringFeatures = {};
            console.log('Reset steering features');
        } else if (args[1] === 'cat') {
            console.log('Steering features', steeringFeatures);
        } else {
            let amount = 10;
            const [, , rawAmount] = args;
            if (rawAmount !== null && rawAmount !== undefined) {
                amount = rawAmount;
            }
            steeringFeatures[`feat_34M_20240604_${args[1]}`] = Number(amount);
        }
        return conversation();
    },
    hasChildren,
    hasSiblings,
    hasParent: async () => Boolean(conversationData.parentMessageId),
    hasConversationId: async () => Boolean(getConversationId()),
    resumeAvailable: async () => {
        const lastConversation = await client.conversationsCache.get('lastConversation');
        return Boolean(lastConversation);
    },
    conversation,
});

inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

await loadSettings();

function printDocString(commandObj) {
    console.log(`\n${commandObj.usage}: ${commandObj.description}`);
}

async function showCommandDocumentation(command) {
    if (command) {
        const commandObj = availableCommands.find(c => (c.value === command) || (c.value === `!${command}`));
        if (!commandObj) {
            console.log('Command not found.');
            return conversation();
        }
        printDocString(commandObj);
    } else {
        // console.log('Commands:\n');
        for (const commandObj of availableCommands) {
            // console.log(`\n${commandObj.usage}\n`);
            printDocString(commandObj);
        }
    }
    return conversation();
}

async function conversation() {
    console.log('Type "!" to access the command menu.');
    const prompt = inquirer.prompt([
        {
            type: 'autocomplete',
            name: 'message',
            message: 'Write a message:',
            searchText: '​',
            emptyText: '​',
            suggestOnly: true,
            source: () => Promise.resolve([]),
        },
    ]);
    // hiding the ugly autocomplete hint
    prompt.ui.activePrompt.firstRender = false;
    // The below is a hack to allow selecting items from the autocomplete menu while also being able to submit messages.
    // This basically simulates a hybrid between having `suggestOnly: false` and `suggestOnly: true`.
    await new Promise(resolve => setTimeout(resolve, 0));

    await pullFromCache();

    let userSuggestions = [];
    if (conversationData.parentMessageId) {
        const targetMessage = getMessageByIndex();
        userSuggestions = client.constructor.getUserSuggestions(targetMessage?.details?.message) || [];
    }

    prompt.ui.activePrompt.opt.source = async (answers, input) => {
        if (!input) {
            return [];
        }
        prompt.ui.activePrompt.opt.suggestOnly = (!input.startsWith('!') || input.split(' ').length > 1) && !(input.startsWith('?'));

        availableCommands = await Promise.all(availableCommands.map(async command => ({
            ...command,
            isAvailable: command.available ? await command.available() : true,
        })));

        const userSuggestionCommands = userSuggestions.map(suggestion => ({
            name: `?${suggestion}`,
            value: suggestion,
        }));

        return [
            ...availableCommands.filter(command => command.isAvailable && command.value.startsWith(input)),
            ...userSuggestionCommands.filter(command => command.name.toLowerCase().startsWith(input.toLowerCase())),
        ];

        // return availableCommands.filter(command => command.isAvailable && command.value.startsWith(input));
    };
    let { message } = await prompt;
    message = message.trim();
    if (!message) {
        return conversation();
    }

    if (message.startsWith('!')) {
        const args = message.split(' ');
        const command = availableCommands.find(c => c.value === args[0]);
        if (command) {
            if (args[1] === '--help') {
                return showCommandDocumentation(args[0]);
            }
            return command.command(args, message);
        }
        logWarning('Command not found.');
        return conversation();
    }
    await concatMessages(message);
    showHistory();
    return generateMessage();
}

async function generateMessage() {
    const previewIdx = 0;
    const streamedMessages = {};
    const status = {};
    const eventLog = [];

    const context = await client.yieldGenContext(
        null,
        {
            ...clientOptions.modelOptions,
            ...(Object.keys(steeringFeatures).length !== 0 ? {
                steering: {
                    feature_levels: steeringFeatures,
                },
            } : {}),
        },
        {
            ...conversationData,
            ...clientOptions.messageOptions,
        },
    );

    const {
        apiParams,
        conversationId,
        completionParentId: parentMessageId,
        conversation: _conversation,
    } = context;

    localConversation = _conversation;

    // console.log('apiParams', apiParams);
    // console.log('modelOptions', clientOptions.modelOptions);
    // console.log('messageOptions', clientOptions.messageOptions);

    conversationData = {
        ...conversationData,
        parentMessageId,
        conversationId,
    };

    const spinnerPrefix = `${getAILabel()} is typing...`;
    const previewRenderer = createStreamingPreview(spinnerPrefix, getStreamingPreviewLimit());
    const spinner = ora({
        text: spinnerPrefix,
        spinner: {
            interval: 80,
            frames: ['⠧', '⠇', '⠏', '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏', '⠋'],
        },
    });
    spinner.prefixText = '\n   ';
    spinner.start();
    let spinnerActive = true;
    const stopSpinner = () => {
        if (spinnerActive) {
            spinner.stop();
            spinnerActive = false;
        }
    };
    try {
        const controller = new AbortController();
        // abort on ctrl+c
        process.on('SIGINT', () => {
            controller.abort();
        });

        const { results, replies } = await client.callAPI(
            apiParams,
            {
                ...clientOptions.messageOptions,
                abortController: controller,
                onProgress: (diff, idx, data) => {
                    if (diff) {
                        if (!streamedMessages[idx]) {
                            streamedMessages[idx] = '';
                            status[idx] = 'streaming';
                        }
                        streamedMessages[idx] += diff;
                        if (idx === previewIdx) {
                            if (!previewRenderer.isActive()) {
                                stopSpinner();
                            }
                            previewRenderer.render(streamedMessages[idx]);
                        }
                    }
                    if (data) {
                        eventLog.push(data);
                    }
                    responseData = {
                        replies: streamedMessages,
                        eventLog,
                    };
                },
                onFinished: async (idx, data = {}, stopReason = null) => {
                    // console.log('onFinished', idx, stopReason);
                    if (status[idx] === 'finished') {
                        // console.log('already finished');
                        return null;
                    }
                    status[idx] = 'finished';
                    let empty = false;
                    if (!streamedMessages[idx]) {
                        streamedMessages[idx] = '';
                        empty = true;
                    }
                    const simpleMessage = client.buildMessage(streamedMessages[idx].trim(), client.names.bot.author);
                    const conversationMessage = client.createConversationMessage(simpleMessage, parentMessageId, {
                        ...(data ? { details: data } : {}),
                        ...(stopReason ? { stopReason } : {}),
                    });
                    localConversation.messages.push(conversationMessage);
                    if (idx === previewIdx) {
                        // await pullFromCache();
                        await client.conversationsCache.set(conversationId, localConversation);
                        // localConversation = _conversation;
                        // await pullFromCache();

                        // remove event listeners

                        if (previewRenderer.isActive()) {
                            previewRenderer.clear();
                        } else {
                            stopSpinner();
                        }
                        if (empty) {
                            return conversation();
                        }
                        return selectMessage(conversationMessage.id, conversationId);
                    }
                    return null;
                },
            },
        );

        process.removeAllListeners('SIGINT');

        responseData.response = results;

        if (!streamedMessages[previewIdx]) {
            // console.log('not streaming');
            // remove event listeners

            if (previewRenderer.isActive()) {
                previewRenderer.clear();
            } else {
                stopSpinner();
            }
            const newConversationMessages = [];
            let previewMessage;
            for (const [key, text] of Object.entries(replies)) {
                const simpleMessage = client.buildMessage(text.trim(), client.names.bot.author);
                const conversationMessage = client.createConversationMessage(simpleMessage, parentMessageId);
                if (parseInt(key, 10) === previewIdx) {
                    previewMessage = conversationMessage;
                }
            }
            localConversation.messages.push(...newConversationMessages);
            await client.conversationsCache.set(conversationId, localConversation);
            // await pullFromCache();

            return selectMessage(previewMessage.id, conversationId);
        }

        // await pullFromCache();
        await client.conversationsCache.set(conversationId, localConversation);
        // localConversation = _conversation;
        // await pullFromCache();

        // showHistory();
        return null;
    } catch (error) {
        // remove event listeners
        process.removeAllListeners('SIGINT');

        if (previewRenderer.isActive()) {
            previewRenderer.clear();
        } else {
            stopSpinner();
        }
        console.log(error);
        if (streamedMessages && Object.keys(streamedMessages).length > 0) {
            // console.log(streamedMessages);
            const newConversationMessages = [];
            let previewMessage;
            for (const [key, text] of Object.entries(streamedMessages)) {
                if (status[key] === 'streaming' && text.trim()) {
                    const simpleMessage = client.buildMessage(text.trim(), client.names.bot.author);
                    const conversationMessage = client.createConversationMessage(simpleMessage, parentMessageId, {
                        stopReason: error,
                    });
                    if (parseInt(key, 10) === previewIdx) {
                        previewMessage = conversationMessage;
                    }
                    newConversationMessages.push(conversationMessage);
                }
            }
            if (newConversationMessages.length > 0) {
                localConversation.messages.push(...newConversationMessages);
                // await pullFromCache();
                await client.conversationsCache.set(conversationId, localConversation);
                // localConversation = localConversation;

                if (previewMessage) {
                    return selectMessage(previewMessage.id, conversationId);
                }
            }

            return null;
        }
        // throw error;
    }
    // remove event listeners
    process.removeAllListeners('SIGINT');
    return conversation();
}

function retryResponse() {
    if (!conversationData.parentMessageId) {
        logWarning('No message to rewind to.');
        return conversation();
    }
    const currentMessage = getCurrentMessage();
    if (!currentMessage) {
        logWarning('Current message not found.');
        return conversation();
    }
    conversationData.parentMessageId = currentMessage.parentMessageId;
    // logSuccess(`Rewound conversation to message ${conversationData.parentMessageId}.`);
    const boxes = historyBoxes();
    if (boxes) {
        console.log(boxes);
    }
    return generateMessage();
}

function getMessageByIndex(pathIndex = null, branchIndex = null) {
    const messageHistory = getHistory();
    if (!messageHistory) {
        return null;
    }
    let anchorMessage = null;
    if (pathIndex === null || pathIndex === '.') {
        anchorMessage = getCurrentMessage();
    } else {
        if (pathIndex < 0) {
            pathIndex -= 1; // relative index
        }
        [anchorMessage] = messageHistory.slice(pathIndex);
    }
    if (!anchorMessage) {
        // logWarning('Message not found.');
        return null;
    }
    if (branchIndex === null) {
        return anchorMessage;
    }
    // const messages = await conversationMessages();
    const siblingMessages = getSiblings(localConversation.messages, anchorMessage.id);
    const anchorSiblingIndex = getSiblingIndex(localConversation.messages, anchorMessage.id);
    if (branchIndex < 0) {
        branchIndex = anchorSiblingIndex + branchIndex;
    }
    if (branchIndex < 0) {
        branchIndex = siblingMessages.length + branchIndex;
    } else if (branchIndex >= siblingMessages.length) {
        // logWarning('Invalid index.');
        return null;
    }
    return siblingMessages[branchIndex];
}

function rewindTo(index, branchIndex = null) {
    const conversationMessage = getMessageByIndex(index, branchIndex);
    if (!conversationMessage) {
        logWarning('Message not found.');
        return conversation();
    }
    return selectMessage(conversationMessage.id);
}

async function rewind(idx, branchIndex = null) {
    const messageHistory = getHistory();
    if (!messageHistory || messageHistory.length < 2) {
        return conversation();
    }
    if (!idx) {
        const choices = messageHistory.map((conversationMessage, index) => ({
            name: `[${index}] ${conversationMessage.role}: ${conversationMessage.message.slice(0, 200) + (conversationMessage.message.length > 200 ? '...' : '')}`,
            value: index,
        }));
        const { index } = await inquirer.prompt([
            {
                type: 'list',
                name: 'index',
                message: 'Select a message to rewind to:',
                choices,
                default: choices.length - 2,
                loop: false,
            },
        ]);
        idx = index;
    }
    return rewindTo(idx, branchIndex);
}

async function setConversationData(data) {
    conversationData = {
        ...conversationData,
        ...data,
    };
    navigationHistory.push(conversationData);
    await client.conversationsCache.set('lastConversation', conversationData);
    await pullFromCache();
}

async function selectMessage(messageId, conversationId = getConversationId()) {
    await setConversationData({
        conversationId,
        parentMessageId: messageId,
    });
    // logSuccess(`Selected message ${messageId}.`);
    showHistory();
    return conversation();
}

async function selectChildMessage(index = null) {
    // const messages = await conversationMessages();
    const childMessages = getChildren(localConversation.messages, conversationData.parentMessageId);
    if (childMessages.length === 0) {
        logWarning('No child messages.');
        return conversation();
    }
    if (childMessages.length === 1) {
        index = 0;
    }
    if (index === null) {
        const choices = childMessages.map((conversationMessage, idx) => ({
            name: `[${idx}] ${conversationMessage.role}: ${conversationMessage.message.slice(0, 200) + (conversationMessage.message.length > 200 ? '...' : '')}`,
            value: idx,
        }));
        const { index: idx } = await inquirer.prompt([
            {
                type: 'list',
                name: 'index',
                message: 'Select a child message:',
                choices,
                loop: true,
                pageSize: Math.min(childMessages.length * 2, 30),
            },
        ]);
        index = idx;
    }
    if (index < 0 || index >= childMessages.length) {
        logWarning('Invalid index.');
        return conversation();
    }
    return selectMessage(childMessages[index].id);
}

async function selectSiblingMessage(index = null) {
    // const messages = await conversationMessages();
    const siblingMessages = getSiblings(localConversation.messages, conversationData.parentMessageId);
    if (siblingMessages.length < 2) {
        logWarning('No sibling messages.');
        return conversation();
    }
    if (index === null) {
        const choices = siblingMessages.map((conversationMessage, idx) => ({
            name: `[${idx}] ${conversationMessage.role}: ${conversationMessage.message.slice(0, 200) + (conversationMessage.message.length > 200 ? '...' : '')}`,
            value: idx,
        }));
        const { index: idx } = await inquirer.prompt([
            {
                type: 'list',
                name: 'index',
                message: 'Select a sibling message:',
                choices,
                loop: true,
                default: getSiblingIndex(localConversation.messages, conversationData.parentMessageId) + 1,
                pageSize: Math.min(siblingMessages.length * 2, 30),
            },
        ]);
        index = idx;
    }
    const siblingMessage = getMessageByIndex('.', index % siblingMessages.length);
    if (!siblingMessage) {
        logWarning('Invalid index.');
        return conversation();
    }
    return selectMessage(siblingMessage.id);
}

async function debug() {
    console.log(clientOptions);

    // return loadByTree();

    // console.log(conversationId);
    // const targetMessage = await getMessageByIndex(args[0], args[1]);
    // console.log(targetMessage.message);

    // return conversation();
}

async function addMessage(message, conversationId = getConversationId()) {
    const convo = await client.conversationsCache.get(conversationId);
    convo.messages.push(message);
    await client.conversationsCache.set(conversationId, convo);
    await pullFromCache();
}

function parseAiCommandArgs(args = []) {
    if (!Array.isArray(args) || args.length <= 1) {
        return {
            contextSlug: null,
            instructions: '',
        };
    }

    const tokens = args.slice(1);
    let contextSlug = null;
    const instructionParts = [];

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (!token) {
            continue;
        }

        if (token === '--context' || token === '-c') {
            const next = tokens[index + 1];
            if (next) {
                contextSlug = next;
                index += 1;
            }
            continue;
        }

        const contextMatch = token.match(/^(?:--context|-c)=(.+)$/);
        if (contextMatch) {
            const [, slugValue] = contextMatch;
            contextSlug = slugValue;
            continue;
        }

        instructionParts.push(token);
    }

    return {
        contextSlug,
        instructions: instructionParts.join(' ').trim(),
    };
}

function sanitizeComposeHistory(messages, assistantAuthor) {
    if (!Array.isArray(messages) || !assistantAuthor) {
        return messages;
    }

    const summarizeAttachment = (attachment, index) => {
        if (!attachment || typeof attachment !== 'object') {
            return `${index + 1}. image attachment`;
        }
        const descriptorParts = [];
        if (attachment.name) {
            descriptorParts.push(attachment.name);
        }
        const locator = attachment.sourceUrl || attachment.url || attachment.sourcePath;
        if (locator && !descriptorParts.includes(locator)) {
            descriptorParts.push(locator);
        }
        if (!descriptorParts.length) {
            descriptorParts.push('image attachment');
        }
        return `${index + 1}. ${descriptorParts.join(' – ')}`;
    };

    return messages.map((message) => {
        if (!message || message.author !== assistantAuthor) {
            return message;
        }

        const { details } = message;
        const attachments = Array.isArray(details?.attachments)
            ? details.attachments.filter(attachment => attachment?.type === 'image')
            : [];
        const hasImageContentParts = Array.isArray(details?.contentParts)
            ? details.contentParts.some(part => part?.type === 'input_image' || part?.type === 'image')
            : false;

        if (!attachments.length && !hasImageContentParts) {
            return message;
        }

        const sanitizedMessage = { ...message };
        const sanitizedDetails = details ? { ...details } : undefined;

        if (sanitizedDetails) {
            if (sanitizedDetails.attachments) {
                delete sanitizedDetails.attachments;
            }
            if (Array.isArray(sanitizedDetails.contentParts)) {
                sanitizedDetails.contentParts = sanitizedDetails.contentParts.filter(
                    part => part?.type !== 'input_image' && part?.type !== 'image',
                );
                if (!sanitizedDetails.contentParts.length) {
                    delete sanitizedDetails.contentParts;
                }
            }
        }

        const attachmentNote = attachments.length
            ? attachments.map((attachment, index) => summarizeAttachment(attachment, index)).join('\n')
            : null;

        if (sanitizedDetails) {
            const existingPrompt = typeof sanitizedDetails.prompt === 'string'
                ? sanitizedDetails.prompt.trim()
                : '';
            const promptSegments = [
                existingPrompt,
                attachmentNote ? `Attachments referenced:\n${attachmentNote}` : null,
            ].filter(Boolean);
            if (promptSegments.length) {
                sanitizedDetails.prompt = promptSegments.join('\n\n');
            } else {
                delete sanitizedDetails.prompt;
            }
        }

        if (sanitizedDetails && Object.keys(sanitizedDetails).length) {
            sanitizedMessage.details = sanitizedDetails;
        } else {
            delete sanitizedMessage.details;
        }

        if (attachmentNote) {
            const baseText = typeof sanitizedMessage.text === 'string'
                ? sanitizedMessage.text.trim()
                : '';
            if (!baseText) {
                sanitizedMessage.text = `Attachments referenced:\n${attachmentNote}`;
            }
        }

        return sanitizedMessage;
    });
}

async function composeAiMessage(args = []) {
    const { contextSlug: explicitContextSlug, instructions: parsedInstructions } = parseAiCommandArgs(args);
    const configuredContext = settings?.config?.aiContext || settings?.config?.context || null;
    const contextSlug = explicitContextSlug || configuredContext;

    let contextPrompt = null;
    if (contextSlug) {
        try {
            ({ prompt: contextPrompt } = await loadContextPrompt(contextSlug));
        } catch (error) {
            if (explicitContextSlug) {
                logWarning(`Failed to load context "${contextSlug}": ${error.message}`);
                return conversation();
            }
            const fallbackPrompt = clientOptions?.messageOptions?.systemMessage;
            if (typeof fallbackPrompt === 'string' && fallbackPrompt.trim()) {
                contextPrompt = fallbackPrompt.trim();
            } else {
                logWarning(`Failed to load configured aiContext "${contextSlug}": ${error.message}`);
                return conversation();
            }
        }
    } else {
        const fallbackPrompt = clientOptions?.messageOptions?.systemMessage;
        if (typeof fallbackPrompt === 'string' && fallbackPrompt.trim()) {
            contextPrompt = fallbackPrompt.trim();
        }
    }

    const instructionText = parsedInstructions;

    await pullFromCache();

    const historyMessages = client.toMessages(getHistory());
    const swappedMessages = historyMessages.map((message) => {
        let swappedAuthor = message.author;
        if (message.author === client.names.bot.author) {
            swappedAuthor = client.names.user.author;
        } else if (message.author === client.names.user.author) {
            swappedAuthor = client.names.bot.author;
        }
        return {
            ...message,
            author: swappedAuthor,
        };
    });

    const sanitizedMessages = sanitizeComposeHistory(
        swappedMessages,
        client.names.bot.author,
    );

    const systemMessage = contextPrompt
        ? client.buildMessage(contextPrompt, client.names.system.author)
        : null;
    const instructionMessage = instructionText
        ? client.buildMessage(instructionText, client.names.user.author)
        : null;

    const composeModelOptions = {
        ...clientOptions.modelOptions,
        stream: false,
    };

    const steeringOption = Object.keys(steeringFeatures).length
        ? {
            steering: {
                feature_levels: steeringFeatures,
            },
        }
        : {};

    let replies;
    try {
        const apiParams = {
            ...composeModelOptions,
            ...steeringOption,
            ...client.buildApiParams(instructionMessage, sanitizedMessages, systemMessage),
        };

        ({ replies } = await client.callAPI(apiParams, {}));
    } catch (error) {
        logError(`Failed to generate AI draft: ${error.message}`);
        return conversation();
    }

    const replyKeys = Object.keys(replies || {});
    const draft = replyKeys.length ? (replies[replyKeys[0]] || '').trim() : '';

    if (!draft) {
        logWarning('AI draft was empty.');
        return conversation();
    }

    console.log(tryBoxen(replaceWhitespace(draft), {
        title: client.names.user.display || 'You',
        padding: 0.7,
        margin: {
            top: 1, bottom: 0, left: 1, right: 1,
        },
        dimBorder: true,
    }));

    const { shouldSend } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'shouldSend',
            message: 'Send this AI-drafted message?',
            default: true,
        },
    ]);

    if (!shouldSend) {
        logWarning('Draft discarded.');
        return conversation();
    }

    await concatMessages(draft);
    showHistory();
    return generateMessage();
}

async function concatMessages(newMessages) {
    const convId = getConversationId();
    const { conversationId, messageId } = await client.addMessages(convId, newMessages, conversationData.parentMessageId, true);
    await pullFromCache();
    await setConversationData({
        conversationId,
        parentMessageId: messageId,
    });
}

async function addMessages(newMessages = null) {
    if (!newMessages) {
        const { message } = await inquirer.prompt([
            {
                type: 'editor',
                name: 'message',
                message: 'Write a message:',
                waitUserInput: false,
            },
        ]);
        newMessages = message.trim();
    }
    if (!newMessages) {
        return conversation();
    }
    await concatMessages(newMessages);
    showHistory();
    return conversation();
}

function expandHomePath(input) {
    if (!input) {
        return input;
    }
    if (input === '~') {
        return os.homedir();
    }
    if (input.startsWith('~/')) {
        return path.join(os.homedir(), input.slice(2));
    }
    return input;
}

function resolvePotentialImagePath(input) {
    if (!input) {
        return input;
    }
    const expanded = expandHomePath(input);
    return path.isAbsolute(expanded) ? expanded : path.resolve(expanded);
}

function isExistingFile(filePath) {
    if (!filePath) {
        return false;
    }
    try {
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

function detectMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.gif':
            return 'image/gif';
        case '.webp':
            return 'image/webp';
        case '.bmp':
            return 'image/bmp';
        case '.heic':
            return 'image/heic';
        case '.heif':
            return 'image/heif';
        case '.tif':
        case '.tiff':
            return 'image/tiff';
        case '.avif':
            return 'image/avif';
        default:
            return 'application/octet-stream';
    }
}

function extractImageCommandComponents(raw) {
    if (!raw) {
        return { imagePath: null, promptText: '' };
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return { imagePath: null, promptText: '' };
    }

    const quotedMatch = trimmed.match(/^(["'])([\s\S]+?)\1\s*(.*)$/);
    if (quotedMatch) {
        return {
            imagePath: quotedMatch[2]?.trim() || null,
            promptText: quotedMatch[3]?.trim() || '',
        };
    }

    const tokens = trimmed.split(/\s+/);
    const pathTokens = [];
    let imagePath = null;
    let promptTokens = [];

    for (let i = 0; i < tokens.length; i += 1) {
        pathTokens.push(tokens[i]);
        const candidateRaw = pathTokens.join(' ');
        const candidateResolved = resolvePotentialImagePath(candidateRaw);
        if (isExistingFile(candidateResolved)) {
            imagePath = candidateRaw;
            promptTokens = tokens.slice(i + 1);
        }
    }

    if (!imagePath) {
        imagePath = tokens.shift() || null;
        promptTokens = tokens;
    }

    return {
        imagePath,
        promptText: promptTokens.join(' ').trim(),
    };
}

function normalizeImageReference(raw) {
    if (!raw) {
        return '';
    }
    let normalized = raw.trim();
    if (!normalized) {
        return '';
    }
    normalized = normalized.replace(/^[([{<]+/, '').replace(/[)\]}>]+$/, '');

    const wrapChars = ['"', '\'', '`'];
    for (const ch of wrapChars) {
        if (normalized.startsWith(ch) && normalized.endsWith(ch)) {
            normalized = normalized.slice(1, -1).trim();
        }
    }

    normalized = normalized.replace(/^[([{<]+/, '').replace(/[)\]}>]+$/, '');
    normalized = normalized.replace(/[,:;!?]+$/, '');
    return normalized.trim();
}

function isLikelyImageReference(candidate) {
    if (!candidate) {
        return false;
    }
    if (/^https?:\/\//i.test(candidate)) {
        return true;
    }
    const expanded = expandHomePath(candidate);
    return path.isAbsolute(expanded);
}

function extractInlineImageReferences(message) {
    if (!message) {
        return [];
    }
    const references = new Map();

    const remember = (candidate) => {
        const normalized = normalizeImageReference(candidate);
        if (!normalized || !isLikelyImageReference(normalized)) {
            return;
        }
        if (!references.has(normalized)) {
            references.set(normalized, normalized);
        }
    };

    MARKDOWN_IMAGE_REGEX.lastIndex = 0;
    let markdownMatch = MARKDOWN_IMAGE_REGEX.exec(message);
    while (markdownMatch) {
        remember(markdownMatch[1]);
        markdownMatch = MARKDOWN_IMAGE_REGEX.exec(message);
    }

    INLINE_QUOTED_REGEX.lastIndex = 0;
    let quotedMatch = INLINE_QUOTED_REGEX.exec(message);
    while (quotedMatch) {
        remember(quotedMatch[2]);
        quotedMatch = INLINE_QUOTED_REGEX.exec(message);
    }

    for (const token of message.split(/\s+/)) {
        remember(token);
    }

    return Array.from(references.values());
}

async function createImageAttachment(imageReference, { requireAbsoluteForLocal = false } = {}) {
    const trimmed = (imageReference || '').trim();
    if (!trimmed) {
        throw new AttachmentError('No image reference provided.', 'warning');
    }

    if (/^https?:\/\//i.test(trimmed)) {
        let parsedUrl;
        try {
            parsedUrl = new URL(trimmed);
        } catch (error) {
            throw new AttachmentError(`Invalid image URL: ${error.message}`, 'error');
        }
        if (parsedUrl.protocol !== 'https:') {
            throw new AttachmentError('Image URLs must use HTTPS. Please provide a secure https:// link or a local file path.', 'warning');
        }
        const rawBaseName = path.basename(parsedUrl.pathname) || parsedUrl.hostname || 'image';
        let baseName = rawBaseName;
        try {
            baseName = decodeURIComponent(rawBaseName);
        } catch {
            baseName = rawBaseName;
        }
        const safeName = baseName || 'image';
        return {
            type: 'image',
            name: safeName,
            url: parsedUrl.toString(),
            sourceUrl: parsedUrl.toString(),
        };
    }

    const expanded = expandHomePath(trimmed);
    if (requireAbsoluteForLocal && !path.isAbsolute(expanded)) {
        throw new AttachmentError(`Image path must be absolute when using !ml: ${trimmed}`, 'warning');
    }
    const resolvedPath = resolvePotentialImagePath(trimmed);
    if (!isExistingFile(resolvedPath)) {
        throw new AttachmentError(`Image not found: ${trimmed}`, 'warning');
    }

    const mimeType = detectMimeType(resolvedPath);
    if (!mimeType.startsWith('image/')) {
        throw new AttachmentError(`The provided file is not a supported image type: ${trimmed}`, 'warning');
    }

    let fileBuffer;
    try {
        fileBuffer = await readFile(resolvedPath);
    } catch (error) {
        throw new AttachmentError(`Failed to read image file: ${error.message}`, 'error');
    }

    return {
        type: 'image',
        name: path.basename(resolvedPath),
        mimeType,
        dataUrl: `data:${mimeType};base64,${fileBuffer.toString('base64')}`,
        sourcePath: resolvedPath,
    };
}

async function collectInlineImageAttachments(message) {
    const sources = extractInlineImageReferences(message);
    if (sources.length === 0) {
        return [];
    }

    const attachments = [];
    const seen = new Set();

    for (const source of sources) {
        const isRemote = /^https?:\/\//i.test(source);
        const dedupeKey = isRemote ? source.trim().toLowerCase() : expandHomePath(source.trim());
        if (seen.has(dedupeKey)) {
            continue;
        }
        seen.add(dedupeKey);
        try {
            // eslint-disable-next-line no-await-in-loop
            const attachment = await createImageAttachment(source, {
                requireAbsoluteForLocal: !isRemote,
            });
            attachments.push(attachment);
        } catch (error) {
            if (error instanceof AttachmentError) {
                if (error.severity === 'error') {
                    logError(error.message);
                } else {
                    logWarning(error.message);
                }
            } else {
                logError(error?.message || error);
            }
        }
    }

    return attachments;
}

async function sendImageMessage(rawInput) {
    const payload = rawInput?.slice('!image'.length).trim();
    if (!payload) {
        logWarning('Usage: !image <image_path> [prompt]');
        return conversation();
    }

    const { imagePath, promptText } = extractImageCommandComponents(payload);
    if (!imagePath) {
        logWarning('Usage: !image <image_path> [prompt]');
        return conversation();
    }

    const userProvidedPrompt = promptText.length > 0;
    const promptForModel = userProvidedPrompt ? promptText : ' ';
    let attachment;
    try {
        attachment = await createImageAttachment(imagePath);
    } catch (error) {
        if (error instanceof AttachmentError) {
            if (error.severity === 'error') {
                logError(error.message);
            } else {
                logWarning(error.message);
            }
            return conversation();
        }
        throw error;
    }

    const displayText = promptForModel;

    await concatMessages([
        {
            author: client.names.user.author,
            text: displayText,
            details: {
                prompt: promptForModel,
                attachments: [attachment],
            },
        },
    ]);

    logSuccess(`Attached image ${attachment.name}${userProvidedPrompt ? ` with prompt: ${promptForModel}` : ''}`);
    showHistory();
    return generateMessage();
}

// -------- Backrooms Logs Import --------

// Backrooms import helpers moved to src/cli/backrooms.js

async function importBackroomsLogFlow(targetPath = null) {
    try {
        let filePath = targetPath;
        if (!filePath) {
            const files = getBackroomsFiles();
            if (files.length === 0) {
                logWarning('No .txt files found in import/.');
                return conversation();
            }
            const { chosen } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'chosen',
                    message: 'Select a Backrooms log to import:',
                    choices: files.map(f => ({ name: `${f.name}`, value: f.full })),
                    pageSize: Math.min(files.length * 2, 20),
                },
            ]);
            filePath = chosen;
        }
        if (!fs.existsSync(filePath)) {
            logWarning('File not found.');
            return conversation();
        }

        const raw = fs.readFileSync(filePath, 'utf8');
        const hydrated = applyTemplateVariables(raw, settings?.templateVariables);
        const msgs = parseBackroomsLog(hydrated, {
            user: client.names.user.author,
            bot: client.names.bot.author,
            system: client.names.system?.author,
        });
        if (!msgs.length) {
            logWarning('Could not parse any messages from the selected log.');
            return conversation();
        }

        // Ensure there is a conversation id
        if (!getConversationId()) {
            const newId = crypto.randomUUID();
            await setConversationData({ conversationId: newId, parentMessageId: null });
        }

        await concatMessages(msgs);
        logSuccess(`Imported ${msgs.length} messages from ${path.basename(filePath)}.`);
        showHistory();
        return conversation();
    } catch (err) {
        logError(`Import failed: ${err?.message || err}`);
        return conversation();
    }
}

async function promptEditorForMessage(messagePrompt = 'Write a message:', defaultValue = '') {
    const { message } = await inquirer.prompt([
        {
            type: 'editor',
            name: 'message',
            message: messagePrompt,
            default: defaultValue,
            waitUserInput: false,
        },
    ]);
    if (typeof message !== 'string') {
        return '';
    }
    return message.trim();
}

async function useEditorPlain() {
    const message = await promptEditorForMessage();
    if (!message) {
        return conversation();
    }
    await concatMessages(message);
    showHistory();
    return generateMessage();
}

async function useEditor() {
    const message = await promptEditorForMessage();
    if (!message) {
        return conversation();
    }

    const attachments = await collectInlineImageAttachments(message);
    if (attachments.length > 0) {
        await concatMessages([
            {
                author: client.names.user.author,
                text: message,
                details: {
                    attachments,
                },
            },
        ]);
        logSuccess(`Attached ${attachments.length} image attachment${attachments.length > 1 ? 's' : ''} from message.`);
    } else {
        await concatMessages(message);
    }
    showHistory();
    return generateMessage();
}

async function editMessage(messageId, args = null) {
    const [pathIndex, branchIndex] = args;
    // const currentMessage = await getCurrentMessage();
    const targetMessage = getMessageByIndex(pathIndex, branchIndex);
    if (!targetMessage) {
        logWarning('Message not found.');
        return conversation();
    }
    const initialMessage = targetMessage.message;
    // console.log(initialMessage);
    let { message } = await inquirer.prompt([
        {
            type: 'editor',
            name: 'message',
            message: 'Edit the message:',
            default: initialMessage,
            waitUserInput: true,
        },
    ]);
    message = message.trim();
    if (!message) {
        logWarning('Message empty.');
        return conversation();
    }
    if (message === initialMessage) {
        logWarning('Message unchanged.');
        return conversation();
    }
    const editedMessage = {
        ...targetMessage,
        message,
        id: crypto.randomUUID(),
    };
    await addMessage(editedMessage);

    logSuccess(`Cloned and edited message ${messageId}.`);

    return selectMessage(editedMessage.id);
}

async function mergeUp() {
    // const messages = await conversationMessages();
    const currentMessage = getCurrentMessage();
    const parentMessage = getParent(localConversation.messages, currentMessage.id);
    if (!parentMessage) {
        logWarning('No parent message.');
        return conversation();
    }
    const newMessage = {
        ...parentMessage,
        message: `${parentMessage.message}${currentMessage.message}`,
        id: crypto.randomUUID(),
    };
    await addMessage(newMessage);
    logSuccess(`Merged message ${currentMessage.id} into parent message ${parentMessage.id} and created new message ${newMessage.id}.`);
    return selectMessage(newMessage.id);
}

async function saveConversationState(name = null, data = conversationData) {
    if (!name) {
        if (currentLoadedSave) {
            name = currentLoadedSave;
            logSuccess(`Auto-saving to currently loaded save: ${name}`);
        } else {
            const { conversationName } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'conversationName',
                    message: 'Enter a name for the savepoint:',
                },
            ]);
            name = conversationName;
        }
    }
    if (!name) {
        logWarning('No conversation name.');
        return conversation();
    }

    const existingStates = await listSaveStates();
    const existingState = await findSaveState(name);
    if (existingState) {
        const { overwrite } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'overwrite',
                message: 'A savepoint with this name already exists. Do you want to overwrite it?',
                default: false,
            },
        ]);
        if (!overwrite) {
            return conversation();
        }
    }

    const conversationId = getConversationId(data);
    const conversationState = conversationId
        ? await client.conversationsCache.get(conversationId)
        : null;
    const summary = summarizeConversation(conversationState) || conversationId;

    const slug = existingState
        ? existingState.slug
        : await generateUniqueSlug(name, existingStates);

    const { relativePath } = await writeSaveState({
        name,
        slug,
        conversationData: data,
        conversation: conversationState,
        summary,
    });

    // Maintain in-memory cache for immediate use and backwards compatibility.
    await client.conversationsCache.set(name, data);
    if (conversationId && conversationState) {
        await client.conversationsCache.set(conversationId, conversationState);
    }
    const refreshedStates = await listSaveStates();
    await client.conversationsCache.set('savedConversations', refreshedStates.map(state => state.name));

    // Update current loaded save to track this save
    currentLoadedSave = name;

    logSuccess(`Saved state as "${name}" → ${relativePath}`);
    return conversation();
}

async function applySavedState(savedState) {
    const {
        conversationData: savedConversationData,
        conversation: savedConversation,
        name,
        relativePath,
        filePath,
    } = savedState;
    if (!savedConversationData) {
        logWarning('Saved state is missing conversation data.');
        return conversation();
    }
    const conversationId = getConversationId(savedConversationData);
    if (!conversationId) {
        logWarning('Saved state does not include a conversation id.');
        return conversation();
    }

    if (savedConversation) {
        await client.conversationsCache.set(conversationId, savedConversation);
    }
    await client.conversationsCache.set(name, savedConversationData);
    const currentStates = await listSaveStates();
    await client.conversationsCache.set('savedConversations', currentStates.map(state => state.name));

    await setConversationData({
        ...savedConversationData,
        conversationId,
    });

    // Update current loaded save to track this save
    currentLoadedSave = name;

    const location = relativePath || (filePath ? path.relative(process.cwd(), filePath) : name);
    logSuccess(`Resumed ${conversationId} from ${location}.`);
    showHistory();
    return conversation();
}

async function loadConversationState(name = 'lastConversation') {
    const savedState = await findSaveState(name);
    if (savedState) {
        return applySavedState(savedState);
    }

    const data = (await client.conversationsCache.get(name)) || {};
    const conversationId = getConversationId(data);

    if (conversationId) {
        await setConversationData({
            ...data,
            conversationId,
        });

        // Update current loaded save to track this save (legacy cache-based load)
        currentLoadedSave = name;

        logSuccess(`Resumed ${conversationId} at ${name}.`);
        showHistory();
        return conversation();
    }
    logWarning('Conversation not found.');
    return conversation();
}

async function systemPromptSelection(name = null) {
    // Get list of .txt files in contexts directory (excluding files subdirectory)
    const getContextFiles = () => {
        try {
            const files = fs.readdirSync(CONTEXTS_DIR)
                .filter(file => file.endsWith(CONTEXT_EXTENSION)
                    && !fs.statSync(path.join(CONTEXTS_DIR, file)).isDirectory())
                .map(file => ({
                    name: file.replace(CONTEXT_EXTENSION, ''),
                    filename: file,
                    fullPath: path.join(CONTEXTS_DIR, file),
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

            return files;
        } catch (error) {
            console.error('Error reading contexts directory:', error.message);
            return [];
        }
    };

    const contextFiles = getContextFiles();

    if (contextFiles.length === 0) {
        logWarning('No context files found in ./contexts directory.');
        return conversation();
    }

    if (name) {
        // If name is provided, try to load that specific context
        const targetFile = contextFiles.find(file => file.name === name);
        if (!targetFile) {
            logWarning(`Context file "${name}" not found.`);
            return conversation();
        }

        // Load and apply the context
        try {
            const contextContent = fs.readFileSync(targetFile.fullPath, 'utf8');

            // Update the system message in settings
            settings.cliOptions.openRouterOptions.messageOptions.systemMessage = contextContent;
            settings.cliOptions.claudeOptions.messageOptions.systemMessage = contextContent;

            logSuccess(`Loaded system prompt: ${name}`);
            console.log(`\nContext preview (first 200 chars):\n${contextContent.slice(0, 200)}${contextContent.length > 200 ? '...' : ''}\n`);
        } catch (error) {
            logWarning(`Error loading context file: ${error.message}`);
        }

        return conversation();
    }

    // Show selection menu
    const { selectedContext } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedContext',
            message: 'Select a system prompt:',
            choices: contextFiles.map(file => ({
                name: `${file.name}`,
                value: file.name,
            })),
            pageSize: Math.min(contextFiles.length, 20),
        },
    ]);

    if (!selectedContext) {
        logWarning('No context selected.');
        return conversation();
    }

    // Apply the selected context recursively
    return systemPromptSelection(selectedContext);
}

async function loadSavedState(name = null) {
    const states = await listSaveStates();
    if (states.length > 0) {
        await client.conversationsCache.set('savedConversations', states.map(state => state.name));

        if (name) {
            const target = await findSaveState(name);
            if (!target) {
                logWarning(`Saved conversation "${name}" not found.`);
                return conversation();
            }
            return applySavedState(target);
        }

        const { selectedState } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedState',
                message: 'Select a conversation to load:',
                choices: states.map(state => ({
                    name: formatSaveChoiceLabel(state),
                    value: state.name,
                })),
                pageSize: Math.min(states.length * 2, 20),
            },
        ]);
        if (!selectedState) {
            logWarning('No conversation name.');
            return conversation();
        }
        const target = states.find(state => state.name === selectedState);
        if (!target) {
            logWarning('Saved conversation not found.');
            return conversation();
        }
        return applySavedState(target);
    }

    // Fallback: legacy cache-only saves.
    const savedConversations = await client.conversationsCache.get('savedConversations') || [];
    if (savedConversations.length === 0) {
        logWarning('No saved conversations.');
        return conversation();
    }
    if (!name) {
        const { conversationName } = await inquirer.prompt([
            {
                type: 'list',
                name: 'conversationName',
                message: 'Select a conversation to load:',
                choices: savedConversations,
                pageSize: Math.min(savedConversations.length * 2, 20),
            },
        ]);
        name = conversationName;
    }
    if (!name) {
        logWarning('No conversation name.');
        return conversation();
    }
    return loadConversationState(name);
}

async function loadConversation(conversationId) {
    const cachedConversation = await client.conversationsCache.get(conversationId);
    const messageList = cachedConversation?.messages || [];
    if (messageList.length === 0) {
        logWarning('Conversation not found.');
        return conversation();
    }

    const lastMessageId = messageList[messageList.length - 1]?.id || null;

    await setConversationData({
        conversationId,
        parentMessageId: lastMessageId,
    });

    logSuccess(`Resumed conversation ${conversationId}.`);
    showHistory();
    return conversation();
}

async function exportConversation(conversationId = null) {
    if (!conversationId) {
        conversationId = getConversationId();
    }
    if (!conversationId) {
        logWarning('No conversation id.');
        return conversation();
    }
    const conversationDict = await client.conversationsCache.get(conversationId);
    if (!conversationDict) {
        logWarning('Conversation not found.');
        return conversation();
    }
    conversationDict.id = conversationId;
    // const savedStates = await getSavedStatesForConversation(conversationId);
    // conversationDict.savedStates = savedStates;

    // prompt for filename
    const { name } = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Enter a filename:',
            default: `${conversationId}`,
        },
    ]);

    const filename = `${name}.json`;
    const filePath = `./${filename}`;
    fs.writeFileSync(filePath, JSON.stringify(conversationDict, null, 2));
    logSuccess(`Exported conversation to ${filename}.`);
    return conversation();
}

async function newConversation() {
    conversationData = settings.cliOptions?.conversationData || settings.conversationData || {};
    localConversation.messages = [];
    currentLoadedSave = null; // Reset current loaded save for new conversation
    logSuccess('Started new conversation.');
    return conversation();
}

function getConversationHistoryString() {
    const messageHistory = getHistory();
    if (!messageHistory) {
        return null;
    }
    return client.toTranscript(messageHistory);
}

function isNumeric(value) {
    return /^-?\d+$/.test(value);
}

async function printOrCopyData(action, args = null) {
    if (action !== 'print' && action !== 'copy') {
        logWarning('Invalid action.');
        return conversation();
    }
    let type = null;
    // get first arg that isn't a number and isn't '.'
    if (!args) {
        args = [];
    }
    type = args.find(a => !isNumeric(a));
    // remove type from args
    args = args.filter(a => a !== type);

    if (type === '?' || !type) {
        const { dataType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'dataType',
                message: 'Select a data type:',
                choices: [
                    'text',
                    'response',
                    'responseText',
                    'settings',
                    'transcript',
                    'message',
                    'messages',
                    'messageHistory',
                    'eventLog',
                    'conversationData',
                ],
            },
        ]);
        type = dataType;
    } else if (type === '.') {
        type = 'text';
    }
    const [index, branchIndex] = args;

    const targetMessage = getMessageByIndex(index, branchIndex);
    if (!targetMessage) {
        logWarning('Current message not found.');
        return conversation();
    }
    // if (type === null) {
    //     logWarning('No data type.');
    //     return conversation();
    // }
    let data;
    // let currentMessage;
    switch (type) {
        case 'text':
            data = targetMessage.message;
            break;
        case 'response':
            data = responseData;
            break;
        case 'responseText':
            data = responseData.response?.response || responseData.response;
            break;
        case 'eventLog':
            data = responseData.eventLog;
            break;
        case 'conversationData':
            data = conversationData;
            break;
        case 'transcript':
            data = getConversationHistoryString();
            break;
        case 'message':
            data = targetMessage;
            break;
        case 'messages':
            data = localConversation.messages;
            break;
        case 'messageHistory':
            data = getHistory();
            break;
        case 'settings':
            // console.log(`client: ${clientToUse}`);
            // console.log(`\nsettings:\n${JSON.stringify(clientOptions, null, 2)}`);
            data = {
                clientToUse,
                clientOptions,
            };
            break;
        default:
            logWarning('Invalid data type.');
            return conversation();
    }

    if (action === 'print') {
        if (typeof data === 'string') {
            console.log(data);
        } else {
            console.log(JSON.stringify(data, null, 2));
        }
    }
    if (action === 'copy') {
        try {
            const dataString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

            if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland') {
                const wlCopy = spawn('wl-copy', { stdio: 'pipe' });
                wlCopy.stdin.write(dataString);
                wlCopy.stdin.end();
                wlCopy.on('close', (code) => {
                    if (code === 0) {
                        logSuccess(`Copied ${type} to clipboard.`);
                    } else {
                        logError(`Failed to copy ${type}. Exit code: ${code}`);
                    }
                });
            } else {
                await clipboard.write(dataString);
            }

            logSuccess(`Copied ${type} to clipboard.`);
        } catch (error) {
            logError(error?.message || error);
        }
    }
    return conversation();
}

/**
 * Boxen can throw an error if the input is malformed, so this function wraps it in a try/catch.
 * @param {string} input
 * @param {*} options
 */
// tryBoxen moved to src/cli/boxen.js

function aiMessageBox(message, title = null) {
    // Ensure message is properly handled for terminal display
    const cleanMessage = String(message || '').trim();

    // Check if this is complex content that needs special handling (including stored ANSI format)
    const hasComplexFormatting = cleanMessage.includes('\u001b[') || cleanMessage.includes('[3') || cleanMessage.includes('█') || cleanMessage.includes('▓') || cleanMessage.includes('≋');

    return tryBoxen(cleanMessage, {
        title: title || getAILabel(),
        padding: hasComplexFormatting ? 0.5 : 0.7,
        margin: {
            top: 1, bottom: 0, left: 1, right: 1,
        },
        dimBorder: true,
        // Let tryBoxen calculate proper width for complex content
        width: hasComplexFormatting ? undefined : (Math.min(80, process.stdout.columns - 4) || 76),
    });
}

function conversationStart() {
    console.log(conversationStartBox(getConversationId()));
}

function historyBoxes() {
    const messageHistory = getHistory();
    return renderHistoryBoxes(messageHistory, {
        messages: localConversation.messages,
        getAILabel,
        userDisplay: client.names.user.display,
    });
}

function slugifyForFilename(input, fallback = 'message') {
    const normalized = String(input ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || fallback;
}

function ensureUniquePath(targetPath) {
    if (!existsSync(targetPath)) {
        return targetPath;
    }
    const parsed = path.parse(targetPath);
    let counter = 1;
    let candidate = path.join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
    while (existsSync(candidate)) {
        counter += 1;
        candidate = path.join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
    }
    return candidate;
}

function getRenderConfig() {
    const configSource = settings?.config?.rendering;
    const cliSource = settings?.cliOptions?.rendering;
    if (configSource && cliSource) {
        return {
            ...configSource,
            ...cliSource,
        };
    }
    return configSource || cliSource || {};
}

async function runCommand(command, args, { inheritStdio = false } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: inheritStdio ? 'inherit' : ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        if (!inheritStdio) {
            if (child.stdout) {
                child.stdout.on('data', (chunk) => {
                    stdout += chunk.toString();
                });
            }
            if (child.stderr) {
                child.stderr.on('data', (chunk) => {
                    stderr += chunk.toString();
                });
            }
        }
        child.on('error', (error) => {
            if (!inheritStdio && stderr) {
                error.stderr = stderr;
            }
            reject(error);
        });
        child.on('exit', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                const error = new Error(`${command} exited with code ${code}`);
                error.code = code;
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
            }
        });
    });
}

async function runWeztermCommand(args, { inheritStdio = false } = {}) {
    const renderConfig = getRenderConfig();
    const weztermExecutable = renderConfig.weztermExecutable || 'wezterm';
    return runCommand(weztermExecutable, args, { inheritStdio });
}

async function detectWeztermPaneId(titleHint = null) {
    try {
        const { stdout } = await runWeztermCommand(['cli', 'list', '--format', 'json']);
        const panes = JSON.parse(stdout);
        if (!Array.isArray(panes) || panes.length === 0) {
            return null;
        }
        const normalizedHint = typeof titleHint === 'string' ? titleHint.toLowerCase() : null;
        if (normalizedHint) {
            const hinted = panes.find(pane => pane?.title?.toLowerCase?.().includes(normalizedHint));
            if (hinted?.pane_id) {
                return String(hinted.pane_id);
            }
        }
        const zellijPane = panes.find(pane => pane?.title?.toLowerCase?.().includes('zellij'));
        if (zellijPane?.pane_id) {
            return String(zellijPane.pane_id);
        }
        const fallbackPane = panes.find(pane => pane?.pane_id);
        return fallbackPane ? String(fallbackPane.pane_id) : null;
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw error;
        }
        return null;
    }
}

async function renderLastMessage(rawArgs = []) {
    const messageHistory = getHistory();
    if (!messageHistory || messageHistory.length === 0) {
        logWarning('No messages available to render.');
        return conversation();
    }

    const args = Array.isArray(rawArgs) ? rawArgs.slice(1) : [];
    let customSlug = null;
    let customDir = null;
    let customOutput = null;
    let interactiveMode = false;
    let windowMode = false;
    let htmlMode = false;

    for (let index = 0; index < args.length; index += 1) {
        const option = args[index];
        if (!option) {
            continue;
        }
        if (option === '--dir') {
            customDir = args[index + 1];
            index += 1;
            continue;
        }
        if (option.startsWith('--dir=')) {
            customDir = option.slice('--dir='.length);
            continue;
        }
        if (option === '--output') {
            customOutput = args[index + 1];
            index += 1;
            continue;
        }
        if (option.startsWith('--output=')) {
            customOutput = option.slice('--output='.length);
            continue;
        }
        if (option === '--interactive' || option === '-i') {
            interactiveMode = true;
            continue;
        }
        if (option === '--window' || option === '-w') {
            windowMode = true;
            continue;
        }
        if (option === '--html') {
            htmlMode = true;
            continue;
        }
        if (!customSlug && !option.startsWith('--')) {
            customSlug = option;
            continue;
        }
    }

    const renderConfig = getRenderConfig();
    const baseDirSetting = customDir ?? renderConfig.outputDir ?? './renders';
    const resolvedDir = path.isAbsolute(baseDirSetting)
        ? baseDirSetting
        : path.resolve(baseDirSetting);

    try {
        await mkdir(resolvedDir, { recursive: true });
    } catch (error) {
        logError(`Failed to prepare render directory: ${error.message}`);
        return conversation();
    }

    const lastMessage = messageHistory[messageHistory.length - 1];
    const roleSlug = slugifyForFilename(lastMessage.role || 'message', 'message');
    const messagePreview = slugifyForFilename(lastMessage.message?.slice?.(0, 32) || '', roleSlug);
    const slug = customSlug ? slugifyForFilename(customSlug) : `${roleSlug}-${messagePreview}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suggestedPath = path.join(resolvedDir, `${timestamp}-${slug}.png`);

    let resolvedOutputPath = suggestedPath;
    if (customOutput) {
        resolvedOutputPath = path.isAbsolute(customOutput)
            ? customOutput
            : path.resolve(customOutput);
    }

    try {
        await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    } catch (error) {
        logError(`Failed to prepare output directory: ${error.message}`);
        return conversation();
    }

    const outputPath = ensureUniquePath(resolvedOutputPath);

    const displayContext = {
        messages: localConversation.messages,
        getAILabel,
        userDisplay: client.names.user.display,
    };
    const renderedBox = conversationMessageBox(lastMessage, displayContext, messageHistory.length - 1);
    if (renderConfig.echo !== false) {
        console.log(renderedBox);
    }

    // HTML mode - generate HTML file instead of screenshot
    if (htmlMode) {
        const convert = new Convert({
            fg: '#FFF',
            bg: '#000',
            newline: true,
            escapeXML: true,
        });

        const htmlContent = convert.toHtml(renderedBox);
        const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CLooI Render - ${lastMessage.role}</title>
    <style>
        body {
            background-color: #000;
            color: #fff;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 14px;
            line-height: 1.2;
            margin: 20px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .container {
            max-width: 100%;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <div class="container">
${htmlContent}
    </div>
</body>
</html>`;

        const htmlOutputPath = outputPath.replace(/\.png$/, '.html');

        try {
            await writeFile(htmlOutputPath, htmlTemplate, 'utf8');
            const relativePath = path.relative(process.cwd(), htmlOutputPath);
            logSuccess(`HTML render saved to ${relativePath}`);

            // Try to open in browser
            const openCommand = process.platform === 'darwin' ? 'open' :
                               process.platform === 'win32' ? 'start' : 'xdg-open';
            try {
                await runCommand(openCommand, [htmlOutputPath]);
                logSuccess('Opened in browser');
            } catch (error) {
                logWarning(`Could not auto-open browser: ${error.message}`);
            }

        } catch (error) {
            logError(`Failed to save HTML file: ${error.message}`);
        }

        return conversation();
    }

    // Build screencapture command
    const screencaptureArgs = [
        '-x', // no sounds
        '-t', 'png', // PNG format
    ];

    if (interactiveMode) {
        screencaptureArgs.push('-i'); // interactive mode
    } else if (windowMode) {
        screencaptureArgs.push('-w'); // window selection mode
    } else {
        // Default: try to capture the active window
        screencaptureArgs.push('-w');
    }

    screencaptureArgs.push(outputPath);

    logSuccess(`Taking screenshot... ${interactiveMode ? 'Select area or window.' : windowMode ? 'Click on window to capture.' : 'Capturing active window.'}`);

    try {
        await runCommand('screencapture', screencaptureArgs);
    } catch (error) {
        if (error.code === 'ENOENT') {
            logError('screencapture command not found. This feature requires macOS.');
        } else if (error.stderr) {
            logError(`Failed to capture screenshot: ${error.stderr.trim() || error.message}`);
        } else {
            logError(`Failed to capture screenshot: ${error.message}`);
        }
        return conversation();
    }

    const relativePath = path.relative(process.cwd(), outputPath);
    logSuccess(`Screenshot saved to ${relativePath}`);
    return conversation();
}

function showHistory() {
    const boxes = historyBoxes();
    if (boxes) {
        conversationStart();
        const { systemMessage } = clientOptions.messageOptions;
        if (systemMessage) {
            console.log(systemMessageBox(systemMessage));
        }
        let suggestions = '';
        const targetMessage = getMessageByIndex();
        const suggestedUserMessages = client.constructor.getUserSuggestions(targetMessage?.details?.message);
        if (suggestedUserMessages && suggestedUserMessages.length > 0) {
            suggestions = `\n${suggestionsBoxes(suggestedUserMessages)}`;
        }
        console.log(`${boxes}${suggestions}`);
    }
    pushToCache();
    // return conversation();
}

function getAILabel() {
    return client.names.bot.display || 'Assistant';
}

function getConversationId(data = conversationData) {
    return getCid(data);
}

function getCurrentMessage() {
    if (!conversationData?.parentMessageId) {
        // logWarning('No message id.');
        return [];
    }
    const messages = getHistory();
    return messages.find(message => message.id === conversationData.parentMessageId);
}

async function getCachedConversation() {
    if (!conversationData?.parentMessageId) {
        // logWarning('No message id.');
        return [];
    }
    const cachedConversation = await client.conversationsCache.get(getConversationId());
    return cachedConversation;
}

async function pullFromCache() {
    localConversation = await getCachedConversation();
}

async function pushToCache() {
    if (!localConversation || !getConversationId()) {
        return;
    }
    await client.conversationsCache.set(getConversationId(), localConversation);
}

function getHistory() {
    // const messages = await conversationMessages();
    if (!conversationData.parentMessageId) {
        // logWarning('No parent message id.');
        return [];
    }

    const messageHistory = getMessagesForConversation(localConversation.messages, conversationData.parentMessageId);

    return messageHistory;
}
