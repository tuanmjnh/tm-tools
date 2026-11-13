# P0 — Auth Hardening Audit (JWT, App Secret, Device Enrollment)

**Date**: 2026-11-09
**Scope**: `tm-hub`, `tm-hub-client`, `tm-tools` (Electron + web), satellite impact on `tm-studio`, `tm-trading`
**Decision source**: architecture decision "Electron Build Security, Root-only & Avatar" (2026-11-09)

This document is the evidence ledger for P0. Later phases update the tables instead of
rewriting them, so a claim in P1–P5 can always be traced back to a file and a line.

---

## 1. Secret inventory

| Secret | Read at | Used by | Shipped to client? |
| :--- | :--- | :--- | :--- |
| `AUTH_JWT_SECRET` | `tm-hub/nuxt.config.ts:104` → `runtimeConfig.jwtSecret` | HS256 **fallback** signer (only when no private key) and transitional verifier in `tm-hub/server/modules/token/jwt.ts` | No (server only) |
| `AUTH_JWT_PRIVATE_KEY` (P3) | `tm-hub/nuxt.config.ts:108` → `runtimeConfig.jwtPrivateKey` | `server/modules/token/keys.ts` → RS256 signer; public half derived in memory | **Never** — only the derived public JWK leaves the server |
| `AUTH_JWT_KEY_ID` (P3) | `tm-hub/nuxt.config.ts:109` | `kid` header on every token, default `hub-1` | Yes (public identifier) |
| `AUTH_JWT_PUBLIC_KEYS` (P3) | Hub: `nuxt.config.ts:111`; satellites: their own config | Hub: retained public JWKs for verification after rotation. Satellites: the verification key set | Yes — public material, safe in a packaged build |
| `AUTH_JWT_SECRET` | `tm-tools/server/config/index.ts:175` (`config.auth.accessTokenSecret`) | `tm-tools/server/utils/jwt.ts` HS256 fallback; `server/middleware/auth.ts` 503 only when neither keys nor secret exist | **No** — P5 ships only the public key set (`public-config.json`). A value a user pastes into `config.env` stays a per-user legacy fallback and is never packaged |
| `AUTH_REFRESH_TOKEN_SECRET` | `tm-tools/server/config/index.ts:179` | `tm-tools/server/utils/jwt.ts:22,35` — **unused**: no route calls `signAccessToken`/`signRefreshToken`/`verifyRefreshToken` (verified by grep) | No |
| `NUXT_HUB_APP_SECRET` | `tm-tools/server/config/index.ts:190` (`config.hub.appSecret`) | `server/utils/aiRelay.ts:64` (relay catalogue + chat), `server/utils/hubStorage.ts:212` (Storage Gateway) | No, and after P4 the Electron build does not need it: an enrolled device sends `X-Device-Id` + `X-Device-Secret`. The remaining consumer is a server runtime (Vercel/workers) |
| `HUB_DEVICE_SECRET` (P4) | `tm-tools/server/config/index.ts:206` (`config.hub.deviceSecret`) | `tm-hub-client` device headers for relay + storage; written by the enrollment flow | **No** — stored through `safeStorage` in `userData/config.env` (DPAPI); never in the renderer, localStorage or the installer |
| `HUB_DEVICE_ID`/`_USER_ID`/`_APP_ID`/`_EXPIRES_AT`/`_SCOPES` (P4) | `tm-tools/server/config/index.ts:203-218` | device identity metadata, display and expiry checks | No secret; identity metadata only |
| `apps.secret_key` (DB row) | `tm-hub/server/utils/authz.ts:160-186` | `requireAppAuth`, `requireStorageApp` | N/A (per-app, rotatable) |
| Decrypted secrets at rest | `tm-tools/electron/main.cjs:62` (`loadUserConfig` → `safeStorage.decrypt`) | every `SECRET_SLOT_RE` key in `userData/config.env`, including `HUB_DEVICE_SECRET` | No (DPAPI) |

Satellites that verify Hub tokens — migrated in P3 to public JWKs with the shared
secret kept only as the transitional fallback (contract: [`P3-JWT-JWKS.md`](./P3-JWT-JWKS.md)):

- `tm-studio/server/utils/tokenVerify.ts` (verifier factory) + `server/utils/jwt.ts` (wiring)
- `tm-trading/server/modules/token/jwt.ts` + `nuxt.config.ts`
- `tm-tools` (this repo): `server/utils/jwt.ts`, `server/middleware/auth.ts`,
  `electron/tools/root-token.cjs`

## 2. Endpoints that require **App Secret** (`X-App-Id` + `X-App-Secret`)

Guard: `tm-hub/server/utils/authz.ts:153 requireAppAuth` → `timingSafeEqual` against
`apps.secret_key`.

| Feature | Endpoints |
| :--- | :--- |
| AI relay | `POST /api/v1/apps/:id/ai/relay/chat`, `GET /api/v1/apps/:id/ai/relay/catalog` |
| Storage Gateway | `GET /storage/connections`, `GET|POST|DELETE /storage/folders`, `GET /storage/objects`, `GET|DELETE /storage/objects/:objectId`, `POST /storage/objects/:objectId/copy`, `POST /storage/objects/:objectId/download-grant`, `POST /storage/uploads/initiate`, `POST /storage/uploads/:uploadId/complete`, `POST /storage/uploads/:uploadId/abort` |

Also app-secret-shaped (not in the table above): `GET /api/v1/apps/:id/ai/provider-presets`.

Total: **14 endpoints** (12 storage + 2 relay, provider-presets shares the guard).

`tm-hub-client` exposes `getAppSecret` and attaches `X-App-Secret` from
`src/client.ts:183 appSecretHeaders()` for the same groups (relay, storage, uploads).
After P4 the same groups also accept an enrolled device (`X-Device-Id` +
`X-Device-Secret`) through `requireAppOrDevice`; device headers win and the scope must
match. Storage is additionally confined to `users/{userId}/` for device callers (§6).

## 3. Endpoints requiring a **user JWT** (tm-tools local server)

`tm-tools/server/middleware/auth.ts`. Every `/api/*` request needs a Bearer token or the
`accessToken` cookie, except this allow-list:

| Public route | Why it is public |
| :--- | :--- |
| `/api/auth/login`, `/register`, `/refresh` | no session yet |
| `/api/health`, `/api/system/network` | liveness |
| `/api/system/connection/status` | public-safe: runtime + one `configured` boolean. Full diagnostics moved to `/api/system/connection` (root session) in P1 |
| `/api/v1/documents/health` | monitoring has no user session |
| `/api/v1/documents/maintenance/cleanup` | cron proves itself inside the handler |

Claim checks after verification:

- Neither `AUTH_JWT_PUBLIC_KEYS` nor `AUTH_JWT_SECRET` present → `503 error.authNotConfigured`
  (P3: public keys alone are sufficient; the secret is only the fallback)
- `payload.appId` ≠ this app → `403` unless root / `*` / cross-app capability (`auth.ts:66-74`)
- `server/middleware/rbac.ts:24` treats `permissions.includes('*')` or `role === 'root'` as full access

**Defect found in P0, fixed in P1**: Hub access tokens carry `roles: string[]`, not `role`.
tm-tools now funnels every root decision through `server/utils/authz.ts`
(`isRootClaims`), which accepts `role === 'root'`, `roles.includes('root')` and
`permissions.includes('*')`. `server/middleware/auth.ts` and
`server/api/system/connection.get.ts` use it; the API-route checks that still read a
single `role` field (`server/api/chat/index.post.ts`, `server/utils/chatAuth.ts`,
`server/middleware/rbac.ts`) were left unchanged because the wildcard branch already
grants root and changing them is out of P1 scope.

## 4. Client-side carve-outs (UI)

| Location | Behaviour after P1 |
| :--- | :--- |
| `tm-tools/app/middleware/auth.global.ts` | non-root navigating to `/system/settings/hub` is redirected to `/`; root proceeds |
| `tm-tools/app/pages/system/settings.vue` | the Hub tab is rendered only when `isRoot` (`role === 'root'` or `permissions` includes `*`) |
| `tm-tools/app/components/document-studio/ConnectionAlert.vue` | root gets the settings button; non-root gets a "contact an administrator" text and no link |
| `tm-tools/app/pages/system/settings/hub.vue` | `set-config` sends the renderer's access token; the main process refuses with `code: 'notRoot'` when the stored secret is already configured and the token is not a root HS256 token for it |
| `tm-tools/app/pages/system/settings/hub.vue` (P4) | device enrollment card: `device:enroll`/`device:forget` require a root token only when a credential already exists; the renderer sees identity metadata and progress phases, never the secret. **Historical from v2:** the enrollment card and `device:enroll` are removed; the page now shows device metadata + health and links to `/system/settings/devices` |
| `tm-hub/app/pages/device.vue` + `app/pages/system/settings/devices.vue` (P4) | approval page and device list are root-only; the API refuses non-root direct calls regardless of UI |

Server side, `/api/system/connection` is root-only (`requireRootAuth`). The public
surface is `/api/system/connection/status`, which answers `runtime` and `configured`
only — no URL, App ID or credential booleans.

## 5. Electron boot path

```
electron/main.cjs
  ├─ loadUserConfig()            reads userData/config.env, safeStorage-decrypts SECRET_SLOT_RE keys
  ├─ NITRO_PORT / NITRO_HOST     loopback only
  ├─ TOOLS_DATA_DIR              = userData (jobs, local document files)
  └─ import .output/server/index.mjs   in-process Nitro
```

- `userData` is **per Windows user**; `config.env` is therefore not shared between accounts
  on one machine. A device credential stored in `safeStorage` follows the same rule, which
  is the correct behaviour for a device/account pair.
- `get-config` masks secret slots to `********` (`main.cjs:274`), `set-config` merges and
  re-encrypts (`main.cjs:292`).
- Nothing in the renderer can read the stored plaintext; `window.electronAPI` exposes only
  `getConfig`/`setConfig` (`electron/preload.cjs:128-129`).

## 6. Storage ownership — blocker for a user-scoped device credential

`tm-hub/supabase/migrations/20261107000000_storage_gateway.sql` defines
`storage_objects` and `storage_folders` with `app_id` but **no owner user column** (lines
51-99). The Gateway authorizes the app, and objects are shared across every caller of that
app.

Consequence: a device credential allowed to call Storage Gateway would be equivalent to the
App Secret *for storage*. The decision explicitly forbids that.

Mitigation chosen for P4 (no destructive schema change):

1. Device-scoped storage calls are accepted only for namespaces under `users/{userId}/`,
   enforced in the Hub before touching the manifest. Anything else answers
   `403 error.deviceScopeForbidden`.
2. App Secret (server runtimes, Vercel) keeps the current app-wide behaviour.
3. Adding `owner_user_id` to the manifest is a follow-up; it is not required to remove the
   App Secret from the installer because Electron document jobs are local-first.

Relay scope: the device credential may call `ai.relay` only for its own app, attributed to
the enrolling user in the audit log, rate-limited per device. No provider key is ever
returned by the relay, so this is narrower than the App Secret (which can also read app
config, presets and storage).

## 7. Phase plan and acceptance tests

| Phase | Work | Acceptance evidence |
| :--- | :--- | :--- |
| P1 | Root-only UI + server checks for `/api/system/connection`, the Hub settings page, and admin config routes | non-root direct `GET /api/system/connection` → 403; anonymous → safe metadata only; root → full; UI tab hidden for non-root |
| P2 | `avatarUrl` end to end | Hub `me.get` returns it; tm-tools maps it in `fetchUser`, `applyAuthData`, refresh; `UserMenu` shows account avatar → bundled local fallback → initials, with network off |
| P3 | RS256 + `kid` + JWKS, transitional HS256 verification | **Done** — contract in [`P3-JWT-JWKS.md`](./P3-JWT-JWKS.md), evidence in §9. Hub signs RS256; `GET /api/v1/auth/jwks` publishes public keys only; tm-tools/tm-studio/tm-trading verify by `kid` with an HS256 fallback; old HS256 tokens still verify; two `kid`s pass at once. `electron/tools/root-token.cjs` now verifies RS256 public keys as well as legacy HS256 |
| P4 | Device enrollment + per-device credential | **Done, then superseded by Device Registry v2 (2026-11-10)** — contract in [`P4-DEVICE-ENROLLMENT.md`](./P4-DEVICE-ENROLLMENT.md), evidence in §9. The RFC 8628 authorize/approve/token flow and the per-device credential contract it produced are still what the Hub issues and enforces; what changed is how a client obtains one: a normal login now registers the device identity and Main brokers the credential (no approval page, no `device:enroll`). Credential stays in `safeStorage` and never crosses IPC; scopes `ai.relay` + `storage.user`; storage confined to `users/{userId}/`; root-only list/revoke/rotate |
| P5 | Real installer verification | **PARTIAL — evidence in §9**, contract in [`P5-PACKAGED-BUILD.md`](./P5-PACKAGED-BUILD.md). Built `tm-tools-1.0.0-setup.exe` (454,248,647 B); installer scan clean; packaged first-run, root-only 401, enrollment start, Document Studio rendering and restart proven. Live login/logout, approval/revoke and two-Windows-user isolation stay blocked on credentials (§9) |

## 8. Non-goals (explicitly unchanged)

- Satellite RBAC rules and route seeds.
- The password login endpoint (kept for web); device authorization is added beside it.
- Local document job storage (`localJobRepository`) and the local/Electron storage policy.
- Any secret rotation: the user rotates; this work only removes distribution.

---

## 9. Verification log

Every result below came from a running server, not from typecheck. Tokens were minted
locally with a dev keypair or the configured `AUTH_JWT_SECRET` (read from `.env`, never
printed); no password, seed account or browser session was used. Probe scripts lived in
`tm-tools/.tmp-probe/` and were deleted after the run.

### P1 — root-only access (tm-tools dev server, `:4002`, 2026-11-09)

| Request | Expected | Observed |
| :--- | :--- | :--- |
| `GET /api/system/connection`, no token | 401 | 401 `error.tokenMissing` |
| `GET /api/system/connection`, non-root token (`role: user`, `permissions: [pdf.read]`) | 403 | 403 `error.notRoot` |
| `GET /api/system/connection`, expired root token | 401 | 401 `error.invalidToken` |
| `GET /api/system/connection`, forged signature | 401 | 401 `error.invalidToken` |
| `GET /api/system/connection`, token with only `roles: ['root']` | 200 | 200, no secret string in body |
| `GET /api/system/connection`, root token | 200 | 200 `{ runtime, authProvider, hubUrl, appId, *Configured: boolean }` |
| `GET /api/system/connection/status`, anonymous | 200 | 200 `{ runtime, configured }` only |
| `GET /api/system/connection/status`, non-root | 200 | 200 `{ runtime, configured }` only |

Body scan for `AUTH_JWT_SECRET|NUXT_HUB_APP_SECRET|secretKey|secret_key` was negative on
all eight responses.

Unit evidence:

- `tests/unit/authz_root.spec.ts` — 11 checks over `isRootClaims` and the Electron
  `isRootHs256Token` gate.
- `tests/unit/auth_refresh.spec.ts` — 26 checks, including three P2 checks below.
- `npx tsx tests/unit/run-all.mts` → `44/44 specs passed`.
- `npx nuxt typecheck` → exit 0, `grep -c "error TS"` = 0.
- `npx eslint <touched files>` → exit 0 **after** `.nuxt/eslint.config.mjs` was
  regenerated by typecheck (config mtime recorded).

### P2 — avatar round trip (Hub dev server, `:4000`, 2026-11-09)

1. `GET /api/v1/auth/me` with a token for a real user whose `users.avatar_url` was set to
   a sentinel: `avatarRoundTrip=true`, `nameRoundTrip=true`, status 200.
2. `users.avatar_url` was restored to its previous value in the same run:
   `restored=true`. No audit row was written and the probe user's name/email never left
   the process.
3. Renderer mapping is executed by the real composable in `auth_refresh.spec.ts`:
   - `fetchUser` maps `avatarUrl` → `user.avatar`, and the value survives a refresh.
   - `avatarUrl: null` maps to `undefined`, which is what selects the bundled fallback.
   - `UserMenu.vue` must use `'/icon.png'` and must not reference `github.com`,
     `avatars.githubusercontent.com` or `dicebear`.
4. `FALLBACK_AVATAR` in `app/utils/constants.ts` is now `'/icon.png'`; the notification
   slideover no longer depends on an external avatar host.

Not yet proven here (moved to P5): avatar rendering inside the packaged window with the
network disabled, and a profile save made through the real UI. The renderer half is
covered by the composable spec, the network-off half by the bundled asset.

### P3 — RS256 + JWKS (four dev servers, 2026-11-09)

`GET /api/v1/auth/jwks` → `200`, one current key and one retained key:
`{"kids":["hub-1","hub-0"],"hasD":false}`.

**Hub `:4000`, `GET /api/v1/auth/permissions`:**

| Token | Expected | Observed |
| :--- | :--- | :--- |
| RS256, current `kid` `hub-1` | 200 | 200 |
| RS256, retained `kid` `hub-0` (rotation overlap) | 200 | 200 |
| RS256, unknown `kid` `hub-9` | 401 | 401 |
| RS256, foreign signature, `kid` `hub-1` | 401 | 401 |
| Legacy HS256 | 200 | 200 |
| `alg: none` | 401 | 401 |
| RS256 with `purpose: totp` | 401 | 401 |
| No token | 401 | 401 |

**tm-tools `:4002`, `GET /api/system/connection` (root-only):** RS256 root 200, RS256
non-root 403, RS256 unknown `kid` 401, legacy HS256 root 200, anonymous 401; public
`/status` 200 for anonymous.

**tm-studio `:4003`, `GET /api/v1/process/runs`:** RS256 for this app 200, RS256 for
another app 403, legacy HS256 200, anonymous 401.

**tm-trading `:4001`, `GET /api/v1/instruments`:** RS256 root 200, foreign-app 403,
unknown `kid` 401, legacy HS256 200, anonymous 401.

Total **23/23** HTTP checks passed; no response contained a private key, `"d":`, or a
secret value.

Unit evidence:

- `tests/unit/jwt_rs256.spec.ts` — 9 checks: current key, unknown `kid`, foreign
  signature, HS256 fallback, RS256-only mode, `alg: none`, `d`-carrying key discarded,
  material detection.
- `tests/unit/authz_root.spec.ts` — 16 checks, including five RS256 cases for the
  Electron `isRootAccessToken` set-config gate.
- tm-studio `tests/unit/tmcut_token_verify.spec.ts` — 16 checks (inline keys, JWKS URL,
  introspection fallback, cache, `alg: none`, `d` rejection).
- `npx tsx tests/unit/run-all.mts` → `45/45 specs passed`.
- `npx nuxt typecheck` exit 0 / `grep -c "error TS"` = 0 in tm-hub, tm-tools, tm-studio;
  `npm run typecheck` exit 0 in tm-trading.
- Scoped `npx eslint` exit 0 for every touched file in tm-tools and tm-studio, run after
  the last `.nuxt/eslint.config.mjs` regeneration.

Not proven in P3: login and refresh with a real account. That requires credentials the
policy for this work forbids using; both issue through the same `sign()` path the matrix
verified. P5 repeats the flow with a real sign-in during packaged first-run. The dev
`AUTH_JWT_SECRET` is still present for the migration window and is removed from the
installer in P5.

### P4 — device enrollment (Hub `:4000`, app `tm-tools_bae5xz`, 2026-11-09)

All requests used the public routes or the device guard with a deliberately wrong secret;
no valid credential was created, and no root session, seed account or password was used.

| Request | Expected | Observed |
| :--- | :--- | :--- |
| `POST /api/v1/auth/device/authorize` `{appId, clientName, platform}` | 200 with codes | 200 `{ deviceCode, userCode: "42WJ-9NDC", expiresIn: 600, interval: 5, verificationUri, verificationUriComplete }` |
| `POST /api/v1/auth/device/authorize` unknown app | 400 | 400 `error.unknownApp` |
| `POST /api/v1/auth/device/token` pending code | 428 | 428 `error.authorizationPending`, `data.error: "authorization_pending"` |
| `POST /api/v1/auth/device/token` unknown code | 400 | 400 `error.deviceCodeInvalid` |
| `POST /api/v1/auth/device/approve`, anonymous | 401 | 401 `error.unauthorized` |
| `GET /api/v1/auth/devices`, anonymous | 401 | 401 `error.unauthorized` |
| `GET /api/v1/apps/:id/ai/relay/catalog`, UUID device id + wrong secret | 401 | 401 `error.deviceUnauthorized` |
| `GET /storage/connections`, same device headers | 401 | 401 `error.deviceUnauthorized` |
| Any device route, malformed device id | 401 | 401 `error.deviceUnauthorized` |
| `GET /storage/connections`, anonymous | 401 | 401 `error.unauthorized` |

No response contained a secret, a hash or `secret_hash`. One pending authorization row
was created by the authorize probe; it expires after 10 minutes and issues nothing.

Unit evidence:

- `tm-hub/tests/device-lifecycle.test.ts` — 19 tests with a stateful fake Supabase:
  codes, secret hashing/prefix, TTL clamp (180 / 30 / 0 → 180 / 99999 → 3650), create,
  approve/deny, double-approve 400, pending poll, **single-use issuance** (second poll
  `error.deviceCodeUsed`, hash only, no `*` scope), expired/denied never issue, list has
  no hash, revoke twice → 404, rotate keeps id and expiry, revoked rotate 404. This is
  where approval and consumption are proven, because no legitimate root session is held.
- `tm-tools/tests/unit/device_enroll.spec.ts` — 15 tests: unenrolled/enrolled status
  without secret, pending → 428 → issued (progress `authorizing, pending, issued`,
  browser opened, config written, secret absent from calls and IPC result), fresh
  install needs no root, denied/expired/unreachable/rejected, not configured makes no
  network call, busy lock, re-enroll and forget root gate, rotate, forget removes only
  `DEVICE_KEYS`.
- `tm-tools/tests/unit/secret_slots.spec.ts` — `HUB_DEVICE_SECRET` is a secret slot;
  the other `HUB_DEVICE_*` keys are plain, so the renderer may read metadata only.
- `tm-hub-client/tests/storage.test.mjs` — 4 new tests: device credential wins with no
  `X-App-Secret`, relay device → app fallback, incomplete device credential falls back,
  async getter awaited.

Runs: `tm-tools` `npx tsx tests/unit/run-all.mts` → `46/46 specs passed`; `tm-hub`
`pnpm test` → `197/197`; `tm-hub-client` `pnpm test` → `21/21` (after
`pnpm typecheck` + `pnpm build` exit 0). `tm-tools` `nuxt typecheck` exit 0 with
`grep -c "error TS"` = 0, and scoped `eslint` exit 0 after the last
`.nuxt/eslint.config.mjs` regeneration (26053 bytes, 14:57).

Deliberate gaps carried to P5: the live approval/consume step (service-level proof above),
installer/asar/sourcemap secret scan, packaged first-run enrollment, revoke-then-restart,
two Windows users, and offline avatar.

### P5 — packaged build (Windows `win-unpacked`, `:3456`, 2026-11-09)

Contract: [`P5-PACKAGED-BUILD.md`](./P5-PACKAGED-BUILD.md).

Artefacts: `release/tm-tools-1.0.0-setup.exe`, 454,248,647 bytes, built 15:22,
SHA-256 `69ec4ff8…aac947b85`. Baked `resources/resources/public-config.json` carries
`NUXT_PUBLIC_HUB_URL`, `NUXT_PUBLIC_HUB_APP_ID` and one public JWK (no `d`).

Secret scan: 4,868 files under `release/` searched for the live `AUTH_JWT_SECRET` and
`NUXT_HUB_APP_SECRET` values — both clean, exit 0. `BEGIN RSA PRIVATE KEY` occurred only
in third-party Electron/ffmpeg binaries and fixtures. Probe deleted afterwards.

Runtime, launched from `win-unpacked`:

| Request / view | Expected | Observed |
| :--- | :--- | :--- |
| first window | renders | Dashboard, `Online · 914ms`, no red error |
| `GET /api/system/connection/status` | `{runtime, configured}` | `{"runtime":"electron","configured":true}` |
| `GET /api/system/connection`, anonymous | 401 | 401 |
| `GET /api/auth/me`, anonymous | 401 (not 503) | 401 |
| Settings → Hub | ready via built-in keys | "Connection ready"; App ID `tm-tools_bae5xz`; App Secret **Not configured**; form pre-filled `http://localhost:4000` |
| Device enrollment | starts | code `6VRW-JFNK`, waiting for browser; nothing issued, expires in 10 min |
| Document Studio Activity / Library / AI Extraction / Settings | render, folder chooser | all rendered; Activity has **Open output folder**, Settings has **Select folder**; extraction shows explicit "No model selected" until enrolled |
| restart | state persists, no re-entry | server up, `configured: true`, 401 on protected route, root session restored |

Blocked, not failed: live approval/issue, login/logout, revoke-then-restart and
two-Windows-user isolation need a legitimate root session or a second Windows account;
the online avatar needs an account with `avatarUrl` (observed account shows the `SR`
initials fallback). No password, seed credential or forged session was used.

Packaging note: `app.asar` is 742,825,875 B because `node_modules` (~853 MB uncompressed,
including dev-only transitives) is packaged wholesale. The app runs; pruning the asar is
a separate packaging task and was not done here.
