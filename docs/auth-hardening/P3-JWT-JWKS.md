# P3 — Asymmetric JWT (RS256 + `kid`) and the JWKS contract

**Date**: 2026-11-09
**Scope**: `tm-hub` (issuer), `tm-tools`, `tm-studio`, `tm-trading` (verifiers)
**Decision source**: architecture decision "Electron Build Security, Root-only & Avatar"
**Evidence ledger**: [`P0-AUDIT.md`](./P0-AUDIT.md) §9 → P3

P3 removes the requirement that every client holds `AUTH_JWT_SECRET`. The Hub signs
with a private key that never leaves the server; clients verify with public JWKs.
HS256 keeps verifying during the migration window, so no existing session or satellite
breaks at cut-over.

---

## 1. Token contract

| Property | Value |
| :--- | :--- |
| Algorithm | `RS256` (RSA PKCS#1 v1.5 + SHA-256) |
| Header | `{ "alg": "RS256", "kid": "<AUTH_JWT_KEY_ID>" }` |
| Claims | unchanged: `sub`, `appId`, `email`, `name`, `roles`, `permissions`, `allowedRoutes`, `exp`, `iat` |
| TOTP challenge | same signer, `purpose: "totp"`, 5 minutes, never accepted as an access token |
| Refresh token | opaque 40-byte hex, unrelated to JWT signing (unchanged) |

When `AUTH_JWT_PRIVATE_KEY` is empty the Hub falls back to HS256 with
`AUTH_JWT_SECRET`. That keeps a single-node deployment bootable, but it is **not** the
target state: a public Electron build must never carry that secret.

## 2. Environment

### Hub (issuer — server only)

| Key | Meaning |
| :--- | :--- |
| `AUTH_JWT_PRIVATE_KEY` | PKCS#8 PEM, raw or base64-encoded (single line). **Never** ships to a client. |
| `AUTH_JWT_KEY_ID` | `kid` written into every header, default `hub-1`. Changes on rotation. |
| `AUTH_JWT_PUBLIC_KEYS` | JSON array of **public** JWKs kept for verification after a rotation. A key containing `d` is discarded. |
| `AUTH_JWT_SECRET` | Legacy HS256 secret; verification fallback until all issuers rotated. |

### Satellites (verifiers — public material only)

| Key | Meaning |
| :--- | :--- |
| `AUTH_JWT_PUBLIC_KEYS` | JSON array of public JWKs, normally copied from `GET /api/v1/auth/jwks`. Not a secret: a packaged build may embed it. |
| `AUTH_JWT_JWKS_URL` | tm-studio only, optional. When set, the verifier fetches the live key set before falling back to the inline copy. |
| `AUTH_JWT_SECRET` | Legacy HS256 fallback during the migration window. |

Generation (write the private half only into the Hub env):

```bash
node -e "const {generateKeyPairSync}=require('node:crypto');const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});process.stdout.write(Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'))"
```

## 3. JWKS endpoint

`GET /api/v1/auth/jwks` — public, no authentication, `Cache-Control: public, max-age=300`.

```json
{ "keys": [ { "kty": "RSA", "kid": "hub-1", "alg": "RS256", "use": "sig", "n": "…", "e": "AQAB" } ] }
```

Guarantees enforced in `server/modules/token/keys.ts`:

- Only `n`/`e` are exported; `d` is never written by `derivePublicJwks`.
- A client-supplied `AUTH_JWT_PUBLIC_KEYS` entry containing `d` is rejected before it is
  parsed as a key.
- The derived current key and the retained previous keys are de-duplicated by `kid`+`n`.

## 4. Verification rules (all three satellites)

1. Decode the protected header. An unreadable header fails closed.
2. `alg: RS256` → import the JWK whose `kid` matches the header (`kid` absent = try all),
   call `jwtVerify` with `algorithms: ['RS256']`. A wrong or unknown key returns `null`.
3. `alg: HS256` → verify with the legacy secret **only if** it is configured, with
   `algorithms: ['HS256']`.
4. Everything else — including `alg: none` — returns `null`. There is no implicit trust.
5. `purpose: "totp"` is never an access token.

tm-tools additionally treats “no public keys **and** no legacy secret” as
`503 error.authNotConfigured` instead of a misleading `401`. The Electron main-process
gate (`electron/tools/root-token.cjs`) applies the same two arms locally so a root can
still repair device configuration offline: RS256 via the public JWK, HS256 via the
legacy secret, identical root claim rule for both.

## 5. Rotation runbook

1. Generate the next keypair. Set `AUTH_JWT_PRIVATE_KEY` to the new key and
   `AUTH_JWT_KEY_ID` to its new id (e.g. `hub-2`).
2. Append the **old** public JWK to `AUTH_JWT_PUBLIC_KEYS`. Restart the Hub.
   New tokens carry the new `kid`; tokens signed with the old `kid` still verify, and
   `/api/v1/auth/jwks` publishes both.
3. Update `AUTH_JWT_PUBLIC_KEYS` in every satellite (or let tm-studio's
   `AUTH_JWT_JWKS_URL` pick it up) and redeploy. Both keys verify at this point.
4. Wait at least one access-token lifetime (15 minutes) plus the satellite deploy lag.
5. Remove the old public JWK from `AUTH_JWT_PUBLIC_KEYS` and restart.
6. Only after every client has been on RS256 for a full token lifetime: stop
   distributing `AUTH_JWT_SECRET`, then remove it from the satellites.

Skipping step 2 or step 4 invalidates the tokens that are still in flight.

## 6. Acceptance evidence

See [`P0-AUDIT.md`](./P0-AUDIT.md) §9 “P3 — RS256 + JWKS”. Summary: 18/18 Hub +
tm-tools + tm-studio HTTP checks and 5/5 tm-trading checks passed against running dev
servers, with both a current `kid` and a second retained `kid` accepted, and unknown
`kid`, foreign signature and `alg: none` refused.

## 7. Deliberate gaps (owned by P4/P5)

- Login and refresh were not exercised with a real account: that needs credentials, and
  the policy for this work forbids using seed accounts. Both issue tokens through the
  same `sign()` path that the matrix verified as RS256. P5 repeats the flow with a real
  sign-in during packaged first-run.
- `AUTH_JWT_SECRET` is still present in the dev `.env` files and in the Hub while the
  migration window is open. Removing it from the installer is a P4/P5 deliverable.
- Device credentials (P4) make the public-key distribution question moot for the
  desktop app: the device gets its own credential instead of inheriting app-wide rights.
