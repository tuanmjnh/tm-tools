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

## Relay catalog and chat/extraction model lists

Both `/api/v1/chat/models` and `/api/v1/pdf/extract/models` derive their options
from the same hub relay catalogue (`GET /api/v1/apps/:id/ai/relay/catalog`) and
the same server-side filter in `server/utils/relayModels.ts`:

- connections without a key are skipped;
- non-text models (TTS, audio, live, image, embedding, imagen, veo, AQA) are
  dropped, so neither picker can offer a model that cannot answer a prompt;
- `displayName` falls back to the bare model id when the catalogue omits it;
- extraction marks `config.pdf.extract.model` as the suggested entry.

The relay accepts a device credential (`X-Device-Id` / `X-Device-Secret`) before
falling back to `X-App-Id` / `X-App-Secret`. An Electron build therefore needs no
App Secret at all — it needs an enrolled device.

## Failure copy in the packaged app

`fetchRelayCatalog` raises `error.aiRelayNotConfigured` (503) when no identity can
reach the hub at all, and `error.aiRelayUnauthorized` (502) when the hub rejects
the credential. Both surfaces show that text instead of an empty picker:

- chat shows the message in a `UAlert` with **Refresh** and **Hub connection**
  (`/system/settings/hub`) actions;
- extraction shows the same alert in the model field, and its **Refresh** button
  re-requests the catalogue with `?refresh=1` to bypass the five-minute cache.

Neither string may instruct desktop users to set `NUXT_HUB_APP_SECRET`; that
variable is a server-deployment mechanism, not something a packaged app holds.

## Screens

- `/system/ai-keys` — read-only dashboard: providers, connections, models,
  health, discovery, import/export. Editing a credential opens the hub
  connection wizard (`/resources/connections`) which posts to the hub.
- `/resources/connections` — hub-backed credential wizard.
- `/system/settings/hub` — device enrollment: issues this device an encrypted
  credential and reports connection health. Linked from the chat and extraction
  empty/error states.

## Rules for contributors

- Never add a code path that persists an AI key in tm-tools (localStorage,
  `config.env`, SQLite, logs). Only the hub may hold it.
- Never log request bodies or headers that may contain a key.
- A new AI call goes through `useHubAi()` / the hub relay, not a direct provider
  SDK call from this app.
