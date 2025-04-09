import { MODEL_INFO } from "../modelPresets.js";
import ChatClient from "./ChatClient.js";
import "./fetch-polyfill.js";

const GEMINI_DEFAULT_MODEL_OPTIONS = {
  generationConfig: {
    temperature: 1.0,
    maxOutputTokens: 8192,
    topP: 0.95,
    topK: 40,
  }
};

const GEMINI_PARTICIPANTS = {
  bot: {
    display: "Gemini",
    author: "assistant",
    defaultMessageType: "message",
  },
};

// Gemini-specific model info that used to be in modelPresets.js
const GEMINI_MODEL_INFO = {
  contextLength: 30000,
  vision: true,
  json: true,
  maxResponseTokens: 8192,
};

export default class GeminiClient extends ChatClient {
  constructor(options = {}) {
    options.cache = options.cache || {};
    options.cache.namespace = options.cache.namespace || "gemini";
    super(options);
    this.apiKey = process.env.GOOGLE_API_KEY || "";
    this.completionsUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    this.modelOptions = GEMINI_DEFAULT_MODEL_OPTIONS;
    this.participants = GEMINI_PARTICIPANTS;
    this.isChatGptModel = false;

    this.setOptions(options);
  }

  getModelInfo(modelName) {
    // Return Gemini-specific defaults
    return GEMINI_MODEL_INFO;
  }

  buildApiParams(userMessage = null, previousMessages = [], systemMessage = null) {
    // Build a simple contents array matching Gemini's format
    const contents = [];

    // Handle system message as a user+model exchange
    if (systemMessage && systemMessage.text) {
      contents.push({
        role: "user",
        parts: [{ text: `System instruction: ${systemMessage.text}` }],
      });
      contents.push({
        role: "model",
        parts: [{ text: "I'll follow these instructions." }],
      });
    }

    // Add previous messages
    for (const msg of previousMessages) {
      contents.push({
        role: msg.author === "user" ? "user" : "model",
        parts: [{ text: msg.text }],
      });
    }

    // Add user message if provided
    if (userMessage && userMessage.text) {
      contents.push({
        role: "user",
        parts: [{ text: userMessage.text }],
      });
    }

    // Return API parameters in the format expected by the Gemini API
    return {
      contents,
      generationConfig: this.modelOptions.generationConfig,
    };
  }

  getHeaders() {
    return {
      "Content-Type": "application/json",
    };
  }

  async callAPI(params, opts = {}) {
    // Remove stream property if it exists to avoid API errors
    const { stream, ...restParams } = params;
    
    const modelOptions = {
      ...this.modelOptions,
      ...restParams,
    };

    if (typeof opts.onProgress !== "function") {
      opts.onProgress = () => {};
    }
    if (typeof opts.onFinished !== "function") {
      opts.onFinished = () => {};
    }

    const result = null;
    const replies = {};

    try {
      // Make the API request
      const url = `${this.completionsUrl}?key=${this.apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(modelOptions),
        signal: opts.abortController ? opts.abortController.signal : null,
      });

      if (response.status !== 200) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const text = data.candidates[0]?.content?.parts[0]?.text || "";

      // Add to replies directly
      replies[0] = text;

      // For streaming simulation, call onProgress with the full text
      if (opts.onProgress) {
        opts.onProgress(text, 0);
      }

      // Signal completion
      if (opts.onFinished) {
        opts.onFinished(0, null, "stop");
      }

      return {
        result: {
          choices: [
            {
              text,
              index: 0,
            },
          ],
        },
        replies,
      };
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  }
}