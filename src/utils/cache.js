import { listSaveStates } from './saveStates.js';

export function getCid(data) {
    const convId = data.conversationId || data.jailbreakConversationId;
    if (!convId) {
        return null;
    }
    return convId;
}

export async function getSavedStatesForConversation(conversationId) {
    const states = await listSaveStates();
    return states
        .filter(state => getCid(state.conversationData || {}) === conversationId)
        .map(state => ({ name: state.name, conversationData: state.conversationData }));
}

export async function savedStatesByConversation(conversationsCache) {
    const states = await listSaveStates();
    const statesByConversation = {};
    for (const state of states) {
        const { conversationData = {} } = state;
        const conversationId = getCid(conversationData);
        if (!conversationId) {
            continue;
        }
        if (!statesByConversation[conversationId]) {
            let { conversation } = state;
            if (!conversation && typeof conversationsCache?.get === 'function') {
                // eslint-disable-next-line no-await-in-loop
                conversation = await conversationsCache.get(conversationId);
            }
            conversation = conversation || {};
            const firstMessage = conversation.messages?.[0]?.message;
            const conversationName = conversation.name
                || (typeof firstMessage === 'string' ? firstMessage.substring(0, 50) : conversationId);

            statesByConversation[conversationId] = {
                name: conversationName,
                states: [],
            };
        }
        statesByConversation[conversationId].states.push({
            name: state.name,
            slug: state.slug,
            savedAt: state.savedAt,
            conversationData,
            filePath: state.filePath,
        });
    }
    return statesByConversation;
}

export async function getSavedIds() {
    const states = await listSaveStates();
    return states
        .map(state => getCid(state.conversationData || {}))
        .filter(Boolean);
}
