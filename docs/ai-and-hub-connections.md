# AI & Hub Connections in tm-tools

tm-tools owns **no AI API keys**. Every credential lives in TM Hub, and tm-tools
works with the hub's provider catalog, model list and relay.

## What tm-tools stores

| Data | Where | Notes |
| --- | --- | --- |
| Hub URL + app id | `.env` (`NUXT_PUBLIC_HUB_URL`, `NUXT_PUBLIC_HUB_APP_ID`) | public, safe to ship |
| Shared JWT secret | `.env` (`AUTH_JWT_SECRET`) | never committed, must match tm-hub |
| Non-secret app config | Electron `config.env` (`CHROME_PATH`, downloads dir, …) | plain text |
| AI provider keys | **TM Hub only** | tm-tools never writes, caches or displays them |

`electron/tools/secret-slots.cjs` still classifies a legacy `AI_API_KEY*` /
`TMCUT_GEMINI_API_KEY` slot as secret when a pre-migration `config.env` is read,
so an old encrypted token can never leak through `get-config`. No handler writes
new AI keys locally.

## What tm-tools does at runtime

1. **Catalog** — `useHubAi()` reads provider definitions, connections, models and
   grants from `GET /api/v1/apps/:appId/ai/*` with a bearer token + `X-App-Id`.
2. **Discovery** — `POST /api/v1/apps/:appId/ai/discover` lists models for a
   connection. If the hub relay is unreachable, `/system/ai-keys` falls back to
   this app's own `POST /api/v1/ai/discover` (server-side fetch, no key is stored).
3. **Use** — product code calls the model through the hub relay or a granted
   connection; the decrypted credential stays inside the hub process.

## Screens

- `/system/ai-keys` — read-only dashboard: providers, connections, models,
  health, discovery, import/export. Editing a credential opens the hub
  connection wizard (`/resources/connections`) which posts to the hub.
- `/resources/connections` — hub-backed credential wizard.

## Rules for contributors

- Never add a code path that persists an AI key in tm-tools (localStorage,
  `config.env`, SQLite, logs). Only the hub may hold it.
- Never log request bodies or headers that may contain a key.
- A new AI call goes through `useHubAi()` / the hub relay, not a direct provider
  SDK call from this app.
