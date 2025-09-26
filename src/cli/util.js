import OpenRouterClient from '../clients/OpenRouterClient.js';
import ClaudeClient from '../clients/ClaudeClient.js';

// CLI schema doc was Bing-heavy; removed for clarity.

export function getClientSettings(clientToUse, settings) {
    switch (clientToUse) {
        case 'openrouter':
            return {
                ...settings.openRouterClient,
                ...settings.cliOptions.openRouterOptions,
            };
        case 'claude':
            return {
                ...settings.claudeClient,
                ...settings.cliOptions.claudeOptions,
            };
        default:
            throw new Error(`Unsupported client: ${clientToUse}`);
    }
}

export function getClient(clientToUse, settings) {
    const clientOptions = {
        ...getClientSettings(clientToUse, settings),
        cache: settings.cacheOptions,
    };
    switch (clientToUse) {
        case 'openrouter':
            return new OpenRouterClient(clientOptions);
        case 'claude':
            return new ClaudeClient(clientOptions);
        default:
            throw new Error(`Unsupported client: ${clientToUse}`);
    }
}
