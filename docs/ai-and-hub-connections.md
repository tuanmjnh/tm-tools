# AI & Hub Connections in tm-tools

tm-tools works with the TM Hub provider catalogue, model list and relay, and it
can also hold **app-managed provider keys of its own**. Those keys are sealed
with `AI_CONFIG_SECRET` and stored per account in this app's own MongoDB
(`ai_connections`); they never reach the renderer, and they never reach the hub.

## What tm-tools stores

| Data | Where | Notes |
| --- | --- | --- |
| Hub URL + app id | `.env` (`NUXT_PUBLIC_HUB_URL`, `NUXT_PUBLIC_HUB_APP_ID`) | public, safe to ship |
| Shared JWT secret | `.env` (`AUTH_JWT_SECRET`) | never committed, must match tm-hub |
| Non-secret app config | Electron `config.env` (`CHROME_PATH`, downloads dir, …) | plain text |
| Device service credential | Electron `config.env` (`HUB_DEVICE_*`) | keychain-encrypted, Main only |

AI provider keys have exactly three homes:

| Home | Owner | What is stored | Notes |
| --- | --- | --- | --- |
| Hub connection (`/resources/connections`) | TM Hub | the credential, encrypted inside the hub | tm-tools only reads the catalogue and calls the relay |
| App-managed row (`ai_connections`) | this app, per account | `apiKeyCipher` only, sealed AES-256-GCM by `sealSecret` | the renderer receives `hasKey`, never a key |
| Legacy `AI_LOCAL_CONNECTIONS` | deployment env / JSON file | plain keys or `apiKeyEnv` slots | **import-only** source, not the live store (see below) |

`electron/tools/secret-slots.cjs` still classifies a legacy `AI_API_KEY*` /
`TMCUT_GEMINI_API_KEY` slot as secret when a pre-migration `config.env` is read,
so an old encrypted token can never leak through `get-config`. No handler writes
new AI keys locally.

## Environment variables

| Variable | Where set | Who sets it | Notes |
| --- | --- | --- | --- |
| `MONGODB_URI` | app env (Vercel project env, or local `.env`) | operator | required for hosted use; defaults to `mongodb://localhost:27017` |
| `MONGODB_DB_NAME` | app env | operator | database that holds `ai_connections`; defaults to `tm-tools` |
| `AI_CONFIG_SECRET` | app env | operator | 32 random bytes, base64 (for example `openssl rand -base64 32`); seals every stored key; never committed |
| `AI_LOCAL_CONNECTIONS` | app env or a JSON file | operator, legacy only | import source read once per account; Nitro's runtime variant is `NUXT_AI_LOCAL_CONNECTIONS` |

How `AI_CONFIG_SECRET` behaves:

- It seals each key into `apiKeyCipher` before the row is written and opens it
  again only on the server. Losing it makes every stored key unreadable: the app
  warns once, the connections report no key, and the keys must be re-entered.
- With no secret at all, `requireAIConfigSecret()` answers 503
  `error.aiConfigSecretMissing`, and an inline legacy key cannot be imported
  (that row is skipped).

## Migration from `AI_LOCAL_CONNECTIONS`

`AI_LOCAL_CONNECTIONS` is no longer the live store; it is an **import source**:

1. The first signed-in read imports its entries into that user's rows in
   `ai_connections`.
2. Inline `apiKey` values are sealed with `AI_CONFIG_SECRET` on the way in. With
   no secret, an entry that carries an inline key is **skipped** instead of
   stored in the clear; entries that only name `apiKeyEnv` are still imported.
3. Import runs only while the user has **zero** rows. Once a user owns rows, the
   database wins and the env is ignored from then on.
4. The env variable or JSON file is **never rewritten** by the app.

After that, connections are edited in **Settings → AI connections**
(`/system/settings/ai-local`), which writes the database rather than the file.

## What tm-tools does at runtime

1. **Catalog** — `useHubAi()` reads provider definitions, connections, models and
   grants from `GET /api/v1/apps/:appId/ai/*` with a bearer token + `X-App-Id`.
2. **Discovery** — `POST /api/v1/apps/:appId/ai/discover` lists models for a
   connection. If the hub relay is unreachable, `/system/ai-keys` falls back to
   this app's own `POST /api/v1/ai/discover` (server-side fetch, no key is stored).
3. **Use** — product code calls the model through the hub relay or a granted
   connection; the decrypted credential stays inside the hub process. Calls bound
   to an app-managed connection resolve their key on the server, from
   `ai_connections`.

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
App Secret at all: a normal sign-in registers the device and, when the app
policy allows it, TM Hub issues the scoped credential that Main stores in the
keychain (v2 — see `docs/TM-DEVICE-AUTH-UPGRADE-v2` in tm-hub).

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

- `/system/ai-keys` — hub-backed dashboard: providers, models, health,
  discovery, import/export. Editing a hub credential opens the hub connection
  wizard (`/resources/connections`) which posts to the hub.
- `/system/settings/ai-local` — **AI connections**: the app-managed rows this
  account owns (`ai_connections`). Adding or editing a row writes the database;
  the key is sealed server-side and only `hasKey` comes back. Root only.
- `/resources/connections` — hub-backed credential wizard.
- `/system/settings/hub` — connection health and the current device credential's
  metadata (id, scopes, expiry). Enrollment is automatic on sign-in; the page
  keeps a root-gated "forget this device" action. Linked from the chat and
  extraction empty/error states.
- `/system/settings/devices` — the identity registry: every device signed in to
  this account, with rename and revoke (`/api/v1/auth/user-devices`). Not the
  service-credential list, and never a secret.

## Deploying on Vercel

- `MONGODB_URI`, `MONGODB_DB_NAME` and `AI_CONFIG_SECRET` are **server-only**.
  None of them may be exposed as `NUXT_PUBLIC_*`: a public variable is bundled
  into the client.
- Vercel reads project env when a deployment is created, so changing any of them
  requires a **redeploy** before the new value is used.
- MongoDB Atlas must accept Vercel's egress addresses (Atlas **Network Access**;
  `0.0.0.0/0` is the usual choice for serverless). While Atlas refuses the
  connection, every AI call that needs a stored connection fails with a server
  error: `getSharedConnection()` throws a plain `MongoDB is not reachable`, and
  tm-tools has no dedicated `error.mongo*` code to translate it.

## Rules for contributors

- A key may be persisted **only** as `apiKeyCipher` in `ai_connections`. Never in
  the renderer, `localStorage`, logs, or env files.
- Never log request bodies or headers that may contain a key, and never return a
  decrypted key from an API route — map rows through `safeConnection` first.
- A new AI call goes through `useHubAi()` / the hub relay (or the gateway for an
  app-managed connection), not a direct provider SDK call from this app.
