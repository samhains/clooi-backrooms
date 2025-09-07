import OpenRouterClient from '../clients/OpenRouterClient.js';

// CLI schema doc was Bing-heavy; removed for clarity.

export function getClientSettings(clientToUse, settings) {
    if (clientToUse !== 'openrouter') {
        throw new Error('Only openrouter is supported by this build.');
    }
    return {
        ...settings.openRouterClient,
        ...settings.cliOptions.openRouterOptions,
    };
}

export function getClient(clientToUse, settings) {
    const clientOptions = {
        ...getClientSettings(clientToUse, settings),
        cache: settings.cacheOptions,
    };
    if (clientToUse !== 'openrouter') {
        throw new Error('Only openrouter is supported by this build.');
    }
    return new OpenRouterClient(clientOptions);
}
