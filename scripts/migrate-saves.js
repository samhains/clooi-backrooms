#!/usr/bin/env node
/* eslint-disable no-await-in-loop */
import 'dotenv/config';
import { promises as fs, existsSync } from 'fs';
import path from 'path';

import settings from '../settings.js';
import { getClient } from '../src/cli/util.js';
import { getCid as getConversationId } from '../src/utils/cache.js';
import {
    listSaveStates,
    generateUniqueSlug,
    writeSaveState,
    summarizeConversation,
    ensureSaveStatesDir,
    getSaveStatesDir,
} from '../src/utils/saveStates.js';

const FORCE_FLAGS = new Set(['--force', '-f']);
const args = process.argv.slice(2);
const force = args.some(arg => FORCE_FLAGS.has(arg));

async function migrate() {
    const clientToUse = settings.cliOptions?.clientToUse || settings.clientToUse || 'openrouter';
    const client = getClient(clientToUse, settings);

    await ensureSaveStatesDir();
    const markerPath = path.join(getSaveStatesDir(), '.migration_complete');

    if (!force && existsSync(markerPath)) {
        console.log('Legacy save migration already completed. Use --force to run again.');
        return;
    }

    const statesOnDisk = await listSaveStates();
    const existingNames = new Set(statesOnDisk.map(state => state.name));
    const legacyNames = await client.conversationsCache.get('savedConversations') || [];

    if (!legacyNames.length) {
        await fs.writeFile(markerPath, `${new Date().toISOString()}\n`, 'utf8');
        console.log('No legacy saved conversations found.');
        return;
    }

    const workingStates = [...statesOnDisk];
    let migratedCount = 0;

    for (const legacyName of legacyNames) {
        if (!force && existingNames.has(legacyName)) {
            continue;
        }

        const legacyData = await client.conversationsCache.get(legacyName) || null;
        if (!legacyData) {
            continue;
        }

        const conversationId = getConversationId(legacyData);
        const conversationState = conversationId
            ? await client.conversationsCache.get(conversationId)
            : null;
        const summary = summarizeConversation(conversationState) || conversationId;

        let slug;
        if (force && existingNames.has(legacyName)) {
            const existing = statesOnDisk.find(state => state.name === legacyName);
            slug = existing?.slug || await generateUniqueSlug(legacyName, workingStates);
        } else {
            slug = await generateUniqueSlug(legacyName, workingStates);
        }

        const { payload } = await writeSaveState({
            name: legacyName,
            slug,
            conversationData: legacyData,
            conversation: conversationState,
            summary,
        });

        workingStates.push(payload);
        existingNames.add(legacyName);
        migratedCount += 1;
    }

    const refreshedStates = await listSaveStates();
    await client.conversationsCache.set('savedConversations', refreshedStates.map(state => state.name));
    await fs.writeFile(markerPath, `${new Date().toISOString()}\n`, 'utf8');

    if (migratedCount) {
        console.log(`Migrated ${migratedCount} legacy save${migratedCount === 1 ? '' : 's'} to saved_states/.`);
    } else {
        console.log('No new legacy saves needed migration.');
    }
}

migrate().catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
});
