# TMCut Cross-Platform / FX Preview / FFmpeg Audit — Phase 0

- **Date:** 2026-10-28
- **Spec audited against:** [docs/tmcut-web-electron-storage-fx-preview-ffmpeg-upgrade-roadmap-v1.md](../tmcut-web-electron-storage-fx-preview-ffmpeg-upgrade-roadmap-v1.md)
- **Scope:** `D:\Applications\tm-tools` (Electron + Nuxt 4 host app) and `D:\Applications\tmcut-core` (framework-independent engine)
- **Method:** read-only inspection of the actual source. Every finding cites a file and line that was opened, or states the grep that returned nothing.

## 0. Baseline (commands actually run)

| Command | Result |
|---|---|
| `node --test "test/*.test.mjs"` (tmcut-core) | PASS — 369 tests, 48 suites, 0 fail |
| `node tools/check-boundaries.mjs` (tmcut-core) | PASS — "core imports nothing platform-specific" |
| `tsx tests/unit/run-all.mts` (tm-tools) | PASS — 45/45 specs (render smoke skipped, opt-in via `--smoke`) |
| `tsx tests/unit/tmcut_fx_library.spec.ts` | PASS — 13 checks |

Working tree note: 82 uncommitted paths in tm-tools (~+4011/−2637), including brand-new untracked
`server/api/v1/**`, `server/routes/**`, `app/components/tmcut/TmcutFxThumb.vue`. This is in-flight work,
not stale files — nothing was reset, stashed or overwritten during this audit.

## 1. Headline conclusion

The roadmap was written against an assumed state that is now **partly obsolete**: Phases 1–4 and most of
Phase 7 already exist and are covered by tests. The genuinely weak link is **Phase 5/6 — FX preview parity
and honesty** (the thumbnail, the fidelity matrix, and a few export-graph gaps).

Already implemented and verified in code (do not rebuild):

- Electron/web adapter boundary: [app/composables/useTmcutPreviewEngine.ts:45-69](file:///D:/Applications/tm-tools/app/composables/useTmcutPreviewEngine.ts#L45) resolves one `TmcutPreviewEngine` contract per runtime.
- Web upload → server storage: [server/api/v1/media/upload.post.ts:29-95](file:///D:/Applications/tm-tools/server/api/v1/media/upload.post.ts#L29) (JWT, extension allowlist, name sanitize, 512 MB cap + byte-count guard, writes `.data/uploads`, not `public/`), streamed back through [server/routes/uploads/[...path].get.ts](file:///D:/Applications/tm-tools/server/routes/uploads).
- Web render jobs with `jobId` + polling + real `-progress pipe:1` parsing: [server/api/v1/media/render.post.ts:117-168](file:///D:/Applications/tm-tools/server/api/v1/media/render.post.ts#L117), [server/utils/renderJobs.ts:38-99](file:///D:/Applications/tm-tools/server/utils/renderJobs.ts#L38).
- IPC choke point: every `ipcMain.handle` is wrapped by a sender/origin gate — [electron/main.cjs:297-308](file:///D:/Applications/tm-tools/electron/main.cjs#L297), [electron/ipcPolicy.cjs:92-141](file:///D:/Applications/tm-tools/electron/ipcPolicy.cjs#L92). No raw `ipcRenderer`, `fs` or `shell` leaks through preload ([electron/preload.cjs:221-236](file:///D:/Applications/tm-tools/electron/preload.cjs#L221)).
- Provider keys never reach the browser: masked at the bridge on desktop ([electron/main.cjs:328-333](file:///D:/Applications/tm-tools/electron/main.cjs#L328), keychain at rest), Nitro relay on web. Grep for `api.openai.com|generativelanguage|api.anthropic.com` under `app/` → 0 hits; `localStorage` holds routing slots only.
- One registry drives the FX library, the inspector defaults and the export compiler: `EFFECT_REGISTRY` ([tmcut-core/src/effects.mjs:21-336](file:///D:/Applications/tmcut-core/src/effects.mjs#L21)) → [app/utils/tmcut/fxLibrary.ts:150-228](file:///D:/Applications/tm-tools/app/utils/tmcut/fxLibrary.ts#L150) → `buildFfmpegEffectFilters` ([effects.mjs:483-741](file:///D:/Applications/tmcut-core/src/effects.mjs#L483)).
- `renderReady` already exists in core as an honesty flag ([effects.mjs:6-9](file:///D:/Applications/tmcut-core/src/effects.mjs#L6)) — currently `true` for all 29 effects.

## 2. Findings

Severity: **Critical** = exploitable/secret exposure or data loss; **High** = user-visible lie or architectural breach;
**Medium** = fragile/wrong in edge cases; **Low** = convention/perf polish.

### A. Secrets and platform boundary

| # | Finding | Evidence | Severity | Roadmap |
|---|---|---|---|---|
| A1 | Real secret material is committed as `readEnv(key, fallback)` defaults: JWT access/refresh secrets (64-char), Supabase **service-role** key (219 chars), Cloudinary API secret, **Firebase private key (1732 chars)**, VAPID private key. Present in the working tree **and in committed `HEAD`**, and the repo has a GitHub remote (`origin`). Values deliberately not reproduced here. | [server/config/index.ts:85-121](file:///D:/Applications/tm-tools/server/config/index.ts#L85); `git show HEAD:server/config/index.ts` lines 63, 64, 79, 84, 89, 94 | **Critical** | §3.5, §4.4, §10.1 |
| A2 | Spawn options are spread from the caller-supplied task object: `spawn(task.command, task.args, { ...(task.options \|\| {}) })`. TMCut tasks pass renderer-built `args` verbatim, so a renderer (or anything that can drive it) controls both argv and `shell`/`cwd`/`env`. | [electron/tools/task-manager.cjs:208](file:///D:/Applications/tm-tools/electron/tools/task-manager.cjs#L208), [:284](file:///D:/Applications/tm-tools/electron/tools/task-manager.cjs#L284); [electron/tools/ffmpeg.controller.cjs:1030,1063,1113](file:///D:/Applications/tm-tools/electron/tools/ffmpeg.controller.cjs#L1030) | **Critical** | §1.2, §2.2, §3.2 |
| A3 | 44 absolute-path filesystem channels are reachable from the renderer (`tools:file-manager:read/write/copyFile/copyFolder/rename/delete/getTree/…`) with no approved-root constraint — only the origin gate. | [electron/preload.cjs:169-183](file:///D:/Applications/tm-tools/electron/preload.cjs#L169); [electron/tools/file-manager.cjs:305-353](file:///D:/Applications/tm-tools/electron/tools/file-manager.cjs#L305) | **Critical** | §1.2, §2.2 |
| A4 | A Vue page performs direct filesystem reads through the bridge: `api.fileManager.read(firstPath)`. The roadmap explicitly forbids fs branching inside pages. | [app/pages/tmcut/editor.vue:1048](file:///D:/Applications/tm-tools/app/pages/tmcut/editor.vue#L1048) | High | §2.2 |
| A5 | 40 files / 177 `window.electronAPI` touches and 49 `isElectron` branches, including inside components. Adapter registration exists for the preview engine but not for the rest. | grep over `app/`; e.g. [TmcutExportModal.vue:217-249](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutExportModal.vue#L217), [TmcutVideoFactory.vue:39-75](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutVideoFactory.vue#L39) | High | §2.2, §10.1 |
| A6 | `set-config` writes arbitrary environment keys to `config.env` with no name allowlist. | [electron/main.cjs:380-404](file:///D:/Applications/tm-tools/electron/main.cjs#L380) | Medium | §3.2 |
| A7 | FFmpeg/ffprobe path resolution hardcodes `win32` exe names with no per-platform matrix. | [electron/tools/paths.cjs:37-52](file:///D:/Applications/tm-tools/electron/tools/paths.cjs#L37) | Medium | §3.2 |

### B. Project portability (§9)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| B1 | Project JSON stores **absolute machine paths inline** (`"src": "C:/Users/…/Troll Đàn Anh….mp4"`), `assets.json` stores absolute `path`/`thumbPath`/`waveformPath`, and timeline items carry **no `assetId`**. A project moved to another machine or to web cannot resolve media. | `C:/Users/tuanmjnh/AppData/Roaming/tm-tools/tmcut/projects/3okuxio7.tmcut.json`, `…/tmcut/assets.json`; [electron/tools/tmcut.controller.cjs:13-30,69-92](file:///D:/Applications/tm-tools/electron/tools/tmcut.controller.cjs#L13) | **Critical** |
| B2 | No DB model for TMCut assets — state is loose JSON on disk; the drizzle schema covers profiles/browser tables only. | [drizzle.config.ts:4](file:///D:/Applications/tm-tools/drizzle.config.ts#L4), `electron/src/infrastructure/database/schema/*` | Medium |
| B3 | Upload route never sniffs signatures (extension allowlist + size only); roadmap §3.5 asks for signature inspection + bounded ffprobe on ingest. | [server/api/v1/media/upload.post.ts:36-47](file:///D:/Applications/tm-tools/server/api/v1/media/upload.post.ts#L36) | Medium |
| B4 | Web render jobs live in an in-memory `Map` with a 10-min TTL and there is **no cancel endpoint** — a refresh of the *server* loses the queue; roadmap §10.4 wants persistence across restart. | [server/utils/renderJobs.ts:29-32](file:///D:/Applications/tm-tools/server/utils/renderJobs.ts#L29); `ls server/api/v1/media/render` → `[jobId].get.ts` only | Medium |

### C. FFmpeg graph compiler (§5.5)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| C1 | No typed IR: `addFilterChain(chain: string)` takes arbitrary text and chains are `join('; ')`. The `RenderGraph` label generator is **dead code** — real labels are hand-written literals with no uniqueness/dangling-edge validation. | [app/utils/tmcut/render/graph.ts:26,35,64](file:///D:/Applications/tm-tools/app/utils/tmcut/render/graph.ts#L26); called only in [tests/unit/tmcut_render_graph.spec.ts:43-44](file:///D:/Applications/tm-tools/tests/unit/tmcut_render_graph.spec.ts#L43) | High |
| C2 | Raw interpolation of a model-controlled string into a filter: `blend=all_mode='${clip.raw.blend}'`. The UI constrain
s it to 4 values, but the store/project-JSON boundary is unvalidated, and no agent/MCP guard exists for future writes. | [app/utils/tmcut/render/video.ts:126-127](file:///D:/Applications/tm-tools/app/utils/tmcut/render/video.ts#L126) vs allowlisted [fxCatalog.ts:183](file:///D:/Applications/tm-tools/app/utils/tmcut/fxCatalog.ts#L183) | High |
| C3 | No **filter** capability probe against the target FFmpeg build (only an encoder/GPU probe exists). | [electron/tools/ffmpeg.controller.cjs:60-117](file:///D:/Applications/tm-tools/electron/tools/ffmpeg.controller.cjs#L60); nothing in `render/*` | High |
| C4 | Desktop export declares success on exit code `0` alone — no output existence/size probe, no stream/duration verification, and no temp cleanup on failure (partial file survives). | [ffmpeg.controller.cjs:1168-1192](file:///D:/Applications/tm-tools/electron/tools/ffmpeg.controller.cjs#L1168), [task-manager.cjs:252](file:///D:/Applications/tm-tools/electron/tools/task-manager.cjs#L252), [TmcutExportModal.vue:504](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutExportModal.vue#L504) | High |
| C5 | A rejected transition overlap **silently** becomes a hard `concat`; the core validator (`transitions.mjs:102-124`) is not consulted by the compiler, so the user gets a cut with no warning. | [render/video.ts:258-274](file:///D:/Applications/tm-tools/app/utils/tmcut/render/video.ts#L258) | Medium |
| C6 | Effects on text/overlay items are dropped: the text chain never calls `buildFfmpegEffectFilters`, and `TextOverlayClip` has no `effects` field. | [render/text.ts:192-214](file:///D:/Applications/tm-tools/app/utils/tmcut/render/text.ts#L192), [render/types.ts:52-77](file:///D:/Applications/tm-tools/app/utils/tmcut/render/types.ts#L52) | Medium |
| C7 | `filterPathArg` throws on an apostrophe instead of escaping it, and no path-existence check happens before the argument is emitted. | [render/graph.ts:98-110](file:///D:/Applications/tm-tools/app/utils/tmcut/render/graph.ts#L98) | Medium |
| C8 | Web render passes compiled filter strings through unchanged by design → a `fontfile=`/`lut3d=` path in a chain can read server paths (inputs themselves are correctly restricted to `/uploads/*`). | [server/api/v1/media/render.post.ts:79-98](file:///D:/Applications/tm-tools/server/api/v1/media/render.post.ts#L79) | Medium |
| C9 | `keyframes.mjs` divides by a literal `120000` instead of importing `TICKS_PER_SECOND` (value matches today, so no live bug — pure drift risk). | [tmcut-core/src/keyframes.mjs:164-165,191](file:///D:/Applications/tmcut-core/src/keyframes.mjs#L164) vs [time.mjs:9](file:///D:/Applications/tmcut-core/src/time.mjs#L9) | Low |
| C10 | Second and later video/text tracks are not compiled (`.find`), though the export modal does disclose it in a banner. | [render/index.ts:41-46](file:///D:/Applications/tm-tools/app/utils/tmcut/render/index.ts#L41), banner [TmcutExportModal.vue:391-407](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutExportModal.vue#L391) | Low |
| C11 | Render tests assert `filterComplex.includes(...)` substrings, not IR nodes/edges. Missing: capability probe tests, unsupported-effect rejection, Unicode/Vietnamese drawtext, multi-effect chain, keyframe start/middle/end frame checks. Real-FFmpeg smoke is opt-in and skipped by default. | [tests/unit/tmcut_render_graph.spec.ts:36,115](file:///D:/Applications/tm-tools/tests/unit/tmcut_render_graph.spec.ts#L36), [run-all.mts:18-21](file:///D:/Applications/tm-tools/tests/unit/run-all.mts#L18) | High |

Timebase policy is sound: integer ticks at 120 000/s ([time.mjs:9](file:///D:/Applications/tmcut-core/src/time.mjs#L9)), decoded to seconds once at the clip boundary ([render/clip.ts:74-102](file:///D:/Applications/tm-tools/app/utils/tmcut/render/clip.ts#L74)), FFmpeg only ever sees seconds; `settb=1/fps` locks the timebase. Frame snapping exists but is not used by the compiler.

### D. FX preview parity — the roadmap's stated focus (§5, §6)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| D1 | The preview is a **second, parallel definition table inside the component**: `EFFECT_SPEC` (28 entries), `FILTER_SPEC` (20 entries) and a 46-case `switch` in `transitionLayers()`. Coverage is complete *today* (verified: 28/28 registry effects minus `lut3d`, 20/20 LUT presets, 45/45 catalog transitions), but nothing enforces it — a 30th core effect silently renders the generic before/after toggle and lies about what it does. | [TmcutFxThumb.vue:92-170](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxThumb.vue#L92), [:178-223](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxThumb.vue#L178), [:272-414](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxThumb.vue#L272) | High |
| D2 | No `preview` metadata exists on any definition. `EFFECT_REGISTRY` carries `type/label/category/renderReady/params`; `TmcutTransitionEntry` carries `key/xfade/category/label`. Neither has strategy, fidelity, sample asset or applicability, so preview behaviour has no declared source of truth. | [effects.mjs:21-30](file:///D:/Applications/tmcut-core/src/effects.mjs#L21), [fxCatalog.ts:19-27](file:///D:/Applications/tm-tools/app/utils/tmcut/fxCatalog.ts#L19) | High |
| D3 | The thumbnail ignores parameters: all 3 call sites pass only `kind` + `type` — no `params`, no `action`. Changing an amount in the inspector never changes the tile, so the tile always demonstrates the default value. | [TmcutFxLibrary.vue:421](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxLibrary.vue#L421), [:454](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxLibrary.vue#L454), [:489](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxLibrary.vue#L489) | High |
| D4 | Animation runs unconditionally (`… infinite`) with no viewport/hover/selection gate — 45 transition tiles + 27 effects + 20 filters mounted at once in an `overflow-y-auto` grid, including per-frame `filter: blur()` keyframes. Roadmap §6.4 requires offscreen pause. | [TmcutFxThumb.vue:24-28,72-75,419-454](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxThumb.vue#L24), [TmcutFxLibrary.vue:401,408](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxLibrary.vue#L401) | High |
| D5 | `renderReady` — the honesty flag that already exists — is read by **no UI**. There is no `previewExact / previewApproximate / exportSupported / exportUnsupported` matrix, so nothing tells the user that a CSS preview is an approximation. The only admissions live in code comments. | grep `renderReady` in `app/` → [fxLibrary.ts:120](file:///D:/Applications/tm-tools/app/utils/tmcut/fxLibrary.ts#L120) (type only); grep `approximate\|fidelity\|exportSupported` → none; comments at [TmcutInspector.vue:1642](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutInspector.vue#L1642), [TmcutFxThumb.vue:11-16](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxThumb.vue#L11) | High |
| D6 | Known approximations not marked anywhere: `zoom-in`/`zoom-out`/pop text animations export as a fade ([render/text.ts:44-72](file:///D:/Applications/tm-tools/app/utils/tmcut/render/text.ts#L44) vs [TmcutInspector.vue:192-230](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutInspector.vue#L192)); `lut3d` presets are `colorbalance`/`curves` approximations, not `.cube` ([effects.mjs:453-473](file:///D:/Applications/tmcut-core/src/effects.mjs#L453)); effect `stabilize` is one-pass `deshake` while the real 2-pass vidstab pipeline lives in the tools controller. | — | High |
| D7 | `kind` has no `animation` arm, although animations exist as keyframe presets (`applyMediaAnimPreset` writes OPACITY/SCALE pairs). | [fxLibrary.ts:55-95](file:///D:/Applications/tm-tools/app/utils/tmcut/fxLibrary.ts#L55), [TmcutFxThumb.vue:25](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxThumb.vue#L25) | Medium |
| D8 | The transition switch's `default:` branch draws a **left wipe** for any unknown key, i.e. an invented behaviour rather than an honest unknown state. Reachable for keys that `xfadeNameFor` passes through but the catalog does not list (`coverleft`, `revealup`, `hlwind`, `fadefast`, …). | [TmcutFxThumb.vue:411-413](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxThumb.vue#L411), [fxCatalog.ts:183-188](file:///D:/Applications/tm-tools/app/utils/tmcut/fxCatalog.ts#L183) | Medium |
| D9 | `TmcutFxThumb` has **no test at all** (roadmap §10.2 wants per-definition coverage). | grep `FxThumb` in `tests/` → 0 hits | High |

### E. UI (§7, PHẦN 7) and AGENTS.md conventions

| # | Finding | Evidence | Severity |
|---|---|---|---|
| E1 | Inspector numeric params are free-entry `type="number"` and the write path never clamps; when a param omits `min`/`max` the UI invents `0…100`. | [TmcutInspector.vue:640-642](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutInspector.vue#L640), [:707](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutInspector.vue#L707), [:1910-1911](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutInspector.vue#L1910) | Medium |
| E2 | Web-build BYOK save is Electron-only but the field is not disabled: `if (!isDesktop.value) return`, and `window.electronAPI?.setConfig` throws `'set-config failed'`. Against AGENTS rule "no buttons that imply a real operation". | [TmcutAiConnect.vue:78,217,258-259,530,711-712](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutAiConnect.vue#L217) | Medium |
| E3 | AI/generation jobs are not persisted — after a refresh the state is gone; only the export queue persists. | [useTmcutAi.ts:56-84](file:///D:/Applications/tm-tools/app/composables/useTmcutAi.ts#L56) vs [useTmcutExportQueue.ts:36-57](file:///D:/Applications/tm-tools/app/composables/useTmcutExportQueue.ts#L36) | Medium |
| E4 | Zero `Lazy` prefix anywhere in the tmcut scope despite on-demand modals/slidovers. | [editor.vue:1609,1618,1715,1718,1914-1921](file:///D:/Applications/tm-tools/app/pages/tmcut/editor.vue#L1715) | High |
| E5 | `/tmcut/factory` has no `BasePage` (hand-rolled header + `p-6`) and imports the component directly. | [factory.vue:2-23](file:///D:/Applications/tm-tools/app/pages/tmcut/factory.vue#L2) | High |
| E6 | Forbidden inline i18n fallbacks (`t(key, 'Fallback')`) in 13 places, including 5 inside `TmcutFxLibrary.vue` whose own comment states the rule. | [TmcutVideoFactory.vue:343,353,837,847,855,858,867,872](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutVideoFactory.vue#L343); [TmcutFxLibrary.vue:147-164](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxLibrary.vue#L147); [TmcutAssetCenter.vue:108,130,335,357](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutAssetCenter.vue#L108); [TmcutMarketplace.vue:90,159,198,204,253](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutMarketplace.vue#L90) | Medium |
| E7 | No `focus-visible` anywhere in tmcut (and `outline-none` with no replacement); tab/chip bars are bare buttons with no `role="tablist"`/`aria-selected`/arrow-key nav. | grep `focus-visible` → 0 files; [TmcutTimeline.vue:1574](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutTimeline.vue#L1574), [TmcutFxLibrary.vue:330-358,387-398](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxLibrary.vue#L330) | Medium |
| E8 | FX library has no sort control and no loading/error branch at all (no `loading`/`error` ref in the file); empty states lack icon + CTA. | [TmcutFxLibrary.vue:69-79,383-399,432-437,462-467,499-504](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxLibrary.vue#L383) | Medium |
| E9 | Convention drift: `variant="solid" color="primary"` ([editor.vue:1560,1748,1830,1865](file:///D:/Applications/tm-tools/app/pages/tmcut/editor.vue#L1560)); 6 primaries on one surface ([TmcutVideoFactory.vue:774-1199](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutVideoFactory.vue#L774)); studio pages missing `flush` ([templates.vue:238](file:///D:/Applications/tm-tools/app/pages/tmcut/templates.vue#L238), [autocut.vue:488](file:///D:/Applications/tm-tools/app/pages/tmcut/autocut.vue#L488)); hand-rolled `animate-*` entrances and decorative `animate-pulse` loops; fixed `grid-cols-2` in a narrow panel; icon-only buttons without `aria-label`. | cited | Low |

## 3. Prioritised plan

Ordered by (risk × user-visible value) ÷ effort, honouring §12.4 "no broad refactor before a vertical slice".

1. **Now, before anything else (user decision required):** rotate/withdraw the A1 secrets and replace the
   committed fallbacks with env-only reads. Code change is trivial; the *rotation* is not ours to do.
2. **Phase 5/6 — FX preview parity** (roadmap's stated focus; D1–D9): add declared `preview` metadata to the
   core effect registry + transition catalog, make `TmcutFxThumb` resolve its adapter from that metadata with
   `params`/`action`/`active` inputs, gate animation by viewport, surface an honest fidelity + export badge,
   replace the misleading default transition with an unknown state, and add per-definition tests.
3. **Phase 2 hardening** (A2–A4): allowlist spawn options, constrain `file-manager` roots, move the
   editor-page direct fs read behind the media adapter.
4. **Graph correctness** (C2, C5, C9, then C1/C3/C4): validate `blend` against an allowlist at the compiler
   boundary, warn instead of silently concat-ing a rejected transition, use `TICKS_PER_SECOND`, then IR
   validation + capability probe + output verification.
5. **Phase 7 follow-ups** (B1, B4): `assetId` indirection with a legacy-path resolver + missing-media UX;
   persisted web render jobs + cancel.
6. **Phase 8 UI polish** (E1–E9) in small batches, each verified by typecheck + the existing specs.

## 4. Open questions for the user

1. A1 — are `tm-tools`'s GitHub repo and its committed secrets in scope for rotation now?
2. Should web mode keep the current "upload + server render" path as the supported web export, or is a
   browser-side render path wanted later (roadmap §1.1 #1 leaves it optional)?
3. Phase 5/6 subset to land first: is the current 29-effect / 45-transition set the published set, or should
   unsupported-for-export definitions be hidden from the marketplace until they have a render path?

## 5. Phase 5/6 delivered — one registry drives tile + inspector + live preview (2026-10-28)

### 5.1 What changed

| Layer | Change | Evidence |
|---|---|---|
| Core registry | Every one of the 29 effect descriptors now declares `preview: { strategy, fidelity }` with fidelity from the documented vocabulary (`exact` 5 / `approximate` 17 / `illustrative` 7), and `fxCapabilities()` exposes `{ fidelity, strategy, exportSupported, label, category }` — `exportSupported` is the existing `renderReady` flag, now read by UI. New `clampEffectParam()` (same `coerceValue` the store uses) and `lut3dChain()` (single FFmpeg chain per LUT preset, `null` for the `neutral` no-op and unknown ids). | [tmcut-core/src/effects.mjs:27](file:///D:/Applications/tmcut-core/src/effects.mjs#L27), [:782](file:///D:/Applications/tmcut-core/src/effects.mjs#L782), [:797](file:///D:/Applications/tmcut-core/src/effects.mjs#L797), [:820](file:///D:/Applications/tmcut-core/src/effects.mjs#L820); typings [src/index.d.ts](file:///D:/Applications/tmcut-core/src/index.d.ts) |
| Preview resolver (new) | `app/utils/tmcut/fxPreview.ts` is the single place a definition becomes CSS: 28 effect builders, 46 transition keys (the 45 catalog keys plus one xfade alias) folded onto a handful of wipe/slide/slice/squeeze/shape/tint primitives, and LUT grades **derived by parsing the export chain** rather than a copied table. Unknown ids return `known:false` with **zero layers** (closes D8's invented wipe). `effectCssParts()` returns the two properties a lone media element can drive (`filter` **and** `transform` — a mirror is not a CSS filter function); `usedAnimationNames()` enumerates the 45 animation names the module can emit. | [fxPreview.ts:134](file:///D:/Applications/tm-tools/app/utils/tmcut/fxPreview.ts#L134), [:418](file:///D:/Applications/tm-tools/app/utils/tmcut/fxPreview.ts#L418), [:468](file:///D:/Applications/tm-tools/app/utils/tmcut/fxPreview.ts#L468), [:607](file:///D:/Applications/tm-tools/app/utils/tmcut/fxPreview.ts#L607), [:658](file:///D:/Applications/tm-tools/app/utils/tmcut/fxPreview.ts#L658), [:778](file:///D:/Applications/tm-tools/app/utils/tmcut/fxPreview.ts#L778), [:811](file:///D:/Applications/tm-tools/app/utils/tmcut/fxPreview.ts#L811) |
| Thumbnail | `TmcutFxThumb.vue` no longer owns any definition table: it resolves layers through `resolveFxPreview` and gates motion on `IntersectionObserver` + `prefers-reduced-motion` + hover/selection (D4), freezes offscreen work with `animation-play-state` instead of unmounting, shows the honest fallback line when `known:false`, and badges fidelity/`exportSupported` straight from `fxCapabilities` (D5). Params now reach the tile (D3). | [TmcutFxThumb.vue:91](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxThumb.vue#L91), [:114](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxThumb.vue#L114) |
| FX library | The three call sites pass the selected clip's stored params and an `active` flag, and forward focus so keyboard users get the hover badges. | [TmcutFxLibrary.vue](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFxLibrary.vue) `clipParamsFor` / `tileActive` |
| Live preview | `TmcutPreviewPlayer.vue` deleted its own 4-type `computeEffectsCssFilter` table and now paints every clip effect through `effectCssParts`, including the transforms it used to ignore (mirror / rotate) and the LUT grades it hard-coded for 4 presets. No `eff.type === '…'` branch remains in the player — the spec fails if one comes back. | [TmcutPreviewPlayer.vue:679](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutPreviewPlayer.vue#L679), [:731](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutPreviewPlayer.vue#L731) |
| Inspector (E1) | Param writes go through `clampEffectParam` on a `normalizeEffects` copy, so the index matches the rendered list, out-of-range numbers land on the documented bounds, invalid enum picks fall back to the default, and a param the schema does not declare never enters the project. | [TmcutInspector.vue:608](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutInspector.vue#L608), [:705-718](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutInspector.vue#L705) |
| i18n | New `tmcut.fxThumb` block (4 keys) in **both** locales; the tile renders no inline fallback string. | [en.json:496](file:///D:/Applications/tm-tools/i18n/locales/en.json#L496), [vi.json:496](file:///D:/Applications/tm-tools/i18n/locales/vi.json#L496) |

### 5.2 Tests added

- [tests/unit/tmcut_fx_preview.spec.ts](file:///D:/Applications/tm-tools/tests/unit/tmcut_fx_preview.spec.ts) — 22 checks, `pnpm test:fxpreview`: coverage (0 missing effect / transition / filter previews, 45 catalog keys, 20 presets), honesty (fidelity always equals `fxCapabilities`, unknown ⇒ `known:false` + no painted layer), param response + registry clamping, `effectCss` parity and the `filter`/`transform` split, motion-off still-frames (transitions keep both plates as a direction-aware split), and two drift guards: every animation name the resolver emits has a `@keyframes` in the tile, and neither the tile nor the player may re-introduce a local definition table.
- [tmcut-core/test/effects.test.mjs:228](file:///D:/Applications/tmcut-core/test/effects.test.mjs#L228) — 5 checks for the registry contract (§5.6): descriptors declare preview, `fxCapabilities` mirrors them, fidelity is a *documented* stance (only `negate`/`letterbox`/mirrors/`sepia` claim `exact`), `clampEffectParam` bounds, `lut3dChain` covers every preset except the no-op, tokens parse and carry no shell-risk characters.

### 5.3 Verification actually run

| Command | Result |
|---|---|
| `node --test "test/*.test.mjs"` (tmcut-core) | PASS — 374 tests, 0 fail (was 369) |
| `node tests/unit/run-all.mts` (tm-tools) | PASS — 46/46 specs (was 45; render smoke still opt-in, **not** run) |
| `tsx tests/unit/tmcut_fx_preview.spec.ts` | PASS — 22/22 checks |
| `nuxt typecheck` | PASS — no errors |
| `eslint` on all touched files | PASS — no errors (after `--fix` of repo style rules) |

### 5.4 Still open in this area

- **Overlay compositing in the live preview.** 10 definitions (vignette, grain, chromakey, stabilize,
  letterbox, chromatic, fisheye, afterimage, denoise, deband) paint through extra layers or alpha, so
  `effectCssParts` returns an empty `filter` for them and a single `<video>` element still cannot show them
  while export does. The tile is honest about it (badge + layered demo); closing this needs multi-layer
  compositing in the player, not another CSS table. The mirror/rotate family now travels on `transform`, so
  it *is* previewed.
- **D7** — no `animation` preview kind yet (keyframe presets exist in `fxLibrary.applyMediaAnimPreset`).
- **D6** — the export approximations themselves are unchanged (`deshake` one-pass, `colorbalance`/`curves`
  standing in for `.cube` LUTs, zoom/pop text animations exporting as a fade); they are now *labelled*, not fixed.
- Web render smoke (`--smoke`, needs real FFmpeg) was not executed in this phase.

## 6. UI sweep phase (2026-10-29) — running the five TMCut pages and fixing what broke

Method: dev server on `:4002`, real browser (Chrome DevTools MCP) at 1920 / 1366 / 1024, every claim
below backed by a measured DOM value or a rendered file, not by reading the template.

### 6.1 Defects found in the running app and fixed

| Defect (how it showed) | Fix | Evidence |
|---|---|---|
| Program monitor painted a **"Cannot load media file"** overlay over a perfectly playable clip. The still-image `<img>` layer stayed mounted for video clips, so a video URL fed to `<img>` always errored; the symmetric guard for the video layer was missing too. | Guard both directions and bind `src` only while the active clip is an image. | [TmcutPreviewPlayer.vue:1745](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutPreviewPlayer.vue#L1745) · browser: overlay count 0 with the video playing (`/uploads/…mp4` was already answering `206`) |
| `pnpm typecheck` failed twice on `UModal :close`: `{ 'aria-label': … }` is not a key Nuxt UI v4 accepts (its own close button already carries the localized `t('modal.close')`). | Boolean `close` in the shared modal and the template-customize modal. | [TmcutModal.vue:34](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutModal.vue#L34), [TmcutTemplateCustomizeModal.vue:60](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutTemplateCustomizeModal.vue#L60) |
| AutoCut media chooser bound a `string \| null` ref to `URadioGroup`, which types `modelValue` as `string \| undefined`. | Ref widened to `undefined`, cleared on reopen. | [autocut.vue:1415](file:///D:/Applications/tm-tools/app/pages/tmcut/autocut.vue#L1415) |
| Three keys rendered as raw `tmcut.steps.sourceReady` / `tmcut.home.pinned` / `tmcut.autocutV2.profileSelected` text in the UI. | Added to **both** locales + a spec that scans every literal `t('…')` in the tmcut pages/components and fails on a missing key or an en/vi drift. | [tmcut_i18n_keys.spec.ts](file:///D:/Applications/tm-tools/tests/unit/tmcut_i18n_keys.spec.ts) |
| **A 2-second project behaved like a 5-second one.** `totalDuration` carries a 5s *ruler* floor, and playback, the saved project duration, every transport readout, the End shortcut, the scrub bar and the export spec all read that padded number: the player ran 3s of black after the media ended, the dashboard card said 5s, and the export dialog quoted `00:05.00 / ~20 MB` for a render the compiler actually produces in 2s. | Split the concepts: new `contentDuration` (real end of content) drives playback, loop bounds, `play()` restart, `durationMs`, readouts, scrub mapping, End/skip-to-end and full-range export; `totalDuration` keeps the floor for ruler drawing and playhead parking. | [useTmcutProject.ts:251-272](file:///D:/Applications/tm-tools/app/composables/useTmcutProject.ts#L251), [useTmcutPlayback.ts:205-336](file:///D:/Applications/tm-tools/app/composables/useTmcutPlayback.ts#L205) · [tmcut_playback_duration.spec.ts](file:///D:/Applications/tm-tools/tests/unit/tmcut_playback_duration.spec.ts) (6 checks, rAF-driven) · browser: playhead 0→**00:02.00** then auto-pause; export dialog now reads `00:02.00 / ~8.0 MB` |
| Dashboard filter bar fell off the right edge at 1024: at `lg` the search field and the ~600px filter group shared one row, so *Recently opened / Name A-Z / Longest duration* and both view toggles sat at x=994…1336 behind an `overflow-x-auto` clip. | Share the row only from `xl`; below it stack the bar and wrap the group (no clipped scroll area pretending to be complete). | [index.vue:262-274](file:///D:/Applications/tm-tools/app/pages/tmcut/index.vue#L262) · browser at 1024: off-screen controls 0, `scrollWidth == clientWidth == 1024` |

### 6.2 Flows re-driven end to end in the browser

- **Templates → Customize → Create**: typed `QA-HEADLINE-42` into the placeholder field, the created
  project's text clip carried exactly that string, the modal closed and routed to the editor. Deleted the
  throwaway project through the dashboard menu (confirm dialog names the project) — no test data left behind.
- **Editor playback**: play/pause button + `Space`, transport label flips, playhead and `<video>` advance
  together, stop at content end.
- **Console**: the only message on any tmcut page is `[MCP] electronAPI.mcp.onToolInvoke not available`
  (expected in the web runtime). The `/api/v1/ai/relay/catalog` 401s seen earlier now return `200`, so they
  belonged to the pre-fix auth refresh, not to media serving.

### 6.3 Verification actually run (this phase)

| Command | Result |
|---|---|
| `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/run-all.mts` | PASS — **51/51** specs (smoke excluded) |
| `… tests/unit/run-all.mts --smoke` (real bundled FFmpeg N-126482) | PASS — **52/52** specs, `tmcut_render_smoke` **5/5** renders exit 0 |
| `tsx tests/unit/tmcut_playback_duration.spec.ts` | PASS — 6/6 |
| `tsx tests/unit/tmcut_component_hygiene.spec.ts` | PASS — 19/19 (2 new dashboard-bar checks) |
| `tsx tests/unit/tmcut_autocut_source.spec.ts` / `tmcut_template_modal.spec.ts` / `tmcut_i18n_keys.spec.ts` | PASS — 28 / 11 / 4 |
| `nuxt typecheck` | PASS — no errors |
| `eslint` on every file touched in this phase | PASS — no errors |
| Browser: 1920 / 1366 / 1024 on dashboard, templates, autocut, editor, factory | PASS — no off-screen controls, no raw i18n keys, no console errors |

### 6.4 Honest limits after this phase

- **Existing projects keep their padded `durationMs` until the next save** — the dashboard badge on the QA
  project still reads `00:05` from a save made before the split. New/edited projects store the content length.
- **The editor timeline is a fixed `h-72`** with no height control: at 1366×768 the tracks band shows ~2 of
  3 rows and the rest is reached by scrolling (header/canvas scroll sync verified 1:1). A resizable split is a
  feature, not filed as a defect.
- A synthetic `Ctrl+S` does not reach the editor's save handler in automation, so the *re-save refreshes the
  badge* step is covered by the unit spec (`saveProject persists the content length`) rather than by a click.
- **The content/export split is now closed all the way down:** `tmcut_render_smoke` gained a fifth real render
  that compiles a 2s project whose stored `durationMs` is the old padded `5000`, renders it with the bundled
  FFmpeg and `ffprobe`s the result — 2.0s, not 5. [tests/unit/tmcut_render_smoke.spec.ts:244](file:///D:/Applications/tm-tools/tests/unit/tmcut_render_smoke.spec.ts#L244)
- Non-tmcut pages, Electron-only paths (IPC, hardware encoders, `media://` preview) were
  not exercised in this phase; the secrets found in `server/config/index.ts` remain for the owner to rotate.

## 7. Export + AutoCut web-parity phase (2026-10-29) — the two flows the sweep had not reached

Same method: dev server on `:4002`, driven in a real browser, every claim backed by a rendered file, a
measured response, or a console that stayed empty.

### 7.1 Defects found in the running app and fixed

| Defect (how it showed) | Fix | Evidence |
|---|---|---|
| **Web export failed on the first try** with a red `error.tokenMissing`. The access-token cookie expires on its own (maxAge = token TTL) while the refresh cookie survives, and the interceptor refreshed the session but could not replay the request — ofetch ignores whatever `onResponseError` returns, so the export `POST` that triggered the refresh still died. | Drop the dead hook; wrap `$fetch` so a 401 on a protected route refreshes once and **replays** the original call, and leave `login/register/refresh/me` to their own handlers (a 401 there is a user error or the end of the session, not a retry signal). | [auth.client.ts:34-73](file:///D:/Applications/tm-tools/app/plugins/auth.client.ts#L34) · [tmcut_auth_refresh.spec.ts](file:///D:/Applications/tm-tools/tests/unit/tmcut_auth_refresh.spec.ts) 4 new checks (replay, no second-401 loop, unrefreshable session, non-401 not retried) · browser: export produced `/uploads/render-mvt04md0-…-QA_UI_2026-10-29.mp4`, 1,336,029 B, ffprobe h264 1920×1080 + aac, 2.067 s, served `200` and `206` on Range |
| **AutoCut could not analyze anything in the browser** — the two FFmpeg detection passes only existed behind `window.electronAPI.tmcut`. | New `POST /api/v1/media/analyze` runs the same passes server-side over a `/uploads/` asset and returns the raw log; `resolveAnalyzer` picks IPC on desktop, this endpoint on web, so both feed the identical log to the same @tmcut/core parsers. | [analyze.post.ts](file:///D:/Applications/tm-tools/server/api/v1/media/analyze.post.ts) · [useTmcutAutocut.ts:80-89](file:///D:/Applications/tm-tools/app/composables/useTmcutAutocut.ts#L80) · [tmcut_autocut_analyze.spec.ts](file:///D:/Applications/tm-tools/tests/unit/tmcut_autocut_analyze.spec.ts) 4/4 |
| **Scene detection was broken on desktop too.** The controller passed `-vsync 0`, an option removed in the bundled FFmpeg (N-126482): every AutoCut run died with `Unrecognized option 'vsync'`, and the endpoint inherited the same shape. | One argv module for both runtimes (`-fps_mode passthrough`, filter-only pass with the unused streams dropped), plus an opt-in smoke spec that runs those exact vectors against `resources/ffmpeg.exe`. | [shared/utils/detection-args.cjs](file:///D:/Applications/tm-tools/shared/utils/detection-args.cjs) · [tmcut_detect_smoke.spec.ts](file:///D:/Applications/tm-tools/tests/unit/tmcut_detect_smoke.spec.ts) 4/4 — red-proven: re-injecting `-vsync` fails check 1 with the original error text. `electron-builder.yml` now packages `shared/**` (the main process requires it) |
| **Every AutoCut analysis threw an uncaught `TypeError: Cannot read properties of null (reading 'edl')`** and raised the dev error overlay, even though the review UI then rendered correctly. `analyzeSource` clears `analyzing` in its `finally`, Vue flushes the render on that microtask, and the step-3 branch opened on `currentStep === 3` alone — so it dereferenced `edlResult!` before `startAnalysis` had stored the result. | Guard the branch with the ref it asserts on, and add a template scanner that fails any `X!.prop` whose enclosing branch never tests `X`. | [autocut.vue:897-901](file:///D:/Applications/tm-tools/app/pages/tmcut/autocut.vue#L897) · [tmcut_component_hygiene.spec.ts](file:///D:/Applications/tm-tools/tests/unit/tmcut_component_hygiene.spec.ts) 22/22 — red-proven: it names `autocut.vue:919 edlResult!.edl.profile` when the guard is removed · browser: full analyze → review → draft with **zero** console messages |
| Seven icon names resolved to nothing (offline `@iconify-json` lookup): `memory`, `folder-eye`, `letter-case` ×4, `monitor-desktop`, `circle-question`, `coin`, `crop-portrait`. | Renamed to names the collections actually ship (`cpu`, `folder-search`, `case-sensitive`, `monitor-pc`, `circle-question-mark`, `coins`, `rectangle-vertical`) and pinned a check over all ~1,949 icon references. | [tmcut_component_hygiene.spec.ts](file:///D:/Applications/tm-tools/tests/unit/tmcut_component_hygiene.spec.ts) "every icon name resolves offline" |

### 7.2 Flows re-driven end to end in the browser

- **Export**: `QA UI 2026-10-29` project → export modal → web render → Download; file verified with ffprobe
  and over HTTP (200 + 206 Range).
- **AutoCut (web)**: media chooser → profile → analyze (real scene + silence logs, transcript stage honest
  with and without an AI key) → review (1 segment, avg 5 %, `transcript-v2`) → **Create draft** → editor at
  `/tmcut/editor?project=…`, 1080×1920 canvas, `00:02.00`. Run twice: once before and once after the argv
  refactor, both with an empty console.

### 7.3 Verification actually run (this phase)

| Command | Result |
|---|---|
| `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tests/unit/run-all.mts --smoke` | PASS — **54/54** specs (2 new spec files), `tmcut_render_smoke` 5/5, `tmcut_detect_smoke` 4/4 |
| `nuxt typecheck` | PASS — exit 0, no diagnostics (the plugin's `TypedInternalResponse` mismatch is resolved at the boundary) |
| `eslint` on every file touched in this phase | PASS — no errors |
| Browser: AutoCut ×2, export ×1, editor ×1 | PASS — no console errors, no error overlay |

### 7.4 Honest limits after this phase

- **The web runtime renders inline**: the dashboard `Queue (0)` only tracks desktop jobs, so a web export
  never appears there. Divergence, not a defect — filed here so it is not mistaken for one later.
- The 2 s test card is *silent*, so AutoCut honestly returns one 5/100 "silence" segment and cuts nothing.
  A speech-bearing clip is still needed to exercise multi-segment review, captions and the AI triage blend.
- The transcript stage stalls ~20-25 s when no AI key is configured (`status()` probe, not a timeout bug);
  the UI shows the stage label, so it reads as working. Not fixed — worth a bounded probe.
- Factory batch run and the dark-mode + `vi`-locale visual pass remain unverified *(closed by §8 for the
  `vi` pass and the factory dry-run; the live paid run and the dark-mode measurement stay open)*;
  `tests/scratch-debug.*` predates this phase and was left alone.

## 8. Template library + Video Factory UI phase (2026-10-29) — the filter bar was a trap

Method unchanged: dev server on `:4002`, driven in a real browser (Chrome DevTools MCP), and every claim
below is a measured DOM/accessibility value or a spec assertion — not a reading of the template.

### 8.1 Defects found in the running app and fixed

| Defect (how it showed) | Fix | Evidence |
|---|---|---|
| **Blocker — the template library's filter bar disabled itself.** The category chips are a *single*-select group (`:max-selected="1"`) that also carries an `all` entry, but the component applied the multi-select rule: once the limit is reached, freeze every unselected sibling. With one chip always on, that meant **all seven chips went `disabled` after any deselect or Reset click** — the page could no longer be filtered at all, and reloading was the only escape. | A single-select group has no "full" state: `maxSelected === 1` now replaces the selection instead of blocking siblings, and only true multi-select groups block. | [TmcutFilterChips.vue:32-42](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFilterChips.vue#L32) · browser: disabled chips 0/7, and the measured walk All→Intro(2)→Outro(1)→deselect→All(6)→My Templates(0, empty state)→All(6) |
| **Chip numbers lied about the grid.** A chip's count was taken over the whole library while the grid was also filtered by aspect ratio and search, so "Outro & End Cards 1" stayed printed at 9:16 where the outro template does not exist — clicking it produced an empty grid under a badge promising one. | Counts derive from `facetScope` — the library filtered by everything *except* the chip's own dimension — so the number equals the grid clicking that chip yields. | [useTmcutTemplates.ts:129-155](file:///D:/Applications/tm-tools/app/composables/useTmcutTemplates.ts#L129) · browser at 9:16: All 2 / Intro 1 / Split 1 / Outro 0 and `grid.length === chip.count` for every chip and every ratio+search combination |
| **"My Templates" could not reach your own templates.** The ownership chip filtered `category === 'custom'`, but a template saved from the AI builder keeps its brief's category (`intro`, `promo`, …) while its card is badged Custom — so the one label that promises the user's own work showed 0 next to a template that existed. | `custom` now means *owned* (`!isBuiltin`) in both the filter and the count. | [useTmcutTemplates.ts:140-145](file:///D:/Applications/tm-tools/app/composables/useTmcutTemplates.ts#L140) · spec: an owned intro template appears under My Templates and still counts under Intro |
| **The factory queue contradicted the page.** With a finished batch selected, the queue panel still announced "No batch is queued" directly above that batch's card. | The empty copy only shows when no batch is selected at all; otherwise the panel states that nothing is running and the card below is a completed batch (new keys in both locales). | [TmcutVideoFactory.vue:1021-1025](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutVideoFactory.vue#L1021) · browser: idle line renders after a completed dry-run batch |
| **Unreachable / unannounced controls.** Icon-only buttons (card export + delete, variants −/+, history trash, AI-modal close) had no accessible name; four `<label>` elements wrapped nothing in the factory; the template and provider `USelect` and both textareas were unnamed; and both shared filter bars announced themselves with a hard-coded English string (`aria-label="Filter chips"`, `"Segmented control"`), so a Vietnamese session still read English. | Names from existing/new i18n keys at every site; `<label>` → `<p>` where no control is wrapped; `role="group"` + translated `:aria-label` on the button rows; the two bars take their name from the page through a new `label` prop (all four call sites pass a localized one). | [TmcutFilterChips.vue:56](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutFilterChips.vue#L56), [TmcutSegmentedControl.vue:43](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutSegmentedControl.vue#L43), [TmcutTemplateCard.vue:97-105](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutTemplateCard.vue#L97), [TmcutVideoFactory.vue:763-774](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutVideoFactory.vue#L763), [templates.vue:277-323](file:///D:/Applications/tm-tools/app/pages/tmcut/templates.vue#L277) · browser: `unnamed buttons 0` on `/tmcut/templates`, `/tmcut/factory` and `/tmcut`; AX names `Lọc mẫu theo danh mục` / `Filter templates by category` per locale |
| **The dashboard's own controls were the same class of gap**, plus Chrome flagged the project search field with no `id`/`name`, and both per-project `⋯` menu triggers were unnamed. | Search field gets `id`/`name`/`aria-label`; grid and list view toggles and both menu triggers get `t('tmcut.home.menuLabel')`-style names; the two bars get localized group names. | [index.vue:269-290](file:///D:/Applications/tm-tools/app/pages/tmcut/index.vue#L269), [index.vue:402](file:///D:/Applications/tm-tools/app/pages/tmcut/index.vue#L402), [index.vue:446](file:///D:/Applications/tm-tools/app/pages/tmcut/index.vue#L446) · browser: the "form field should have an id or name" issue is gone from the console |
| **`<html lang>` was frozen at `en`** while the whole UI rendered Vietnamese — screen readers got the wrong pronunciation model and the page lied about its language. | `lang` follows the active i18n locale. | [app.vue:27](file:///D:/Applications/tm-tools/app/app.vue#L27) · browser: `lang="vi"` with vi copy, `lang="en"` after switching locales |

### 8.2 Flows re-driven in the browser

- **Templates**: search × ratio × category combinations (six probes) — every chip number equalled the grid it
  produced, including the zero-count facet, which now renders the "No templates match your criteria" state
  instead of a phantom row. Tab strip (Timeline / Studio / Factory / Marketplace) switches panels correctly
  (`v-show` panel confirmed hidden by client rects, not by computed style).
- **Factory**: dry-run pipeline re-checked after the edits — estimate → confirm switch → queue → completed →
  approve 0/2 → 1/2, then the batch removed from history. No provider was called and no money was spent.
- **Dashboard**: card menu → *Delete project* → confirm dialog (which names the project) → empty state
  "No projects". This deleted the last artifact my own QA left behind (`QA UI 2026-10-29`); no user project
  was touched.
- **Locales**: the full sweep was re-run in `vi`, and the four new keys exist in both bundles.

### 8.3 Verification actually run (this phase)

| Command | Result |
|---|---|
| `tsx tests/unit/tmcut_template_filters.spec.ts` (new) | PASS — 10/10 (5 chip-group + 2 radiogroup + 3 facet-count checks) |
| `… tests/unit/run-all.mts` | PASS — **53/53** specs |
| `… tests/unit/run-all.mts --smoke` | PASS — **55/55** specs (real FFmpeg renders included) |
| `nuxt typecheck` | PASS — exit 0, no diagnostics |
| `eslint` per touched file (`TmcutFilterChips`, `TmcutSegmentedControl`, `TmcutTemplateCard`, `TmcutVideoFactory`, `TmcutAiTemplates`, `templates.vue`, `index.vue`, `app.vue`, `useTmcutTemplates.ts`, both new specs) | PASS — 0 errors; `--fix` verified idempotent. Repo-wide `eslint .` still reports 1885 problems, all in files this phase did not touch. |
| `tmcut_component_hygiene.spec.ts` | PASS — its dashboard-bar regex was widened to tolerate one-attribute-per-line, which is the repo's lint style |
| Browser: templates, factory, dashboard × en + vi | PASS — only console line left is the `<Suspense>` experimental info |

### 8.4 Honest limits after this phase

- **No screenshots were saved.** The DevTools MCP refused writes outside its configured workspace roots, so
  every visual claim above is a DOM/AX measurement instead of an image.
- **The bars are named but not fully ARIA-conformant on keyboard**: `TmcutSegmentedControl` declares
  `role="radiogroup"`/`role="radio"` with `aria-checked` but keeps every option in the tab order and has no
  arrow-key roving focus. Correct names, non-standard keyboard model — left as is.
- **The factory live (paid) run is still unexercised**; only the dry-run path was driven, twice.
- **Dark mode** was verified by class presence and by the AX tree, not by pixel measurement.
- One artifact of this phase's verification sits outside the repo: the template-export test wrote
  `C:\Users\tuanmjnh\Downloads\QA-Chip-Template.tmcut-template.json`. Left in place — the owner can delete it
  or re-import it to exercise the importer.
- `tests/scratch-debug.mts` / `.mjs` (2026-09/10, not this work) were left untouched, as were all
  pre-existing uncommitted changes; nothing was committed or pushed.



## 9. AI provider / free-model phase (2026-10-29) — the hub knew the reason and we threw it away

Method: every claim below is a measured HTTP response from the running app
(`/api/v1/ai/relay/*` on `:4002`, cookie session, from the real browser), a curl reachability probe of the
provider host, or a spec assertion. Stored provider definitions were read through the hub's existing
`/ai/providers` endpoint, which returns `base_url_default` only — no secret was read, printed, rotated or
saved anywhere in this phase.

### 9.1 What the user actually asked, answered

Three connections are usable by `tm-tools` on the hub: `nvidia` (85 models), `freellmapi` (356 models,
default `deepseek-v4-flash`), `amd_radeon` (15 models, no default). **None of the three can complete a chat
call through the hub relay today**, and each fails for a different, now-measurable reason:

| Connection | Stored base URL | Relay result (measured) | Why |
|---|---|---|---|
| `freellmapi` | `http://127.0.0.1:31415/v1` | `ai.network — fetch failed`, 826 ms | The host answers locally (curl gets 401 in 5 ms — it wants a key), but the hub runs on `tm-hub-app.vercel.app`, where `127.0.0.1` is the hub's own loopback. Structurally desktop-only: it can never work through the relay. |
| `amd_radeon` | `https://developer.amd.com.cn/radeon/api/v1` | `ai.network — fetch failed`, 10.9 s | Reachable from this machine (401 in 1.2 s), unreachable from the hub's network position. Also has `AI_MODEL` unset, so a relay call without an explicit model picks `models[0]` = `Clef`. |
| `nvidia` | `https://integrate.api.nvidia.com/v1` | `ai.provider-unavailable — HTTP 404 — Function '<uuid>': Not found for account '<id>'` on every one of 5 models tried (default + 4 matching instruct/chat/llama/deepseek/mistral/qwen/gemma), ~0.6–0.75 s each | Both sides reach the host and `GET /models` returns 200. The listing is NVIDIA's public catalogue, not the endpoints this account has activated, so chat 404s per model. Fix is an account-side activation, not code. |

Two further stored definitions are shaped wrong for this relay and would 404 even with a live key:
`custom_electronhub` (`https://api.electronhub.ai/v1/chat/completions`) and `custom_xkiro`
(`https://api.xkiro.com/v1/chat/completions`) — `base_url_default` must be a base, because `relayChat`
appends `/chat/completions` itself. Left as data, for the owner to correct on the hub.

### 9.2 Defects found and fixed in tm-tools

| Defect | Fix | Evidence |
|---|---|---|
| The relay proxies discarded the hub's `data.detail`; the client saw only `ai.network` / `ai.provider-unavailable`. The hub had already put "HTTP 404 — Function not found for account" in the body. | `server/utils/aiRelay.ts` (`relayUpstreamError`) forwards the detail; both `relay/chat.post.ts` and `relay/catalog.get.ts` use it | Measured before/after on the same call: `detail:""` → `detail:"fetch failed"` / the full NVIDIA 404 body |
| `useTmcutAi` printed ofetch's generic text, ignored `timeoutMs` on web (the desktop honours it), and reported an empty catalogue as "connect a model on the hub" even when the read had failed | `relayFailure()` composes `code — detail`; `timeout` is passed to the chat call; `noConnectionUsable()` names the read failure | `tmcut_ai_relay_error.spec.ts` checks 5–8 |
| `getErrorMessage` maps anything matching `/fetch failed|network/` to a generic "network problem" string, which would have re-swallowed the new detail in the Test toast | the Test toast prefers the relay message and falls back to `getErrorMessage` | `app/pages/system/ai-keys.vue:1069` |
| Saving a credential marked the connection `Healthy` (`lastTestOk: true`) with **no** request to the provider | the save path no longer writes health; the badge reads `Untested` until a test runs | `ai-keys.vue:480-488` |
| "Test" meant `GET {base}/models`. A listing answers while chat 404s (that is exactly the nvidia case) — and the repo's own picker comment already says only a chat round-trip proves a model | `probeConnection(connectionId)` in `useTmcutAi` sends one real 8-token completion to *that* connection; the success toast now names the model that answered (`aiProviders.test_chat_ok`, en + vi) | spec checks 9–10 |
| `complete()` resolves a connection by provider key or saved slot, so a per-connection test could silently probe a different connection | the probe matches on `connectionId` only | spec check 9 asserts the pinned id |

### 9.3 Verification actually run (this phase)

| Command / measurement | Result |
|---|---|
| `tsx tests/unit/tmcut_ai_relay_error.spec.ts` (new) | PASS — 10/10 (4 proxy-body, 4 composable-message, 2 probe) |
| `… tests/unit/run-all.mts` | PASS — **54/54** specs |
| `… tests/unit/run-all.mts --smoke` | PASS — **56/56** specs |
| `nuxt typecheck` | PASS — exit 0, no diagnostics (this is what closed the `relayUpstreamError` build errors: Nitro auto-imports `server/utils` at runtime, `vue-tsc` does not, so both routes now import it explicitly, matching `server/middleware/auth.ts:1`) |
| `eslint` per touched file (`server/utils/aiRelay.ts`, both relay routes, `useTmcutAi.ts`, new spec) | PASS — 0 problems. `ai-keys.vue` keeps its pre-existing 638 problems; the three inside my edited ranges are the file's own `catch { }` style, present before this change |
| Live relay calls from the browser (3 connections × chat) | 502 + code + **detail** in every case; latencies in §9.1 |
| Provider host probes (curl, unauthenticated) | nvidia 200, openrouter 200, groq/cerebras/deepseek/mistral/together/amd-cn/electronhub 401–404, `models.inference.ai.azure.com` and `127.0.0.1:11434` unreachable, `127.0.0.1:31415` alive |
| Auth guard probe | `/api/v1/ai/relay/catalog` with no cookie → 401 `Missing authorization token`; with a bad token → 401 `Invalid or expired token`. The secret-backed relay is not reachable anonymously, and `tmcut:dev-bypass-auth` in `localStorage` is not referenced by `server/middleware/auth.ts` (no server-side bypass exists) |

### 9.4 Honest limits after this phase

- **The UI toast text was not re-driven in the browser.** The client session bounced `/system/ai-keys` to
  `/login` mid-phase even though the server still accepted the `accessToken` cookie (a real, separate
  client-guard/server asymmetry worth a look). I do not submit your stored credentials, so the message the
  toast prints is pinned by the spec instead of by a screenshot.
- **Nothing was changed on the hub.** `tm-hub` code and data were read only; the two malformed base URLs,
  the NVIDIA endpoint activation and the key rotations stay yours by design.
- **Desktop paths untested this phase**: the Electron `ai-gateway.cjs` and the `freellmapi`/`amd_radeon`
  providers it *can* reach are local-loopback concerns; they need `pnpm dev:electron`, not the web runtime.
- The probe is a real completion: 8 max-tokens, one message, sent only when the user presses Test. It costs
  whatever the provider charges for a trivial call; no paid provider was called without that button press,
  and the three free-tier hosts above were the only ones exercised.
- Nothing was committed or pushed; `tests/scratch-debug.*` remains untouched.

---

## 10. Console + form-labeling phase (2026-10-29) — "vẫn còn nhiều lỗi" was three lines of noise and two Chrome issue classes

The report before this one claimed the console was clean, and it was — for the pages it had opened.
Re-driving the app with panels and modals mounted showed what the earlier sweep had not reached: the same
four lines came back on every tmcut page, and every one of them was ours.

### 10.1 What was actually in the console, and what became of it

| Console line | Where it came from | Fix | Evidence |
|---|---|---|---|
| `[log] ✅ Service Worker registered with scope:` | `app/plugins/sw.client.ts` logged every successful registration, i.e. on every page load | success log removed; the `console.error` on failure stays | no `[log]` lines on any page after the change |
| `[log] [FirebasePush] Initializing Firebase Cloud Messaging...` and `[log] [WebPush] Using standard VAPID Web Push Public Key: <key>` | `app/composables/useWebPush.ts` | both deleted — the second also echoed the VAPID public key into every visitor's console; the `warn`/`error` paths in the same function were kept | page load logs nothing |
| `[warn] [MCP] electronAPI.mcp.onToolInvoke not available` | `useMcpRendererBridge.ts` ran `setup()` on the web runtime too, where there is no preload bridge at all | return early when `window.electronAPI` is absent; still warn when Electron *is* present but the MCP channel is missing (that is a broken install) | warn gone on web, semantics unchanged in desktop |
| `[issue] A form field element should have an id or name attribute` | Chrome, for tmcut + Key-Vault fields with neither | see §10.2 | issue line gone on all five surfaces |
| `[issue] No label associated with a form field` | real `<input>` / `<textarea>` fields whose caption was a bare `<label>` with no `for`, plus captions using `for` against Reka roots: `role="slider"` renders a `<span>` (never labelable, so `for` cannot bind) and `role="combobox"` / `switch` / `checkbox` render a `<button>` (labelable in HTML, but Chrome does not count it as a form field, so it still needs its own accessible name) | caption becomes a `<span>` and the control gets `:aria-label`; where the control *is* a native field, `label for` ↔ `id` were paired properly | issue line gone with the inspector, studio and autocut panels mounted (see §10.5 for the re-measured numbers) |

The 29 `CORS` / `net::ERR_FAILED` errors visible at the start of the phase were **not live**: they came from a
Vite error-overlay iframe left over from an already-resolved `postcss` "Missed semicolon". `TmcutModal.vue` has
no `<style>` block, so nothing in it could still fail to compile — confirmed by a reload with no overlay.

What is left in the console is deliberately left alone: `[info] <Suspense> is an experimental feature` (Vue emits
it, we do not), `[debug] [vite] hot updated` (dev-server only), and Chrome's `[verbose] [DOM] Password field is not
contained in a form` in the Add-credential modal — informational, and that field already carries
`autocomplete="new-password"`, so wrapping the modal body in a `<form>` would change submit semantics for nothing.

### 10.2 Wiring put in place

| Surface | Fields wired | How |
|---|---|---|
| Inspector ([TmcutInspector.vue](../../app/components/tmcut/TmcutInspector.vue)) | 25 | 20 `label for` ↔ `id` pairs (`tmcut-insp-*`, `tmcut-eq-*` for the 8 EQ/grade sliders, crop/mask/transform/offset/in-out points); 5 got `id` + `:aria-label` where the caption is a `<span>` |
| Inspector effect params | dynamic per row | `tmcut-fx-${idx}-${param.name}` label↔id only for the `number`/`color` kinds (labelable native inputs); `enum`/`bool` render Reka `USelect`/`USwitch`, so their caption is a `<span>` and the control takes `:aria-label="paramLabel(param.name)"` |
| Timeline | marker label + per-track Vol/Pan | `tmcut-timeline-marker-label` (+ `:aria-label`); Vol/Pan keep their existing **dynamic** `track-volume-${track.id}` / `track-pan-${track.id}` — a scripted pass had appended static `for`/`id` next to them, which is a duplicate attribute and a per-track id collision. Static duplicates removed, verified live: `track-volume-t-audio-1`, `track-pan-t-audio-1` |
| Editor page | media search, custom-canvas W/H, two folder-name modals | `tmcut-media-search`, `tmcut-canvas-width|height`, `tmcut-folder-create-name`, `tmcut-folder-edit-name` (distinct ids because both share the i18n key `tmcut.folders.nameLabel`) |
| Preview player | quality + volume | `tmcut-preview-quality`, `tmcut-preview-volume` each with `:aria-label` |
| AutoCut page | keyword input, AI-influence slider | `tmcut-autocut-keyword`; `USlider` caption → `<span>` + `:aria-label` ("AI influence on scoring" resolves live) |
| `TmcutAiConnect` | 10 fields / 9 labels | static ids (`tmcut-aiconnect-hub|-provider|-model|-base-url|-api-key`) plus per-surface ids inside `v-for="task in SURFACE_KEYS"`; `-model` is shared by the `v-if` select and `v-else` input, which is legal because only one renders |
| `TmcutVideoTemplateStudio` | 3 header pairs + 10 repeated rows | `for`/`id` for name/topic/description; repeated rows use `name=` + `:aria-label` (duplicate `name` values across `v-for` rows are valid HTML, duplicate `id` values are not) |
| Library/search surfaces | 6 | `tmcut-marketplace-search`, `tmcut-shortcuts-search`, `tmcut-asset-center-search`, `tmcut-fx-library-search`, `tmcut-sticker-library-search`, `tmcut-home-rename` |
| Export modal | 2 | `tmcut-export-file-name`, `tmcut-export-bitrate-custom` |
| AI Key Vault | 6 | `ai-keys-search-provider`, `-search-model`, `-search-connection-model`, `-inline-model-id`, `-inline-model-name`, `-connect-search`; each tag re-wrapped one-attribute-per-line so the ids did not add lint errors |
| i18n | 1 key | `tmcut.marker.label` added to **both** locales → parity re-measured at 3886 / 3886, no key missing on either side |

### 10.3 Verification actually run (this phase)

| Command / measurement | Result |
|---|---|
| DOM audit, `/tmcut/editor` with a text clip, an audio track and the inspector mounted | 22 fields · 0 without id/name · 0 duplicate ids · 0 orphan `label[for]` · 0 label-without-target |
| DOM audit, Template Studio edit form (`Edit` on a real template) | 42 fields · 0 missing · 0 dup · 0 orphans · 4 `role="switch"` all named |
| AutoCut driven for real: step 1 → pick `clipA.mp4` → step 2 profiles → "Analyze & Generate EDL" → step 3 Review EDL → back to step 2 | 0 missing / 0 dup / 0 orphans at every stop; analysis ran and produced the EDL panel |
| `/system/ai-keys`: Add-credential modal, Connect-provider modal, Models Catalog tab, Key Vault & Surfaces tab | 0 missing / 0 dup / 0 orphans in each; both wired search ids resolve in the open modals |
| `/tmcut`, `/tmcut/templates` (Studio + Video Factory + Asset Marketplace tabs) | 0 missing / 0 dup / 0 orphans |
| Console capture on all of the above | only `[info] <Suspense>` + dev `[debug] [vite]` lines; **zero** `[log]`, `[warn]`, `[error]`, `[issue]` |
| `nuxt typecheck` | PASS — exit 0, no diagnostics (run twice: after the id wiring and again after the last inspector + Key-Vault reformat) |
| `tsx tests/unit/run-all.mts` | PASS — **54/54** specs |
| `eslint` on every file touched this phase | PASS — 0 problems in all of them |
| `eslint app/pages/system/ai-keys.vue` | 644 → **603** problems: the six ids briefly added six `max-attributes-per-line` errors, and re-wrapping those tags also cleared 35 pre-existing ones on the same lines |
| i18n parity (`en.json` vs `vi.json`, flattened) | 3886 / 3886, nothing missing either way |

### 10.4 Honest limits after this phase

- **Two console-issue classes are fixed inside TMCut and the AI Key Vault, not repo-wide.** 153 bare fields
  elsewhere (administration, profiles, inbox, utilities, tools) still have no `id`/`name`; the user's complaint
  was about the editor, so those stayed out of scope rather than turning this into a whole-app diff.
- **Effect-param rows were not exercised live.** The open project's media library is empty and clicking an
  effect card does not attach it to a text clip, so the `enum`/`bool` branches could not be rendered in the
  browser. Their wiring is verified by reading the template (the three kinds are `v-if` / `v-else-if` branches,
  so no id can collide) plus eslint; it is not screenshot-proven.
- **`TmcutAiConnect`'s custom-provider inputs cannot appear on the web runtime at all** — the component renders
  the hub notice ("Connection setup … runs in the desktop app"). Its ten fields were therefore checked
  statically; they need `pnpm dev:electron` to be seen.
- **`/tmcut` rename modal was not opened live** (the probe could not reach a project card's menu); its input is
  wired and lint-clean.
- **Pre-existing lint debt left where it was**, unchanged in this phase: `useMcpRendererBridge.ts` 101 errors
  (identical count at `HEAD` — verified with `eslint --stdin`, so my edit added none), `useWebPush.ts` 5,
  `TmcutMarketplace.vue` 4, `ai-keys.vue` 603. No repo-wide `eslint --fix` was run; it would rewrite hundreds
  of lines of the user's own uncommitted work.
- **Two dead components flagged, not deleted**: `app/components/tmcut/AutocutStep2.vue` (no importers; carries
  its own duplicate keyword input and a stray `size="sm"` on a raw `<input>`) and
  `app/components/settings/MembersList.vue` (no importers; `onSelect` handlers are `console.log` stubs).
  Deleting them is the owner's call.
- Nothing was committed or pushed; no key, credential or hub data was read or written;
  `tests/scratch-debug.*` remains untouched.

### 10.5 Second pass on the same two issue classes (2026-10-29, written after §10.1–§10.4)

§10 stopped at "badLabels 10 → 0". Re-measuring showed the console still carried one `[issue]` line for a
nameless `role="switch"`, and a static scan of all 40 TMCut `.vue` files (components + pages) found 23 more
role-based controls with no accessible name — controls no live audit had reached because their panels were
never mounted. Every change in this pass is "give the control a name"; no layout, no copy, no behaviour.

| File | What got named |
|---|---|
| [TmcutExportModal.vue](../../app/components/tmcut/TmcutExportModal.vue) | the last one, the GPU `USwitch` (`:aria-label`); in the same modal the 9 group captions and `rangeLabel` became `<span>`s, the fps/format `USelect`s and the three wrapped checkbox rows (watch folder, auto-preview, denoise) were converted to a click-target `<div>` + `@click.stop` on the `UCheckbox` |
| [TmcutShortcutsModal.vue](../../app/components/tmcut/TmcutShortcutsModal.vue) | shortcut-hints row, same click-target pattern |
| [TmcutInspector.vue](../../app/components/tmcut/TmcutInspector.vue) | 10 controls: `animIn`, `animOut`, `speed`, `ramp`, `fit`, mask shape, mask axis, stabilize level, blend mode selects + reverse / stabilize / mask-invert switches; three captions that were `<label>` with no target became `<span>`; the mask-invert row uses the click-target pattern so its `cursor-pointer` is honest |
| [TmcutVideoTemplateStudio.vue](../../app/components/tmcut/TmcutVideoTemplateStudio.vue) | field `type` select, `required` switch, boolean record switch (`:aria-label="field.label"`), scene `role` + `shotType`, prompt-block `type` |
| [TmcutAgentPanel.vue](../../app/components/tmcut/TmcutAgentPanel.vue) | language select (its caption was a `<label>` pointing at nothing) |
| [TmcutKeyframeLane.vue](../../app/components/tmcut/TmcutKeyframeLane.vue) | property select, easing select |
| [TmcutMarketplace.vue](../../app/components/tmcut/TmcutMarketplace.vue) | category filter select |
| [autocut.vue](../../app/pages/tmcut/autocut.vue) | filler-words + AI-analysis switches, per-segment include checkbox (`Include segment {index}`) |
| [editor.vue](../../app/pages/tmcut/editor.vue) | custom-canvas FPS select |
| i18n | 9 keys added to **both** locales — `videoTemplates.inputType`, `.inputRequired`, `.sceneRole`, `.sceneShot`, `.blockTypeLabel`, `keyframeLane.propertyLabel`, `.easingLabel`, `assetCenter.filterCategory`, `autocutV2.includeSegmentAria` → parity re-measured **3895 / 3895** |

| Verification actually run in this pass | Result |
|---|---|
| Live DOM audit, Export **and** Shortcuts modals open on `/tmcut/editor` | 15 visible fields · 0 without an accessible name · 0 orphan `label[for]` · 0 duplicate ids |
| Same audit with a text clip selected, cycling the Audio / Text / Visual / Animation inspector tabs | 25 controls on the visual tab, 9 on animation, 0 unnamed; `Intro Animation (In)`, `Outro Animation (Out)`, `Property`, `Mask` read their names back from the DOM |
| Native fields on `/tmcut/editor` | 6 visible `<input>`, 0 without `id`/`name` |
| Toggle behaviour of every converted row | caption click flips exactly once, control click flips exactly once (shortcut hints, auto-preview, denoise, GPU switch, mask invert); all states restored afterwards |
| Console capture after all of the above | only `[info] <Suspense> is an experimental feature` — **no** `[issue]`, `[error]`, `[warn]`, `[log]` |
| Asset Marketplace tab | 2 controls, both named |
| `nuxt typecheck` | PASS — exit 0 |
| `tsx tests/unit/run-all.mts` | PASS — **54/54** specs |
| `eslint` on the 8 files touched in this pass | clean, except `TmcutMarketplace.vue`, which still shows exactly its 4 pre-existing problems (self-closing `<input>`, two `singleline-html-element-content-newline`, missing EOF newline) — none added, none of its lines touched |
| static re-scan of the 40 TMCut `.vue` files | 4 leftovers, all explained below |

What this pass did **not** prove:

- **AutoCut's two switches and the include checkbox were not re-rendered live.** Step 2 only mounts after a
  source is picked, and re-running an analysis to verify an `aria-label` is not worth the side effects. The
  keys resolve in both locale files and the page loads with zero console issues.
- **The keyframe easing select** renders only when a keyframe exists; **`AutocutStep2.vue`** (the dead
  component from §10.4) was left unnamed on purpose — fixing code nothing imports would hide the fact that it
  is dead. Those are 3 of the 4 scan leftovers; the 4th is the auto-captions `UCheckbox`, which is already
  named through Nuxt UI's `#label` slot (it renders a real `<label for>`), and the scanner does not look inside
  slots.
- **Fact to keep** for the next edit: Reka's `role="slider"` root is a `<span>` — never labelable — while
  `role="combobox"` / `switch` / `checkbox` roots are `<button>`s. `<label for>` therefore only works for the
  last three, and `aria-label` is the single wiring that covers both.

### 10.6 Self-review sweep — defects, storage hardening, per-frame cost, chunk policy (2026-10-29)

Prompt: *"còn phần nào lỗi hoặc nâng cấp tối ưu không, hãy tự rà soát toàn bộ và fix giúp mình"*. Method: read
the code, and only change what a read proves is wrong. Two claims from the exploration pass were **refuted by
reading** and are therefore not in the fix list — the IPC task listeners in `useToolTaskManager.ts` (the state
object is a module-level singleton guarded by `state.listenersSetup`, so they register once per kind and the
empty teardown at :238 is deliberate) and one "unnamed control" hit that turned out to be Nuxt UI's `#label`
slot. Every fix below was confirmed in the source before editing.

**A. Defects fixed**

| # | Site | Defect | Fix |
|---|---|---|---|
| 1 | [ffmpegHelper.ts:81](../../app/utils/ffmpegHelper.ts#L81) `getOutFile` | the fallback after `\|\|` could never fire, because a template literal is always truthy — an unparseable input path produced `undefined.1.undefined` as the ffmpeg **output filename**. ~10 call sites (579/624/644/708/728/825/854/903) | explicit `parseFile?.fileNameNoExt \|\| generateId()`, extension appended only when known |
| 2 | [videoFactoryRunner.ts:355](../../app/utils/tmcut/videoFactoryRunner.ts#L355) and [:471](../../app/utils/tmcut/videoFactoryRunner.ts#L471) | each poll tick added a fresh `abort` listener and detached none on the timeout path — a 30-minute job at the 2 s default leaves ~900 closures on one signal, twice over (provider runner + auto runner) | the timer now calls `removeEventListener` for its own handler before resolving |
| 3 | [TmcutFxThumb.vue:155](../../app/components/tmcut/TmcutFxThumb.vue#L155) | `matchMedia('(prefers-reduced-motion: reduce)')` listener added in `onMounted`, never removed; the FX grid mounts ~27 tiles per tab visit and unmounts on every tab switch | the `MediaQueryList` and its handler are kept per instance and detached in `onBeforeUnmount` |
| 4 | [autocut.vue:375](../../app/pages/tmcut/autocut.vue#L375) `startAnalysis` | no re-entrancy guard (its own caller `rescoreWith` had one) and the button only tested `!sourceAsset` → a double click started **two** ffmpeg + AI pipelines on the same source | `analyzing` guard, `try/finally` that holds the flag until the EDL is stored, `:disabled="!sourceAsset \|\| analyzing"`. This also retires the microtask hazard the step-3 comment had to work around |
| 5 | [useTmcutVoiceCommands.ts:343](../../app/composables/useTmcutVoiceCommands.ts#L343) | `\"` inside a template literal: renders the right text but is a `no-useless-escape` error | plain quotes |
| 6 | [TmcutAudioOrchestrationModal.vue:104](../../app/components/tmcut/TmcutAudioOrchestrationModal.vue#L104) | the last `[issue]` in TMCut: `UInputNumber`'s inner `<input>` had neither `id` nor `name`, and its caption `<label>` had no target — Chrome logged "no label associated with a form field" once per open | `id="tmcut-audio-bed-volume"` (InputNumber forwards it to the input) + `label for` — a real association, no `aria-label` needed because this control *is* labelable |
| 7 | [useTmcutProject.ts:464](../../app/composables/useTmcutProject.ts#L464) and [:779](../../app/composables/useTmcutProject.ts#L779) | raw `localStorage.getItem` / `.removeItem` outside any `try`: with storage blocked, opening a project threw **before** the disk read and `deleteProject` failed outright | routed through the new shim |

**B. Hardening and cost**

- New [app/utils/tmcut/localStore.ts](../../app/utils/tmcut/localStore.ts) — `readStored` / `writeStored` /
  `removeStored` / `readStoredFlag`, all never-throw. Migrated: [useTmcutUiPrefs.ts](../../app/composables/useTmcutUiPrefs.ts)
  (module-scope reads + both persistence watchers), `proxyPreview` in
  [useTmcutMedia.ts:46](../../app/composables/useTmcutMedia.ts#L46), the AutoCut prefs hydrate at
  [autocut.vue:26](../../app/pages/tmcut/autocut.vue#L26), and the two project sites in row 7 above. The other
  ~25 TMCut storage calls were already inside `try`, and were left alone.
  **Constraint found the hard way:** the helper reads `globalThis`, not `window`, because
  [tests/unit/helpers/tmcut_store_env.ts:30](../../tests/unit/helpers/tmcut_store_env.ts#L30) installs its shim
  on `globalThis`. A `window`-only guard silently turned persistence off and made **7 specs red** before this
  was caught and corrected.
- [useTmcutMedia.ts:58](../../app/composables/useTmcutMedia.ts#L58) — `findAssetBySrc` scanned every asset and
  re-normalised every path per call, and its callers are per-frame (preview player ×3, timeline clips ×2, export
  modal, factory). Now a module-level `computed` `Map` keyed by `mediaFileKey`, first-match-wins preserved.
  Behaviour is identical because `mediaFileKey(undefined)` is `''`, not a throw.
- Chunk policy (AGENTS.md:89-90 — on-demand components MUST use the `Lazy` prefix): 9 tags in
  [editor.vue](../../app/pages/tmcut/editor.vue) (Export, Export Queue, AI Script, AI Edit, Agent Panel, Audio
  Orchestration modals + the Sticker / FX / Asset-Center tab content) and 2 in
  [index.vue](../../app/pages/tmcut/index.vue) (rename, delete) now do. Kept eager: PreviewPlayer, Inspector,
  Timeline, Waveform (above-the-fold chrome) and `TmcutVideoFactory` in factory.vue, where it *is* the page.
  `templates.vue` already followed the rule and is the precedent. No regression: every converted component was
  opened live (§C).

**C. Verification actually run**

| Gate | Result |
|---|---|
| `nuxt typecheck` | PASS — exit 0, 0 × `error TS` (re-run after the last template edit) |
| `tsx tests/unit/run-all.mts` | PASS — **55/55** (54 shipped + the new spec) |
| new [tests/unit/tmcut_local_store.spec.ts](../../tests/unit/tmcut_local_store.spec.ts) | 5 checks — round-trip, absent store, throwing getter (blocked storage), `setItem`/`removeItem` throwing (quota), `'1'`-only truthiness |
| `eslint` on the 12 files touched | 0 new problems. One self-inflicted error was caught and fixed (a `</TmcutModal>` left mismatched against `<LazyTmcutModal>`); pre-existing problems in `videoFactoryRunner.ts` / `ffmpegHelper.ts` (`member-delimiter-style`, `no-explicit-any`, `no-unused-vars`, 2 × `no-useless-assignment`) were deliberately not touched |
| live `/tmcut/editor` | page mounts; **all 6** lazy modals open with their own content (Export · Queue · AI Script · AI Edit · Agent · Audio Orchestration); Effects tab renders **27** FX thumbnails; Asset Center mounts its desktop-only notice; 0 dialogs left after each close |
| live `/tmcut` | project ⋯ menu → Rename opens (`input#tmcut-home-rename`, named), real `Escape` closes it; Delete opens, Cancel leaves the project listed |
| live `/tmcut/autocut` | full walk: Choose from Media → `clipA.mp4` → step 2 → Analyze → step 3 EDL with 1 detected segment → Re-run analysis works → Back to step 2 |
| console `[error]`/`[warn]`/`[issue]`/`[log]` | **zero** on `/tmcut`, `/tmcut/editor`, `/tmcut/templates`, `/tmcut/factory`, `/tmcut/autocut` |

**§10.5 follow-up — the gap it declared is now closed.** AutoCut step 2 and step 3 were reached live this time
and their controls read back their names from the DOM: `Filter filler words & hesitations`, `AI content
analysis (beta)`, `Include segment 1`. Nothing in §10.5 row "autocut.vue" is unverified any more.

What this pass still did **not** prove:

- **The two poll fixes never ran against a real provider job** (that needs a live submit and minutes of 2 s
  polling); verified by reading, and by `/tmcut/factory` mounting clean.
- **`getOutFile`'s failure branch has no test.** The happy path is byte-identical to before; only the
  unparseable-path case changed, and nothing in the app currently produces one on the web runtime.
- **No listener-count measurement** for the `TmcutFxThumb` detach (`getEventListeners` is DevTools-console-only)
  — the grid mounts and unmounts clean, which is the necessary but not the sufficient evidence.
- **The double-click guard was not proven by timing two concurrent pipelines**; it is a code-level invariant,
  and the single live run completed normally.
- **No production build**, so the `Lazy` conversion is verified for correctness, not measured for bundle size.

**Backlog found and deliberately not fixed** (owner's call, in rough priority order):

1. `TmcutPreviewPlayer.vue:452` and `:566` — two `deep: true` watchers on project state: the largest identified
   per-frame cost left in the editor.
2. Inspector property getters called during render (not memoised) — same class of cost, smaller.
3. `useTmcutProject.ts:608` save path — autosave amplification on drag.
4. 700 ms export-queue polling in the modal while a job runs.
5. No virtualisation in the FX / sticker / timeline lists (27 tiles is fine; a full catalog is not).
6. `tmcut-core/src/autocutPlan.mjs:84` — `Math.max(MIN_CAPTION_TICKS, …)` can let the last caption overhang the
   final cut.
7. Repo lint debt: `eslint .` still reports ~1.8k problems across ~100 files, almost all formatting in the
   user's own uncommitted work. Not auto-fixed on purpose — a repo-wide `--fix` would rewrite hundreds of lines
   that this audit never touched.
8. `AutocutStep2.vue` (dead, §10.4) — deletion is the owner's call.

Nothing was committed or pushed; no key or credential was read or rotated; `tests/scratch-debug.*` untouched.

### 10.7 The "Missed semicolon" that no CSS could explain (2026-10-29)

Reported as a hard dev-server error:

```
[postcss] app/components/tmcut/TmcutModal.vue?vue&type=style&index=0&lang.css:3:16: Missed semicolon
  › 3 │   open: boolean
```

A CSS parser complaining at `open: boolean` means it was fed **TypeScript**, not a stylesheet. That was the
first clue, and it is the whole story: [TmcutModal.vue](../../app/components/tmcut/TmcutModal.vue) has **no
`<style>` block at all** and has not had one — 47 lines, `<script setup>` + `<template>`, nothing else.

**What the disk actually contains.** A PostCSS parse of every `<style>` block in `app/` — 196 SFCs, 13 blocks —
returns 0 failures. The real style URLs (`TmcutFxThumb`, `TmcutPreviewPlayer`, `PasswordInput`) all answer
`200`. Only the phantom URL 404s.

**What the running server believed.** The SPA shell (served for every route, identical on `/chat`,
`/tmcut`, `/tmcut/factory`) carried `<link rel="stylesheet">` for that non-existent style module — plus a
`?direct` twin — so the browser fetched it on every load and Vite choked. The server's own module for
`TmcutModal.vue` contained no style import, also when requested with the shell's own `?t=` stamp; the two
caches disagreed, and only the shell's list was stale.

**Why it stayed stale.** That dev server had been up since 08:23 and its **file watchers were dead**. Three
independent proofs, none of which produced an invalidation or a restart:

| Change made | Expected | Observed |
|---|---|---|
| `touch TmcutModal.vue` | module invalidated | shell list unchanged |
| real content edit of `TmcutModal.vue` | HMR update | shell list unchanged |
| deleting `TmcutFxThumb.vue`'s `<style>` block | its link disappears | its link **stayed** |
| appending a line to `nuxt.config.ts` | "Restarting Nuxt due to config change" | same PIDs for 36 s |

**Fix.** Restarted the orphaned `sh.exe → nuxt dev --port 4002` tree (its parent shell no longer exists) and
reconnected a fresh browser client. Verified afterwards: all five TMCut routes serve **0** style links; the
three real style modules still `200`; the phantom URL `404`s without touching PostCSS (server log stayed at
the single pre-restart entry, produced by the old client reconnecting mid-restart); console is clean on
`/tmcut`, `/tmcut/autocut`, `/tmcut/editor`; and the Rename dialog still opens through `TmcutModal`, so the
component itself was never the problem.

**Rule for next time.** A `?vue&type=style` error naming an SFC that has no `<style>` block is dev-server
state, not code. Check the watchers first — one cheap probe is "edit `nuxt.config.ts`, does the process
restart?" — and restart before touching CSS. Note also that the shell's stylesheet list is per-process memory:
grepping `.nuxt`, `node_modules/.cache` and `node_modules/.vite` for the stale id returns nothing, so a cache
clear would have been wasted effort.

### 10.8 Industry template pack — 24 new cards across 16 industries (2026-10-29)

Ask: a template library that matches today's short-form formats **by industry**, not six generic demo cards.

**Built as data, not 24 hand-written coordinate sets.** One builder
([tmcut-core/src/templates.mjs:439](file:///D:/Applications/tmcut-core/src/templates.mjs#L439)) turns a spec into a
full template; 24 specs
([templates.mjs:526](file:///D:/Applications/tmcut-core/src/templates.mjs#L526)) pick one of 7 layout archetypes
([templates.mjs:169](file:///D:/Applications/tmcut-core/src/templates.mjs#L169)) — `hook`, `listicle`, `banner`,
`price`, `lower-third`, `before-after`, `stack`. Shared rules (accent colour, font ramp per orientation, staggered
in-points, CTA pinned near the tail) therefore hold for every card and are machine-checkable. Appended to
`BUILTIN_TEMPLATES` ([templates.mjs:1010](file:///D:/Applications/tmcut-core/src/templates.mjs#L1010)) → **30
builtin cards**, 6 legacy + 24 new.

Two shape decisions worth recording:

- **One text track per beat.** The first build put all beats of a card on a single `text` track, which the timeline
  drew as overlapping blocks at the same lane. Each beat now owns `tr-<key>-text-<beat>`; placeholders point at that
  track, so `placeholder.trackId → track → clip` resolves exactly once per slot.
- **No `schemaVersion` on shipped builtins.** The builder originally stamped it and turned
  `template-studio.test.mjs:34` red (`1 !== undefined`). Absence is the v1 signal here; `migrateTemplate()` stamps it
  on import. The test encodes the contract — the builder was corrected, not the test.

`INDUSTRY_CATALOG` ([templates.mjs:59](file:///D:/Applications/tmcut-core/src/templates.mjs#L59)) is 17 ids
(16 industries + `general`), each with a label and a Lucide icon. `filterTemplates` gained an `industry` facet and
now searches name, description, industry id **and label**, plus bilingual tags — so `"quán ăn"` finds the F&B cards
and `"real estate"` returns only that industry
([templates.mjs:1850](file:///D:/Applications/tmcut-core/src/templates.mjs#L1850)).

**Honest chip counts.** The library previously counted every chip against one facet set, so a ratio filter could
advertise "Product & Promo 13" for a combination that renders an empty grid. The composable now scopes three ways —
`baseScope` (ratio + search), `facetScope` (+ industry) feeding the category chips, `industryScope` (+ category)
feeding the industry chips
([useTmcutTemplates.ts:139](file:///D:/Applications/tm-tools/app/composables/useTmcutTemplates.ts#L139),
[:154](file:///D:/Applications/tm-tools/app/composables/useTmcutTemplates.ts#L154),
[:162](file:///D:/Applications/tm-tools/app/composables/useTmcutTemplates.ts#L162)). Live check: with Food &
Beverage selected the category row read **All 2 / Promo 1 / Minimal 1** — the numbers a click would produce.
Industry chips ([templates.vue:97](file:///D:/Applications/tm-tools/app/pages/tmcut/templates.vue#L97)) hide
zero-count industries; each card carries an industry badge
([TmcutTemplateCard.vue:113](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutTemplateCard.vue#L113)).

**Verification**

| Gate | Result |
|---|---|
| `node --test "test/*.test.mjs"` (tmcut-core) | PASS — **380/380**, 49 suites (6 new industry invariants) |
| new invariants ([templates.test.mjs:208](file:///D:/Applications/tmcut-core/test/templates.test.mjs#L208)) | catalog coverage + unique ids; every industry except `general` ships ≥1 card; placeholder→track→clip resolves and `clip.text === defaultContent`; geometry (`in ≥ 0`, `out > in`, `out ≤ durationTicks`, `offset + (out−in) ≤ durationTicks`, \|x\| ≤ W/2, \|y\| ≤ H/2); canvas matches `aspectRatio`; every builtin instantiates and round-trips `durationMs`; search/industry filters |
| `npm run test:templates` (app) | PASS — 4/4 |
| `tsx tests/unit/run-all.mts` | PASS — **54/55** (render smoke still opt-in) |
| `npx eslint` on the 5 touched files | 0 problems |
| `npx nuxt typecheck` | exit 0, **0 × `error TS`** |
| live `/tmcut/templates` | 30 cards, 17 industry chips; F&B click → 2 cards, counts re-scoped |
| live instantiate ×3 | `price` (9:16, 5 tracks, 1080×1920, 6 s) · `banner` (16:9, 5 tracks, 1920×1080, 8 s) · `listicle` (9:16, 7 tracks, 1080×1920, 9 s) — correct staggered `in` points, separate lanes, `durationMs` matches |
| console `[error]`/`[warn]` | **zero** on the library and all three editor sessions |

**Finding: only the top video track renders.** `activeVideoClip` takes the first non-hidden video track and stops
([useTmcutPlayback.ts:96](file:///D:/Applications/tm-tools/app/composables/useTmcutPlayback.ts#L96)) — intentional
CapCut-style layering, documented there. Consequence: the legacy `tpl-split-screen-duo` card cannot show two videos
side by side *in preview*, whatever its timeline geometry says. The new "before/after" cards therefore use **one
media bed plus timed labels**, not two video layers. Text has no such limit — `activeTextClips` renders every text
track (R122), which is why multi-beat cards are text-driven.

Known limits of the pack: copy is Vietnamese-first (bilingual tags aid search only); thumbnails are icon placeholders,
not rendered stills; the 24 cards reuse the six existing categories rather than adding new ones. Nothing committed;
the four scratch projects created while verifying were removed from `localStorage` and the project list re-checked
clean.

## 11. HTML/CSS video + Voice as first-class pages, and the controller syntax break (2026-10-30)

Three asks in one message: repair a hard parse error in the Electron controller, promote the two studios from
"buried inside the editor" to routes of their own, and teach tm-hub's RBAC seed about those routes.

### 11.1 The syntax error was one missing brace

`electron/tools/tmcut.controller.cjs:1276` — inside `ipcMain.handle('${moduleName}:synthesizeGeminiVoice')`, the
request body for the Gemini TTS interaction was written as

```js
input: [{ type: 'user_input', content: [{ type: 'text', text, ...(style ? { annotations: [{ type: 'speech_metadata', style }] : {}) }] }],
```

The spread object was never closed: `...(style ? { annotations: [...] : {})` opened `annotations: [` and closed it
with `})` instead of `}] }`. Node reports it as `SyntaxError: Unexpected token ':'` at the next property, which is
why the arrow in the bug report landed one line late. Corrected line:

```js
input: [{ type: 'user_input', content: [{ type: 'text', text, ...(style ? { annotations: [{ type: 'speech_metadata', style }] } : {}) }] }],
```

`node --check electron/tools/tmcut.controller.cjs` → **CHECK_OK**. This is a whole-file parse, so the fix also proves
the handler below it was intact. Four lint findings remain in the file (indentation at 969–971, `max-statements-per-line`
at 1138/1206/1225/1458); all four predate this phase and were left alone — they are style, not correctness.

### 11.2 Two studios, one component each, two routes

Both studios previously existed only as editor overlays, which meant their i18n strings were reachable only by
opening the right panel and neither could be linked to, bookmarked, or granted through RBAC.

| File | Role |
|---|---|
| [app/pages/tmcut/html-video.vue](file:///D:/Applications/tm-tools/app/pages/tmcut/html-video.vue) | new route `/tmcut/html-video`; `BasePage` + `<TmcutHtmlVideoStudio embedded />` |
| [app/pages/tmcut/voice.vue](file:///D:/Applications/tm-tools/app/pages/tmcut/voice.vue) | new route `/tmcut/voice`; `BasePage` + `<TmcutVoiceStudioBody embedded />` |
| [TmcutHtmlVideoStudio.vue:20](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutHtmlVideoStudio.vue#L20) | gained `defineProps<{ embedded?: boolean }>()`; header hides at [:291](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutHtmlVideoStudio.vue#L291), action row right-aligns at [:299](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutHtmlVideoStudio.vue#L299) |
| [TmcutVoiceStudioBody.vue](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutVoiceStudioBody.vue) | new 465-line body: every voice ref and handler moved out of the modal verbatim; `embedded` hides the header at [:272](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutVoiceStudioBody.vue#L272) |
| [TmcutVoiceStudio.vue](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutVoiceStudio.vue) | now 16 lines: the `UModal` wrapper, nothing else — the editor's `<LazyTmcutVoiceStudio v-model:open>` keeps working untouched |

Splitting body from wrapper rather than adding a second copy is what keeps one implementation: the editor modal and
the page mount the same `TmcutVoiceStudioBody`. `TmcutHtmlVideoStudio` did not need a split — it has no shell, only
a header that can be suppressed.

Navigation follows the existing shell, not a new one:
[TmcutEditorShell.vue:12-13](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutEditorShell.vue#L12) inserts
`HTML/CSS Studio` (`i-lucide-code-2`) and `Voice Studio` (`i-lucide-audio-lines`) between Video Factory and AutoCut.
Each new page also cross-links the other plus a Back to `/tmcut` link, so the pair is reachable without the sidebar.

**The `tmcut.voice` namespace did not exist.** The page header first rendered the raw key `tmcut.voice.title` — not
because of the refactor, but because the entire namespace had never been added, so the modal had been showing raw
keys too. 55 keys were written into both locales (`en.json`, `vi.json`, block starting
[en.json:1888](file:///D:/Applications/tm-tools/i18n/locales/en.json#L1888)) and `openStudio` — needed by
`TmcutTimeline.vue` — brought the count to 56. `nav.tmcut_html_video` / `nav.tmcut_voice` were added at
[en.json:199](file:///D:/Applications/tm-tools/i18n/locales/en.json#L199) with Vietnamese counterparts.

Two Nuxt UI v4 behaviours re-confirmed while touching this markup: `UCheckbox` ignores slot content for its label
(it must be the `label` prop), and `UButton :to` routes through Vue Router, which logs `R0004` for `/uploads/*`
URLs — the render result's "Open" button now uses `:href` + `target="_blank" rel="noopener"`. Three form controls
(the scrub range, JPEG quality, allow-remote checkbox) also had no `id`/`name`, which Chrome reports as
`[issue] A form field element should have an id or name attribute`; they are labelled now.

### 11.3 tm-hub seed, kept to routes and labels

Authorised as a narrow edit, and kept narrow:

- [scripts/seed/data.ts:361-362](file:///D:/Applications/tm-hub/scripts/seed/data.ts#L361) — two `route` rows after
  `tmcut_autocut`, `sort` 33/34, both parented to `group_tmcut` with `required_permission: null`.
- [data.ts:332](file:///D:/Applications/tm-hub/scripts/seed/data.ts#L332) — `tmcut_html_video` and `tmcut_voice`
  appended to the admin role's `allowed_routes`; the root role already carries `'*'`.
- `tm-hub` `i18n/locales/{en,vi}.json` — `nav.tmcut_html_video` / `nav.tmcut_voice` labels, because tm-hub resolves
  nav labels as `nav.<name>` from its own catalog.

No credential, key or environment file was read or changed.

### 11.4 Verification actually run (this phase)

| Gate | Result |
|---|---|
| `node --check electron/tools/tmcut.controller.cjs` | PASS — `CHECK_OK` |
| `npx eslint` on all five touched Vue files | PASS — 0 problems (`--fix` applied once for the inherited dense markup) |
| `npx nuxt typecheck` | PASS — 0 × `error TS` (run twice) |
| `npx tsx tests/unit/run-all.mts` | PASS — **56/56** (render smoke still opt-in); `tmcut_i18n_keys.spec.ts` 4/4 |
| `npm run typecheck:seed` (tm-hub) | edits add **no** new errors; one pre-existing `shared/utils/routeTree.ts(1,34) TS2307: Cannot find module '#shared/types/rbac'` needs `nuxt prepare` |
| live render on `/tmcut/html-video` | `4.00s · 120 frames · 588.1 KB` → `.data/uploads/html-mvuaqxu8-873439-kinetic-title.mp4` |
| `ffprobe` on that file | `h264, 1080×1920, r_frame_rate 30/1, duration 4.000000, size 602260` (`pix_fmt yuvj420p`) |
| preview seek/playback | Play → slider and clock read `1.71 / 4.00s`; frame shows the mid-animation blurred title — frame-first seeking works, not CSS playback |
| console on `/tmcut/html-video` and `/tmcut/voice` | one `[info] <Suspense> is an experimental feature` each; **zero** `[error]`/`[warn]`/`[issue]` |

### 11.5 What this phase does not fix

The Electron controller is now parseable, but nothing here exercised the Gemini TTS path end-to-end — that needs a
key, and rotating or spending on keys is the owner's call. `TmcutVoiceStudioBody` still depends on a local voice
service probe and on `window.tmcut` IPC calls that only exist inside Electron, so on the web page the local engine
reports offline by design; the Gemini branch is the one that works in-browser. And the two new routes exist in the
seed as *data*: a database that was already seeded needs a re-seed or a migration to pick them up, which was not run.

Nothing was committed or pushed; no key or credential was read or rotated; `tests/scratch-debug.*` untouched.

## 12. Web voice + composition-as-clip (2026-10-30)

Section 11 left two holes: the Voice Studio worked only where Electron IPC existed, and a finished HTML render was a
file you could download but not edit with. Both are closed here.

### 12.1 The browser could not reach VieNeu-TTS, so Nitro answers for it

VieNeu-TTS listens on `127.0.0.1:8000` with no CORS headers and no browser-safe contract, and the page has no IPC.
Proxying through the Nuxt server is the only path that works in both runtimes, and it is the path that can be made
safe:

| File | Role |
|---|---|
| [server/utils/tts.ts:22](file:///D:/Applications/tm-tools/server/utils/tts.ts#L22) | `normalizeTtsBaseUrl` — **loopback-only, origin-only** SSRF guard |
| [server/utils/tts.ts:88](file:///D:/Applications/tm-tools/server/utils/tts.ts#L88) | `readBounded` — streams with a hard byte ceiling, aborts mid-stream |
| [server/utils/tts.ts:108](file:///D:/Applications/tm-tools/server/utils/tts.ts#L108) | `isWav` — RIFF/WAVE magic **and** declared length ≤ actual bytes |
| [server/utils/tts.ts:117](file:///D:/Applications/tm-tools/server/utils/tts.ts#L117) | `saveGeneratedWav` — writes `tts-<stamp>-<rand>.wav` with flag `wx`, returns `/uploads/…` |
| [server/api/v1/media/tts.post.ts:24](file:///D:/Applications/tm-tools/server/api/v1/media/tts.post.ts#L24) | `POST /api/v1/media/tts` → `{ ok, url, size }` |
| [server/api/v1/media/tts/status.get.ts:15](file:///D:/Applications/tm-tools/server/api/v1/media/tts/status.get.ts#L15) | `GET /api/v1/media/tts/status` → health + voice list |

The guard mirrors the Electron module (`electron/tools/tmcut-voice.cjs`) instead of trusting the client:

- protocol must be `http:` (not `https:`) and the hostname must be `127.0.0.1`, `localhost` or `[::1]`; LAN, private
  ranges, `169.254.169.254` and look-alike hosts (`127.0.0.1.evil.tld`) all fail;
- credentials, path, query and fragment are rejected, so the caller cannot append `/v1/...` or smuggle a proxy target;
- limits match the Electron module: text ≤ 20 000 chars, audio ≤ 64 MiB, 120 s `AbortSignal.timeout`;
- a non-RIFF body is a `502`, not a saved file — a misconfigured service cannot poison `.data/uploads`.

Both handlers still sit behind `server/middleware/auth.ts` (401 without a JWT). Upstream failures surface as `502`
with the service's own message, so "the TTS app is not running" and "the TTS app rejected this voice" read differently.

**19 checks** in [tests/unit/tmcut_tts_endpoint.spec.ts](file:///D:/Applications/tm-tools/tests/unit/tmcut_tts_endpoint.spec.ts)
cover the URL matrix (accept, and 9 rejection shapes), trimming and length limits, the three voice-payload shapes,
and WAV validation (accept / truncated / over-declared / non-RIFF). No network is touched by the spec.

Client side, [TmcutVoiceStudioBody.vue:54](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutVoiceStudioBody.vue#L54)
now branches on `isDesktop` instead of assuming IPC:

- service check → `$fetch('/api/v1/media/tts/status')` on web, IPC in Electron;
- local synthesis → `$fetch('/api/v1/media/tts', { method: 'POST' })`, then the returned `/uploads/…` URL goes through
  the same import path as an uploaded file;
- reference cloning and the persistence note render only on desktop, with
  `tmcut.voice.referenceDesktopOnly` shown in their place;
- Gemini stays desktop-only (button disabled, `tmcut.voice.geminiDesktopOnly` on click) because no proxy was built
  for it — **this corrects §11.5**, which claimed the Gemini branch was the one that worked in-browser.

### 12.2 Imported web audio had duration 0

`analyzeAsset` returned early on web (no ffprobe), so a freshly imported voiceover landed in the library with
`durationSec: 0` and produced a zero-length clip. The early-return now probes through a media element
([useTmcutMedia.ts:337](file:///D:/Applications/tm-tools/app/composables/useTmcutMedia.ts#L337)), reusing the
`probeWebMedia` helper that previously only ran on the File-picker path. Images still skip the probe.

### 12.3 A render result is now a clip, not just a download

[useTmcutInsertAsset.ts](file:///D:/Applications/tm-tools/app/composables/useTmcutInsertAsset.ts) is the shared
"import → locate → place" step: it loads the library, imports the path, finds the asset by `mediaFileKey`, and appends
it at the end of the matching track (`audio` for audio, `video` otherwise; offset = max end of that track's clips).
It deliberately **does not fail when no project is open** — it returns `placed: false` and the caller reports
"saved to the media library", because a generation flow that discards its output when no editor is open is a data-loss
bug, not a validation.

`TmcutHtmlVideoStudio` uses it for the new **Add to timeline** action
([TmcutHtmlVideoStudio.vue:270](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutHtmlVideoStudio.vue#L270)).
`TmcutVoiceStudioBody` uses the same helper for every generated voiceover, and the standalone `/tmcut/voice` page now
degrades to library-only instead of toasting for clips that never appear.

### 12.4 `R0004` on `/uploads/*` was the `Open` button, not the render

After a render the console logged, twice:

```
[VUE_ROUTER_R0004] No match found for location with path "/uploads/html-…-kinetic-title.mp4"
```

with the stack pointing at `renderVideo`. The renderer was innocent. Nuxt UI's `UButton` always renders
`ULink` → `NuxtLink`; `ULink` computes `to = props.to ?? props.href` and only returns the raw string when `external`
is set. A relative `/uploads/…` href therefore went to Vue Router as a route. `target="_blank" rel="noopener"` does
not change that path. The fix is the `external` prop
([TmcutHtmlVideoStudio.vue:618](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutHtmlVideoStudio.vue#L618));
the anchor now keeps `href="/uploads/…"` verbatim, and the warning is gone.

### 12.5 Verification actually run (this phase)

| Gate | Result |
|---|---|
| `npx eslint` on the 8 changed/added files | PASS — exit 0 |
| `npx nuxt typecheck` | PASS — 0 × `error TS` |
| `npx tsx tests/unit/run-all.mts` | PASS — **57/57** (new TTS spec included; render smoke still opt-in) |
| live TTS status on `/tmcut/voice` (stub service on `127.0.0.1:8000`) | voices listed, `localOnline` true |
| live synthesis | `.data/uploads/tts-mvuef2jq-7491f8f4.wav`, 32 044 B, probed duration **1.00 s** |
| clip placed by Voice Studio | audio track, `out: 120000` ticks (= 1 s) |
| live render on `/tmcut/html-video` | 602 260 B, `h264 1080×1920 30/1 4.000000 s` |
| clip added via **Add to timeline** | video track, `out: 480000` ticks (= 4 s) |
| determinism, incidentally observed | three renders of the same config → identical **md5** `fa13800e…882da` |
| console on `/tmcut/html-video` after render + add | 1 × `[info] <Suspense>` — **zero** `R0004`, zero errors |

The stub service used to stand in for VieNeu-TTS lives outside the repo (`%TEMP%\tm-tts-stub.cjs`) and is not part of
the test suite; the checks in the spec exercise the guard and limits, not a live model.

### 12.6 What this phase does not fix

- Gemini TTS is still desktop-only on web; no proxy exists for it, so a browser session cannot spend a key.
- The TTS proxy trusts whatever `/v1/voices` returns for *names* — a malicious local service could return 5 000
  voices or names full of markup. Values are length-capped by the UI but not by the server.
- The **Add to timeline** offset strategy appends to the end of the track. It is predictable, not smart: it will not
  find a gap or align to a marker.
- Browser-side duration probing decodes the whole file to learn its length; for a 64 MiB WAV that is real work on
  the media pipeline (it is async, but not free).
- Rendering three identical files wastes 1.8 MB of `.data/uploads`; deduplication is a storage-policy decision, not
  something this phase should silently do.

Nothing was committed or pushed; no key, credential or service configuration was read or changed;
`tests/scratch-debug.*` untouched.

## 13. Captions reach the composition (2026-10-30)

AutoCaptions already writes one text clip per recognised segment, and the HTML studio already had a token system.
Nothing connected them, so a narrated short needed its captions typed twice — or, on web, could not get ANY captions,
because transcription lives behind Electron IPC (`extractAudio` + the AI gateway's `transcribe`).

### 13.1 The bridge is the text track, not a second transcription

`{{token}}` values are HTML-escaped by `replaceHtmlTokens` (`&quot;` for every quote), so JSON cannot live inside a
`<script>` block — script content is raw text and entities are never decoded there. It can live in an attribute:
attribute values go through the same escaping and the parser decodes them, so `root.getAttribute('data-cues')`
returns the original JSON. That is the whole transport.

| File | Role |
|---|---|
| [app/utils/tmcut/captions.ts](file:///D:/Applications/tm-tools/app/utils/tmcut/captions.ts) | `toCaptionCues` / `serializeCaptionCues` / `parseCaptionCues` |
| [htmlVideoStarters.ts](file:///D:/Applications/tm-tools/app/utils/tmcut/htmlVideoStarters.ts) | new `voice-captions` starter reading `data-cues` |
| [TmcutHtmlVideoStudio.vue:276](file:///D:/Applications/tm-tools/app/components/tmcut/TmcutHtmlVideoStudio.vue#L276) | **Use timeline captions** — text clips → `cues` variable |
| [tests/unit/tmcut_caption_cues.spec.ts](file:///D:/Applications/tm-tools/tests/unit/tmcut_caption_cues.spec.ts) | 11 checks over the conversion and the starter |

`toCaptionCues` takes seconds, not ticks. The caller converts with `clipStartSec`/`clipDurationSec`
([clipTime.ts](file:///D:/Applications/tm-tools/app/utils/tmcut/clipTime.ts)), which keeps the "only clipTime knows
about ticks" rule intact — the unit bug this codebase already paid for once.

### 13.2 The composition

`voice-captions` (9:16, 5 s base) parses the attribute, splits each cue into words, and on `seek(t)`:

- picks the cue whose `[start, end)` contains `t`;
- splits that cue's duration evenly across its words and lights word *k* once `(t − start) / span × wordCount > k`,
  so the highlighted word always matches the spoken fraction — karaoke without forced alignment;
- extends `DURATION` to the last cue's end when the cues run longer than the declared 5 s, otherwise the render would
  cut the last line off.

The highlight is `--accent` at >50 % progress, `#fff` at 30 % opacity before. Everything is a pure function of `t`:
no rAF, no timers, no `Math.random` — the three-render md5 identity from §12.5 still holds.

### 13.3 The button degrades honestly

`Use timeline captions` only appears when the document has a `cues` token, and:

- no project → disabled, with `captionsNoProject`;
- project with no text clips → warning toast `captionsEmpty` + the hint to run AutoCaptions on desktop;
- text clips → `variables.cues` is replaced and a toast reports the count.

It reads **all** text tracks and does not dedupe overlaps: two text clips stacked at the same time produce two
overlapping cues, and the composition shows the first. Merging them would be a guess about which one the author meant.

### 13.4 Verification actually run (this phase)

| Gate | Result |
|---|---|
| `npx eslint` on the 4 changed/added files | PASS — exit 0 (two findings fixed: statement-per-line, quote style) |
| `npx nuxt typecheck` | PASS — 0 × `error TS` |
| `npx tsx tests/unit/run-all.mts` | PASS — **58/58** (`tmcut_caption_cues` 11 checks; starter invariants re-run over all 8 starters) |
| live preview, `Voice captions` + default cues, t = 2.00 s | cue 2 rendered, "is" lit in accent, rest at 30 % opacity, progress bar at 40 % |
| live **Use timeline captions** with one text clip (`Xin chào từ track text`, 4 s) | variable became `[{"start":0,"end":4,"text":"Xin chào từ track text"}]` |
| live preview with that cue, t = 2.00 s | first half of the Vietnamese line lit (diacritics intact) |
| live render | `html-mvuf8l43-20687e-voice-captions.mp4`, **5.000 s**, 150 frames, 95 109 B, h264 1080×1920 30/1 |
| the encoded file, seeked to 2.0 s in a plain `<video>` | caption **baked in** with the same half-lit karaoke state — not a preview-only effect |
| console on `/tmcut/html-video` through starter → fill → render | 2 × `[debug] [vite] hot updated` (i18n), zero errors |

### 13.5 What this phase does not fix

- Web still cannot *produce* captions: Whisper is desktop-only, so on web the button only helps once text clips exist
  (typed, imported with a project, or made on desktop).
- Word timing is even-split inside a cue, not forced alignment: a long pause inside one segment will mistime words.
- Cues are read from the whole text track, not from the clip under the playhead, so a project with several unrelated
  caption runs needs the variable trimmed by hand.
- `data-cues` inherits the 512 KiB document limit; roughly 2 000 cues is the practical ceiling.

Nothing was committed or pushed; no key or credential was read or changed; `tests/scratch-debug.*` untouched.

## 14. HTML starter pack keyed by industry (2026-10-30)

### 14.1 The gap

The timeline template library has been industry-aware since phase 8 (`INDUSTRY_CATALOG`, 17 ids, every id covered by
the 30 built-in timeline templates). The HTML/CSS starter pack was not: it shipped 8 compositions with only free-form
`tags` (`'commerce'`, `'interview'`, …), so nothing connected "I make content for a clinic" to "start from
`booking-cta`". The fix had to stay data-driven — the same catalog drives the filter labels in the template library, and
two parallel taxonomies would drift.

### 14.2 Shape of the change

- `HtmlVideoStarter` gained a **required** `industries: string[]` (ids from `INDUSTRY_CATALOG`). Required, not optional:
  the type checker is the thing that stops the next starter from being added without a mapping.
- A starter may claim several industries (`lower-third` → creator, events, travel; `booking-cta` → beauty, services,
  medical). `general` means "fits anything" and is deliberately *not* a fallback inserted by code — the existing
  starters that really are generic (`kinetic-title`, `gradient-loop`, `blank`) claim it explicitly.
- Filter chips are derived, never hardcoded: catalog order, only industries with a non-zero starter count, labels via
  `useTmcutIndustries()` (i18n key `tmcut.templateLibrary.industries.<id>`), counts of what clicking shows. This reuses
  `TmcutFilterChips` single-select, the same component and the same "no empty grid" rule as the template library.
- Two new i18n keys per locale: `tmcut.htmlVideo.industryAll` ("All industries" / "Tất cả ngành") and
  `industryFilterLabel` for the group's `aria-label`.

### 14.3 Five new compositions

| Starter | Industries | Frame | Duration | Motion (all functions of `seek(t)`) |
|---|---|---|---|---|
| `menu-board` | fnb | 9:16 | 5 s | eyebrow → dish → price pill → note staggered out-cubic; progress rule `scaleX(t / DURATION)` |
| `booking-cta` | beauty, services, medical | 9:16 | 6 s | centred stack; CTA lands at 1.05 s then breathes via `sin(t)` (a sine of seek time, not a timer) |
| `listing-reveal` | realestate, automotive | 16:9 | 6 s | six text parts at 0.15 s offsets, card rises and scales behind them |
| `countdown` | health, events | 9:16 | 4 s | `STEP = 0.8`, marks `3 / 2 / 1 / GO`, per-step pop from the position inside the step, conic-gradient ring |
| `pet-spotlight` | pets | 9:16 | 5 s | `easeOutBack` name pop, breed slide, four dots drifting on `sin(t)` |

Every one satisfies the same invariants as the first eight: `data-composition-id` root, literal `var DURATION = N;`,
`window.__hf = { duration: DURATION, seek: seek }`, no rAF / `Math.random` / `setInterval`, no remote script, all tokens
declared as variables.

### 14.4 Coverage

13 starters, 17 of 17 catalog industries covered. Per industry: general 3, creator 2, tech 2, education 2, medical 2,
events 2, ecommerce 1, fashion 1, finance 1, travel 1, fnb 1, beauty 1, services 1, realestate 1, automotive 1,
health 1, pets 1. `pets` and `fnb` exist in the pack **only** because of this phase — which is exactly the failure the
new coverage test is there to prevent from recurring.

### 14.5 What the tests now pin

`tests/unit/tmcut_html_video_starters.spec.ts` gained a second `describe` with two checks:

1. **Catalog membership** — every `industries` array is non-empty, duplicate-free, and every id exists in
   `INDUSTRY_CATALOG`. A typo (`'real-state'`) fails here instead of silently disappearing from the filter.
2. **Full coverage** — the union of all starter industries must equal the catalog; the assertion prints the missing ids.
   Adding a 18th industry to the core catalog without a starter fails the suite by design.

The existing suite keeps doing the rest: tokens declared, defaults validate clean, `data-duration` / `DURATION` /
`__hf.duration` agree, aspect preset matches, deterministic/offline lint.

### 14.6 Verification

| Gate | Result |
|---|---|
| `npx eslint` on the 3 changed files | PASS — exit 0 |
| `npx nuxt typecheck` | PASS — 0 × `error TS` |
| `npx tsx … tmcut_html_video_starters.spec.ts` | PASS — **11/11** (2 new industry checks over all 13 starters) |
| `npx tsx tests/unit/run-all.mts` | PASS — **58/58** |
| live filter row on `/tmcut/html-video` | 18 chips: "All industries 13" + all 17 catalog industries, counts match the map above |
| click "Food & Beverage" | grid reduced to `['menu-board']`, chip `aria-pressed` |
| live preview of each new starter, mid-frame | `menu-board` t=2.00 price rule 40 %; `booking-cta` t=3.30 CTA landed; `listing-reveal` t=3.60 16:9 switch + spec pills; `countdown` t=1.80 shows "1" (index 2 of `3/2/1/GO`), ring 45 %; `pet-spotlight` t=2.50 name pop done, dots drifting |
| live render, `countdown` defaults | `html-mvuflms1-43d27b-countdown.mp4`, **4.000 s**, 120 frames, 123 980 B, 1080×1920 30/1; result row "4.00s · 120 frames · 121.1 KB" |
| console during the sweep | 1 × `<Suspense>` info, zero errors |

### 14.7 Limits

- `industries` is hand-claimed metadata, not derived from the composition; a starter could claim an industry whose
  content only loosely fits. The test guarantees *coverage*, not *quality*.
- The filter is single-select and not persisted: reloading the studio starts at "All industries".
- Cards still show aspect · duration · fps only; industry is visible through the filter, not on the card.
- Industry labels come from the template library's namespace; a locale that has not translated a new industry id falls
  back to the catalog's English label (`useTmcutIndustries` behaviour).

Nothing was committed or pushed; no key or credential was read or changed; `tests/scratch-debug.*` untouched.

## 15. Gates for the new features (2026-10-30)

### 15.1 Why the fast suite was not enough

The 58 specs prove the wiring: tokens are declared, defaults validate, the API refuses anonymous callers, the TTS proxy
guards its targets. None of them prove the two things that only exist at runtime:

- **Determinism.** The render contract is "motion is a pure function of `seek(t)`", and the renderer is frame-first
  (seek → screenshot → encode), never play-then-record. That design *should* make renders reproducible, but nothing
  asserted it — a stray `Math.random`, a `setInterval`, or a font that resolves differently per run would still pass the
  static lint if it slipped in through a token value.
- **The routes actually serve.** `/tmcut/html-video` and `/tmcut/voice` were verified by hand in this phase; a typo in a
  page filename or a broken default export would not fail any spec.

### 15.2 The smoke spec

`tests/unit/tmcut_html_video_smoke.spec.ts` — opt-in via the `*_smoke` naming (skipped by `run-all.mts` unless
`--smoke`, so `npm run test:tmcut` stays fast and server-free). New script: `npm run test:html-video-smoke`.

1. **Determinism** — renders the `countdown` starter (the shortest real one, 4 s × 30 fps = 120 frames) **three times**
   through the production pipeline (`runHtmlVideoRender`, real Chrome + bundled ffmpeg, same job store the API uses),
   then compares md5 and size, and the job-reported duration. Outputs are written to `config.uploads.dir` and deleted
   in a `finally`, so a failed run leaves nothing behind either.
2. **Routes** — GET `/tmcut/html-video` and `/tmcut/voice` must answer 200 `text/html`, and an anonymous
   `POST /api/v1/media/html-video` must answer **401**. Base URL: `TMCUT_SMOKE_BASE_URL` (default
   `http://localhost:4002`). When no server answers, the spec prints `SKIPPED (no server at …)` and keeps the
   determinism result instead of pretending to have tested the routes.

The 401 assertion doubles as a security regression test: the render endpoint must never accept an unauthenticated
composition, even on a local server.

### 15.3 Verification

| Gate | Result |
|---|---|
| `npm run test:html-video-smoke` | PASS — **6/6** checks |
| md5 of the three `countdown` renders | identical — `0c85cf99ba9618929f33a0fe5d474500`, 107 607 B, 4 s each |
| `GET /tmcut/html-video`, `GET /tmcut/voice` | 200, `text/html` |
| `POST /api/v1/media/html-video` (no session) | 401 |
| leftovers in `.data/uploads` | 0 files after the run |
| `npx tsx tests/unit/run-all.mts` (default) | PASS — **58/58**, smoke correctly skipped |
| `npm run build` | PASS — exit 0, "Build complete in 2m 46s", `.output/` 435 MB |

### 15.4 Limits

- Determinism is asserted **per machine and per browser build**: a Chrome update can change JPEG bytes without changing
  a single pixel, and the check would fail while the video stays visually identical. The assertion is therefore about
  "same input, same toolchain → same file", not about a golden hash in version control.
- Only one composition (4 s) is rendered three times; a longer starter would triple a 20–30 s render.
- The routes half needs a running server and is skipped (loudly) when there is none; CI that wants it must start the
  app first and set `TMCUT_SMOKE_BASE_URL`.
- `npm run build` type-checks and bundles; it does not exercise the Electron shell (`build:electron` is a separate,
  much heavier target and was not run).

Nothing was committed or pushed; no key or credential was read or changed; `tests/scratch-debug.*` untouched.

