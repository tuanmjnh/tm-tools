# AI connection modes (tm-tools)

tm-tools resolves every chat / model-check / PDF-extraction call through one
gateway: `server/utils/aiGateway.ts`.

| Mode | Who holds the key | Who calls the provider |
|---|---|---|
| `hub` (default) | TM Hub (encrypted connection) | TM Hub relay |
| `local` | This app, per account (`ai_connections`) | tm-tools, via `@tuanmjnh/tm-ai-client` |

There is no implicit detection. A connection is `local` only when it is listed
explicitly, so a hosted deployment can never be tricked into calling a loopback
or private-network address. Everything else stays on the hub relay, unchanged.

## Where local connections live now

Rows live per account in this app's own MongoDB, collection `ai_connections`
(`MONGODB_URI`, `MONGODB_DB_NAME` — see
[AI & Hub Connections](./ai-and-hub-connections.md)). **Settings → AI connections**
(`/system/settings/ai-local`, root only) edits those rows; it does not touch any
file. The UI sends the key once, the server seals it with `AI_CONFIG_SECRET` into
`apiKeyCipher`, and the page only ever shows whether a key exists (`hasKey`).
`AI_CONFIG_SECRET` is 32 random bytes, base64, never committed; losing it makes
the stored keys unreadable, so they have to be re-entered.

## `AI_LOCAL_CONNECTIONS` is an import source

`AI_LOCAL_CONNECTIONS` (Nitro runtime variant: `NUXT_AI_LOCAL_CONNECTIONS`) is a
JSON array, read **once** for a user: the first signed-in read imports its entries
into that user's rows while the user has zero rows, and the database wins from
then on. The env variable or file is never rewritten, and the settings page no
longer writes it either.

The JSON shape is still the import format:

```json
[
  {
    "connectionId": "free-local",
    "provider": "openai-compatible",
    "baseUrl": "http://127.0.0.1:31415/v1",
    "apiKeyEnv": "AI_API_KEY_FREELLM",
    "models": ["auto", "gpt-4o-mini"]
  }
]
```

- `connectionId` must match the id the rest of the app already sends. For a hub
  connection that is its hub id, so the existing picker entry keeps working and
  simply changes execution mode.
- `baseUrl` must be `http(s)`. Trailing slashes are stripped.
- `apiKeyEnv` names a server config slot (`AI_API_KEY` or `AI_API_KEY_<SUFFIX>`),
  read from `process.env` on every call. On desktop a slot in `config.env` is
  encrypted at rest by the OS keychain and masked to the renderer. Prefer it over
  `apiKey`.
- `apiKey` is an inline fallback for env-file-only setups (Ollama and LM Studio
  need none). It is sealed with `AI_CONFIG_SECRET` on import; with no secret the
  entry is skipped rather than stored.
- `models` feeds the picker when the hub catalogue is unavailable. A running hub
  still contributes its own models for the same connection.

Bad entries are rejected individually and logged once per call; a malformed
entry never half-registers.

Examples.

Ollama (no key needed):

```bash
AI_LOCAL_CONNECTIONS='[{"connectionId":"ollama","provider":"openai-compatible","baseUrl":"http://127.0.0.1:11434/v1","models":["llama3.2"]}]'
```

FreeLLMAPI (key stays in a server config slot):

```bash
AI_LOCAL_CONNECTIONS='[{"connectionId":"774c79e3-9293-4bbe-9d6c-fe9d84991315","provider":"openai-compatible","baseUrl":"http://127.0.0.1:31415/v1","apiKeyEnv":"AI_API_KEY_FREELLM","models":["auto"]}]'
AI_API_KEY_FREELLM='sk-...'
```

## Behaviour

- `GET /api/v1/chat/models` and the PDF model picker merge local connections
  with the hub catalogue; a local id overrides the hub entry with the same id.
- With no hub enrollment but a local connection configured, the pickers still
  work (hub failure is only rethrown when there is nothing local).
- Local failures use stable codes instead of raw provider text:
  `error.aiRateLimited` (429), `error.aiTimeout` (408),
  `error.aiLocalKeyMissing` (503), `error.aiLocalUpstreamFailed` (502).
- Attachments are flattened into text for local calls; the hub relay keeps
  handling its own image rendering.

## Security notes

- Keep `AI_LOCAL_CONNECTIONS` empty in the public web build. A loopback base URL
  there would just fail, but it also must never be shipped with a real key.
- The live local key sits in `ai_connections` as `apiKeyCipher`, sealed with
  `AI_CONFIG_SECRET`; it is read only on the server for the duration of a call and
  never reaches the renderer or the hub.
