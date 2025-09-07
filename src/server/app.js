import 'dotenv/config';
import fastify from 'fastify';
import cors from '@fastify/cors';
import { FastifySSEPlugin } from '@waylaidwanderer/fastify-sse-v2';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { KeyvFile } from 'keyv-file';
import { getClient } from '../cli/util.js';
import { on } from 'events';
import { nextTick, filterClientOptions } from '../src/server/utils.js';

const arg = process.argv.find(_arg => _arg.startsWith('--settings'));
const path = arg?.split('=')[1] ?? './settings.js';

let settings;
if (fs.existsSync(path)) {
    // get the full path
    const fullPath = fs.realpathSync(path);
    settings = (await import(pathToFileURL(fullPath).toString())).default;
} else {
    if (arg) {
        console.error('Error: the file specified by the --settings parameter does not exist.');
    } else {
        console.error('Error: the settings.js file does not exist.');
    }
    process.exit(1);
}

if (settings.storageFilePath && !settings.cacheOptions.store) {
    // make the directory and file if they don't exist
    const dir = settings.storageFilePath.split('/').slice(0, -1).join('/');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(settings.storageFilePath)) {
        fs.writeFileSync(settings.storageFilePath, '');
    }

    settings.cacheOptions.store = new KeyvFile({ filename: settings.storageFilePath });
}

const clientToUse = settings.apiOptions?.clientToUse || settings.clientToUse || 'openrouter';
const perMessageClientOptionsWhitelist = settings.apiOptions?.perMessageClientOptionsWhitelist || null;

const server = fastify();

await server.register(FastifySSEPlugin);
await server.register(cors, {
    origin: '*',
});

server.get('/ping', () => Date.now().toString());

server.post('/conversation', async (request, reply) => {
    console.log('Received request:', request.body);
    const body = request.body || {};
    const abortController = new AbortController();

    reply.raw.on('close', () => {
        if (abortController.signal.aborted === false) {
            abortController.abort();
        }
    });

    let onProgress;
    const stream = body.stream || body.modelOptions?.stream;
    if (stream === true) {
        onProgress = (diff) => {
            // console.log('Token:', diff);
            if (settings.apiOptions?.debug) {
                console.debug(diff);
            }
            if (diff !== '[DONE]') {
                reply.sse({ id: '', data: JSON.stringify(diff) });
            }
        };
    } else {
        onProgress = null;
    }

    let result;
    let error;
    try {
        if (!body.modelOptions) {
            const invalidError = new Error();
            invalidError.data = {
                code: 400,
                modelOptions: 'The message parameter is required.',
            };
            // noinspection ExceptionCaughtLocallyJS
            throw invalidError;
        }

        let clientToUseForMessage = body.client || clientToUse;

        const messageClient = getClient(clientToUseForMessage, settings);

        result = await messageClient.standardCompletion(
            body.messages,
            body.modelOptions,
            // apiParams,
            {
                // n: 1,
                ...body.opts,
                abortController: abortController,
                onProgress,
                onFinished: async (idx) => {
                    console.log('Finished', idx);
                }
            }
        )

    } catch (e) {
        error = e;
    }

    if (result !== undefined) {
        if (settings.apiOptions?.debug) {
            console.debug(result);
        }
        if (stream === true) {
            reply.sse({ event: 'result', id: '', data: JSON.stringify(result) });
            reply.sse({ id: '', data: '[DONE]' });
            await nextTick();
            return reply.raw.end();
        }
        return reply.send(result);
    }

    const code = error?.data?.code || (error.name === 'UnauthorizedRequest' ? 401 : 503);
    if (code === 503) {
        console.error(error);
    } else if (settings.apiOptions?.debug) {
        console.debug(error);
    }
    const message = error?.data?.message || error?.message || `There was an error communicating with OpenRouter.`;
    if (stream === true) {
        reply.sse({
            id: '',
            event: 'error',
            data: JSON.stringify({
                code,
                error: message,
            }),
        });
        await nextTick();
        return reply.raw.end();
    }
    return reply.code(code).send({ error: message });
});

server.listen({
    port: settings.apiOptions?.port || settings.port || 3000,
    host: settings.apiOptions?.host || 'localhost',
}, (error) => {
    console.log(`Server listening on ${server.server.address().port}`);
    if (error) {
        console.error(error);
        process.exit(1);
    }
});

// nextTick and filterClientOptions moved to src/server/utils.js
