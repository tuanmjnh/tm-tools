# AI Key Ownership & Hub Sharing

> **Tóm tắt (VN):** Mỗi app tự quản lý API key của chính nó — key của tm-tools nằm
> trong `config.env` đã mã hoá bằng keychain của máy tm-tools, key của app khác nằm
> ở app đó, tm-tools không đọc được và không được phép ghi. tm-tools là **app con
> (satellite)** của tm-hub: nó **đồng bộ catalog provider** từ hub, dùng **credential
> của riêng mình** (scoped theo `app_id`), và có thể được hub **chia sẻ (grant)**
> connection của app khác để dùng — kể cả dùng qua **relay** mà không cần cầm key.
> Body bên dưới là contract kỹ thuật.

- **Document type:** Architecture contract (who may write what, and where a secret may exist)
- **Applies to:** `D:/Applications/tm-tools` (satellite) and `D:/Applications/tm-hub` (hub)
- **Status:** Normative — resolves the R140 (vault read-only) vs R147 (hub provider plane) boundary
- **Enforced by:** `tests/unit/tmcut_ai_vault.spec.ts`, `tmcut_config_file.spec.ts`, `tmcut_ai_tasks.spec.ts`, hub `authz` capability checks

---

## 1. The rule in one line

**A key belongs to the app that created it. The hub stores and shares keys; it never
becomes the owner, and no app ever reads another app's key.**

A satellite (tm-tools) has exactly two ways to use an AI provider that it does not
hold a key for:

1. **Granted connection** — the owner shares it, the hub grants it to this `app_id`,
   the satellite sees *metadata* only and the hub decrypts at call time.
2. **Relay** — the hub performs the provider call on the satellite's behalf;
   the decrypted credential never leaves the hub process.

Anything else — reading another app's key, writing another app's credential row,
copying a key into a shared config — is out of contract, even if the data is
reachable.

---

## 2. Two planes, one screen each

| | **Local plane** | **Hub plane** |
|---|---|---|
| What | tm-tools' own provider keys | provider catalog + per-app credentials + sharing |
| Where it lives | `config.env` in Electron `userData`, values encrypted at rest (safeStorage / DPAPI) | tm-hub Postgres (`provider_definitions`, `connections`, `ai_grants`), secrets AES-GCM |
| Who writes it | Electron main process only | the owning app (scoped by `app_id`), under hub capabilities |
| Renderer visibility | **counts only** — never a value | metadata (provider, model, health); secrets are write-only inputs, never echoed back |
| Owning screen | `/system/ai-keys` (vault, read + governance) | `/resources/connections` (credential wizard) |

Both planes can answer "which provider runs this surface, with which model".
Only one of them may write each kind of record.

### 2.1 Local plane (tm-tools owns)

- Slots: `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, plus per-surface
  `…_<TASK>` overrides (`PLAN`, `TRIAGE`, `TRANSCRIBE`). Read by
  `electron/tools/config-file.cjs` — the only reader — and consumed by
  `electron/tools/ai-gateway.cjs`.
- At rest: encrypted by `electron/tools/ai-secure.cjs` (safeStorage). `ai-migrate-keys`
  re-runs the same idempotent migration when the keychain was unavailable at boot.
- Which slots count as secrets is decided by exactly one regex, declared once in
  `electron/tools/secret-slots.cjs`. A second copy of that regex is a defect by
  itself (the vault spec fails on the duplicate, not on the drift).
- The renderer receives **counts**: the `ai-key-status` IPC iterates the slots and
  returns "N encrypted / N plaintext / keychain available". It never serialises a value.

### 2.2 Hub plane (each app owns its own rows)

- `provider_definitions` — hub-curated catalog (key, name, category, default base URL).
  Satellites **read** it; that is the "sync providers" flow.
- `connections` — a credential row, scoped by `app_id`, secret AES-GCM at rest.
  An app may create/edit/delete **its own** rows; hub capability `ai.connections.write`.
- `ai_grants` — the sharing mechanism: the owner flips `is_shared`
  (connections PATCH), then a grant hands that connection to a specific `targetAppId`.
  Sharing without a grant gives nobody access; a grant to a non-shared row is rejected.
- Usability gate: `listUsableConnections(appId)` = own enabled rows **+** granted,
  still-enabled shared rows. That function, not the UI, decides what may run.
- `relay/chat` — satellite-to-satellite auth (`X-App-Id` + `X-App-Secret`, no user
  JWT at runtime), restricted to the same usable set. Response carries content,
  provider, model and usage — never a credential.

---

## 3. Which screen owns which action

This table is the contract the specs pin. If a screen gains an action that is not
listed for it, either the screen or this table is wrong — fix one of them in the
same round.

| Action | `/resources/connections` | `/system/ai-keys` (vault) | tm-hub admin |
|---|---|---|---|
| Enter / change an API key value | **yes** (write-only input) | **no** | owner-side |
| Create or edit own hub credential | **yes** | no (deep-link instead) | — |
| Delete own credential | yes | yes (revoke is governance) | yes |
| Enable / disable a credential | yes | yes | yes |
| Share / unshare own credential | yes | yes | yes |
| Grant a shared credential to another app | no | no | **yes** |
| Sync / list provider catalog from hub | yes | yes | — |
| Test a surface with the **stored** key | yes | yes (`listModels({ task })`) | yes |
| Model discovery + manual model entry | yes | yes | yes |
| Read a stored key value | **nowhere** | **nowhere** | **nowhere** |
| Encrypt local keys now | no | **yes** | — |

Consequences that the vault spec enforces verbatim:

- The vault page contains no `AI_API_KEY` literal and no field that could carry a
  key value (`apiKey:` / `apiKey =`), because a page that renders a key input is no
  longer a status dashboard.
- The vault page never calls `setConfig` — the single writer of local config is the
  AI connect panel (`TmcutAiConnect.vue`), mounted in exactly two components.
- Per-surface tests go through the gateway's saved-slot resolution
  (`gatewayListModels(...)`), never a key typed into the page.

**Adding a hub credential from the vault is therefore a deep link to
`/resources/connections`, not an inline form.** One authoring surface for
credentials; the vault keeps status, governance and the local-vault remedy.

---

## 4. Flows

### 4.1 App manages its own key (offline-first)

```
user types key in TmcutAiConnect (renderer)
  → setConfig IPC → main writes config.env → ai-secure encrypts value (DPAPI)
  → gateway reads plaintext into process.env at boot only
```
The satellite works with zero hub connectivity. Nothing about hub sharing changes
this path.

### 4.2 App syncs the provider catalog

```
useTmcutAi().providerPresets()
  → GET /api/v1/apps/{appId}/ai/providers   (user JWT)
  → merge with local PROVIDER_PRESETS by id; hub rows win on name/base_url_default
```
Catalog read only — a catalog row is not a credential and cannot run anything by
itself. Hub unreachable → the local preset list is returned unchanged and the UI
says so; the app never invents a provider.

### 4.3 App uses a credential it does not own

```
owner app: PATCH connections { is_shared: true }
admin:     POST /apps/{targetAppId}/ai/grants { connectionId, targetAppId }
tm-tools:  GET /apps/{appId}/ai/grants        → sees metadata (provider, model, label)
           POST /apps/{appId}/ai/relay/chat   → hub decrypts, calls provider, returns content
```
tm-tools never receives the key. Cost, rate limit and retention remain the owner's
contract with the provider, so the UI must show *whose* credential a surface runs
on (R147's `overridden` / provider badges are that disclosure).

---

## 5. Hard rules (unchanged, restated here so the doc is self-sufficient)

1. Secrets never reach: the renderer store, chat/agent logs, the project JSON,
   template files, `.tmcut-template.json` exports, crash logs, telemetry.
2. Generation adapters and any new provider integration live in the **main process**
   (`electron/tools/…`), never the renderer — same reason as the gateway.
3. `providerPresets` / grants are **reads**. A satellite never writes another app's
   row; the hub scopes every mutation by `app_id` regardless of what the UI offers.
4. A credential row is `verified` only against the provider's own documented API
   (see `generation-adapters-audit.md`). Catalog presence ≠ usable provider.
5. A vault page reports facts it can prove. "0 encrypted / 0 plaintext" must
   distinguish *no config file* from *empty config file* (`config-file.cjs` returns
   `{ exists, values }` for exactly this reason).

---

## 6. Verifying

```bash
# vault keeps its read-only contract
npx tsx --tsconfig tsconfig.test.json tests/unit/tmcut_ai_vault.spec.ts
# one config reader, honest exists/empty split
npx tsx --tsconfig tsconfig.test.json tests/unit/tmcut_config_file.spec.ts
# per-surface slots resolve without leaking values to the renderer
node --test electron/tools/ai-gateway.test.mjs electron/tools/ai-secure.test.mjs
```

Grep that must stay empty (renderer handling a raw local slot):

```bash
grep -rn "AI_API_KEY" app/pages/system/ai-keys.vue app/composables/useTmcutAi.ts
```
