import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadModelPresets, getDefaultModelAlias } from './src/modelPresets.js';
import applyTemplateVariables from './src/utils/templateVars.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const CONTEXT_FILES_DIR = path.resolve(moduleDirname, 'contexts', 'files');
const CONFIG_FILE_PATH = path.resolve(moduleDirname, 'config.json');

const { models } = loadModelPresets();
const fallbackModelAlias = getDefaultModelAlias() || 'opus4';
const userConfig = loadConfigFile(CONFIG_FILE_PATH);
const configuredModelAlias = userConfig?.model && models[userConfig.model]
    ? userConfig.model
    : null;
const defaultModelAlias = configuredModelAlias || fallbackModelAlias;
const defaultModel = models[defaultModelAlias] || {};
const claudeModelAlias = defaultModel?.company === 'anthropic'
    ? defaultModelAlias
    : (getDefaultModelAlias('anthropic') || defaultModelAlias);
const openRouterModelAlias = defaultModel?.company === 'openrouter'
    ? defaultModelAlias
    : (getDefaultModelAlias('openrouter') || defaultModelAlias);
const defaultClientToUse = defaultModel?.company === 'anthropic' ? 'claude' : 'openrouter';

const configTemplateVariables = isPlainObject(userConfig?.vars) ? userConfig.vars : {};
const templateVariables = resolveTemplateVariables(configTemplateVariables);

const systemMessage = resolveSystemMessage(userConfig?.context);
const parsedMaxTokens = Number(userConfig?.maxTokens);
const maxTokens = Number.isFinite(parsedMaxTokens)
    ? parsedMaxTokens
    : 4096;

function loadConfigFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return isPlainObject(parsed) ? parsed : {};
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn(`Failed to read config.json: ${error.message}`);
        }
        return {};
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveTemplateVariables(variables) {
    return Object.entries(variables).reduce((resolved, [key, value]) => {
        if (typeof value === 'string' && value.startsWith('@file:')) {
            const fileName = value.slice('@file:'.length).trim();
            const filePath = path.resolve(CONTEXT_FILES_DIR, fileName);
            resolved[key] = fs.readFileSync(filePath, 'utf8');
        } else {
            resolved[key] = value;
        }
        return resolved;
    }, {});
}

function loadContextTemplate(relativePath) {
    const absolutePath = path.resolve(moduleDirname, relativePath);
    const template = fs.readFileSync(absolutePath, 'utf8');
    return applyTemplateVariables(template, templateVariables);
}

function resolveSystemMessage(contextSlug) {
    if (!contextSlug) {
        return '';
    }
    const relativePath = `./contexts/${contextSlug}.txt`;
    try {
        return loadContextTemplate(relativePath);
    } catch (error) {
        console.warn(`Failed to load context template "${contextSlug}": ${error.message}`);
        return '';
    }
}

export default {
    config: userConfig,
    maxTokens,
    templateVariables,
    // Cache settings (kept minimal). If namespace is null, it uses clientToUse
    cacheOptions: {
        namespace: null,
    },
    // Persist conversations to a JSON file (optional)
    storageFilePath: process.env.STORAGE_FILE_PATH || './cache.json',

    // CLI options
    cliOptions: {
        clientToUse: defaultClientToUse,

        // Minimal toggles
        showSuggestions: false,
        showSearches: false,
        conversationData: {},

        // OpenRouter model + message options
        openRouterOptions: {
            modelOptions: {
                temperature: 1,
                stream: true,
                max_tokens: maxTokens,
            },
            messageOptions: {
                // Keep or point to your preferred system prompt
                systemMessage,
            },
        },
        claudeOptions: {
            modelOptions: {
                temperature: 1,
                max_tokens: maxTokens,
                max_output_tokens: maxTokens,
                stream: true,
            },
            messageOptions: {
                systemMessage,
            },
        },
    },

    // OpenRouter client configuration
    openrouterClient: {
        apiKey: process.env.OPENROUTER_API_KEY || '',
        completionsUrl: 'https://openrouter.ai/api/v1/chat/completions',
        debug: false,
    },
    claudeClient: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        completionsUrl: 'https://api.anthropic.com/v1/messages',
        debug: false,
        modelAlias: claudeModelAlias,
    },
    // Backwards/compat casing used by some utilities
    openRouterClient: {
        apiKey: process.env.OPENROUTER_API_KEY || '',
        completionsUrl: 'https://openrouter.ai/api/v1/chat/completions',
        debug: false,
        modelAlias: openRouterModelAlias,
    },

    // API server options (if you run the server)
    apiOptions: {
        port: process.env.API_PORT || 3000,
        host: process.env.API_HOST || 'localhost',
        debug: false,
        clientToUse: defaultClientToUse,
        generateTitles: false,
        perMessageClientOptionsWhitelist: {
            // Allow switching between built-in clients by default
            validClientsToUse: ['openrouter', 'claude'],
        },
    },
};
