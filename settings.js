import dotenv from "dotenv";
import * as fs from "fs";
import { MODEL_INFO, getClientConfig, getModelConfig } from "./modelPresets.js";

// Load environment variables from .env file
dotenv.config();

const selectedModel = "gemini-2-flash"; // Default model - Using full model name
const modelConfig = getModelConfig(selectedModel);

// Get default models for each client type
const defaultClaudeModel = "sonnet-37";
const defaultGPTModel = "gpt-4o";
const defaultGeminiModel = "gemini-2-flash"; // Using full model name

export default {
  // Options for the Keyv cache, see https://www.npmjs.com/package/keyv.
  // This is used for storing conversations, and supports additional drivers (conversations are stored in memory by default).
  cacheOptions: {
    namespace: null, // if namespace is null, it will use the clientToUse
  },
  // If set, chat clients will use `keyv-file` to store conversations to this JSON file instead of in memory.
  // However, `cacheOptions.store` will override this if set
  storageFilePath: process.env.STORAGE_FILE_PATH || "./cache.json",
  // Options for the CLI app
  cliOptions: {
    // Possible options:
    // "bing" (copilot 'API')
    // "infrastruct" (openai completions API)
    // "claude" (anthropic API)
    // "chatgpt" (openai chat API)
    // "ollama"
    // "openrouter"
    clientToUse: modelConfig.clientType,

    showSuggestions: true, // only implemented for Bing
    showSearches: false, // not implemented yet
    conversationData: {},

    // Model-specific options
    claudeOptions:
      modelConfig.company === "anthropic" ? modelConfig.defaultOptions : {},
    chatGptOptions:
      modelConfig.company === "openai" ? modelConfig.defaultOptions : {},
    bingOptions:
      modelConfig.company === "microsoft" ? modelConfig.defaultOptions : {},
  },
  bingAiClient: {
    // Necessary for some people in different countries, e.g. China (https://cn.bing.com)
    host: "",
    // The "_U" cookie value from bing.com
    userToken: "",
    // If the above doesn't work, provide all your cookies as a string instead
    cookies: process.env.BING_COOKIES || "",

    // A proxy string like "http://<ip>:<port>"
    proxy: "",
    // (Optional) Set 'x-forwarded-for' for the request. You can use a fixed IPv4 address or specify a range using CIDR notation,
    // and the program will randomly select an address within that range. The 'x-forwarded-for' is not used by default now.
    // xForwardedFor: '13.104.0.0/14',
    // (Optional) Set 'genImage' to true to enable bing to create images for you. It's disabled by default.
    // features: {
    //     genImage: true,
    // },
    debug: false,
  },

  chatGptClient: getClientConfig(defaultGPTModel),
  openrouterClient: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    completionsUrl: "https://openrouter.ai/api/v1/chat/completions",
    debug: false,
  },
  infrastructClient: {
    apiKey: process.env.OPENAI_API_KEY || "",
    completionsUrl: "https://api.openai.com/v1/completions",
    debug: false,
  },
  claudeClient: getClientConfig(defaultClaudeModel),
  geminiClient: getClientConfig(defaultGeminiModel), // Added Gemini client config
  ollamaClient: {},
  chatGptBrowserClient: {
    // (Optional) Support for a reverse proxy for the conversation endpoint (private API server).
    // Warning: This will expose your access token to a third party. Consider the risks before using this.
    reverseProxyUrl: "https://bypass.churchless.tech/api/conversation",
    // Access token from https://chat.openai.com/api/auth/session
    accessToken: "",
    // Cookies from chat.openai.com (likely not required if using reverse proxy server).
    cookies: "",
    // A proxy string like "http://<ip>:<port>"
    proxy: "",
    // (Optional) Set to true to enable `console.debug()` logging
    debug: false,
    // (Optional) Possible options: "chatgpt", "chatgpt-browser", "bing". (Default: "chatgpt")
    clientToUse: modelConfig.clientType, // This will now correctly be 'gemini' by default
    // (Optional) Generate titles for each conversation for clients that support it (only ChatGPTClient for now).
    // This will be returned as a `title` property in the first response of the conversation.
    generateTitles: false,
    // (Optional) Set this to allow changing the client or client options in POST /conversation.
    // To disable, set to `null`.
    perMessageClientOptionsWhitelist: {
      // The ability to switch clients using `clientOptions.clientToUse` will be disabled if `validClientsToUse` is not set.
      // To allow switching clients per message, you must set `validClientsToUse` to a non-empty array.
      validClientsToUse: [
        "bing",
        "chatgpt",
        "chatgpt-browser",
        "infrastruct",
        "claude",
        "gemini",
      ], // Added 'gemini' to valid clients
      // The Object key, e.g. "chatgpt", is a value from `validClientsToUse`.
      // If not set, ALL options will be ALLOWED to be changed. For example, `bing` is not defined in `perMessageClientOptionsWhitelist` above,
      // so all options for `bingAiClient` will be allowed to be changed.
      // If set, ONLY the options listed here will be allowed to be changed.
      // In this example, each array element is a string representing a property in `chatGptClient` above.
      chatgpt: [],
    },
  },
  // Options for the API server
  apiOptions: {
    port: process.env.API_PORT || 3000,
    host: process.env.API_HOST || "localhost",
    // (Optional) Set to true to enable `console.debug()` logging
    debug: false,
    // (Optional) Possible options: "chatgpt", "chatgpt-browser", "bing". (Default: "chatgpt")
    clientToUse: modelConfig.clientType,
    // (Optional) Generate titles for each conversation for clients that support it (only ChatGPTClient for now).
    // This will be returned as a `title` property in the first response of the conversation.
    generateTitles: false,
    // (Optional) Set this to allow changing the client or client options in POST /conversation.
    // To disable, set to `null`.
    perMessageClientOptionsWhitelist: {
      // The ability to switch clients using `clientOptions.clientToUse` will be disabled if `validClientsToUse` is not set.
      // To allow switching clients per message, you must set `validClientsToUse` to a non-empty array.
      validClientsToUse: [
        "bing",
        "chatgpt",
        "chatgpt-browser",
        "infrastruct",
        "claude",
        "gemini",
      ], // Added 'gemini' to valid clients
      // The Object key, e.g. "chatgpt", is a value from `validClientsToUse`.
      // If not set, ALL options will be ALLOWED to be changed. For example, `bing` is not defined in `perMessageClientOptionsWhitelist` above,
      // so all options for `bingAiClient` will be allowed to be changed.
      // If set, ONLY the options listed here will be allowed to be changed.
      // In this example, each array element is a string representing a property in `chatGptClient` above.
      chatgpt: [],
    },
  },
};
