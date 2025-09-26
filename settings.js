import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { loadModelPresets, getDefaultModelAlias } from "./src/modelPresets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTEXT_FILES_DIR = path.resolve(__dirname, "contexts", "files");

const { models, globals } = loadModelPresets();
const defaultModelAlias = getDefaultModelAlias() || "opus4";
const defaultModel = models[defaultModelAlias] || {};
const claudeModelAlias = defaultModel?.company === "anthropic"
  ? defaultModelAlias
  : (getDefaultModelAlias("anthropic") || defaultModelAlias);
const openRouterModelAlias = defaultModel?.company === "openrouter"
  ? defaultModelAlias
  : (getDefaultModelAlias("openrouter") || defaultModelAlias);
const defaultClientToUse = defaultModel?.company === "anthropic" ? "claude" : "openrouter";

const templateVariables = resolveTemplateVariables({
  model1_company: defaultModel?.company || "openrouter",
  recurring_characters: "@file:recurring_characters.json",
});

function resolveTemplateVariables(variables) {
  return Object.entries(variables).reduce((resolved, [key, value]) => {
    if (typeof value === "string" && value.startsWith("@file:")) {
      const fileName = value.slice("@file:".length).trim();
      const filePath = path.resolve(CONTEXT_FILES_DIR, fileName);
      resolved[key] = fs.readFileSync(filePath, "utf8");
    } else {
      resolved[key] = value;
    }
    return resolved;
  }, {});
}

function applyTemplateVariables(template) {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
    if (key in templateVariables) {
      return templateVariables[key];
    }
    return match;
  });
}

function loadContextTemplate(relativePath) {
  const absolutePath = path.resolve(__dirname, relativePath);
  const template = fs.readFileSync(absolutePath, "utf8");
  return applyTemplateVariables(template);
}

export default {
  templateVariables,
  // Cache settings (kept minimal). If namespace is null, it uses clientToUse
  cacheOptions: {
    namespace: null,
  },
  // Persist conversations to a JSON file (optional)
  storageFilePath: process.env.STORAGE_FILE_PATH || "./cache.json",

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
        // If you set globals.max_tokens in model_presets.json this can be omitted
        max_tokens: globals?.max_tokens ?? 4096,
      },
      messageOptions: {
        // Keep or point to your preferred system prompt
        systemMessage: loadContextTemplate("./contexts/dreamsim2.txt"),
        //systemMessage: ""
      },
    },
    claudeOptions: {
      modelOptions: {
        temperature: 1,
        max_tokens: globals?.max_tokens ?? 4096,
        stream: true,
      },
      messageOptions: {
        systemMessage: loadContextTemplate("./contexts/dreamsim2.txt"),
      },
    },
  },

  // OpenRouter client configuration
  openrouterClient: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    completionsUrl: "https://openrouter.ai/api/v1/chat/completions",
    debug: false,
  },
  claudeClient: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    completionsUrl: "https://api.anthropic.com/v1/messages",
    debug: false,
    modelAlias: claudeModelAlias,
  },
  // Backwards/compat casing used by some utilities
  openRouterClient: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    completionsUrl: "https://openrouter.ai/api/v1/chat/completions",
    debug: false,
    modelAlias: openRouterModelAlias,
  },

  // API server options (if you run the server)
  apiOptions: {
    port: process.env.API_PORT || 3000,
    host: process.env.API_HOST || "localhost",
    debug: false,
    clientToUse: defaultClientToUse,
    generateTitles: false,
    perMessageClientOptionsWhitelist: {
      // Allow switching between built-in clients by default
      validClientsToUse: ["openrouter", "claude"],
    },
  },
};
