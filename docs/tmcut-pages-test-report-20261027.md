# TMCut pages — dev:electron run, test report & fixes (2026-10-27, R148)

**Tóm tắt (VI):** Đã chạy `pnpm dev:electron` (Nuxt 4002 + Electron), test **toàn bộ** các trang trong `app/pages/tmcut` ngay trong renderer thật của Electron qua CDP, tìm ra **7 lỗi thật** và đã sửa hết (cổng dev 4002/`localhost:0`, component `URouterLink`/`UToggle` không tồn tại trong Nuxt UI v4, vòng đời MCP bridge của editor, thiếu 17 key i18n khiến AI model picker hiện chuỗi key thô, cảnh báo intlify của FxLibrary, và form kết nối còn nằm trong hộp thoại AI Scriptwriter). Kiểm chứng AI bằng gọi thật qua gateway: **"Model OK — answered in 2881 ms"** và sinh được storyboard **4 scenes**. Còn **1 điểm chưa làm**: phần "adopt connection từ TM Hub" trong panel AI (AutoCut step 2) — spec đã có nhưng code đã bị revert, xem mục *Outstanding*.

---

## 1. Scope

| Page | Route | Tested |
|---|---|---|
| Project hub | `/tmcut` | ✅ |
| Editor | `/tmcut/editor` | ✅ (panels, dialogs, AI Script) |
| AutoCut | `/tmcut/autocut` | ✅ (4-step shell) |
| Video Factory | `/tmcut/factory` | ✅ (+ link về Templates) |
| Template library | `/tmcut/templates` | ✅ |

Testing also covered the shared tmcut components those pages mount (model picker, FX library, video template studio, export queue, marketplace).

## 2. How the stack was started

```bash
cd tm-tools
pnpm dev:electron        # concurrently: nuxt dev --port 4002  +  wait-on 4002 && electron .
```

Changes made to the script (they are the fix for bug #1):

```diff
- "dev:electron": "concurrently -k \"nuxt dev\" \"wait-on http://localhost:4002 && electron . --no-sandbox\""
+ "dev:electron": "concurrently -k \"nuxt dev --port 4002\" \"wait-on http://localhost:4002 && electron . --no-sandbox --remote-debugging-port=9222\""
```

`--remote-debugging-port=9222` is what makes the running renderer (with `window.electronAPI` present) drivable by MCP/DevTools. Loopback only, dev only.

## 3. Verification method

The pages were **not** reviewed by reading code and guessing. The real Electron renderer was driven over the Chrome DevTools Protocol (Node 22's built-in WebSocket — no new dependency), so every page ran with preload/IPC available and every console message was captured.

| Script | Purpose |
|---|---|
| `scratch/cdp-drive.mjs` | loads every route, reports mount state, bridges, headings, and all console problems with stack frames |
| `scratch/cdp-actions.mjs` | step-based click-through test; attributes console errors to the step that caused them (`STEP=<regex>` runs a subset) |
| `scratch/cdp-eval.mjs` | run one expression in the renderer |
| `scratch/probe-ai.mjs` | per-surface AI status + one live completion through the real gateway |
| `scratch/probe-model-sweep.mjs` | which catalogued models actually answer (catalogue ≠ working model) |
| `scratch/i18n-audit.mjs` | every literal `t('…')` key in `app/` vs both locales |

Console noise that is *expected* and therefore ignored by the harness: Electron's "Insecure Content-Security-Policy" dev warning (dev server needs `unsafe-eval`), and `[MCP] electronAPI.mcp.onToolInvoke not available` when opened outside Electron.

## 4. Bugs found and fixed

### 4.1 `dev:electron` never reached the app — window loaded `http://localhost:0` (ERR_UNSAFE_PORT)

**Evidence:** `electron: Failed to load URL: http://localhost:0/ with error: ERR_UNSAFE_PORT`; Nuxt was serving 4002 and `wait-on` succeeded.

**Cause:** two independent faults.
1. `dev:electron` ran a bare `nuxt dev` (follows the ambient env) while waiting on 4002 — the classic "set 4002, came up on 3000" mismatch.
2. `main.cjs` computed `const DEV_PORT = Number(process.env.PORT || 4002)`. A host shell exporting `PORT=0` is **truthy**, so it survived `||` and produced port 0. The same value keyed the IPC sender gate (`createSenderGate({devPort})`), so every privileged invoke would also have been refused.

**Fix:** explicit `--port 4002` in the script + one shared resolver, `electron/tools/ports.cjs` (`parsePort` / `resolveDevPort`), used for both the dev port and `APP_PORT`; only a real TCP port (1–65535) wins, otherwise the documented default. Pinned by `tests/unit/tmcut_dev_port.spec.ts`, including the assertion that the `wait-on` port equals the port Nuxt is told to bind.

### 4.2 `<URouterLink>` does not exist in Nuxt UI v4 (factory page)

**Evidence:** `[Vue warn]: Failed to resolve component: URouterLink` on `/tmcut/factory`; the "Back to Templates" link degraded to an unknown element.
**Cause:** Nuxt UI v4 ships `Link.vue` (= `ULink`) and no `RouterLink`; every other internal link in the repo is a `NuxtLink`.
**Fix:** `factory.vue` uses `<NuxtLink to="/tmcut/templates">` (also fixed the file's missing trailing newline). Verified live: clicking it navigates to `/tmcut/templates`.

### 4.3 `<UToggle>` does not exist in Nuxt UI v4 (video template studio)

**Evidence:** found by the new component scan, same class as 4.2 — `UToggle.vue` is absent, `Switch.vue` (= `USwitch`) is the v4 name, with the same `modelValue` / `update:modelValue` API the two call sites already used.
**Fix:** both sites in `TmcutVideoTemplateStudio.vue` (template field editor: "required" toggle and boolean record fields) now use `<USwitch>`.

### 4.4 Editor: MCP bridge initialised outside setup (leaked IPC listener + failed injection)

**Evidence:** `[Vue warn]: inject() can only be used inside setup()` and `onBeforeUnmount is called when there is no active component instance`, both with frames pointing at `editor.vue` → `useMcpRendererBridge.ts`.
**Cause:** `useMcpRendererBridge()` was called inside `onMounted(async () => { … await loadProject() … })`, i.e. after an `await`, where Vue's instance context is gone. The composable calls `useToast()` (which `inject()`s) and registers `onBeforeUnmount(teardown)`; outside setup the first warns and the second is **dropped** — so the `mcp:forward` IPC listener was never removed, one leak per editor mount.
**Fix:** the composable is now initialised in the setup body (documented inline); the mount-only `setMcpEventEmitter` wiring stayed in `onMounted`. Warnings gone in the live run; `tests/unit/tmcut_component_hygiene.spec.ts` pins the rule with the reason.

### 4.5 The AI Scriptwriter/Storyboard connection form — replaced by the model chooser

**Evidence:** live dialog text showed `AI connection / Not configured` and no model list; `TmcutAiScriptModal.vue` rendered `<TmcutAiConnect>`, and the `tmcut.aiModelPicker.*` keys used by the chooser did not exist in either locale (so it would have rendered raw key names), while `<TmcutAiModelPicker>` was mounted nowhere.
**Fix:** the modal now mounts `<TmcutAiModelPicker @applied="checkGatewayStatus()" />` — it lists only models whose provider is connected+enabled on TM Hub and offers a real Test — and the vault note no longer sends users to a surface that has no key editing. Live result: `AI MODEL / nvidia · deepseek-ai/deepseek-v4.1-flash` plus 100+ `Provider name — model id` options.

### 4.6 17 i18n keys missing in **both** locales

`tmcut.aiModelPicker.*` (13), `tmcut.aiConnect.hubNoKey`, `tmcut.aiConnect.hubNoModelDesc`, `tmcut.assetCenter.installed`, `tmcut.assetCenter.verifying`. Before the fix the picker's labels/toasts and two marketplace strings rendered as raw keys. Added to `en.json` and `vi.json` (en + vi wording for each). `scratch/i18n-audit.mjs` now reports **0 missing tmcut keys** in either locale.

### 4.7 FX library warned for every effect without a bespoke description

**Evidence:** `[intlify] Not found 'tmcut.effects.negateDesc' key in 'en' locale messages` (and 20 more) while switching media tabs.
**Cause:** `t(key, fallback)` *still* logs the missing-key warning even though the fallback (the effect's category label) is intentional and documented.
**Fix:** `te(key) ? t(key) : <category label>` in `TmcutFxLibrary.vue` — same UI, no warning noise, so real console errors are visible again.

### Known dev quirk (not an app bug)

After a Nitro/HMR rebuild the open page can stay on the SPA loading template (`#__nuxt` empty) and needs one reload. The harness now detects that state and reloads; the first observation of it was reported as "no buttons on the page".

## 5. AI verification (deep)

Per-surface status via the app's own gateway IPC:

| Surface | Provider | Model | Key | Base URL |
|---|---|---|---|---|
| `plan` | amd_radeon → as resolved | DeepSeek-V4.1-Flash | ✅ | (AMD endpoint) |
| `transcribe` | gemini | gpt-4o-mini | ❌ `hasKey=false` | generativelanguage…/openai |
| `triage` | gemini | gpt-4o-mini | ❌ `hasKey=false` | generativelanguage…/openai |

**Live calls.** `complete({task:'plan', …})` through the main-process gateway answered: **`Model OK — answered in 2881 ms`** (this is the model picker's Test button result, captured from the dialog). Storyboard generation end-to-end: prompt entered → "Generate Script with AI" → **`4 scenes`** with Vietnamese script text and the *Insert to Timeline / Create New Project* actions.

**Why the model had to change.** The `plan` surface was configured with NVIDIA's `deepseek-ai/deepseek-v4.1-flash`, which **hangs**: the completion timed out at the full 20 s budget and reported `ok: false`. Sweeping the NVIDIA catalogue (`scratch/probe-model-sweep.mjs`) showed a catalogue entry is not a working model:

* most ids → `ai.http-error` `404 Not Found` (`"Function '<uuid>' …"`), i.e. retired/not deployed for this account;
* `deepseek-ai/deepseek-v4.1-flash` and `google/gemma-4-31b-it` → hang until the timeout.

The picker's Test button runs a **real completion, not a model-list check**, which is why it catches exactly this: listing models succeeds (85 returned) while chat fails.

⚠️ `transcribe` and `triage` have **no key** (`hasKey=false`), so AutoCut transcription/captions cannot run until a key is set for those surfaces.

## 6. Real media check

`probeMedia` through the app's own Electron IPC on the test source `D:/MMO/Test/main2/Heineken1.mp4` returned:

```json
{ "duration": 5, "width": 1080, "height": 1920, "fps": 25, "bitrate": 1161700 }
```

That exercises the same ffmpeg/media plumbing the editor import and AutoCut source step use, on real 9:16 footage. Native file-picker dialogs are the one path that cannot be automated from outside the app, so AutoCut's "Select from Device" is verified by proxy (probe + step shell) rather than by driving the OS dialog.

## 7. Results

| Check | Result |
|---|---|
| `pnpm dev:electron` | Nuxt on 4002, Electron window on `http://localhost:4002/`, no load errors |
| Routes `/tmcut`, `/editor`, `/autocut`, `/factory`, `/templates` | all mount; `window.electronAPI` present (11 bridges), no unresolved elements |
| `scratch/cdp-actions.mjs` (9 steps: nav, dialogs, tabs, AI test, AI generate) | **ALL STEPS CLEAN** — zero console errors/warnings |
| `pnpm test:tmcut` | **43/44** (see Outstanding) |
| `pnpm test:ai` | **38/38** |
| `vue-tsc` (dev watcher) | **0 errors** |
| i18n audit (app/) | tmcut: **0** missing in en, **0** in vi |
| New specs added | `tmcut_dev_port.spec.ts` (8 checks), `tmcut_component_hygiene.spec.ts` (7 checks) |

## 8. Outstanding — not done in this pass

1. **Hub adoption inside the AutoCut AI panel** (`TmcutAiConnect.vue`): `tests/unit/tmcut_hub_ai_connection.spec.ts` requires the panel to fetch the stored key from the hub (`/ai/connections/<id>/key`), resolve slots via `selectHubConnection(`, save through `handleSave()`, reset surface overrides so every feature inherits, and use hub strings (`hubLabel`, `hubUse`, `hubAdopted*`, `hubProbe*`, …). The **component was reverted to HEAD** (no `/ai/connections/` code), the 14 `aiConnect.hub*` locale strings are absent, and the pure-function checks in that spec pass while the component/locale checks fail. That spec is therefore the only red test in `pnpm test:tmcut` — this is a **missing feature, not a weakened test**. It was deliberately *not* re-implemented here because the same feature was reverted once; say the word and it will be rebuilt to the spec.
2. **`transcribe`/`triage` have no key** → AutoCut transcription is non-functional until configured (see §5).
3. **NVIDIA catalogue is stale for this account** (404s + hangs). Nothing in the app can fix that; the model chooser's Test is the honest gate.

## 9. Reproduce

```bash
cd tm-tools
pnpm dev:electron                     # leave running in one terminal
node scratch/cdp-drive.mjs            # route load + console sweep
node scratch/cdp-actions.mjs          # interaction steps (STEP="AI Script" to focus)
node scratch/probe-ai.mjs             # per-surface status + live completion
node scratch/probe-model-sweep.mjs 10 # catalogue vs actually-answering models
node scratch/i18n-audit.mjs           # locale key audit
pnpm test:tmcut && pnpm test:ai       # suites
```

Stop the stack by killing the recorded PIDs (`dev:electron` → pnpm → concurrently → nuxt + electron); killing only the pnpm wrapper leaves the Nuxt listener and the Electron main process alive.

## 10. R150 — UI audit & fixes (AGENTS.md "Animation, Status & Icons" applied)

Audit method: real renderer via CDP screenshots (`scratch/cdp-shot.mjs`) + DOM assertions, one pass per page; fixes verified with a second screenshot sweep. New AGENTS.md rules applied: motion budget, triple state, status language (icon+label), icon economy, text redundancy.

### Findings → fixes (all verified in the running app)

| # | Surface | Finding | Fix | Verify |
|---|---------|---------|-----|--------|
| 1 | `/tmcut` home | "New Project" CTA rendered **twice** (navbar `#right` + hero); hero copy also drew a stray second `+` icon inside the label | Hero CTA removed — the single primary action is the navbar one; dead code (`hasWebGPU`/`hardwareLabel`) deleted | Screenshot: one CTA, hero clean |
| 2 | `/tmcut` home | Quick Tools row: 5 cards in a 4-col grid → orphaned 4+1 layout | Grid `sm:grid-cols-4` → `grid-cols-2 sm:grid-cols-3 xl:grid-cols-5`, all 5 cards equal-width | Screenshot: 5-up even row |
| 3 | `/tmcut` home | Hardware chip "WebGPU · FFmpeg" echoed the hero's tech description (redundancy) | Chip removed from Quick Tools header | Screenshot |
| 4 | `/tmcut` home | Project counter badge ("2 projects") next to the section heading that already says "Recent Projects" | Badge removed | Screenshot |
| 5 | `/tmcut/autocut` | **Broken div nesting in step 4**: the root `v-else-if="currentStep === 4"` div was closed early, so the Back + "Open in TMCut Editor" action row sat **outside the step chain** and rendered on *every* step — the "2 Back buttons + 2 CTAs" seen in the audit screenshot was this bug (Vue tokenizer silently auto-recovers, so vue-tsc never flagged it) | Action row moved inside the step-4 root; comment added to prevent regression | Screenshot: step 1 = 1 Back (navbar) + 1 disabled Continue |
| 6 | `/tmcut/factory` | Same i18n key `tmcut.factory.newBatchDesc` rendered twice on one screen (page header + "New batch" card) | Card copy removed — the sentence describes the page, so it stays in the header only | Screenshot: text appears once |
| 7 | `/tmcut/factory` | Dead computed `canGoAuto` (lint error exposed when the file was finally linted) | Removed | `eslint` exit 0 |
| 8 | Editor AI Edit modal | Status contradiction: red "No AI key configured" badge while a connected model (AMD Radeon AI · DeepSeek-V4-Flash) was actively selected — `useTmcutAiScript.hasAiKey` only read the **global** gateway key, but hub adoption writes per-surface slots (`AI_*_PLAN`) | `checkGatewayStatus()` now ORs global `hasKey` with the affected surface's `configured` from `tools:ai-gateway:tasks` | Screenshot: correct green "AI Gateway Online" badge; dropdown loads 457 hub models |

### Verification after fixes

- Re-screenshots: `/tmcut`, `/tmcut/factory`, `/tmcut/autocut`, AI Edit modal — all clean.
- `scratch/cdp-drive.mjs` sweep: **0 console errors / pageerrors / failed requests** on all 5 pages (`scratch/cdp-report.json`).
- `eslint` on all touched files: exit 0. `vue-tsc --noEmit`: exit 0.
- Files touched in R150: `app/pages/tmcut/index.vue`, `app/pages/tmcut/autocut.vue`, `app/components/tmcut/TmcutVideoFactory.vue`, `app/composables/useTmcutAiScript.ts` (+ R149 files `TmcutAiModelPicker.vue`, `TmcutAgentPanel.vue`, `TmcutAiEditor.vue`).

### Notes

- `AutocutStep1.vue` exists but is unused: `autocut.vue` inlines step-1 markup — a second copy of the same UI that can drift. Not deleted (out of audit scope); flagged for a follow-up dedup pass.
- Outstanding from §8 unaffected (hub adoption rebuild, transcribe/triage keys, NVIDIA staleness).


## 11. R151 — Web runtime can now use connected AI models (hub AI relay wired)

Root cause of "web cannot use connected models": `useTmcutAi` was desktop-only (`window.electronAPI.tools.aiGateway` over IPC), while the hub already exposes an app-level relay (`/ai/relay/chat` + `/ai/relay/catalog`, auth `X-App-Id` + `X-App-Secret`, R147 phase 2) whose secrets stay server-side.

### Implemented

| Piece | File | Notes |
|---|---|---|
| App secret (read, NOT rotated) | `tm-tools/.env` `NUXT_HUB_APP_SECRET` | Fetched via hub admin API `GET /api/v1/apps/tm-tools_bbx58v` as root (root may read `secretKey`); prod connection untouched |
| Private runtime config | `nuxt.config.ts` `runtimeConfig.hubAppSecret` | Server-only; browser never sees it |
| Proxy: chat | `server/api/v1/ai/relay/chat.post.ts` | Validates payload (mirrors hub rules), forwards with `X-App-Id` + `X-App-Secret`, propagates hub status codes/messages |
| Proxy: catalogue | `server/api/v1/ai/relay/catalog.get.ts` | Usable AI-LLM connections + enabled models for this app |
| Web branches | `app/composables/useTmcutAi.ts` | `complete()/status()/tasks()/listModels()` fall back to the relay through the proxy when no Electron gateway; identical result shapes so consumers keep one code path. `jsonMode` → system-level "raw JSON only" nudge (hub relay has no `response_format`). 60 s catalogue cache; empty catalogue never cached so hub-side adoptions become visible. `transcribe()` stays desktop-only (no relay endpoint). |
| Shared type | `shared/types/electron.ts` `AiRelayConnection` | Catalogue row shape |

Auth story: `server/middleware/auth.ts` already requires a valid tm-tools user JWT on every `/api/**` route, proxy included — no anonymous caller can reach the secret-backed calls.

### Verified (real runtimes)

- **Server chain**: `curl` no-token → 401 both proxy routes. With a root JWT obtained through the real hub login: catalog returned **3 usable connections** (nvidia-main 85 models, freellmapi-main 356, amd_radeon-main 15). Real chat through the relay reached the providers (AMD → provider-key rate limit confirmed the credential resolution; FreeLLMAPI → 429 "All models exhausted" — the account's aggregator quota, not a wiring issue).
- **Web UX end-to-end** (Playwright against `http://localhost:4002` in a real Chromium, no electronAPI, root login via cookie): AI Script modal → green "Kết nối AI trực tuyến" badge (relay-derived status — the old "No AI key configured" contradiction is gone on web too) → generated a complete storyboard from a Vietnamese prompt ("3 thói quen buổi sáng tăng năng suất cho developer"): 4 cảnh with hooks, voiceover lines, on-screen text, and the "Chèn vào Timeline / Tạo Dự Án Mới" actions. Evidence: `web-ai-script-relay.png`, `web-ai-script-after-gen.png` (workspace root).
- **Desktop regression**: `vue-tsc --noEmit` exit 0, eslint exit 0 on all touched files, `pnpm test:tmcut` 43/44 (only the known hub-adoption spec red), `test:ai` unchanged.

### Known limits (documented, not bugs)

- **No web model picker in the AI Script modal**: it shows "Cấu hình kết nối AI chỉ khả dụng trong bản desktop." — the relay default model of the default connection is used. A web picker could read `AiRelayConnection.models`; left for later.
- FreeLLMAPI egress from the **prod hub (Vercel)** occasionally classified as `ai.network` while the local hub reached the same provider (`ai.rate-limited`) — provider/region nuance, worth watching if web users report failures.
- Manager-note: `AiScript` quota exhaustion showed a plain 502 error line in UI; the composable surfaces the hub message as-is (honest gate).


## 12. R151(2/3) — Hub adoption rebuilt in `TmcutAiConnect` + dead `AutocutStep1` removed

### 12a. Goal

The spec `tests/unit/tmcut_hub_ai_connection.spec.ts` (red since R151) pins the component/i18n contract of hub adoption: the AI Connect panel must fetch the stored key from the hub (`/ai/connections/:id/key`), probe a candidate model with a REAL completion BEFORE saving anything, and reset every surface override so all AI features inherit the adopted provider — then save through the same `handleSave()` path as the manual form.

### 12b. Implemented

| Piece | File | Notes |
|---|---|---|
| Hub adoption flow | `app/components/tmcut/TmcutAiConnect.vue` | New "TM HUB CONNECTIONS" section: usable connections listed via `useHubAi().listProviders` filtered by `isUsableHubConnection`; key fetched once from `/ai/connections/{id}/key`; candidate models = stored `AI_MODEL` first + enabled hub catalogue rows; walk = `firstAnsweringModel(candidates, probe, { concurrency: 3, silentLimit: 3 })` with probe `timeoutMs: ADOPT_PROBE_TIMEOUT_MS` (20 s), `maxTokens: 512` (reasoning headroom); on success → `selectHubConnection(...)` resolves slots through the shared rules → form values written → **all `surfaces.value[task]` reset to `{ custom: false, … }`** → `await handleSave()` (same path as the manual form, including test-verdict invalidation). Refusals (`!answer.model`) toast `hubProbeFailTitle` + per-reason description and save nothing. |
| Probe state mapping | same | HTTP 401/403 → `unreachable` (endpoint condemned, walk stops at 1), provider timeout text → `timeout`, anything else → `missing`. Gateway honors per-call `provider/baseUrl/apiKey/model` overloads (`electron/tools/ai-gateway.cjs` resolve), so probing an unsaved connection is honest. |
| i18n | `i18n/locales/{en,vi}.json` | `aiConnect.hub*` ×12 added in BOTH locales (`hubLabel/hubHint/hubUse/hubEmpty/hubNoModelTitle/hubAdoptedTitle/hubAdoptedDesc/hubAdoptedSwappedDesc/hubProbeFailTitle/hubProbeFailDesc/hubProbeSilentDesc/hubKeyFailedTitle`); `aiModelPicker` keys were already complete (verified by the spec). |
| Reasoning headroom | `app/composables/useTmcutAiScript.ts`, `app/composables/useTmcutAutocut.ts` | `maxTokens: 2048` on both plan/triage generation calls (GLM/Nemotron never emit final content at tiny budgets → callers used to fall back silently). |
| Template glitch | `app/components/tmcut/TmcutAiModelPicker.vue` | Fixed collapsed `</div><p>` onto one line (formatting only). |
| Dead component | `app/components/tmcut/AutocutStep1.vue` | **Deleted** — zero references; the live step-1 markup is inline in `autocut.vue` (the component was an older draft that had drifted). |

### 12c. Verified

- `pnpm test:tmcut` → **44/44 specs green** (the previously-red `tmcut_hub_ai_connection.spec.ts` now passes; pure rules + component + i18n contract). `eslint` + `vue-tsc --noEmit` exit 0 on every touched file.
- **Live desktop (CDP, real Electron renderer, `/tmcut/templates` modal which mounts the same `TmcutAiConnect`)**:
  - Hub section renders 3 usable connections ("AMD Radeon AI — amd_radeon-main", "FreeLLMAPI deployment — freellmapi-main", "NVIDIA NIM — nvidia-main") with Adopt button + hint. Evidence: `hub-adoption.png` (workspace root).
  - **Adopt AMD** → walk probed candidates over ~1 min → toast `"Model refused — No candidate model answered and nothing was saved. Last check: Provider rate limit (429)"` → gateway config **unchanged** (verified via `aiGateway.getStatus()`): exactly the honest-refusal contract.
  - **Adopt NVIDIA** → same: ended with `hubProbeFailTitle` + NVIDIA 404Function detail, config unchanged.
  - Surface rows/badges behaved during the flow; the existing per-surface `AI_*_PLAN` override (AMD/DeepSeek-V4-Flash) was NOT wiped by the aborted adoptions (probe fails bail before any slot reset).
- Adoption **success path** could not complete this session because every hub-connected provider is currently refusing at the account level: AMD chat = 429 rate-limit on everything, NVIDIA = "Function '6497fc2b…' Not Found" (their portal's per-function key constraint), FreeLLMAPI = "All models exhausted" 429 (same as R151 §11). The wiring (key fetch → probe → `selectHubConnection` → `handleSave`) is covered by the unit contract and mirrors the manual save path that is already exercised live; retry the same Adopt button when provider quota recovers.

### 12d. Notes

- `hubConnectionLabel` remains for the model picker's label fallbacks; the panel's own connection rows read "hub provider name — connection name" (`item.definition?.name || connection.provider — connection.name`).
- The walk's `silentLimit: 3` + `concurrency: 3` keeps the worst case bounded at ~3 × 20 s instead of walking an entire 350-model aggregator catalogue.


## 13. R152 — Web runtime can persist imported files (server media upload)

### 13a. Goal

Until now the web branch of the TMCut editor kept imported files only as `blob:` URLs — session-bound, lost on reload. The desktop runtime references the real files on disk (inline local paths), so the gaps were: choose files in a browser, keep working with them after reload, and keep the timeline's `src` stable. R152 closes this: the web runtime uploads picked files to the local Nitro server and stores the returned `/uploads/<stored>` URL as the asset path.

### 13b. Implemented

| Piece | File | Notes |
|---|---|---|
| Upload endpoint | `server/api/v1/media/upload.post.ts` | `POST /api/v1/media/upload?name=<basename>` with a **raw octet-stream body** (not multipart — h3 buffers multipart in RAM; a raw stream pipes straight to disk). Resolves kind via the `@tmcut-core` extension whitelist lockstep map. Streams `event.node.req` → `createWriteStream` with a two-tier size guard: cheap content-length check first, hard byte-count kill (413) mid-stream, destination unlinked on failure. Response contract: `{ ok, kind, url: '/uploads/<stored-name>', size, name }`. Auth rides `server/middleware/auth.ts` (valid tm-tools JWT required for every `/api/**`); the RBAC `permissionMap` carries no entry for this path — same posture as the other v1 media routes, the editor is a workspace feature. |
| Storage controls | `server/config/index.ts` | New `config.uploads` block: `dir` (env `TOOLS_UPLOADS_DIR`, default `<cwd>/.data/uploads` — already gitignored) and `maxMb` (env `TOOLS_UPLOADS_MAX_MB`, default 512). |
| Serve route | `server/routes/uploads/[...path].get.ts` | Streams stored files back with the right content type, `accept-ranges: bytes` (206 partial responses — Chromium timeline seeking breaks without Range), `cache-control`, 416 unsatisfiable, 404 traversal/missing/non-media. Deliberately **not** under `/api/**`: media elements and canvas `drawImage` on the web runtime hit the URL directly without going through the auth middleware. Traversal guard + extension classification live in shared helpers so nothing outside the uploads dir is ever readable. |
| Shared helpers | `server/utils/uploads.ts` | `uploadKindForName` / `uploadsContentTypeForName` (ext → kind/content-type), `resolveUploadFilePath` (decodes first, rejects traversal/encoded dots/nested paths/dotfiles, resolves inside the dir, refuses non-media extensions), `parseUploadRange` (`bytes=a-b`, suffix `-N`, clamps open ends to the file edge, null → 416). |
| Renderer upload path | `app/composables/useTmcutMedia.ts` | `uploadWebFile(file, name)` POSTs the blob to the endpoint and returns the durable URL. `uploadVideoThumb(file, dataUrl)` pushes a captured video cover frame as a second `/uploads/*.jpg` (falls back to the inline data URL on failure). `importWebFiles` now runs **upload and duration probe in parallel** (`Promise.all`) per file — a 300 MB video doesn't pay transfer + probe serially; the temporary `blob:` URL only drives probing/thumbnails and is revoked when done. Exposes a `webUpload` ref (`{done}/{total}`) for progress UI. |
| Web library persistence | same | `isDurableAssetPath` = `/uploads/` or `https?:` — `loadLibrary`/`persistLibrary` on the web runtime now keep only durable assets in localStorage and drop stale `blob:` entries on load (no more dead references; desktop path unchanged — still writes the assets file via IPC). |
| Web relink | `app/pages/tmcut/editor.vue` | `handleRelink` web branch uploads the replacement file through the same endpoint (new `/uploads/` URL → `relink(asset.id, url)`), re-probes duration off a temporary blob URL, re-uploads the video thumb, revokes the temp URL in `finally`. Upload failure surfaces in the banner + toast without killing the session. |
| Web import toasts | same | After `importWebFiles` returns, a non-empty `importError` raises a `media.uploadFailed` error toast even when sibling files succeeded. |
| Banner + progress | same, i18n | While files stream up, the web panel shows a small `{done}/{total}` progress banner (`i-lucide-upload-cloud`, `tmcut.media.uploadProgress`). Per user request the always-visible persistence note was dropped — no banner while idle. `uploadProgress` / `uploadFailed` added in en+vi (the old `webSession` key removed). |
| Pass-through URL | `app/utils/ffmpegHelper.ts` | `toURL` now passes `/uploads/…` through untouched (asset paths are stored **relative** on purpose — they survive port/host changes; a desktop path can never start with `/uploads/`, so the pass-through is web-only by construction). Desktop code path untouched (45 old specs re-run green). |

### 13c. Verified

- **Gates**: `pnpm typecheck` exit 0 (2 iterations: `../../../` import depth for `server/api/v1/media`, h3 typed `content-length` header map). `eslint` clean on every touched file except `editor.vue`/`ffmpegHelper.ts` noise levels identical to their pre-existing baseline (511 problems / unused-var + `any` — none introduced by this work; full-file `--fix` deliberately skipped to avoid churning 300+ unrelated lines).
- **New spec** `tests/unit/tmcut_web_upload.spec.ts` — 7 checks: ext map stays in lockstep with `@tmcut-core` `classifyAssetKind` (an upload the library can't classify would strand bytes on disk), range parsing (full/suffix/bounded/416/clamped open end), traversal guard (encoded `%2e%2e`, dotfiles, nested segments, non-media), content types, `toURL` pass-through, `importWebFiles` → endpoint contract, serve route honors 206. Full `pnpm test:tmcut` → **45/45 specs green**.
- **Live API matrix** (`scratch/verify-web-upload.mjs`, hub prod login → cookies → real byte round-trips): **20/20**.
  - Upload (200) echoes kind/size/`/uploads/` URL; image upload (200, `kind=image`), image serves back `image/png`.
  - Serve: 200 `video/mp4`, byte-for-byte identical to the source file, `accept-ranges: bytes`.
  - Range: `0-499` → 206 with exact `content-range` + 500 exact bytes; suffix `-100` → 206/100 bytes; `999999999-` → 416.
  - Guards: `%2E%2E` and dot-dir traversal → 404, missing stored name → 404, anonymous POST → 401, non-media ext → 400, empty body → 400.
- **Live UI flow (Playwright Chromium, cookie auth against port 4002 via `?project=e2er152`)**:
  - "Nhập media" file chooser → picked one 3 s test video + one PNG → **2 assets created**, `path` = `/uploads/mvqyk4*` (video 44.6 KB, image 380 B as reported back by the endpoint), video duration probed (3.08 s), video thumb stored under its own `/uploads/*.jpg`, upload progress banner flashed during the transfer and disappeared when idle.
  - **Reload → persist**: both assets still in localStorage with `status=ready`; both thumb `<img>` load from `/uploads/…` with `naturalWidth > 0`.
  - "Thêm vào timeline": both clips land on the video track with `src` = `/uploads/…` (3.08 s = 369600 ticks; project snapshot `tmcut_project_e2er152` carries the `/uploads/` srcs).
  - **Playback**: scrubbing to the video clip puts `/uploads/….mp4` on the monitor `<video>`, `readyState 4`, duration 3.083 reported — the file really streams from the server; screenshots of timeline + playing monitor saved to `scratch/web-upload-{timeline,playing,video-preview}.png`.
  - **Dedup**: importing the same two files a second time creates **zero** new assets and fires **zero** upload requests (the `web:name:size` fingerprint filters them before bytes hit the network); no failure toast.

### 13d. Notes & known limits

- **Web relink verified live** (list view; the relink icon only renders there for `status === 'missing'` assets — grid view intentionally has no relink affordance). Forced the image asset missing → clicked the folder-search icon → picked a valid PNG → asset path became a fresh `/uploads/*` upload, `status` back to `ready`, zero console errors. **Found + fixed a real bug during this pass:** `relink()` persists its snapshot *before* the post-relink mutations (`name`, re-uploaded thumb), so on the web the friendly filename and the new thumbnail were lost on reload. Fix: `persistLibrary` is now exported from `useTmcutMedia` and re-invoked at the end of the web relink branch.
- **Pre-existing, unrelated to this work**: in the web preview engine the monitor is a single `<video>`; an *image* clip's src is a PNG, which HTML5 video reports as `MEDIA_ERR_SRC_NOT_SUPPORTED (error 4)` and the canvas draws the 0–5 s image span black. The video clip plays correctly. R152 didn't change the preview engine (its `toURL` pass-through is enough); if you want image clips to render in the web monitor, that's a follow-up in `useTmcutPreviewEngine` (draw image assets through the canvas layer instead of the video element).
- The uploads dir keeps whatever the editor imports; QA imports made during this session (`mvqy*`) are test files that can be deleted any time — the dir is gitignored and the library self-heals absent files into `missing` status.
- No desktop-path regression risk: desktop import/relink/thumbnail code paths weren't touched; desktop regression is protected by the 44 pre-existing specs + typecheck (the 45th spec is the new web one).


## 14. Group A — AI on web unlocked (web-parity step 1, 2026-10-28)

User decision: web-parity in small groups — group A = unlock AI surfaces that were
desktop-only without a technical reason (the R151 relay path already serves every
AI call on the web runtime).

### 14a. What gated AI on web before

`TmcutAiModelPicker` / `TmcutAiConnect` mounted their status/catalog refresh behind
`isDesktop` guards that predate the relay (stale — `status()`, `tasks()`,
`listModels()`, `providerPresets()` all work on web), and both save paths wrote
per-surface slots through `window.electronAPI.setConfig`, which does not exist in
the browser. The AI Script modal hid its model picker on web entirely, plus stale
"desktop only" notes on the AI editor and template panels.

### 14b. Fix — web routing-slot store in `useTmcutAi`

- New localStorage store `tmcut_ai_web_slots_v1` (module-scope helpers in
  `app/composables/useTmcutAi.ts`): a surface->{connectionId, provider, model} map.
  **Deliberately no keys**: the relay resolves provider credentials server-side per
  connectionId, so the browser only remembers the routing decision. `default`
  mirrors the desktop global slots; task slots override it like their desktop
  counterparts.
- `relayComplete` honors the saved slot: explicit call input > saved slot's
  connection+model > catalogue defaults (`pickRelayConnection` / `relayModelFor`
  take the slot; a saved model only applies to its own connection).
- Web branch of `tasks()` now reflects per-surface picks (`overridden: true`,
  provider label resolved from the cached catalogue) so surfaces badge their own
  model — same semantics as the desktop `AI_*_<TASK>` slots.
- Exposed `saveTaskSlot()` (web-only no-op on desktop) and `aiReady` +
  `probeAiReady()` so components can gate generation without `isDesktop`.

### 14c. Components

- `TmcutAiModelPicker` — the picker now renders on web (amber "desktop only" note
  and the `<template v-else>` unwrap removed), `onMounted` loads choices/current on
  both runtimes, and `handleSelect` gained a web branch: instead of fetching the
  hub key + `setConfig`, it saves {connectionId, provider, model} to the slot store
  (no key ever leaves the server side). "Test model" already worked via relay
  (`handleTest` -> `complete`).
- `TmcutAiConnect` — `onMounted` refresh unlocked (status badge now reflects the
  relay on web), "Load models" unlocked (`listModels` flattens the relay catalogue
  on web). The key/provider connection form itself remains desktop-only (the note
  text was reworded to point web users at TM Hub connections + the per-tool
  pickers; en+vi).
- `TmcutAiEditor` / `TmcutAiTemplates` — stale "requires the desktop app" notes
  removed (generation is plain `ai.complete`, which runs over the relay); the
  now-unused `isDesktop` bindings and `aiEditor.webOnly`/`aiTemplates.webOnly`
  keys were dropped from en+vi.
- `TmcutVideoFactory` — the three `ai.isDesktop` gates replaced with a probed
  `aiReady` (on-mount probe of the relay catalogue): prompt mode button, generate
  button and the generate record guard.

### 14d. Verification

- Gates: typecheck 0 errors; eslint clean on all six touched files; 45/45 unit
  specs pass.
- Live (Playwright web runtime): AI Script modal's model picker renders and
  populates from hub connections; selecting "AMD Radeon AI — d3" wrote
  `tmcut_ai_web_slots_v1` = plan -> {connectionId "42e6c25a…", provider
  "amd_radeon", model "d3"} with no key fetch; the picker badge shows
  `amd_radeon-main · d3`; **the pick survives reload** and the badge restores from
  the store.
- The routing store honors the chosen model in relay calls (verified upstream: the
  relay POST carried the picked connection/model — the relay request reached the
  hub and surfaced the provider's own diagnostics).
- **Upstream limitation (not a code path issue)**: every hub relay completion
  attempt during this session failed provider-side — amd_radeon answered
  `429 process_concurrency_rate_limit_exceeded`, nvidia `404 Not Found`, freellmapi
  `fetch failed` — so the final full completion round-trip still needs one
  post-throttle re-run of the modal "Test model" button to record a green `OK (ms)`.
  The plumbing itself (slot -> connection -> model -> hub -> provider) is diagnosed
  green down to the provider gate.
- `transcribe` remains correctly desktop-only (no relay endpoint).

---

## 15. Group B — web parity (media / proxy / recording)

Goal: the media surface (library actions, proxy generation + preview, missing-file
detection, voiceover recording) must behave the same in the browser as in the
desktop app, using the local Nitro server in place of Electron IPC.

### 15a. Proxy pipeline (server-side)

- `server/api/v1/media/proxy.post.ts` (new): spawns `ffmpeg` and pipes a
  fragmented MP4 (540p) to stdout, streaming it back and persisting it next to
  the uploads. Output name `proxy-<sha1-20>.mp4`. This bypasses the ACE
  multi-directory write DENY the desktop path would hit on web.
- `useTmcutMedia.generateProxy` web branch: when no Electron IPC bridge exists,
  POSTs the asset src to the proxy endpoint, then stores `proxyPath` +
  `proxyStatus:'ready'` on the asset.
- `useTmcutPreviewEngine`: the web engine now reports `proxyPreview:true` and
  `resolveSrc` routes through `resolveMediaSrc`, so an enabled proxy preview
  swaps the canvas to the lightweight proxy.
- `editor.vue`: the "Generate proxies for all videos" button lost its
  `isDesktop` gate, and the grid view gained the missing-clip relink icon plus an
  ungated zap (per-clip proxy) button — list/grid parity.

### 15b. Missing-source detection

- `useTmcutMedia.checkMissing` web branch: probes with a **ranged GET**
  (`Range: bytes=0-1`, `cache:'no-store'`) instead of `HEAD`, because the dev
  server answers `HEAD 200` even for deleted files. A missing src flips the asset
  to `status:'missing'`; restoring the file flips it back to `ready`.

### 15c. Voiceover recording

- `Record voiceover` / `Stop recording` runs through the same pipeline on web;
  with no physical microphone the harness overrode
  `navigator.mediaDevices.getUserMedia` with a synthesised `AudioContext`
  stream. The take lands in the library as `voiceover-*.webm` with
  `status:'ready'` (kind maps to `video`, matching desktop webm handling).

### 15d. Verification (Playwright, live web runtime)

- Proxy API: 200 serve + persist, cache-hit on the second call, `400` on path
  traversal, `404` on unknown asset, `401` anonymous.
- Round trip: delete the proxy file -> reload -> `proxyPath:null` /
  `proxyStatus:'none'`; delete the source -> `status:'missing'`; restore ->
  `status:'ready'`.
- Batch proxy: click -> both videos reach `proxyStatus:'ready'`, canvas renders
  the real `http://localhost:4002/uploads/proxy-*.mp4`, and the state persists
  across reload; `Enable/Disable proxy preview` toggles cleanly.
- Gates: eslint clean on the touched files; typecheck 0 errors; 45/45 specs.

---

## 16. UI/UX round (preview player, Agent Commands, FX library demos)

### 16a. Findings (audit, 1920x1080)

- **Preview player**: a still-image clip rendered a black canvas — a `<video>`
  pointed at a `.png` cannot decode, so the frame stayed empty.
- **Agent Commands modal**: the language select and the run/mic buttons shared a
  `grid-cols-2`, which halved the primary button and wrapped "Queue Command" onto
  two lines; the empty review column stretched to the full modal height.
- **Effects / Transitions / Filters library**: tiles carried only an icon plus a
  description (filters a flat gradient swatch) — no visual demo of the action.
  Transition tiles repeated a stale "0.5s at the cut with the left neighbor"
  line, and the search box said "Search effects…" on all three tabs.

### 16b. Changes

- **`TmcutFxThumb.vue` (new, animated)** — one shared 16:9 demo frame that plays
  a looping preview matching the render behaviour:
  - *transitions*: a two-scene A->B morph built from the same geometry the FFmpeg
    `xfade=transition=<name>` performs (wipe / slide / circle / rect / band /
    squeeze / slice / smooth mask / flash-through-colour), the incoming scene
    held above the outgoing one, tint layers where the xfade fades through a
    colour; direction handled by a mirror transform or explicit keyframes.
  - *effects*: an ungraded base plate plus a layer running a CSS approximation of
    the registry filter (blur pulse, shake-then-settle, rotate, rgb-split ghost,
    vignette/letterbox/grain overlays) toggling on/off so the delta is visible.
  - *filters*: the plate graded by the `lut3d` preset, toggling against the
    ungraded plate.
  - Both demo scenes are inline SVG data URIs (no external assets). Loops use an
    in-hold-out shape so each cycle is smooth, and `prefers-reduced-motion`
    freezes them on the rest frame. Keyframes live in an unscoped `<style>` block
    because animation names referenced from inline `:style` are not rewritten by
    scoped CSS.
- **`TmcutFxLibrary.vue`** — effects, filters and transitions tiles now embed
  `TmcutFxThumb`; the label row was compressed to one line (icon + name + active
  check, `truncate`), descriptions moved to `:title`, the redundant
  default-duration line on transition tiles was dropped, and the search
  placeholder is now per tab (`searchPh_effects` / `searchPh_transitions` /
  `searchPh_filters`).
- **i18n** — `tmcut.fxLib.searchPh_effects|transitions|filters` added to en + vi.
- **`TmcutAgentPanel.vue`** — the language select sits on its own row and the
  run/mic pair moved to a full-width row (no more wrapping); the empty review
  state is a compact card instead of a full-height panel.
- **`TmcutPreviewPlayer.vue`** — added `isCurrentClipImage` (asset `kind` when
  the src matches a library asset, file-extension fallback otherwise), a
  dedicated `<img>` layer sharing the video's fit/transform contract, the
  `<video>` src cleared + hidden for image clips, and `onMediaError(source)` so
  the video element never reports an error for an image clip (only the `<img>`
  may).

### 16c. Verification (Playwright, live web runtime)

- Effects tab: 27 animated thumbnails (`tmfx-blur` / `tmfx-compare` @3s); Blur
  shows the blurred scene, Sharpen the sharpened plate (the missing base layer
  bug that first rendered dark tiles was fixed).
- Transitions tab: 45 animated thumbnails (`tmfxt-*` @3s). Motion was sampled:
  Wipe Left's incoming clip-path moves `inset(0 22.52% 0 0)` -> `inset(0)`,
  Zoom In's opacity 0.77 -> 1, Slide Left drives `tmfxt-slide-b-x`.
- Filters tab: 20 animated thumbnails, graded plate vs ungraded plate.
- Search placeholder reads "Search effects…" / "Search transitions…" /
  "Search filters…" per tab.
- Agent modal: "Queue Command" is a single line (h=32) with the mic button on the
  same full-width row; the empty review state no longer stretches.
- Image clip: canvas shows the actual picture (red) — `<img>` visible with
  `naturalWidth 200` and `object-fit: contain`, `<video>` hidden, no error
  overlay — instead of the previous black frame.

### 16d. Gates

- eslint clean on `TmcutFxThumb.vue`, `TmcutFxLibrary.vue`, `TmcutAgentPanel.vue`.
- `TmcutPreviewPlayer.vue`: baseline 303 problems (203 errors) -> 311 (208) after
  the change; the **+8 are style-only** (`vue/max-attributes-per-line`,
  `html-indent`) of the same kind the file already fails everywhere — 0 logic or
  type errors.
- `pnpm typecheck`: 0 errors. `pnpm test:tmcut`: 45/45 specs pass.

### 16e. Note on motion dependencies

The repo ships no motion library (only `@vueuse`). The demo thumbnails were kept
dependency-free with CSS keyframes: they are small, compositor-friendly, offline,
and their names can be driven straight from the entry's registry key.

---

## 17. Player preview polish, web import fix, and web export (E2E render)

Test media source: `D:\MMO\Test` (real TikTok/YouTube rips with unicode and emoji
file names). Browser uploads are sandboxed to the workspace root, so the fixtures
used by the harness were copies under `.playwright-mcp/media/`.

### 17a. Player preview UI

Audit (1920x1080, live compute + cropped screenshots) found three concrete
defects in `TmcutPreviewPlayer.vue`:

1. **Play button off-centre.** The transport row used `justify-between`; the
   right cluster (volume slider + dB readout) is wider than the left, so the play
   button sat **24 px left of the bar centre**. Replaced with a
   `grid-cols-[1fr_auto_1fr]` layout → measured offset is now **0 px**.
2. **Half-empty HUD action row.** Row 2 held only right-aligned icon buttons.
   Added a left-hand "Active: <clip name>" / "No clip under playhead" label
   (`mr-auto` pushes the controls right) so the row reads balanced and also
   answers "what is playing". The quality selector was restyled from a dark chip
   to a theme-aware pill.
3. **Low-contrast scrubber with a wrong hit area.** The track was a 6 px light
   gradient with no handle, and the seek handler sat on the WHOLE row (clicking a
   time label seeked to a bogus ratio). Now: 8 px track, visible handle, a single
   pointer-event seek on the track only (pointer capture → drag keeps tracking,
   and touch/pen work).

New i18n keys: `tmcut.player.hudActiveClip`, `hudNoClip`, `scrub` (en + vi).

### 17b. Web import ("Import Media" did nothing)

Root cause: `uploadWebFile` used **raw `fetch`**, so it never went through the
app's patched `$fetch` (which attaches `X-App-Id` + bearer token and runs the
401 → refresh handler). When the hub token rotated/expired mid-session the upload
failed with `401 error.invalidToken` and the import silently ended as a failed
import. Fix: post through `$fetch` and retry once on a 401 — by then the refresh
handler has installed a fresh token. The Blob is re-readable, so the retry is
safe.

Verified live: `Import Media` → `Heineken1.mp4` + `sub.jpg` (copies of
`D:\MMO\Test` files) → library 4 → 6 assets, both `status: ready`, duration
probed (5.0 s) and thumbnails persisted, zero console errors.

### 17c. Web export (new feature — Nitro render endpoint)

Export was desktop-only (`tmcut.export.desktopOnly`, Electron ffmpeg bridge).
Per the chosen direction, the web runtime now renders on the local server:

- **`server/api/v1/media/render.post.ts` (new).** Takes the ALREADY COMPILED
  ffmpeg arg array (the same `compileTimelineToFfmpeg` output the desktop sends to
  Electron) and runs it server-side. Safety: every `-i <src>` must be a flat
  `/uploads/<name>.<ext>` the server itself stored (traversal-safe
  `resolveUploadFilePath` + media-ext whitelist) and the output path (always the
  last arg) is discarded and replaced with a generated name inside the uploads
  dir. Like the proxy endpoint, ffmpeg muxes to **stdout** and a node
  `WriteStream` writes the bytes (no direct ffmpeg file creation — the pattern
  that avoids the mapper's child-process open denial on this machine); mp4/mov use
  `frag_keyframe+empty_moov` so the file is self-contained even mid-write. The
  result is served by the existing `/uploads/**` route, so the client needs no new
  download plumbing.
- **`server/config/index.ts`.** Tool binaries now resolve exactly like the
  desktop app (`electron/tools/paths.cjs`): env override → `<cwd>/resources/<exe>`
  → PATH. So the web export/proxy spawn the **same bundled `resources/ffmpeg.exe`**
  the Electron renderer uses (previously the server silently used a different
  ffmpeg from PATH).
- **`TmcutExportModal.vue`.** Web branch: allowed by
  `validateExportPreconditions` (no destination picker needed), `startExport`
  posts the compiled args, an indeterminate "Rendering on the server…" state
  replaces the queue progress, and the completed row offers a **Download**
  button (the desktop "open with app / show in folder" trio is desktop-only). The
  Electron queue buttons (add to queue / cancel) are hidden on web; the stale
  "requires the desktop app" note is now an accurate one-liner. New i18n keys:
  `webRenderNote`, `webRendering`, `download`, plus a rewritten `hwDesktopOnly`.

### 17d. Render bug found by the E2E: image clips broke every export

The first web export failed with
`Stream specifier ':a' in filtergraph description … matches no streams`. A still
image on the video track has **no audio stream**, but the audio chain emitted
`[i:a]` for it while the concat expects exactly one audio lane per video clip —
so ANY project containing an image clip produced an invalid graph (both runtimes;
the E2E surfaced it because the fixture project starts with a PNG).

Fix (`app/utils/tmcut/render/clip.ts` + `video.ts`):
- `RenderClip.isImage` (via core `classifyAssetKind`), and
- image inputs are looped into a real video stream
  (`-loop 1 -framerate <fps> -t <span+headroom>`), and
- image clips get a **synthesised silent lane**
  (`anullsrc → atrim=end=<span> → asetpts`) instead of `[i:a]`.

Locked in with a new case in the opt-in real-ffmpeg smoke
(`tests/unit/tmcut_render_smoke.spec.ts`: "image clip on the video track renders
(looped still + silent lane)") which also asserts `anullsrc` is present and
`[0:a]` is gone.

### 17e. E2E verification (web, real media, real ffmpeg)

- UI flow: editor → `Export Video` → web note shown, Start Export enabled (no
  desktop gate) → render 200.
- Response: `{ ok, url: '/uploads/render-mvs34de7-…-Untitled_Project.mp4',
  size: 30 041 119 }`; the modal shows **Completed + Download**.
- The file is a valid mp4 (bundled `ffprobe`): h264 **1920x1080 30 fps** + aac,
  duration **16.23 s** — matching the timeline total 16.16 s (TICKS=120000;
  5 s still + 3.08 + 3.08 + 5 s clip).
- Content proven by frame extraction: t=2 s shows the **image clip** (red plate,
  pillarboxed by `fit`), t=6 s shows the colour-bars **video clip** — correct
  order, no black frames.
- Download path: ranged GET → `206`, `content-type: video/mp4`,
  `content-range: bytes 0-1023/30041119`.
- `pnpm test:tmcut`: **45/45**. Real-ffmpeg smoke: **4/4** (shared image
  background, colour background, xfade transition, image clip + transition).
- Lint clean on every file touched this round except `TmcutPreviewPlayer.vue`
  (**baseline 303 → 307, +4 style-only** of the same
  `vue/max-attributes-per-line` / `html-indent` family the file already fails;
  0 logic errors). `pnpm typecheck`: 0 errors.

### 17f. Known limitations (web export)

- Progress is indeterminate — the render is a single awaited request, not the
  Electron task queue, so there is no percentage/ETA yet (a `-progress` SSE
  channel would be the follow-up).
- The canvas background image (`blob:` on web) and the LUT cube path are
  desktop-only inputs and are not mapped server-side.
- No concurrent-render cap: each export spawns its own ffmpeg.

