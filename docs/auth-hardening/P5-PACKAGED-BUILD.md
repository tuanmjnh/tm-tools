# P5 — Packaged build: what ships, what is proven

Companion to [`P0-AUDIT.md`](./P0-AUDIT.md) §9 and the two contracts it closes:
[`P3-JWT-JWKS.md`](./P3-JWT-JWKS.md) and [`P4-DEVICE-ENROLLMENT.md`](./P4-DEVICE-ENROLLMENT.md).

P5 answers one question: **can a Windows installer be distributed without a shared
secret, and does the installed app still work?** The short answer is yes, with the
enrollment gesture still manual (root approval), and three checks that need a real
sign-in left unproven by policy.

---

## 1. What ships inside the installer

| Item | Value |
| :--- | :--- |
| Installer | `release/tm-tools-1.0.0-setup.exe` |
| Size | 454,248,647 bytes (433 MiB) |
| Built | 2026-11-09 15:22 |
| SHA-256 | `69ec4ff8868d6933330db78278f3b027f55829338a99e787490e7c7aac947b85` |
| Baked public config | `resources/resources/public-config.json`, 569 bytes |
| Baked keys | `NUXT_PUBLIC_HUB_URL`, `NUXT_PUBLIC_HUB_APP_ID`, `AUTH_JWT_PUBLIC_KEYS` (1 public JWK, no `d`) |

No `AUTH_JWT_SECRET`, `NUXT_HUB_APP_SECRET`, provider key, database URI or private
signing key is written into the build. The allow-list in §2 is the mechanism; §4 is
the scan that checks the result.

### Why the window is not "reconfigured after build"

The app needs three values to verify Hub sessions: the Hub URL, the satellite App ID,
and the Hub public key set. All three are public. `pnpm build:electron` runs
`bake:public-config` first, which copies exactly those keys into
`resources/public-config.json`; `main.cjs` applies the file to `process.env` at boot,
**after** `config.env`, so a per-user override still wins.

Consequence: a fresh install answers `configured: true` with no App Secret and no
manual key paste. A machine that already has `config.env` keeps its values.

## 2. The allow-list (`electron/tools/public-config.cjs`)

```js
const PUBLIC_CONFIG_KEYS = ['NUXT_PUBLIC_HUB_URL', 'NUXT_PUBLIC_HUB_APP_ID', 'AUTH_JWT_PUBLIC_KEYS']
```

- Only those names are read from the shell env / `.env` and written to the file.
  `AUTH_JWT_SECRET` and `NUXT_HUB_APP_SECRET` are ignored even when present.
- `AUTH_JWT_PUBLIC_KEYS` must be a JSON array of JWKs; every entry must have
  `kty`, `n`, `e`, `kid` and must **not** contain `d`. One private key rejects the
  whole file.
- The file is generated (`resources/public-config.json` is gitignored); the logger
  prints key names, never values.
- `applyPublicConfig()` only fills **missing** env keys, so ordering is deliberate:
  `loadUserConfig()` → `applyPublicConfig()` → Nitro boot.

Spec: `tests/unit/public_config.spec.ts` — 6 checks (allow-list drops the two secrets,
rejects `d`, rejects malformed JSON, shell env wins, apply fills only missing keys,
missing file is a no-op).

## 3. Build chain

```
pnpm build:electron
  pnpm bake:public-config     # env/.env -> resources/public-config.json (allow-list)
  pnpm build:electron:main    # esbuild main.cjs
  nuxt build                  # .output
  copy:pdf-runtime           # pdfjs worker, font/cmap/wasm data, @napi-rs/canvas
  pnpm dereference:output     # replace pnpm symlinks before packaging
  electron-builder --win      # NSIS, extraResources resources/** -> resources/
```

The pdfjs step exists because Nitro's tracer follows static imports only, while
`pdf-to-img` reaches its worker and canvas runtime dynamically; without it every
packaged **PDF to images** job fails. See
`docs/document-studio/V5-IMPLEMENTATION-STATUS.md` §8.

`electron-builder.yml` copies `resources/**/*.{exe,json,node}` into the installed
`resources/resources/`, which is where `main.cjs` reads `public-config.json`.

## 4. Secret scan of `release/`

A probe read the non-empty `AUTH_JWT_SECRET` and `NUXT_HUB_APP_SECRET` values from
`.env` in memory and searched every file under `release/` (excluding `.blockmap`):

```
scanning 4868 files for 2 secret values
clean AUTH_JWT_SECRET
clean NUXT_HUB_APP_SECRET
baked keys: NUXT_PUBLIC_HUB_URL, NUXT_PUBLIC_HUB_APP_ID, AUTH_JWT_PUBLIC_KEYS
SCAN_EXIT=0
```

The scan reports key labels and file names only, never values. The string
`BEGIN RSA PRIVATE KEY` appears in 8 third-party files (Electron/ffmpeg binaries and
test fixtures); none matches a project key and none is ours. The probe script was
deleted after the run.

## 5. Packaged runtime evidence (2026-11-09)

Launched `release/win-unpacked/TM Tools.exe`; Nitro listened on `127.0.0.1:3456`.

| Check | Expected | Observed |
| :--- | :--- | :--- |
| First window | renders, no red error | Dashboard rendered, sidebar + cards, `Online · 914ms` |
| `GET /api/system/connection/status` | `{runtime, configured}` only | `{"runtime":"electron","configured":true}` |
| `GET /api/system/connection` (no session) | 401 | 401 |
| `GET /api/auth/me` (no session) | 401, not 503 | 401 |
| Settings → Hub connection | ready from built-in keys, App Secret off | "Connection ready — verified with the built-in public keys or the shared secret"; App ID `tm-tools_bae5xz`; App Secret **Not configured** |
| Hub URL / App ID form | pre-filled from bake | `http://localhost:4000`, `tm-tools_bae5xz`; both secret inputs empty |
| Device enrollment | starts against Hub | approval code `6VRW-JFNK`, "Waiting for approval in the browser…", poller active |
| Document Studio → Activity | renders | filter bar, list/grid, **Open output folder**, Refresh, empty state — no error |
| Document Studio → Library | renders | Input/Output tabs, search, **New Folder**, empty state — no error |
| Document Studio → AI Extraction | renders, explicit model state | output folder + **Change folder**; "No model selected" (relay catalogue is off until enrolled, §7) |
| Document Studio → Settings | renders + folder chooser | output folder field, **Select folder**, Save/Reset; Job database Connected; "Sign-in required: No" |
| Restart (close + relaunch) | same state, no re-entry | server up, `configured: true`, protected route 401, root session restored, no error page |

The pending authorization above issued nothing and expires after 10 minutes. Enrollment
was started from the user's existing root session inside the app; no password, seed
account or forged token was used.

## 6. What P5 does **not** prove (blocked, not failed)

| Check | Why it is blocked |
| :--- | :--- |
| Live device **approval** + credential issuance in the packaged app | needs a legitimate root session in a browser; policy forbids asking for or handling credentials, and a signed-in session must not be forged. Service-level single-use issuance is proven in P4 (19 Hub tests) |
| Login / logout through the packaged UI | same credential restriction. Only the persisted session's rendering is observed |
| Revoke → restart | requires an issued credential first (row above) |
| Two Windows users isolation | requires a second Windows account (administrator action outside this session). The vault is DPAPI-per-user by construction; P5 does not claim it tested |
| Online avatar (Hub `avatarUrl`) | the observed account has no avatar, so the packaged window showed the `SR` initials fallback. The online half is covered by P2 contract tests, not by this build |

Do not read this document as a signed-in PASS. The packaged build is proven for
configuration, rendering, root-only enforcement, enrollment start and restart;
the flows above remain open.

## 7. Packaging observations (not changed in P5)

- `resources/app.asar` is 742,825,875 bytes. Its header lists `node_modules` at
  ~853 MB uncompressed (77 production dependencies plus dev-only transitives such as
  `@rolldown`, `vite-plugin-checker`, `@nuxt`, `@tailwindcss`). The app runs, but the
  installer carries far more than the main process needs. Tightening `files` /
  production-dependency pruning is a separate packaging task; it was not attempted
  here because a rebuild would replace the artefacts this evidence refers to.
- AI relay and Hub Storage stay off until the device is enrolled: `fetchRelayCatalog()`
  returns no models, so the extraction picker shows its explicit empty state instead of
  a broken select. Enroll the device, then reload.
- Electron resolves `appData` through the Windows known-folder API, so an `APPDATA`
  environment redirect does not isolate a launch. Verification ran against the real
  `%APPDATA%\tm-tools` profile; nothing was deleted.
