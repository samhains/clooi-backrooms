import { listSaveStates } from './saveStates.js';

export function getCid(data) {
    const convId = data.conversationId || data.jailbreakConversationId;
    if (!convId) {
        return null;
    }
    return convId;
}


export async function getSavedStatesForConversation(conversationsCache, conversationId) {
    const states = await listSaveStates();
    return states
        .filter(state => getCid(state.conversationData || {}) === conversationId)
        .map(state => ({ name: state.name, conversationData: state.conversationData }));
}

export async function savedStatesByConversation(conversationsCache) {
    const states = await listSaveStates();
    const savedStatesByConversation = {};
    for (const state of states) {
        const conversationData = state.conversationData || {};
        const conversationId = getCid(conversationData);
        if (!conversationId) {
            continue;
        }
        if (!savedStatesByConversation[conversationId]) {
            const conversation = state.conversation
                || (await conversationsCache.get?.(conversationId))
                || {};
            const firstMessage = conversation.messages?.[0]?.message;
            const conversationName = conversation.name
                || (typeof firstMessage === 'string' ? firstMessage.substring(0, 50) : conversationId);

            savedStatesByConversation[conversationId] = {
                name: conversationName,
                states: [],
            };
        }
        savedStatesByConversation[conversationId].states.push({
            name: state.name,
            slug: state.slug,
            savedAt: state.savedAt,
            conversationData,
            filePath: state.filePath,
        });
    }
    return savedStatesByConversation;
}

export async function getSavedIds(conversationsCache) {
    const states = await listSaveStates();
    return states
        .map(state => getCid(state.conversationData || {}))
        .filter(Boolean);
}
