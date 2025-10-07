# CLooI

If you are a complete n00b to coding, you can consult the [n00b's guide to running the CLooI](./n00b-guide.md) which is written for non-coders unlike some of this readme.

## Prerequisites
- Node.js >= 16.0.0
- npm


## Install instructions

1. Clone this repository: `git clone git@github.com:socketteer/clooi-backrooms.git`
2. Install dependencies with `npm install`
3. Copy `.env.example` to `.env` and add your API keys and any overrides (do not commit `.env`).
4. `settings.js` is checked into the repo and safe to edit for non-secret defaults (model aliases, toggles, etc.). Keep secrets in `.env` only.
    - **Note**: If `settings.example.js` changes in the repo, you may copy useful non-secret options into your `settings.js`.

## CLooI instructions

![CLooI](./demos/bcli.gif)

The CLI (Command Loom Interface) app allows you to interact with the chat client using a command line interface and save and load (branching) conversation histories. 

### Running the CLI app

```bash
npm run cli
```

### Commands

Running the app will prompt you to enter a message. 

You can also enter commands (prepended with `!`). Entering `!` will show the list of currently available commands. 

The `!help` command will show a list of commands and their descriptions. You can also use `!help [command]` or `<command> --help` to get more information about a specific command.

<details>
<summary><strong>Show/hide CLooI command descriptions</strong></summary>

- !help [command] | <command> --help: Show command documentation.
    - [command]: If provided, show the documentation for that command, otherwise shows documentation for all commands.

- !mu: Regenerate the last response. Equivalent to running !rw -1 and then !gen.

- !gen: Generate a response without sending an additional user message

- !save [name]: Save a named pointer to the current conversation state
    - [name]: If a name is provided, it will save the state with that name, otherwise a prompt will appear.

- !load [name]: Load a saved conversation state.
    - [name]: If a name is provided, it will load the state with that name, otherwise a prompt will appear showing saved states.

- !new: Start a new conversation.

- !rw [index]: Rewind to a previous message.
    - [index]: If positive, rewind to message with that index. If negative, go that many steps backwards from the current index. If not provided, a prompt will appear to choose where in conversation history to rewind to.

- !fw [index]: Go forward to a child message.
    - [index]: If positive, go to the child message with that index. If 0, go to the first child message. If not provided, a prompt will appear to choose which child message to go to.

- !alt [index]: Go to a sibling message.
    - [index]: Index of sibling message. If not provided a prompt will appear to choose which sibling message to go to.

- !w: Navigate to the parent message. Equivalent to running !rw -1.

- !>: Go right / to the next sibling.

- !<: Go left / to the previous sibling.

- !cp [type]: Copy data to clipboard.
    - [type]: If provided, copy the data of that type. If not provided, a prompt will appear to choose which data to copy.

- !pr [type]: Print data to console.
    - [type]: If provided, print the data of that type. If not provided, a prompt will appear to choose which data to print.

- !ml: Open the editor (for multi-line messages). HTTPS URLs or absolute paths in the edited text are automatically attached as images when you save.
- !ml2: Open the editor without parsing for attachments (legacy !ml behavior).

- !edit: Opens the text of the current message in the editor. If you make changes and save, a copy of the message (with the same author and type) will be created as a sibling message.

- !concat [message]: Concatenate message(s) to the conversation.
    - [message]: If provided, concatenate the message as a user message. If not provided, the editor will open, and you write either a single message or multiple messages in the standard transcript format.

- !merge: Creates a new sibling of the parent message with the last message's text appended to the parent message's text, and which inherits other properties of the parent like author.

- !history: Display conversation history in formatted boxes. If you want to copy the raw conversation history transcript, use !cp history or !pr history instead.

- !exit: Exit CLooI.

- !resume: Resume the last conversation.

- !export [filename]: Export conversation tree to JSON.
    - [filename]: If provided, export the conversation tree to a file with that name, otherwise a prompt will appear to choose a filename.

- !import [path]: Import a specific transcript by path (defaults to opening a picker under `import/`).

- !open <id\>: Load a saved conversation by id.
    - <id\>: The id of the conversation to load.

- !debug: Run debug command.

---

</details>

#### Changing default options

The default options for the CLI app are stored in `settings.js`, under `cliOptions`. You can change the default options by modifying this file. The changes to the settings will take effect when the file is saved.

Secrets and environment-specific values (API keys, ports, hosts, paths) should be defined via environment variables in `.env` (loaded by `dotenv/config` in both CLI and server entrypoints). See `.env.example` for the expected variables.

The system prompt (passed as a request parameter for Claude, prepended to prompt for Infrastruct, injected after Bing's normal system prompt) defaults are stored in text files in `contexts/` specified separately for each client in `settings.js/cliOptions`. You can change the content of the files to change the default system prompt and context, or point to different files in `settings.js`, or write the desired system prompt string directly in `settings.js`. The `contexts/` folder also contains alternative system prompts.

### Saving and loading conversation states

All messages are saved in `cache.json`, but you can save a named pointer to a specific conversation state using the `!save` command. You can then load the conversation state at that point using the `!load` command.

<!-- Removed legacy BingAIClient section during cleanup -->

<!-- Bing-specific prompt injection docs removed during cleanup -->

## API

- Start the server:
    - using `npm start` or `npm run server` (if not using Docker)
    - using `docker-compose up` (requires Docker)

### Endpoints
<details>
<summary><strong>POST /conversation</strong></summary>

Start or continue a conversation.

Fields

- `messages` (object):
  - `userMessage` (optional): single message object or string
  - `previousMessages` (optional): array of message objects
  - `systemMessage` (optional): message object or string
- `modelOptions` (object): OpenRouter options. Requires `modelAlias`. Supports `stream`, `temperature`, `max_tokens`, etc.
- `opts` (object, optional): runtime options passed to the client (e.g., `onProgress` via SSE).

For SSE, set `modelOptions.stream: true` and POST to `/conversation`. The server sends token deltas over SSE and finishes with a final `result` event and `[DONE]` sentinel.
</details>

### Usage
<details>
<summary><strong>Method 1 (POST)</strong></summary>

Send a POST to `/conversation` with `messages` and `modelOptions`.
```JSON
{
    "messages": {
      "userMessage": { "author": "user", "text": "Hello!" },
      "previousMessages": [],
      "systemMessage": { "author": "system", "text": "You are helpful." }
    },
    "modelOptions": { "modelAlias": "llama3.1-8b", "stream": false }
}
```
The server returns a JSON object containing the response:
```JS
// HTTP/1.1 200 OK
{
    "choices": [ { "message": { "role": "assistant", "content": "..." }, "index": 0 } ]
}
```

If the request is unsuccessful, the server will return a JSON object with an error message.

If the request object is missing a required property (e.g. `message`):
```JS
// HTTP/1.1 400 Bad Request
{
    "error": "The message parameter is required."
}
```
If there was an error sending the message to the client:
```JS
// HTTP/1.1 503 Service Unavailable
{
    "error": "There was an error communicating with OpenRouter."
}
```
</details>
<details>
<summary><strong>Method 2 (SSE)</strong></summary>

You can set `"stream": true` in the request body to receive a stream of tokens as they are generated.

```js
import { fetchEventSource } from '@waylaidwanderer/fetch-event-source'; // use `@microsoft/fetch-event-source` instead if in a browser environment

const opts = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        "message": "Write a poem about cats.",
        "conversationId": "your-conversation-id (optional)",
        "parentMessageId": "your-parent-message-id (optional)",
        "stream": true,
        // Any other parameters per `Endpoints > POST /conversation` above
    }),
};
```

See [demos/use-api-server-streaming.js](demos/use-api-server-streaming.js) for an example of how to receive the response as it's generated. You will receive one token at a time, so you will need to concatenate them yourself.

Successful output:
```JS
{ data: '', event: '', id: '', retry: 3000 }
{ data: 'Hello', event: '', id: '', retry: undefined }
{ data: '!', event: '', id: '', retry: undefined }
{ data: ' How', event: '', id: '', retry: undefined }
{ data: ' can', event: '', id: '', retry: undefined }
{ data: ' I', event: '', id: '', retry: undefined }
{ data: ' help', event: '', id: '', retry: undefined }
{ data: ' you', event: '', id: '', retry: undefined }
{ data: ' today', event: '', id: '', retry: undefined }
{ data: '?', event: '', id: '', retry: undefined }
{ data: '<result JSON here, see Method 1>', event: 'result', id: '', retry: undefined }
{ data: '[DONE]', event: '', id: '', retry: undefined }
// Hello! How can I help you today?
```

Error output:
```JS
const message = {
  data: '{"code":503,"error":"There was an error communicating with ChatGPT."}',
  event: 'error',
  id: '',
  retry: undefined
};

if (message.event === 'error') {
  console.error(JSON.parse(message.data).error); // There was an error communicating with ChatGPT.
}
```
</details>

#### Notes
- Method 1 is simple, but Time to First Byte (TTFB) is long.
- Method 2 uses a non-standard implementation of [server-sent event API](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events); you should import `fetch-event-source` first and use `POST` method.
## Module Map (Current Layout)

This repo has a standard, source-first layout. Entry points live under `src/` and Node runs ESM directly — there is no build step.

- `src/clients`
  - `ChatClient.js` – core chat client (moved)
  - `OpenRouterClient.js` – OpenRouter implementation (moved)
  - `constants.js` – defaults for models/participants/message schema
  - `tokenizer.js` – shared tokenizer cache for tiktoken
- `src/utils`
  - `conversation.js` – conversation tree helpers (moved)
  - `cache.js` – cache/keyv helpers (moved)
  - `typeConversion.js` – transcript/XML conversion (moved)
- `src/polyfills`
  - `fetch.js` – undici-based fetch polyfill
- `src/cli`
  - `app.js` – CLI entrypoint (used by `npm run cli` and package `bin`)
  - `boxen.js` – safe wrapper around boxen
  - `logging.js` – logError/logSuccess/logWarning
  - `ui.js` – system/suggestion boxes and whitespace handling
  - `history.js` – conversation history rendering and nav hints
  - `backrooms.js` – Backrooms log listing + parsing
  - `commands.js` – command registry builder used by `src/cli/app.js`
  - `util.js` – client selection + settings helpers
- `src/server`
  - `app.js` – HTTP server entrypoint (used by `npm start` / `npm run server`)
  - `utils.js` – server-side utils (nextTick, filterClientOptions)

Removed legacy shims and bin stubs

- Legacy one-line re-exports in `src/` were removed in favor of direct imports.
- The `bin/` folder was removed. Scripts and package `bin` map directly to `src/cli/app.js` and `src/server/app.js`.

Notes

- CLI behavior and output formatting are unchanged; the code is split into focused modules.
- Streaming fix: after SSE streaming completes, we no longer perform a redundant second POST. The client returns `{ result, results, replies }` for compatibility.
