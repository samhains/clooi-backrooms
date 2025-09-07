# Project Guide for Agents and Contributors

This repository uses a standard, source-first layout. There is no build step; Node runs ESM directly. This document outlines conventions and directory structure to keep things tidy and predictable.

## Runtime and Entrypoints

- ESM only (`"type": "module"` in package.json)
- Entrypoints live under `src/` and include a shebang:
  - `src/cli/app.js` – CLI app (used by `npm run cli` and package `bin`)
  - `src/server/app.js` – HTTP server (used by `npm start` / `npm run server`)
- The `bin/` folder is intentionally not used. Package `bin` points directly to `src/*/app.js`.

## Directory Structure

- `src/clients`
  - `ChatClient.js` – core chat client base
  - `OpenRouterClient.js` – OpenRouter-specific client
  - `constants.js` – default model/participant/message schema constants
  - `tokenizer.js` – shared tokenizer cache
- `src/utils`
  - `conversation.js` – conversation tree utilities
  - `cache.js` – Keyv cache helpers
  - `typeConversion.js` – transcript/XML conversion helpers
- `src/cli`
  - `app.js` – CLI entry and orchestration
  - `commands.js` – builds the command registry from injected handlers
  - `history.js` – history tree rendering (boxes + nav hints)
  - `ui.js` – UI box helpers and whitespace helpers
  - `logging.js` – boxen-wrapped logs
  - `boxen.js` – safe wrapper for boxen
  - `backrooms.js` – Backrooms transcript discovery and parsing
  - `util.js` – client selection + settings
- `src/server`
  - `app.js` – Fastify server entry
  - `utils.js` – server utilities (nextTick, filterClientOptions)
- `src/polyfills`
  - `fetch.js` – undici-based fetch polyfill for Node runtimes

## Code Style and Conventions

- Keep modules small and single-purpose. Avoid one-line re-export “shims” in the repo root.
- Prefer importing from concrete modules (e.g., `../utils/conversation.js`) over intermediary shim files.
- When slimming large files, extract cohesive helpers into `src/cli/*` or `src/utils/*` rather than adding deep nesting.
- Preserve existing behavior and output formatting when refactoring. Favor conservative, incremental changes.
- For streaming, avoid redundant network calls; aggregate tokens and surface a `{ result, results, replies }` shape.

## Running and Development

- CLI: `npm run cli` (runs `node src/cli/app.js`)
- Server: `npm start` or `npm run server` (runs `node src/server/app.js`)
- Debug: `npm run dev:debug:cli` / `npm run dev:debug:server` (uses nodemon + inspector)

## Notes for Future Changes

- If creating new public modules, update `README.md` Module Map to reflect structure.
- Keep the CLI entry thin by adding new helpers to `src/cli/*` and wiring them in `src/cli/app.js`.
- Do not reintroduce `bin/` for source code; use `src/*/app.js` for entrypoints.

