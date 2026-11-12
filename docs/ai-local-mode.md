# AI connection modes (tm-tools)

tm-tools resolves every chat / model-check / PDF-extraction call through one
gateway: `server/utils/aiGateway.ts`.

| Mode | Who holds the key | Who calls the provider |
|---|---|---|
| `hub` (default) | TM Hub (encrypted connection) | TM Hub relay |
| `local` | This machine (`AI_LOCAL_CONNECTIONS`) | tm-tools, via `@tuanmjnh/tm-ai-client` |

There is no implicit detection. A connection is `local` only when it is listed
explicitly, so a hosted deployment can never be tricked into calling a loopback
or private-network address. Everything else stays on the hub relay, unchanged.

## Configuring a local connection

`AI_LOCAL_CONNECTIONS` is a JSON array. Nitro also reads its runtime variant
`NUXT_AI_LOCAL_CONNECTIONS`; the desktop shell writes the plain name into
`userData/config.env`.

On desktop, open **Settings → Local AI connections** (`/system/settings/ai-local`,
root only) instead of editing the file by hand. The page writes the JSON and puts
the key into a named secret slot, so the key is encrypted by the OS keychain and
never sits inside the JSON.

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
- `apiKeyEnv` names a config slot (`AI_API_KEY` or `AI_API_KEY_<SUFFIX>`). That slot
  is encrypted at rest by the OS keychain and masked to the renderer; the gateway
  reads it from `process.env` on every call. Prefer it over `apiKey`.
- `apiKey` is an inline fallback for env-file-only setups (Ollama and LM Studio need none).
- `models` feeds the picker when the hub catalogue is unavailable. A running hub
  still contributes its own models for the same connection.

Bad entries are rejected individually and logged once per call; a malformed
entry never half-registers.

Examples:

```bash
# Ollama
AI_LOCAL_CONNECTIONS='[{"connectionId":"ollama","provider":"openai-compatible","baseUrl":"http://127.0.0.1:11434/v1","models":["llama3.2"]}]'

# FreeLLMAPI
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
- The local key lives in the same server-side config file as
  `NUXT_HUB_APP_SECRET`, never in the renderer and never in the hub.
