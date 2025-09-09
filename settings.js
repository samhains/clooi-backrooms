import * as fs from "fs";

export default {
  // Cache settings (kept minimal). If namespace is null, it uses clientToUse
  cacheOptions: {
    namespace: null,
  },
  // Persist conversations to a JSON file (optional)
  storageFilePath: process.env.STORAGE_FILE_PATH || "./cache.json",

  // CLI options (OpenRouter only)
  cliOptions: {
    clientToUse: "openrouter",

    // Minimal toggles
    showSuggestions: false,
    showSearches: false,
    conversationData: {},

    // OpenRouter model + message options
    openRouterOptions: {
      modelOptions: {
        // Always use aliases defined in model_presets.json
        modelAlias: "k2",
        temperature: 1,
        stream: true,
        // If you set globals.max_tokens in model_presets.json this can be omitted
        max_tokens: 4096,
      },
      messageOptions: {
        // Keep or point to your preferred system prompt
        // systemMessage: fs.readFileSync("./contexts/dreamsim.txt", "utf8"),
        systemMessage: ""
      },
    },
  },

  // OpenRouter client configuration
  openrouterClient: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    completionsUrl: "https://openrouter.ai/api/v1/chat/completions",
    debug: false,
  },
  // Backwards/compat casing used by some utilities
  openRouterClient: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    completionsUrl: "https://openrouter.ai/api/v1/chat/completions",
    debug: false,
  },

  // API server options (if you run the server)
  apiOptions: {
    port: process.env.API_PORT || 3000,
    host: process.env.API_HOST || "localhost",
    debug: false,
    clientToUse: "openrouter",
    generateTitles: false,
    perMessageClientOptionsWhitelist: {
      // Only allow switching to 'openrouter' and changing nothing by default
      validClientsToUse: ["openrouter"],
    },
  },
};
