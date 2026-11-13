# P4 — Device enrollment and per-device credentials

> **Superseded in the product by Device Registry v2 (2026-11-10).** The RFC 8628
> enrollment flow described below is no longer reachable: `device:enroll`, the polling
> loop and the approval UI were removed from tm-tools and tm-studio. A normal sign-in
> now registers the device identity and Main receives the per-device credential through
> the auth broker; `device_credentials` (the service-credential table this document
> specifies) is kept as-is for AI Relay and Storage Gateway. Read this file as the
> design record for the P4 mechanics that still exist on the Hub; read
> `../ai-and-hub-connections.md` and the Hub's `docs/TM-DEVICE-AUTH-UPGRADE-v2/` for
> current behavior.

**Date**: 2026-11-09
**Scope**: `tm-hub` (issuer + guard), `tm-tools` (Electron client), `tm-hub-client` (SDK)
**Decision source**: architecture decision "Electron Build Security, Root-only & Avatar"
**Evidence ledger**: [`P0-AUDIT.md`](./P0-AUDIT.md) §9 → P4

P4 removes the last reason a public Electron build would need `NUXT_HUB_APP_SECRET`.
A device proves itself with a Hub-issued credential that is scoped to one app, one
enrolling user and one device, and can be revoked or rotated without touching the app
row. Nothing in the build is encrypted-and-hidden: there is simply no shared secret to
hide.

---

## 1. What changes, and what does not

| Layer | Before | After |
| :--- | :--- | :--- |
| Electron identity | `X-App-Id` + `X-App-Secret` from `.env` baked or hand-entered | `X-Device-Id` + `X-Device-Secret` issued once by the Hub, stored in the OS keychain |
| Server runtimes (Vercel, workers) | `X-App-Secret` | unchanged — server-only secret, never distributed |
| Hub storage authority | app-wide | device calls are confined to `users/{userId}/`; the app secret keeps app-wide access |
| Root requirement | password login only | an enrolled device may re-enroll / forget locally only when a root token is present |
| JWT verification | P3 RS256 + JWKS | unchanged |

The legacy `requireAppAuth` path is kept. It is not deleted before the new flow is
verified, and server runtimes still depend on it.

## 2. Enrollment flow (RFC 8628 shape)

```
Electron Main                         TM Hub                          Browser
     │ POST /auth/device/authorize      │                                │
     │ {appId, clientName, platform} ───▶│ create pending row             │
     │◀── deviceCode, userCode, …        │                                │
     │ shell.openExternal(verificationUri?code=USER-CODE) ───────────────▶│ /device
     │                                   │                                │ root signs in
     │                                   │◀── POST /auth/device/approve ──│ {userCode, decision}
     │                                   │    requireAuthPayload + requireRoot
     │ poll /auth/device/token           │                                │
     │ {deviceCode} ────────────────────▶│ pending → 428                  │
     │                                   │ approved → issue once → 200    │
     │◀── deviceId, secret, scopes ──────│                                │
     │ safeStorage → config.env          │                                │
```

### Endpoint contract

| Route | Auth | Success | Failure |
| :--- | :--- | :--- | :--- |
| `POST /api/v1/auth/device/authorize` | public, rate-limited 20 / 15 min / IP | `200 { success, data: { deviceCode, userCode: "ABCD-1234", expiresIn: 600, interval: 5, verificationUri, verificationUriComplete } }` | `400 error.missingAppId`, `400 error.unknownApp`, `429 error.tooManyRequests` (+ `Retry-After`) |
| `POST /api/v1/auth/device/approve` | root JWT | `200 { success, data: { appId, clientName, platform, expiresAt } }` | `401 error.unauthorized` / `error.invalidToken`, `403 error.notRoot`, `400 error.deviceCodeInvalid` (unknown, expired or already decided) |
| `POST /api/v1/auth/device/token` | public, rate-limited 240 / 10 min / IP | `200 { success, data: { deviceId, appId, userId, secret, scopes, expiresAt } }` **once** | pending `428 error.authorizationPending` (`data.error: authorization_pending`); denied `403 error.deviceAccessDenied` (`access_denied`); expired/used `400 error.deviceCodeExpired` / `error.deviceCodeUsed`; malformed `400 error.deviceCodeInvalid` |

Both codes are stored hashed (`device_code_hash`, `user_code_hash`, SHA-256 hex). The
plaintext secret appears in exactly one response and is never written to the database.
The approval transition is a conditional update (`status = 'approved'` → `'consumed'`),
so two concurrent polls cannot mint two credentials; the loser gets `error.deviceCodeUsed`.
If credential insertion fails after consumption, the approval is handed back to
`approved` so the device can retry the same poll.

### User code

- 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no `0/O/1/I`; displayed as
  `ABCD-1234`, accepted case-insensitively with or without the separator.
- Single-use, unique while pending, expires with the authorization (10 minutes).

## 3. Credential contract

| Field | Value |
| :--- | :--- |
| `deviceId` | UUID; the row id, sent as `X-Device-Id` |
| `secret` | `tmd_` + 32 random bytes base64url; sent as `X-Device-Secret` |
| Stored form | SHA-256 hex only (`secret_hash`); `secret_prefix` (first 12 chars) is display-only |
| `appId` | must match the app in the request path |
| `userId` | the root who approved; attribution for audit and storage namespacing |
| `scopes` | `ai.relay`, `storage.user` — deliberately narrower than the App Secret |
| `expiresAt` | `AUTH_DEVICE_CREDENTIAL_TTL_DAYS` (default 180, clamped 1–3650) |
| Status | `active` / `revoked`; revoked and unknown answer identically |

There is no scope that grants app config, presets, user management or app-wide storage.
`storage.user` is only meaningful together with the namespace rule in §4.

## 4. Enforcement at the Hub

`server/utils/device-auth.ts`:

- `requireDeviceAuth(event, { appId, scope })` — validates headers, UUID shape, Supabase
  availability, row status, expiry and a constant-time SHA-256 compare
  (`timingSafeEqual`). Failures: `401 error.deviceUnauthorized` (revoked and unknown are
  indistinguishable), `401 error.deviceExpired`, `403 error.forbidden` (app mismatch),
  `403 error.deviceScopeForbidden` (missing scope), `503 error.dbNotConfigured`.
  Activity is stamped `last_seen_at`/`last_seen_ip` at most once per 5 minutes and never
  on the request path.
- `requireAppOrDevice(event, { appId, scope })` — device headers win when present, so a
  device can never silently escalate to app-wide rights; otherwise the legacy
  `requireAppAuth` path runs and the app id must match.
- `deviceStorageNamespace(userId)` → `users/{userId}`.

Call sites: AI relay `catalog.get` / `chat.post` (`ai.relay`) and Storage Gateway
(`storage.user`, via `server/utils/storage.ts`). In the Gateway, a device caller is
rejected with `403 error.deviceScopeForbidden` before the manifest is touched unless the
namespace is exactly `users/{device.userId}`. This is the P0 §6 mitigation: the manifest
has no owner column yet, so a device must not inherit app-wide object access.

## 5. Electron surface (tm-tools Main)

Historical note: this section used to describe `electron/tools/device-enroll.cjs`,
which owned RFC 8628 enrollment, the polling loop and a root-gated `forget`. v2 retired
all of it. The credential's entire local lifecycle now lives in
`electron/tools/hub-login-broker.cjs` — the same module that receives it from a normal
sign-in — and `device-enroll.cjs` is deleted.

| IPC channel | Payload | Result |
| :--- | :--- | :--- |
| `device:status` | — | `{ enrolled, deviceId, appId, userId, hubUrl, hubOrigin, expiresAt, scopes }` (metadata only) |
| `device:forget` | — | `{ success: true, enrolled: false }` or `{ success: false, code: 'untrusted' }` |

There is no `device:enroll`: a credential is issued only to an authenticated user, so
enrollment *is* the normal sign-in (`auth:login`, `auth:verify-totp`,
`auth:passkey-finish`, `auth:register`).

Rules enforced in code:

- Every handler passes `isTrustedSender(event)` first; untrusted senders get a
  `{ success: false, code: 'untrusted' }` / `{ enrolled: false }` answer.
- The secret never crosses IPC. The renderer receives identity metadata only, and the
  broker strips `deviceCredential` before the IPC result is built.
- The credential is written through the same `safeStorage` vault as other secret slots
  (`tmcut:enc:v1:` magic, tolerant decrypt) into `config.env` under `userData`. If the
  keychain is unavailable the credential is dropped rather than written in plaintext.
- `HUB_DEVICE_SECRET` is a secret slot; the other `HUB_DEVICE_*` keys are plain config.
  Both lists are pinned by `tests/unit/secret_slots.spec.ts`.
- `HUB_DEVICE_HUB_ORIGIN` records the Hub that issued the credential. A credential is
  only offered to that exact `(origin, appId)` pair — see
  `shared/utils/deviceCredentialScope.ts` — so switching hubs produces a visible
  re-enroll state instead of a 401 reported as an expired session.
- `forget` is local-only and ungated: anyone signed in on this device may remove the
  local copy. Revoking the Hub record stays a root-only Hub API action
  (`DELETE /api/v1/auth/devices/:id`); this process never performs it on the caller's
  behalf, so the local action needs no root token.
- `forget` clears only `DEVICE_CREDENTIAL_KEYS`; app id, Hub URL, model and other
  settings survive.

**Dev-mode caveat**: under `pnpm dev` the Electron Main process and the Nuxt dev server
are separate processes, so `process.env` writes from Main are not visible to the dev
server until it restarts. In a packaged build the Nitro server is hosted in Main, reads
`config.env` per call, and picks the credential up immediately.

## 6. tm-hub-client support

`createHubClient({ ..., getDeviceCredential })` is the preferred credential source for
relay and storage. Resolution order per call:

1. `getDeviceCredential()` (sync or async) → `X-Device-Id` + `X-Device-Secret`.
2. Else `getAppSecret()` → `X-App-Secret` (server runtimes, Vercel).
3. Else throw before any network call.

An incomplete device credential (missing id or secret) falls back to the app secret. When
both device headers and `X-App-Secret` could apply, only the device headers are sent.

## 7. Root-only management

Device credentials are an administrative surface:

- Hub API: every `/auth/devices*` route and `/auth/device/approve` runs
  `requireAuthPayload` + `requireRoot`.
- Hub UI: `/device` approval page and `/system/settings/devices` are hidden for non-root;
  the API refuses direct calls regardless of UI state.
- `GET /api/v1/auth/devices` returns metadata only — id, name, app, platform, scopes,
  status, prefix, timestamps. No hash, no secret.
- Revoke: `DELETE /auth/devices/{deviceId}` → the next request with that credential is
  `401`. Rotate: `POST /auth/devices/{deviceId}/rotate` keeps the id, returns the new
  secret once, the old secret dies immediately.
- Both routes audit (`auth.device.revoke` / `auth.device.rotate`); enrollment audits
  `auth.device.enroll` with the approving user as actor.

A non-root cannot see or call any of this, so a leaked device credential cannot be used to
enumerate or rotate other devices.

## 8. Database

`supabase/migrations/20261109000000_device_credentials.sql` is additive:

- `device_authorizations` — pending/approved/denied/consumed/expired, hashed codes,
  `expires_at`, `requested_ip`, `attempts`.
- `device_credentials` — `id` is the device id, `secret_hash`, `secret_prefix`, `scopes`,
  `status`, `issued_from`, `expires_at`, `last_seen_*`, `revoked_*`.

Apply manually in the Supabase SQL Editor; the repo has no migration runner, and fresh
bootstrap uses `schema.sql` (which must stay in sync). RLS is open to PostgREST roles as
in every other Hub table; authorization is enforced in the API layer.

## 9. Rollback

The new path is additive. To fall back:

1. Stop enrolling devices; existing credentials keep working until revoked.
2. Revoke enrolled devices in the Hub.
3. Server runtimes are unaffected — they never used device credentials.
4. `requireAppOrDevice` still accepts `X-App-Secret`, so relay and storage keep working
   for app-secret callers throughout.

No migration rollback is needed for a code rollback; dropping the two tables only loses
device enrollments.

## 10. Deliberate gaps (owned by P5)

- **Approval and issuance were proven at service level**, not through a live root
  browser session: this work is not allowed to use seed credentials or forge a session.
  Live HTTP evidence covers every public route and the device guard (see
  [`P0-AUDIT.md`](./P0-AUDIT.md) §9). `tests/device-lifecycle.test.ts` covers approve,
  double-approve, deny, expiry, single-use issuance, revoke and rotate with a stateful
  fake. P5 repeats the approval with a real sign-in during packaged first-run.
- Storage objects still have no owner column. The `users/{userId}` namespace rule is the
  mitigation; adding `owner_user_id` to the manifest is a follow-up, not a P4/P5 blocker
  (Electron document jobs are local-first).
- The Windows installer and asar scan, two Windows users, and offline avatar are P5.
