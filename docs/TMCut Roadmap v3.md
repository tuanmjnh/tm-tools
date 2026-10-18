# TMCut Roadmap v3 — Kế hoạch xây dựng chi tiết

> File **lập kế hoạch & theo dõi tiến độ** của TMCut. Bổ sung cho
> `docs/TMCut Architecture v3.md` (architecture + log các round §65–§79).
> Trạng thái cập nhật: **10/2026**.

---

## 0. Cách dùng tài liệu này

- Mục có `- [x]` = đã làm & verify xong; `- [ ]` = chưa làm. Khi làm xong
  một mục, tick checkbox + ghi log vào architecture doc (§ tiếp theo).
- Mỗi hạng mục ghi rõ **Nơi làm**:

  | Nơi | Repo | Quy tắc |
  |---|---|---|
  | UI (Nuxt/Vue) | `D:/Applications/tm-tools/app` | Chỉ render + gọi composable/core; **không** chứa logic thời gian thuần |
  | Engine thuần | `D:/Applications/tmcut-core` (`@tmcut/core`) | Zero-dep, không Vue/Nuxt/Electron/builtins/browser (§57, `tools/check-boundaries.mjs`); thời gian dùng **ticks** (`TICKS_PER_SECOND = 120_000`); test bằng `node:test` |
  | Runtime/IPC/FFmpeg | `D:/Applications/tm-tools/electron` | Main process; đổi gì → **full restart** app Electron |
  | Render pipeline | `app/utils/tmcut/compiler.ts` | Sinh lệnh FFmpeg; sau này refactor theo Phase 6 thành `@tmcut/render` |

- Quy tắc **bất biến** mỗi round (AGENTS.md + thực tế các round đã làm):
  1. Trung thực: control nào chưa có backend thì **không render** (hoặc badge
     "Sắp ra mắt") — tuyệt đối không nút chết.
  2. i18n: mọi chuỗi người dùng qua `t()`, en+vi **parity** (cùng số key).
  3. Comment/hằng số/tên biến: English.
  4. Không thêm runtime dependency mới.
  5. Verify tối thiểu mỗi round: `pnpm typecheck` + `npx eslint <file chạm>`;
     nếu đụng core: thêm `pnpm test:core && pnpm check:core &&
     pnpm lint:core && pnpm typecheck:core`.
- Việc chọn thứ tự làm: ưu tiên cột **Ưu tiên** (P0 > P1 > P2),effort
  (S < 1 ngày · M 1–3 ngày · L > 3 ngày).

---

## 1. Trạng thái hiện tại (10/2026)

### 1.1 Năm mockup design — đã làm đủ

| Mockup | Vùng | Round | Trạng thái |
|---|---|---|---|
| `private/tmcut/1` | Home dashboard | R11 | ✅ (§77) |
| `private/tmcut/2` | Editor workspace | R10 | ✅ (§76) — còn vài chênh lệch nhỏ, xem 1.4 |
| `private/tmcut/3` | Export modal | R9 | ✅ (§75) |
| `private/tmcut/4` | AutoCut wizard | R12 | ✅ (§78) |
| `private/tmcut/5` | Shortcuts help | R8 | ✅ (§74) |

### 1.2 Round QoL gần nhất (§79 — chưa commit)

- [x] **F5 = reload app** (main.cjs: bỏ Ctrl+R/Ctrl+Shift+R theo yêu cầu;
      giữ Ctrl+Shift+I devtools) — main process → cần 1 lần restart app.
- [x] **Ctrl+scroll zoom timeline** (`onTracksWheel` trong TmcutTimeline:
      zoom quanh con trỏ, range 15–200, step 10, `preventDefault()` chặn
      zoom trang của Electron).
- [x] **R13 (§80)**: playhead → `bg-primary`; help modal + dòng
      Ctrl+scroll (i18n +2 key ×2 locale).
- [x] Review design #2: sửa hardcode `+ Video` → `t('tmcut.addVideo')`;
      4 comment tiếng Việt → English.
- [x] Verify: `pnpm typecheck` EXIT=0, eslint file chạm = 0,
      `node --check electron/main.cjs` = 0.

> ⚠️ Toàn bộ Round 8–12 + §79 **chưa commit** (HEAD vẫn `482ec4a 2026.10.04`).

### 1.3 @tmcut/core (Phase 1–3 architecture) — đã xong

- Repo `D:/Applications/tmcut-core`: 18 module `src/*.mjs`, `types/`
  (DSL v3 = logical `@tmcut/types`), 10 file test — **66 tests**.
- App nối core qua alias `@tmcut-core` (nuxt.config): `media.ts`,
  `recovery.ts`, `waveform.ts` đã rewire; `useTmcutProject` dùng
  `applyV3Edit` (v1→v3→merge) + `snapTimeSec` (gọi `snapTime` của core);
  `useTmcutAutocut` dùng `selectSegments`/`scoreSegments`; preview dùng
  `previewScale`.
- Verify core: `pnpm test:core` · `pnpm check:core` · `pnpm lint:core` ·
  `pnpm typecheck:core` (chạy từ tm-tools, script trỏ sang repo kia).

### 1.4 Khoảng trống đã rà ra (chưa có trong §76.5)

- [x] **Playhead màu đỏ** → đổi `bg-primary` (2 chỗ TmcutTimeline) —
      **đã làm R13 (§80)**.
- [x] **Transform handles trên canvas** cho video clip (chỉ text kéo được)
      → **đã làm A3 R18 ✅** (xem Phase A).
- [x] **Drag & drop media → timeline** (hiện chỉ click/hover "+" )
      → **đã làm A4 R17 ✅** (xem Phase A).
- [x] **Minimap timeline** — **đã làm R19 (§86)**.
- [x] **Track V2/A2** (design có 4 track) — **đã làm R16 (§83)**: nút
      "+" dropdown (Video/Text/Audio) + 🗑 per header.
- [x] **Rotation slider trong Inspector** — **đã làm R21+R22 (§88, §89)**:
      C7 thêm filter rotate (verify export thật) → A8 expose slider
      (video-only) + rotate handle canvas.
- [x] Help modal thêm dòng **Ctrl+scroll zoom** — **đã làm R13 (§80)**.
- [x] Snap/magnet: **đã làm R15 (§82)** — drag/trim gọi core + toggle N.

---

## 2. Quy tắc đóng góp cho @tmcut/core (đọc trước khi code phần core)

Mỗi hạng mục core **bắt buộc** đủ 5 thành phần (đây là "thông tin đầy đủ"
theo yêu cầu):

1. **Module**: file `src/<ten>.mjs` mới hoặc mở rộng file có sẵn; thêm
   export vào `src/index.mjs` (barrel) **và** khai báo kiểu ở
   `src/index.d.ts`.
2. **Kiểu**: nếu cần đổi DSL → sửa `types/dsl.ts` (ghi chú comment theo
   architecture §2/§3); `types/` là type-only, không runtime import.
3. **Test**: file `test/<ten>.test.mjs` bằng `node:test` + `node:assert`;
   chạy `pnpm test:core`.
4. **Giới hạn**: không import Vue/Nuxt/Electron/`node:*`/browser global —
   vượt qua sẽ fail `pnpm check:core`.
5. **Consumer app**: ghi rõ file `app/...` nào sẽ gọi (để verify sau:
   `pnpm typecheck` + eslint).

Quy ước hàm: nhận dữ liệu + **ticks** (không giây, trừ parser dữ liệu
ngoại lai như Whisper/EDL vốn là giây — convert qua `secToTicks`);
mutate timeline được (core đang mutate in-place, `applyV3Edit` bọc undo
bên ngoài); trả về handle/kết quả thay vì boolean mơ hồ khi cần info.

---

## 3. @tmcut/core — các hạng mục mở rộng (thông tin đầy đủ)

> Thứ tự ID = thứ tự ưu tiên thực hiện. Cột **App consumer** liệt kê file
> tm-tools sẽ dùng hàm đó.

### C0 — Rewire `canvas.ts` về core (loại bản copy song song) · P0 · S · **✅ R14 (§81)**

- **Hiện trạng**: `app/utils/tmcut/canvas.ts` (TypeScript) và
  `core/src/canvas.mjs` **cùng có** `buildFfmpegFitFilters`,
  `computeFitObjectStyle`, `reframeTransform`, `previewScale` — 2 bản phải
  giữ đồng tay.
- **Làm**: đối chiếu 2 bản, port phần TS còn thiếu (nếu có) vào
  `canvas.mjs`; `app/utils/tmcut/canvas.ts` chuyển thành re-export
  `export { ... } from '@tmcut-core'` (mẫu `media.ts`/`waveform.ts`).
- **Test**: `test/canvas.test.mjs` bổ sung case thiếu (focus/crop/pad).
- **Consumer**: `app/utils/tmcut/compiler.ts` (import
  `buildFfmpegFitFilters`), `TmcutPreviewPlayer.vue` (`previewScale`).
- **Verify**: `pnpm test:core && pnpm check:core && pnpm typecheck`.

### C1 — Snap khi kéo: ứng dụng `snapTime` + ứng viên chi tiết · P0 · S · **✅ R15 (§82)**

- **Hiện trạng**: `editing.mjs` đã có
  `snapTime(timeline, targetTicks, { thresholdTicks?, playheadTicks?, ignoreIds? })`
  và `useTmcutProject.snapTimeSec` đã wrap. **Chưa có clip drag nào gọi.**
- **Thêm vào `editing.mjs`** (đề xuất):

```ts
export interface SnapCandidate {
  ticks: number
  kind: 'clip-start' | 'clip-end' | 'marker' | 'playhead' | 'zero'
  fromId?: string
}
export function snapCandidates(timeline, targetTicks, options?): SnapCandidate[]
export function snapTimeDetailed(timeline, targetTicks, options?): { ticks: number, snapped: SnapCandidate | null }
```

- **Test** (`test/editing.test.mjs`): vượt ngưỡng không snap; `ignoreIds`
  (clip đang kéo không tự snap cạnh chính nó); marker vs clip-đối-diện ưu
  tiên theo khoảng cách; playhead trả `kind:'playhead'`.
- **Consumer**: `TmcutTimelineClip.vue` (`onDragStart`/`onTrimLeftStart`/
  `onTrimRightStart` → gọi `snapTimeDetailed` trong `onMouseMove`) +
  toggle magnet trong toolbar (A6).
- **Shortcut**: N (bật/tắt magnet) — thêm help modal khi làm A6.

### C2 — Ripple insert & close gap · P1 · S

- **Module**: `editing.mjs` (bên cạnh `rippleDelete` đã có).

```ts
export function insertClipRipple(timeline, trackType, partial, atTicks): { clip, shifted }
export function closeGaps(timeline, options?: { acrossTracks?: boolean }): number // số giây đã đóng
```

- **Test**: chèn giữa 2 clip → clip sau dịch đúng bằng duration bản mới,
  clip đầu giữ nguyên; `acrossTracks:false` chỉ đụng 1 track; timeline
  rỗng/chèn cuối không lỗi.
- **Consumer**: `useTmcutProject` (chèn clip từ media bin khi rippleMode
  bật), autocut acceptDraft (dồn các segment giữ về liền nhau).
  **✅ R33 (§101)**: `insertClipRipple` (+option `acrossTracks` ngoài
  spec) + `closeGaps` (option `trackType`; **trả seconds** theo spec;
  `acrossTracks` mặc định true) · +4 tests → core 113/113 ·
  **UI**: drop-đè khi rippleMode → insert qua bridge · nút toolbar
  Close gaps (`closeProjectGaps` pre-scan tránh history no-op) ·
  autocut `applyDraft` đã contiguous nên không cần closeGaps.

### C3 — Keyframes: eval + easing · P1 · M · **module mới `src/keyframes.mjs`** · **✅ R23 (§90)**

- **DSL** (`types/dsl.ts`): `TmcutKeyframe` đã có `{ t, prop, value }` —
  thêm optional `easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step'`.
- **API đề xuất**:

```ts
export function evalKeyframe(clip, prop, atTicks): number | undefined // clamp ngoài 2 đầu
export function keyframeAt(clip, prop, atTicks, toleranceTicks?): TmcutKeyframe | null
export function setKeyframe(clip, prop, atTicks, value, easing?): TmcutKeyframe // thay nếu trùng t
export function removeKeyframe(clip, prop, atTicks, toleranceTicks?): boolean
export function propsWithKeyframes(clip): string[]
export function keyframeTimes(clip, prop): number[] // ticks tăng dần
```

- **Test** (`test/keyframes.test.mjs`): trước kf đầu = giá trị kf đầu; sau
  kf cuối = kf cuối; linear giữa 2 kf; step giữ giá trị cũ đến đúng kf kế;
  `atTicks` trùng kf trả đúng kf; eval prop chưa có kf = `undefined`;
  easing-in/out tại điểm giữa ≠ linear.
- **Consumer**: `TmcutPreviewPlayer.vue` (apply giá trị interp vào style —
  thay `clip.scale` đọc trực tiếp), `TmcutInspector.vue` (nút thêm keyframe
  ⏱), timeline (biểu tượng diamond trên clip).
- **Render dependency**: compiler map keyframes → expression FFmpeg
  (`scale`/`opacity`/`x`/`y` theo `t`) — item **R2** (Phase I), chưa có thì
  UI chỉ được ghi chú "preview-only" (trung thực).

### C4 — Retime: speed/reverse time map · P1 · M · **module mới `src/retime.mjs`** · **✅ R25 (§92)**

- **DSL**: `speed`, `reverse?` đã có trong `TmcutTimelineClip`.
- **API đề xuất** (toàn bộ ticks):

```ts
export function isRetimed(clip): boolean // speed !== 1 || reverse
export function timelineToSource(clip, atTicks): number  // ticks nguồn (đã map speed+reverse)
export function sourceToTimeline(clip, sourceTicks): number
export function withSpeed(clip, speed): TmcutTimelineClip // normalize source/out + timeline duration
export function validateSpeed(speed): number // clamp ≥ 0.01
```

- **Test** (`test/retime.test.mjs`): speed 2 → duration /2; reverse map
  đầu↔cuối; speed 0.5 ×2; map ngược `sourceToTimeline∘timelineToSource`
  đúng ±1 tick; trim sau khi đổi speed giữ nguồn hợp lý.
- **Consumer**: `TmcutInspector` tab Tốc độ (hiện speed change chưa
  normalize duration — verify khi làm B4), compiler (setpts/asetspts).
- **Render dependency**: compiler đã có `setpts`? — nếu chưa thì item
  **R1** (Phase I) bổ sung; `withSpeed` là nguồn sự thật duy nhất.

### C5 — Transition model (overlap) · P1 · M · **module mới `src/transitions.mjs`**

- **DSL**: `transitionIn?: { type, duration }` đã có (chỉ 1 phía — chấp
  nhận: transition gắn vào clip sau, hàm tự tìm clip liền trước).
- **API đề xuất**:

```ts
export const KNOWN_TRANSITIONS: string[] // 'fade','dissolve','wipe-left','wipe-right','slide-left','zoom-in'
export function canApplyTransition(timeline, clipId, durationTicks):
  { ok: boolean, reason?: 'no-neighbor' | 'gap' | 'too-long' | 'unknown-type', overlapTicks?: number }
export function applyTransition(timeline, clipId, type, durationTicks): boolean
export function clearTransition(timeline, clipId): boolean
export function transitionWindows(track): Array<{ fromId, toId, startTicks, endTicks }>
```

- **Test** (`test/transitions.test.mjs`): duration > clip láng giềng →
  `too-long`; có khoảng trống → `gap`; không clip trước → `no-neighbor`;
  apply → `transitionWindows` trả đúng vùng overlap; type lạ → fail.
- **Consumer**: menu chuột phải clip / toolbar (B3), tooltip hiển thị
  `transitionWindows`.
- **Render dependency**: FFmpeg `xfade` yêu cầu 2 input overlap + music
  `acrossfade` → compiler phải gộp dây clip liền nhau thành chuỗi concat
  + xfade (item **R3**, Phase I). **Trước khi R3 xong, UI chỉ cho chọn
  transition nếu export đã hỗ trợ** (hoặc badge "Sắp ra mắt" → quyết định
  khi làm B3).
- **✅ R34 (§102)**: `src/transitions.mjs` — `canApplyTransition` thêm
  param `type` (spec bỏ type nhưng reason `unknown-type` cần) + reason
  `'locked'` (lock-guard core) · apply shift clip trái bằng duration
  (overlap thật — cả 2 layer phát liên tục, không nhảy frame), re-apply
  un-shift cũ trước khi shift mới · `transitionWindows` skip cặp vỡ
  (neighbor không còn end tại window end) · fix `v1MatchesV3` so
  `transitionIn` + `splitClip` strip `transitionIn` nửa sau ·
  +9 test → **core 124/124** · UI xem **B3**.

### C6 — Effect registry + validate · P1 · S · **module mới `src/effects.mjs`**

```ts
export interface EffectParam { name, kind: 'number'|'color'|'enum'|'bool', min?, max?, default?, options? }
export interface EffectDescriptor { type, label, params: EffectParam[], renderReady: boolean }
export const EFFECT_REGISTRY: Record<string, EffectDescriptor>
// đợt 1: blur, sharpen, vignette, grain, chromakey, lut3d, stabilize, eq-grade
export function validateEffect(effect): string[]   // lỗi kiểu validateTimeline
export function normalizeEffects(list): TmcutClipEffect[]
```

- Flag `renderReady` = trung thực: UI hiện slider được (preview CSS/filter)
  nhưng nếu compiler chưa map → badge "Chưa xuất bản" đúng sự thật.
- **Test**: param out-of-range báo lỗi; normalize bỏ field lạ; registry
  không rỗng key.
- **Consumer**: `TmcutInspector` accordion Effects (Phase E), compiler
  (R4).
- **✅ R35 (§103)**: `src/effects.mjs` — registry 8 effect đợt 1 với
  range/options/default đầy đủ · `validateEffect` (lỗi kiểu
  `validateTimeline`: unknown type/param, out-of-range, sai kind) ·
  `normalizeEffects` (drop type lạ + field lạ whitelist, clamp number
  về range, invalid → default, fill đủ registry params → output luôn
  validate sạch) · **`renderReady: false` toàn bộ** (trung thực —
  compiler chưa map, chờ R4; badge "chưa xuất bản" làm ở Phase E
  cùng accordion Inspector) · +5 test → **core 129/129** ·
  `TmcutClipEffect` đưa vào d.ts re-export.

### C7 — Rotation trong fit filters (mở khóa Inspector Rotation) · P1 · S · **✅ R21 (§88)**

- **Hiện trạng**: `transform.rotation` trong DSL + preview CSS đã xoay;
  `buildFfmpegFitFilters` (sau C0 chỉ còn **1 bản ở core**) chưa sinh
  filter xoay → compiler không xoay khi export.
- **Làm**: thêm option `rotation?: number` (độ, chiều kim đồng hồ) vào
  `buildFfmpegFitFilters(mode, canvasW, canvasH, { ..., rotation })` →
  append `rotate=${deg}*PI/180:ow=iw:oh=ih` (giữ size canvas; corner
  crop — chấp nhận, ghi chú trong doc) **hoặc** rotate trước rồi fit (mới
  sau khi test thực tế bằng `resources/ffmpeg.exe`).
- **Test**: `test/canvas.test.mjs` — rotation 90/0/neg trả filter string
  đúng thứ tự (rotate **sau** fit).
- **Consumer**: `compiler.ts` truyền `clip.transform.rotation`;
  `TmcutInspector` thêm slider Rotation (`handleUpdate('rotation', ...)`)
  — chỉ expose **sau khi** verify export thật quay đúng.
- **Verify đặc biệt**: render thử 1 clip 90° bằng harness esbuild quen
  dùng, xem frame đầu.

### C8 — Track ops: thêm/xóa track · P1 · S · **✅ R16 (§83)**

- **Module**: `timeline.mjs` (bên cạnh `ensureTrack` — `ensureTrack` =
  tìm-or-tạo; cần hàm **luôn tạo mới** cho nút "Thêm track").

```ts
export function addTrack(timeline, type, name?): TmcutTrack
export function nextTrackName(timeline, type): string  // 'Video 2', 'Audio 2'
export function removeTrack(timeline, trackId, options?: { keepClips?: boolean }): boolean
```

- **Test**: thêm Video tạo đúng type/name tăng dần; remove mặc định xóa cả
  clip (hoặc `keepClips` chuyển về track khác); không xóa được track cuối
  cùng của type (bảo vệ) → define rõ ràng trong test.
- **Consumer**: `TmcutTimeline.vue` — nút "+" ở khu vực track header (A5).

### C9 — Group / ungroup · P1 · S

- **Module**: `selection.mjs` (`expandRelated` đã resolve khi chọn — thiếu
  hàm tạo/bỏ).

```ts
export function groupClips(timeline, ids): string | null  // trả groupId mới
export function ungroupClips(timeline, ids): number        // số clip đã gỡ
```

- **Test**: group ≥2 → chung groupId; `expandRelated` chọn 1 clip mở rộng
  cả nhóm; ungroup xóa groupId; group 1 clip / 0 clip → null.
- **Consumer**: `TmcutTimeline` (Ctrl+G / Ctrl+Shift+G, menu chuột phải),
  help modal. **✅ R30 (§97)**: `groupClips`/`ungroupClips` +4 test +
  fix `v1MatchesV3` compare (`groupId/linkId` bị drop khi merge-back) ·
  **UI chờ R31**.

### C10 — EDL segments → clip inputs (glue AutoCut → Timeline) · P1 · S

- **Module**: `edl.mjs` (đã có `validateEdl`, `selectSegments`).

```ts
export function segmentsToClips(edl, segments, options?: { trackType?: 'video', minGapTicks?: number }): CoreClipInput[]
```

- **Test**: segment `{ start, end, ... }` (giây) → clip
  `source.in/out` + `timeline.start/duration` đúng `secToTicks`;
  sort theo start; segment không hợp lệ (end ≤ start) bị loại.
- **Consumer**: `useTmcutAutocut.acceptDraft` (hiện tự ghép object —
  thay bằng core để test được).
- **✅ R36 (§104)**: `segmentsToClips(edl, segments, options?)` trong
  `edl.mjs` — EDL invalid → `[]` (validateEdl gate, không tin output
  model) · filter span ≤ 0 + sort by start · mặc định **concatenate**
  (dead air biến mất — khớp applyDraft cũ) · `minGapTicks`: gap
  ≥ ngưỡng được GIỮ (khoảng nghỉ thật), gap nhỏ hơn vẫn đóng → mọi
  gap trong output ≥ minGapTicks · `trackType` validate intent
  ('text' → `[]`; shape clip giống nhau video/audio hôm nay) ·
  output flat `{ in, out, offset }` ticks · +5 test (round-trip
  `addClip` assert `source/timeline` ticks đúng) → **core 134/134** ·
  consumer `applyDraft` dùng core + `ticksToSec` ở biên (timeline app
  là v1 seconds) · EDL invalid → `null` (trước: áp dụng rác).

### C11 — Caption/Auto-subtitle + SRT · P2 · M · **module mới `src/caption.mjs`**

```ts
export interface TranscriptCue { text: string, start: number, end: number } // GIÂY (nguồn Whisper)
export function cuesToCaptionClips(cues, options?: { maxChars?, maxDurTicks?, fromTicks?, rangeTicks? }): CoreClipInput[]
export function parseSrt(text: string): TranscriptCue[]
export function serializeSrt(cues: TranscriptCue[]): string
export function splitLongCue(cue, maxChars): TranscriptCue[]
```

- **Test**: cue quá dài → split theo từ (không cắt giữa từ); parseSrt
  format chuẩn `00:00:01,000 --> ...`; round-trip parse→serialize; ticks
  đúng `secToTicks`.
- **Consumer**: Auto-captions (Phase C) — `useTmcutAutocut` đã bắt
  `transcript[]` thật từ Whisper (Round 12) → biến thành text clips;
  xuất/phụ đề SRT từ project.
- **AI dependency**: đã có (gateway Whisper `audio/transcriptions`) —
  task `transcribe`.
- **✅ R37 (§105)**: `src/caption.mjs` — `splitLongCue` (greedy theo từ,
  không bao giờ cắt giữa từ; word dài hơn maxChars giữ nguyên 1 chunk;
  timing tỉ lệ theo chars, chunk cuối pin `end` gốc) ·
  `cuesToCaptionClips` (`maxChars` 42 + `maxDurTicks` 7s — slice thời
  gian chia đều, `fromTicks` neo offset, `rangeTicks` clamp cửa sổ:
  ngoài → drop, vắt biên → cắt) · `parseSrt` (tolerant: index tùy ý,
  CRLF, decimal chấm, toạ độ đuôi; block rác → skip, không throw) ·
  `serializeSrt` (chuẩn `HH:MM:SS,mmm`, đánh số, trailing newline;
  drop cue rỗng/invalid để round-trip sạch) · `TranscriptCue` types/
  caption.ts · +5 test (word-bound, CRLF junk, round-trip, ticks
  round-trip qua `secToTicks`, duration-slice) → **core 139/139** ·
  fix boundary: comment chứa "window." (regex `check-boundaries`) →
  viết lại chữ · round core-only (UI auto-captions + xuất SRT nằm
  Phase C).

### C12 — Fade in/out + gain math · P2 · S · **module mới `src/audio.mjs`**

- **DSL**: thêm `fade?: { in: MediaTime, out: MediaTime }` (ticks) vào
  `TmcutTimelineClip`.

```ts
export function fadeDuration(clip, edge): number        // ticks, clamp ≤ duration/2
export function gainAt(clip, atTicks): number           // volume(0..1) × envelope 0..1
export function volumeExpr(clip): string                // expression FFmpeg: 'if(lt(t,A),t/A, if(...))'
```

- **Test**: đầu clip gain≈0 → giữa = volume → cuối về 0; fade > duration
  bị clamp; `volumeExpr` chứa đủ mốc.
- **Consumer**: `TmcutInspector` tab Âm thanh (nút Fade in/out), preview
  dùng `gainAt` đặt `video.volume` (nếu đang phát), compiler (R5).
- **Shortcut dự kiến**: Shift+D (fade mặc định 0.5s) — chỉ thêm khi thật.
- **✅ R38 (§106)**: `src/audio.mjs` — `fadeDuration` (clamp ≤ duration/2,
  2 edge không bao giờ đè nhau) · `gainAt` (volume 0..100 → 0..1 ×
  envelope, atTicks clip-LOCAL, ngoài clip clamp về edge) ·
  `volumeExpr` (marker đủ A / D−B / D, float noise được trim, không
  fade → '1') · clip nhận CẢ 2 shape (v3 ticks + v1 flat seconds —
  cùng contract `evalKeyframe`) · DSL `fade?: { in, out }` (TICKS) +
  `addClip` passthrough · v1compat: fade passthrough 2 chiều +
  `sameFade` (clear fade phải sync về — y hệt transitionIn) ·
  **UI**: Inspector tab Âm thanh — chip Fade in/out toggle 0.5s +
  slider (max min(5s, duration/2), step 0.1s) hiện khi active, slider
  burst coalesce history (B8/C15), toggle = 1 undo entry · preview
  `videoVolume = gainAt({...clip, volume: keyframed}, localTicks)` ·
  +5 test (4 audio + 1 v1compat fade-clear) → **core 144/144** ·
  i18n +2 (fadeIn/fadeOut) → **parity 2439/2439** · Shift+D CHƯA thêm
  (đúng tinh thần "chỉ thêm khi thật") · export: volume+fade cùng
  gap family, compiler R5 sẽ xử lý cả hai (không thêm badge mới).

### C13 — Safe-area rects (canvas) · P2 · S

- **Module**: `canvas.mjs`.

```ts
export function safeAreaRects(canvas): { actionSafe: {x,y,w,h}, titleSafe: {x,y,h,w} } // 0.90 / 0.80 (fractions)
export const SAFE_AREA_PRESETS: Array<{ id, label, ratio }>
```

- **Test**: 16:9 → actionSafe 0.9/0.9 đúng tâm; 9:16 cùng logic.
- **Consumer**: `TmcutPreviewPlayer` thay hardcode inset 2.5%/5% (overlay
  Safe Area) + thêm preset theo tỷ lệ.
- **✅ R39 (§107)**: thêm vào `canvas.mjs` (module có sẵn) —
  `safeAreaRects` (actionSafe 0.9 / titleSafe 0.8 fractions, thay hardcode
  2.5%/5% thành broadcast standard 5%/10% inset; canvas invalid →
  zero rects; inset trim float noise) · `SAFE_AREA_PRESETS` (7 preset
  16:9/9:16/1:1/4:5/4:3/3:4/21:9) · UI: HUD thêm dropdown Frame guide
  (None + preset, check item active) → overlay khung dashed
  primary căn giữa theo tỷ lệ chọn (composition aid, không crop) ·
  +3 test → **core 147/147** · i18n +2 (ratioGuide/none) →
  **parity 2441/2441**.

### C14 — Frame plan (filmstrip / thumbnail / extractFrame) · P1 · S

- **Module**: mới `src/frames.mjs` (hoặc mở rộng `cache.mjs`).

```ts
export function filmstripTimes(startTicks, durationTicks, count): number[]  // ticks đều, tránh đầu/cuối 2%
export function frameTimesForSegments(segments, perSegment): Array<{ id, times: number[] }>
export function clampFrameTime(atTicks, startTicks, durationTicks): number
```

- **Test**: count=8 → 8 mốc tăng đều & nằm trong range; duration 0 → [];
- **Consumer**: Round sau (G1) — IPC **`tmcut:extractFrame`** mới (main +
  preload → **full restart**) cho: thumbnail segment AutoCut (đang bỏ
  "để round sau"), filmstrip timeline (thay cover 1 frame), nút snapshot
  HUD. Core chỉ tính **danh sách timestamp** (giây qua `ticksToSec`);
  FFmpeg `-ss` runtime thuộc Electron.
- **✅ R40 (§108)**: `src/frames.mjs` (module mới — `cache.mjs` là
  cache-key/proxy, không dính frame timing) — `filmstripTimes` (count
  mốc đều, mỗi mốc ở giữa slice riêng, lùi ≥2% 2 đầu; duration ≤ 0 /
  count invalid → `[]`; count lẻ floors) · `frameTimesForSegments`
  (dual-shape: v3 clip `timeline.*` ticks + v1 flat `offset/in/out`
  SECONDS; entry thiếu id → drop, span unusable → slot
  `{ id, times: [] }` giữ chỗ zip 1:1) · `clampFrameTime` (pin seek
  về [start, start+duration]; duration ≤ 0 / time NaN → start) ·
  +4 test → **core 151/151** · **round core-only** — consumer IPC
  `tmcut:extractFrame` + filmstrip UI làm ở **G1** (round sau,
  main + preload → full restart).

### C15 — History: batch + coalesce · P2 · S

- **Module**: `history.mjs` (đã có `createHistory`).

```ts
export function pushBatch(history, entries, label?): void
export function coalesce(history, entry, windowTicks?): boolean // gộp thao tác liên tiếp (gõ chữ)
```

- **Test**: limit vẫn tôn trọng; coalesce cùng key gộp thành 1 undo;
  khác key không gộp.
- **Consumer**: `useTmcutProject` (undo gõ text không bị 1 ký tự/nhấn).
  **✅ R32 (§100)**: `pushBatch` + `coalesce` (+`_top`/`_replaceAfter`
  nội bộ, **`windowMs` wall-clock thay `windowTicks`** — ticks là media
  time) · +3 tests → core 109/109 · app consumer qua
  `pushHistoryCoalesced` trên snapshot stack (B8).

### C16 — Đưa app sang DSL v3 đầy đủ (bỏ bridge v1) · P3 · L ✅ (R78–R88/§146–§152)

- **Hiện trạng**: model app theo v1 (giây), mỗi thao tác qua
  `applyV3Edit` (v1→v3→op→merge) + `v1compat` sync — thừa lệch & chi phí.
- **Làm**: `useTmcutProject` store ticks/v3 (DSL làm nguồn sự thật),
  components đọc qua selector `ticksToSec` khi hiển thị; `v1compat` chỉ
  còn cho file project cũ (migrate 1 lần khi mở).
- **Test**: test core giữ nguyên; app: typecheck + thao tác tay (undo/
  split/trim/paste); migration file v1 cũ → v3 mở lại đúng.
- **Rủi ro**: L — làm sau khi các C1–C15 ổn định; tách nhỏ nhiều round.

### C17 — Beat/tempo detection (hoãn — có backend mới làm) · P3 · ?

- **Phụ thuộc**: FFmpeg không có filter detect beat; cần lib onsets
  (aubio/essentia — thêm runtime dependency) **hoặc** AI. **Chưa chọn →
  không làm core vội.**
- Khi có backend: `analysis.mjs` thêm `parseBeatOutput(stderrText)` theo
  pattern `parseSceneOutput` đã có; UI: marker nhịp (M) auto.
- **Consumer dự kiến**: `useTmcutMedia` generate beat map → markers (Phase
  D).

### C18 — Vocabulary Analysis & Filler Word Removal (AutoCut v2) · P1 · M · **✅ R72 (§140)**

- **Module**: `analysis.mjs` — pure vocabulary analysis (no deps, no platform calls)
- **API** (exported from `@tmcut/core`):
  - `DEFAULT_FILLER_WORDS: string[]` — bilingual list (VN/EN) ~150 entries
  - `detectFillerWords(text, options?): FillerWordResult[]` — finds filler words with positions
  - `analyzeTranscriptSegment(text, options?): TranscriptSegmentAnalysis` — tags filler vs highlight
  - `scoreSegments(input): ScoredSegment[]` — EDL scoring with `filterFillerWords`, `keywords`, `customFillerWords` options
- **Metadata added to segments**: `hasFillerWords`, `detectedFillers`, `isHighlight`, `matchedKeywords`
- **Scoring modifiers**: filler words → `* 0.4` (reason: `'filler-word'`), highlight keywords → `+ 0.25` (reason: `'highlight'`)
- **Tests**: `test/analysis.test.mjs` — 11 tests (filler detection, segment analysis, EDL scoring)
- **Consumer**: `useTmcutAutocut.ts` (apply filters, deselect filler segments, highlight keywords)

**Verify chung mỗi lần sửa core**: `pnpm test:core && pnpm check:core &&
pnpm lint:core && pnpm typecheck:core`, sau đó `pnpm typecheck` app (đụng
consumer) + `npx eslint <file app chạm>`.

---

## 4. Phase tính năng UI (CapCut-like) — theo thứ tự ưu tiên

### Phase A — Còn thiếu của design #2 (P0, làm ngay)

- [x] **A1 · Đổi playhead `bg-red-500` → `bg-primary`** (2 chỗ
      `TmcutTimeline.vue`) · S · **R13 ✅**.
- [x] **A2 · Thêm dòng "Ctrl + Cuộn — Zoom timeline" vào help modal**
      (`TmcutShortcutsModal`, i18n en+vi 2 key) · S · **R13 ✅**.
- [x] **A3 · Transform handles trên canvas cho video clip** — **R18 ✅**:
      bounding box +4 corner handle khi clip được chọn; kéo body = move
      (`x/y` canvas-px `/ textScale`), kéo góc = scale (distance/center,
      clamp 10–300 = Inspector). Fix `videoTransformStyle` từ screen-px →
      canvas-px (đồng bộ với text). **Rotate handle hoãn tới C7** (export
      chưa có rotate filter — cùng lý do Inspector slider còn ẩn) →
      **đã thêm ở R22 (§89)** ·
      `TmcutPreviewPlayer.vue`; §85.
- [x] **A4 · Drag & drop media → timeline** — **R17 ✅**: HTML5 DnD (MIME
      chung `~/utils/tmcut/dnd`) từ thẻ media → Tracks Canvas; drop
      `sec = (clientX − rect.left)/zoom` + snap 8px (C1), row hit-test
      h-14 → đúng type (sai type → track type đầu tiên); giữ click "+"
      · `editor.vue` + `TmcutTimeline.vue`.
- [x] **A5 · Thêm/xóa track** — **R16 ✅**: nút "+" góc TRACKS (dropdown
      Video/Text/Audio) + nút trash per header (thay menu chuột phải —
      trực quan hơn, disabled khi locked); core **C8** · i18n keys
      `tmcut.tracks.addTrack/addVideoTrack/addTextTrack/addAudioTrack/
      removeTrack`.
- [x] **A6 · Bật snap/magnet thật** (toggle toolbar `N` + drag/trim gọi
      core snap; xóa bản snap local tự viết trong TmcutTimelineClip) · M ·
      **R15 ✅** — help modal +1 dòng `snapMagnet`.
- [x] **A7 · Minimap timeline** — **R19 ✅**: thanh overview `h-4` cố định
      trên ruler (ngoài khung scroll): clip blocks cả dự án (màu theo
      loại track), khung viewport, playhead; click/drag pan viewport
      (căn giữa). State mirror `scrollLeft/width` qua scroll+zoom+resize ·
      `TmcutTimeline.vue` +1 key · §86.
- [x] **A8 · Rotation slider Inspector** — **R22 ✅**: `USlider`
      −180..180 trong Transform section (**video-only** — text rotation
      chưa export, chờ **R12**) + rotate handle trên selection box
      (stem+knob counter-scale, `atan2` direction khớp CSS/export) ·
      `TmcutInspector.vue` + `TmcutPreviewPlayer.vue` +1 key · §89.
      (Blocker C7 đã gỡ ở **R21 ✅**.)

### Phase B — Sức mạnh Timeline (P1)

- [x] **B1 · Keyframes UI**: nút ⏱ thêm keyframe cho scale/x/y/opacity/
      volume (core **C3** ✅ R23 — API eval/set/remove sẵn sàng), diamond
      marker trên clip, xóa keyframe · M —
      Inspector + Timeline + PreviewPlayer. *Render sau (R2).*
      **✅ R24 (§91)**: ⏱ toggle ở4 ô Transform + Volume (volume
      **video-only** — audio track chưa có preview engine), diamond
      %-duration trên clip, preview eval keyframes (video active +
      text overlay + volume), chip "Preview only" +3 key.
- [x] **B2 · Speed ramp / reverse**: tab Tốc độ thêm preset (0.5×/1×/2×/
      4×) + reverse toggle; duration normalize qua core **C4** · M.
      **✅ R26 (§93)**: +preset4.0x · `handleSpeedUpdate` → `withSpeed`
      (validate + sàn0.2s,1entry undo) · `USwitch` reverse
      (**text-gated** — text không có playback hướng) · preview reverse
      seek-driven (`mediaCurrentTime` nhánh `out − t*speed`, pause+seek
      như shuttle J).
- [x] **B3 · Transitions**: menu chuột phải clip → loại + duration;
      preview crossfade bằng 2 layer (fade-op) · M — core **C5**; export
      thật chờ **R3** (xfade) → nếu R3 chưa làm thì badge trung thực.
      **✅ R34 (§102)**: core `transitions.mjs` — overlap model (apply
      shift clip trái để 2 layer chồng thật, clear trả cut gốc) +9 test ·
      menu chuột phải `TmcutTimelineClip` (Teleport popover: 6 loại
      `KNOWN_TRANSITIONS` + preset 0.2/0.5/1/2s, live-validate
      `canApplyTransition`, lý do từ chối hiện inline, "None"enabled
      khi đã có transition) · preview crossfade 2 `<video>` (outgoing
      muted + per-type ramp: fade/dissolve opacity, wipe clip-path,
      slide translateX, zoom scale) · fix `v1MatchesV3` so
      `transitionIn` (clear từng bị skip) + `splitClip` strip
      `transitionIn` nửa sau + guard incoming-đã-kết-thúc · export
      badge trung thực · **video clips only** (text/audio omit —
      không preview được = dead control).
- [x] **B4 · Link/unlink A-V** (`linkId` DSL đã có; Ctrl+L) + group
      (core **C9**, Ctrl+G) · S. **✅ R30+R31 (§97–§98)**: core
      `groupClips`/`ungroupClips` + fix `v1MatchesV3` compare ·
      `toggleLinkSelection` (overlap → linkId chung, Ctrl+L toggle) ·
      Ctrl+G/Ctrl+Shift+G · **drag move theo nhóm**
      (`relatedOffsetsFor`) · help modal +2 mục · +10 keys.
- [x] **B5 · Marker UI**: gutter ruler + nút `M` thêm marker tại playhead
      (core `addMarker` đã có, **chưa có UI**),dblclick sửa nhãn, đổi
      màu · S. **✅ R27 (§94)**: `TmcutMarker` + `timeline.markers`
      (backfill migration) · helpers `addMarkerAt/updateMarker/
      removeMarkerById` (undo+save) · pin trên ruler (click seek,
      dblclick editor fixed: nhãn + 6 màu + trash) · phím `M` · snap
      nhận marker · help modal + mục `M` · +4 keys (parity 2403).
- [x] **B6 · Razor toàn track** (S khi chưa chọn clip = cắt tất cả clip
      dưới playhead) · S. **✅ R28 (§95)**: `handleSplit` fallback giờ
      razor mọi track không locked (snapshot loop, tránh cắt mảnh
      mới), toast `{count}` · help `desc.split` mô tả razor ·
      key `splitVideoAtPlayhead` → `razorSplitCount`.
- [x] **B7 · Trim by keyboard**: `Alt+[` / `Alt+]` cắt In/Out về playhead
      (core `trimClip` đã có) · S. **✅ R29 (§96)**: `trimSelectedEdgeAt`
      (guard trong clip + margin 0.1s → core không clamp) gọi
      `trimClip` qua `applyV3Edit` · nhánh Alt+[/] + toast · help modal
      `trimKeyboard` · +4 keys (parity 2407).
- [x] **B8 · Text typing coalesce undo** (core **C15**) · S. **✅ R32
      (§100)**: core `pushBatch`/`coalesce` · app
      `pushHistoryCoalesced` (800ms cùng key) → **toàn bộ Inspector
      giờ undo được** (trước: không có history) · ⏱/speed/fit = discrete
      push.
- [x] **B9 · Ripple insert khi thả clip đè** (core **C2**) · S. **✅ R33
      (§101)**: drop-đè + rippleMode → `insertClipRipple` qua bridge
      (`applyV3Edit` +skipHistory) · thả chỗ trống vẫn overlay ·
      toolbar **Close gaps** (core `closeGaps`, toast `{seconds}s`) ·
      +3 keys.

### Phase C — Text & Captions (P1–P2)

- [x] **C-1 · Bảng font thật** (list font system qua CSS
  `document.fonts`/registry; chọn + preview) · M — Text presets hiện 3 mẫu
  cố định.
  → **R52 ✅ (§120)**: addon `font-scanner` (`resources/fontmanager.node`,
  đã bundle) → IPC `listFonts` (preload allow-list) · `useTmcutFonts`
  dedupe 1 face/family (Regular-upright thắng, session single-flight) ·
  picker trong Inspector (desktop-only — web không IPC → ẩn, không
  dead control) · `handleFontUpdate` ghi cặp `fontFamily` (CSS preview) +
  `fontFile` (drawtext `fontfile=`) trong 1 entry undo · **core
  v1compat passthrough** cả 2 chiều + COMPARE_STRINGS (split/duplicate/
  paste clone giữ font — 3 tests mới → core 154/154) · path escaping
  dùng chung `filterPathArg` (R48).
- [x] **C-2 · Style cho text**: bold/italic/align/shadow/border/stroke
  (preview CSS; export qua `drawtext` options — compiler đã có
  `escapeDrawText` → mở rộng `borderw/shadowx/fontfile`) · M
  → **R53 ✅ (§121)**: model +`bold/italic/align/shadow/stroke` (core
  v1compat passthrough + COMPARE_FLAGS, undefined==false — file cũ
  không bị rewrite; 156/156) · **face matrix 4 quadrant/family**
  (`faceFileFor`/`resolveFace`) — drawtext không faux bold → bold/
  italic export trỏ face THẬT (arialbd/ariali FFmpeg-verified) ·
  align x-expr `0+x` / legacy `(w-text_w)/2+x` / `w-text_w-(x)` ·
  shadow/stroke append sau options cũ (flag tắt = byte-identical) ·
  metrics chung `textStyle.ts` (preview+export) · **sửa 2 lời nói dối
  preview**: `font-bold`/`drop-shadow-md` hardcode + anchor top-left
  ≠ export center (unify theo export) · `whitespace-pre-line` honor
  `\n` · shadow/stroke color cố định black (không picker, tối thiểu) ·
  i18n +7 → 2540.
- [x] **C-3 · Auto-captions**: nút "Tạo phụ đề" → Whisper transcript
  (đã có, Round 12 bắt được `transcript[]`) → core **C11** `cuesToCaptionClips`
  → text clips track riêng · M — deps: AI gateway `transcribe` (đã có),
  cách tách audio (ffmpeg `-vn` runtime)
  → **R54 ✅ (§122)**: button "Phụ đề AI" (sparkles, desktop-only, busy
  guard) → clip video dưới playhead · IPC `tmcut:extractAudio` (main:
  `-vn -ac 1 -ar 16000 -b:a 48k` → `cache/caption-<key>.mp3`, reuse theo
  cacheKey — FFmpeg-verified 3s→18KB mp3) · transcribe `verbose_json`
  → segments → `cuesToCaptionClips` (fromTicks = clip offset, rangeTicks
  clamp trong clip — không rò sang clip khác) → `addClipToTrack('text')`
  (ticksToSec boundary) · toast đếm dòng + lỗi trung thực · i18n +6 →
  2546. Whisper thật chờ API key gateway trên máy user · main+preload
  đổi → FULL RESTART.
- [x] **C-4 · Import/Export SRT** (core **C11** parse/serialize; file qua
  IPC dialog) · S → **R46 ✅ (§114)**: dropdown "SRT" trong timeline
  toolbar (sau +Audio, **desktop-only** — web không có dialog IPC →
  không render) · Import: `pickFile` → `readText` → `parseSrt` →
  `addClipToTrack('text')` per cue (offset = cue.start tuyệt đối,
  out = duration, defaults 42px/trắng) · Export: text clips → cues
  (end = offset + (out−in)/speed) → `serializeSrt` → `selectSaveFile`
  · toast đếm cue + lỗi riêng · i18n +8 → 2455.
- [x] **C-5 · Text animation in/out** (fade/slide/pop) · M → **R65 ✅ (§133)**:
  - `@tmcut-core` (`types/dsl.ts`, `src/v1compat.mjs`, `src/index.d.ts`, `test/v1compat.test.mjs`): kiểu `TmcutTextAnimationType` ('none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom-in' | 'zoom-out'), lưu trữ `animIn`, `animInDuration`, `animOut`, `animOutDuration` đồng bộ hai chiều qua v1/v3 bridge. 167/167 tests passing.
  - `compiler.ts`: FFmpeg filter `drawtext` tích hợp ramp alpha (`animAlphaExpr`), trượt ngang `animXExpr` (`slide-left`/`slide-right`), trượt dọc `animYExpr` (`slide-up`/`slide-down`) với cú pháp trích dẫn an toàn `x='...'`, `y='...'` bảo vệ dấu phẩy cho FFmpeg parser.
  - Preview Player (`TmcutPreviewPlayer.vue`): `textOverlayStyle` mô phỏng realtime alpha ramp, slide offsets và zoom scale (0.3 <-> 1.0) theo vị trí playhead.
  - Inspector (`TmcutInspector.vue`): Tab "Animation" (`i-lucide-wand-sparkles`) chuyên biệt cho text clips với Quick Presets (Fade, Slide, Pop, Reset), chọn loại animation In/Out và slider thời lượng (0.1–2.0s).
  - i18n: `tmcut.animation` đầy đủ EN & VI (2666 leaf keys, 0 missing, 0 duplicates).


### Phase D — Audio (P2) — HOÀN TẤT (D-1..D-4 ✅, D-5/D-6 blocked)

- [x] **D-1 · Fade in/out** (core **C12** + Inspector buttons + preview
  gain) · S · render **R5** → **R38 ✅ (§106)** phần core + UI + preview;
  phần export đã đóng ở **R5 ✅ (R45, §113)** — D-1 hoàn tất.
- [x] **D-2 · Volume keyframes** (C3 + C12 expression) · M → **R61 ✅ (§129)**:
  - `@tmcut-core`: `keyframeExpr` sinh biểu thức FFmpeg `volume='(${kfVol})/100':eval=frame` từ keyframes audio ticks với 5 hàm easing (`linear`, `ease-in`, `ease-out`, `ease-in-out`, `step`).
  - Preview Player (`TmcutPreviewPlayer.vue`): `evalKeyframe(clip, 'volume', localTicks)` kết hợp `gainAt` fade envelope điều chỉnh âm lượng video/audio real-time theo playhead.
  - Inspector (`TmcutInspector.vue`): nút đồng hồ keyframe âm lượng (`toggleKeyframe('volume')`) tại vị trí con trỏ playhead, tích hợp thanh trượt và chip trạng thái.
  - Timeline (`TmcutTimelineClip.vue`): hiển thị các điểm kim cương keyframe diamond trên track audio/video.
  - Compiler (`compiler.ts`): chuỗi âm thanh kết hợp song song cả volume keyframes và fade envelope `fadeFilter` trên bus audio.

- [x] **D-3 · Noise reduction**: exporter option `afftdn` / `anlmdn`
  (checkbox trung thực — chỉ hiện khi đã map trong compiler) · S
  → **R47 ✅ (§115)**: `CompileOptions.denoise` → **1 afftdn global**
  `afftdn=nr=12` trên bus cuối (audio-only: sau amix/trước range ·
  video: sau concat+amix, trước range trim — GIF không build audio
  stream → null check = mode gate) · checkbox "Giảm nhiễu" trong
  export modal (`v-if mode !== 'gif'`, icon `i-lucide-waves` — đã
  verify trong `@iconify-json/lucide`) · **export-only** (không có
  preview giảm nhiễu trên browser → không đặt chỗ nào khác) · test
  FFmpeg thật: tone sạch không đổi -21.1dB, chain+range 4.00s ✓ ·
  i18n +2 → 2457.
- [x] **D-4 · Ghi voiceover** (media bin nút mic → `getUserMedia` +
  `MediaRecorder` → blob → import asset; đã có pattern record?) · M —
  web+electron đều chạy được (mic permission)
  → **R55 ✅ (§123)**: `useTmcutRecorder` (mới) — mic button cạnh
  Import (icon `mic`/`square-stop` verified) · mime chain webm/opus →
  webm → mp4 · slice 250ms · elapsed mm:ss trên nút stop đỏ · release
  mic ngay khi stop + onUnmounted (không để mic nóng) · take < 0.5s
  discard TRƯỚC khi ghi file · desktop IPC `tmcut:saveRecording` →
  `recordings/voiceover-<ts>.webm` → `importFiles` reuse pipeline
  (FFmpeg verified webm/opus đọc trọn) · web → File →
  `importWebFiles` session-only · toast 4 nhánh (added/denied/
  discarded/failed) · i18n +6 → 2552. Mic thật chờ user test ·
  main+preload đổi → FULL RESTART.
- [ ] **D-5 · TTS (giọng đọc)**: **phụ thuộc** AI gateway **chưa có**
  endpoint speech (hiện chỉ chat + transcribe) → cần thêm
  `{base}/audio/speech` (OpenAI-compatible) trong `ai-gateway.cjs` · L ·
  đánh dấu blocked直到 gateway mở.
- [ ] **D-6 · Beat markers** (core **C17** — blocked backend).

### Phase E — Effects & Color (P2)

- [x] **E-1 · Adjust/Color grade** (brightness/contrast/saturation/
  temperature → FFmpeg `eq`/`colorbalance` + preview CSS filter) · M → **R63 ✅ (§131)**:
  tab Effects trong `TmcutInspector.vue` với sliders `eq-grade` (brightness/contrast/saturation) +
  mô phỏng CSS filter thời gian thực trong preview player + xuất video qua FFmpeg R61.
- [x] **E-2 · Filters**: blur, sharpen, vignette, grain (FFmpeg
  `gblur`, `unsharp`, `vignette`, `noise`) · M → **R63 ✅ (§131)**:
  hỗ trợ đầy đủ bộ lọc trong Inspector với thanh trượt cường độ, chọn kích thước hạt grain +
  radial gradient vignette overlay trên preview player.
- [x] **E-3 · Chroma key (xóa phông xanh)**: FFmpeg `chromakey` +
  slider similarity/blend; preview CSS approximation · M → **R63 ✅ (§131)**:
  bộ chọn màu phông hex/color picker + sliders similarity & blend + switch khử tràn màu spill.
- [x] **E-4 · LUT**: `lut3d` (.cube) — chọn file .cube · S (render sẵn
  có trong ffmpeg build) → **R48 ✅ (§116)**: `CompileOptions.lut3dPath`
  → `lut3d` trên bus footage SAU concat, **TRƯỚC drawtext** (title giữ
  màu gốc) + trước outScale · helper `lutFileFilter` — 2 tầng parse
  (filtergraph strip quotes khi split → option level cần `C\:` escape;
  verify 4 biến thể với FFmpeg: quotes-đơn + colon-escape pass,
  path space+comma+colon pass) · apostrophe path không escape được →
  **throw ở compiler + toast ở picker** (từ chối rõ ràng thay vì lỗi
  FFmpeg giữa chừng) · UI: row "LUT màu (.cube)" trong export modal
  (video+GIF, `v-if isDesktop` — web không có dialog → ẩn) ·
  **export-only** (browser không render 3D LUT tùy ý → không có
  preview, ghi rõ trong note) · i18n +5 → 2462.
- [x] **E-5 · Stabilizer**: `vidstabdetect` + `vidstabtransform` (2 pass,
  cần file trung gian — runtime Electron) · L → **R66 ✅ (§134)**:
  - `@tmcut-core` (`src/stabilize.mjs`, `src/index.d.ts`, `types/dsl.ts`, `test/stabilize.test.mjs`, `test/v1compat.test.mjs`): các hàm tạo arguments `buildVidstabDetectArgs` (Pass 1) và `buildVidstabTransformArgs` (Pass 2) với 3 preset chuẩn CapCut (`mild` smoothing 10, `medium` smoothing 20, `aggressive` smoothing 35) + path colon escaping `D\:/...` an toàn trong filter string. 172/172 tests passing.
  - Electron Controller (`tmcut.controller.cjs`, `preload.cjs`, `types/electron.ts`): cache `cache/stabilized/` và `cache/stabilized_trf/` với FNV-1a hash key `(path, mtime, size, level)`. Pass 1 trích xuất vector chuyển động camera vào `.trf`, Pass 2 làm mượt chuyển động xuất ra `.mp4`, tự động dọn dẹp file `.trf` tạm.
  - Inspector (`TmcutInspector.vue`): nhóm "Ổn định hình ảnh / Video Stabilizer" trong tab Video (`isDesktop`), switch bật/tắt, dropdown chọn mức độ, trạng thái xử lý/thành công, nút chạy xử lý một chạm.
  - Timeline & Preview Player (`TmcutTimelineClip.vue`, `TmcutPreviewPlayer.vue`): badge `STAB` màu lục bảo trên clip timeline và HUD player; trình phát preview tự động load footage đã được ổn định.
  - Compiler (`compiler.ts`): video export tự động đọc footage đã chống rung làm đầu vào render.
  - i18n: `tmcut.stabilize` đầy đủ EN & VI (2678 leaf keys, 0 missing, 0 duplicates).
- [ ] **E-6 · AI cutout (người/phông)**: cần model (rembg/ONNX) —
  **blocked** (dependency nặng) → giữ badge "Sắp ra mắt" · L.

### Phase F — Preview & Canvas (P1–P2)

- [x] **F-1 · Safe area presets** (core **C13**; overlay 90%/80% thay
  hardcode) · S → **R39 ✅ (§107)**: `safeAreaRects` centered fractions
  + `SAFE_AREA_PRESETS` 7 tỷ lệ · overlay preview dùng core rect ·
  HUD dropdown "Frame guide".
- [x] **F-2 · Canvas zoom controls** (fit/100%/± trong header player —
  design #2 có "100% Fit"; hiện auto-fit) · S → **R44 ✅ (§112)**:
  `canvasZoom` ref (`'fit' | 0.25..2`) — fit giữ nguyên layout cũ ·
  menu dropdown HUD (icon zoom, `Fit` + 6 step ± thay 2 nút rời) ·
  zoomed: stage cố định 40vh + `overflow-auto`, monitor `m-auto`
  (center khi vừa, thả top-left khi tràn — flex center cắt mất đầu
  khi scroll) · `monitorStageHeight` dùng chung cho fit constraint ·
  HUD + transport luôn pin · i18n +2 → 2447.
- [x] **F-3 · Mask / crop on canvas** (kéo khung crop trực tiếp —
  inspector đã có cropRect sliders) · M → **R67 ✅ (§135)**:
  - `@tmcut-core` (`src/canvas.mjs`, `src/v1compat.mjs`, `src/index.d.ts`, `test/canvas.test.mjs`, `test/v1compat.test.mjs`): thêm `CROP_RATIO_PRESETS` (Free, 16:9, 9:16, 1:1, 4:3, 3:4, 21:9), `clampCropRect` (ràng buộc tọa độ chuẩn hóa [0..1] với kích thước tối thiểu an toàn), `applyCropRatio` (tính toán khung crop theo tỷ lệ chuẩn aspect ratio nguồn), và `sameCropRect` trong `v1MatchesV3` (khắc phục lỗi nuốt thay đổi cropRect trên bridge v1/v3). 175/175 tests core PASS.
  - Preview Player (`TmcutPreviewPlayer.vue`): tích hợp chế độ crop chuyên biệt (`isCropActive`), chuyển video sang `objectFit: 'contain'` để hiển thị trọn vẹn footage gốc, 4 khối mặt nạ đen mờ (`bg-black/65`), khung tương tác crop với lưới 3x3 Rule-of-Thirds, 8 điểm kéo tay cầm (`nw`, `ne`, `sw`, `se`, `n`, `s`, `w`, `e`), và thanh công cụ nổi (floating toolbar) với các chip tỷ lệ một chạm, nút Reset và nút Xong. Hỗ trợ phím Escape thoát nhanh.
  - Inspector (`TmcutInspector.vue`): nút chuyển đổi "Chỉnh sửa trên Canvas / Xong" và nút "Đặt lại" đồng bộ 2 chiều tức thì với 4 slider số `cropRect` (`x`, `y`, `w`, `h`).
  - i18n: `tmcut.crop.*` 9 nhãn mô tả hoàn chỉnh, đồng bộ 2687 leaf keys tuyệt đối giữa EN và VI (0 duplicates, 0 missing).
- [x] **F-4 · Proxy preview**: core `buildProxyArgs` (options + libx264/aac)
  → IPC `tmcut:generateProxy` (cache `cache/proxies/`) + toggle "Proxy"
  trong HUD preview (`proxyPreview` ref, badge `PROXY`) + thẻ media library
  (huy hiệu `PXY`, nút tạo nhanh + nút tạo hàng loạt) · M (§132 R64).

### Phase G — Media & Runtime IPC (P1)

- [x] **G-1 · IPC `tmcut:extractFrame`** (main + preload + giới hạn
  timestamp; **full restart**) → thumbnail segment AutoCut (§78.6),
  filmstrip timeline thật, snapshot HUD · M. Core: **C14** plan.
  - **✅ R41 (§109) — 2/3 consumer**: IPC `tmcut:extractFrame` (main
    handler `extractFrameAt` — cache `cache/frames/`, key
    `(path, mtime, size, time, width)`, timestamp finite ≥ 0 + clamp
    vào duration khi probe được / cap 24h khi không; preload invoke +
    `types/electron.ts` `TmcutFrameResult`) · composable
    `useTmcutFrames` (`extractFrame` + `extractFrames` bounded
    concurrency 3, `available` flag ẩn control trên web) ·
    **AutoCut segment thumbnails** (§78.6 — mỗi segment 1 frame tại
    `segment.thumb` fallback midpoint, 224px, poster cũ làm fallback)
    · **snapshot HUD** (nút camera — frame tại media time của clip
    active, 1280px, toast trả path; ẩn khi không có IPC) · i18n +3 →
    **2444/2444** · **cần FULL RESTART** (main + preload).
  - **✅ R42 (§110) — filmstrip timeline thật**: consumer còn lại.
    `clipFilmstrip(src, in, out, count)` trong `useTmcutFrames` —
    core C14 `filmstripTimes` tính 8 timestamp theo range NGUỒN của
    clip (ticks → `ticksToSec` tại call site), extract 160px/帧 ·
    **global slot pool 3** (module-level — N clip mount đồng thời
    không spawn N×3 ffmpeg) · session cache `(src, in, out)` share
    copy/remount · `TmcutTimelineClip`: layer `<img>` row (flex-1
    slots, slot lỗi trong suốt → hiện strip asset phía sau),
    debounce 300ms khi trim + request-id bỏ kết quả cũ · content
    body lên `z-[1]` (trên strip auto-z, dưới diamonds z-5/handles
    z-10) · controller thêm `probeDurationCached` (batch frame không
    ffprobe lại cùng file) · fix R41: autocut thumb wrap `mediaUrl`
    (raw path không render được) · i18n giữ **2444/2444** ·
    **cần FULL RESTART**.
- [x] **G-2 · Media bin drag & drop file ngoài** (kéo file từ Explorer
  vào panel → import; web: DataTransfer file) · S → **R43 ✅ (§111)**:
  preload `webUtils.getPathForFile` (Electron 32+ bỏ `File.path`) +
  type `electronAPI.getPathForFile` · aside media làm drop zone
  (dragenter/over/leave/drop, depth counter + ring highlight; chỉ
  nhận `Files` type — DnD nội bộ asset không bị nhiễu) · desktop
  `importFiles(paths)` / web `importWebFiles(files)` · toast
  `dropNoMedia` khi mọi file bị lọc (không phải media) · i18n +1 →
  2445.
- [x] **G-3 · Album/folder trong media bin** (nhóm asset, tạo/sửa/xóa thư mục, kéo thả phân loại, lọc danh mục đa chiều) · M · P2 → **R68 ✅ (§136)**:
  - `@tmcut-core` (`src/folders.mjs`, `src/index.mjs`, `src/index.d.ts`, `types/dsl.ts`, `test/folders.test.mjs`): Pure core module quản lý thư mục media bin: `createFolder`, `renameFolder`, `updateFolderColor`, `removeFolder`, `getFolder`, `setAssetFolder`, `getAssetFolder`, `filterAssetsByFolder`, `getFolderCounts`. Hỗ trợ scoped folder theo từng project (`folderByProject`). 183/183 tests core passing.
  - Media State (`useTmcutMedia.ts`, `types/tmcut.ts`): Thêm reactive state `folders` (lưu trữ persistent `tmcut_folders_v1`), `selectedFolderId` ('all' | 'unassigned' | folderId), computed `projectFolders` và `folderCounts`. Các hàm `addFolder`, `editFolder`, `changeFolderColor`, `deleteFolder`, `moveAssetToFolder`. Tự động gán folder khi import asset mới.
  - Media Bin UI (`app/pages/tmcut/editor.vue`): Thanh Folder Bar với các pill cuộn ngang (Tất cả, Thư mục dự án với dot màu & badge số lượng & dropdown context menu, Chưa phân loại). Hỗ trợ kéo thả asset trực tiếp lên chip thư mục (`onFolderDrop`). Badge tag thư mục trên card asset khi xem "Tất cả", nút thao tác nhanh "Chuyển thư mục" trên hover actions. 3 modal: Tạo thư mục mới, Chỉnh sửa thư mục, và Chuyển thư mục asset.
  - i18n: `tmcut.folders.*` 22 leaf keys đầy đủ EN & VI (2709 leaf keys đồng bộ tuyệt đối giữa en.json và vi.json, 0 missing, 0 duplicates).
- [ ] **G-4 · Camera record / quay màn hình** — blocked (không backend
  ghi màn hình; ghi cam = getUserMedia D-4 pattern) · P3.

### Phase H — AI (P2–P3, luôn trung thực) — H-1/H-2 ✅, H-3/H-4/H-5 blocked

- [x] **H-1 · AutoCut v2 — "theo transcript"** (scoring thêm yếu tố từ vựng, nhận diện từ thừa ngập ngừng & từ khóa ưu tiên) · M → **R72 ✅ (§140)**:
  - `@tmcut-core` (`src/analysis.mjs`, `types/edl.ts`, `src/index.d.ts`, `test/analysis.test.mjs`): Pure module phân tích từ vựng `DEFAULT_FILLER_WORDS` (Việt & Anh), `detectFillerWords`, `analyzeTranscriptSegment`, `scoreSegments` nhận `transcript` text và options (`filterFillerWords`, `keywords`, `customFillerWords`), gán lý do `reason: 'filler-word'` (hạ điểm `* 0.4`) hoặc `reason: 'highlight'` (tăng điểm `+ 0.25`), lưu metadata `hasFillerWords`, `detectedFillers`, `isHighlight`, `matchedKeywords`. 194/194 tests core passing.
  - Composable (`useTmcutAutocut.ts`): Hỗ trợ `AutocutOptions`, tính toán thống kê tự động `fillerSegmentCount` và `highlightSegmentCount`.
  - AutoCut Wizard UI (`app/pages/tmcut/autocut.vue`): Bước 2 thêm Card thiết lập AutoCut v2 (Switch toggle lọc từ thừa + Input từ khóa ưu tiên); Bước 3 thêm nút thao tác nhanh "Bỏ chọn từ thừa" và "Chọn đoạn nổi bật", hiển thị badge trực quan trên từng Card phân cảnh (`fillerTag` màu vàng cam, `highlightTag` màu tím).
  - i18n: `tmcut.autocutV2.*` 13 leaf keys đầy đủ EN & VI (2795 leaf keys đồng bộ tuyệt đối giữa en.json và vi.json, 0 missing, 0 duplicates).
  - Tests: `test:autocut` 4/4 tests PASS; `test:core` 194/194 tests PASS.
- [x] **H-2 · AI script (ý tưởng → storyboard)**: panel generate →
  text clips nháp · M → **R71 ✅ (§139)**:
  - Utility thuần & models (`app/utils/tmcut/aiScript.ts`): kiểu dữ liệu
    `TmcutAiScript`, `TmcutAiScriptScene`, các kịch bản mẫu chất lượng cao
    `CURATED_SCRIPT_PRESETS` (TikTok Hook 30s, Tech Review 60s), chuyển đổi
    thời lượng `durationToSeconds`, xuất bản Markdown `exportScriptMarkdown`.
  - Composable (`app/composables/useTmcutAiScript.ts`): kết nối AI gateway
    (`useTmcutAi().complete` với system prompt storyboard chuyên nghiệp &
    JSON mode), tự động fallback sang preset gợi ý khi chưa cấu hình API key,
    tạo project mới từ kịch bản (`createProjectFromScript`), chèn text clips
    vào timeline (`insertScriptToCurrentTimeline`).
  - Giao diện Studio Modal (`app/components/tmcut/TmcutAiScriptModal.vue`):
    2 cột (Thiết lập chủ đề/nền tảng 9:16 & 16:9/thời lượng + Thẻ phân cảnh
    Storyboard chi tiết B-roll, lời thoại, chữ hiển thị), nút tạo dự án mới,
    chèn vào timeline, sao chép markdown.
  - Kích hoạt phím tắt `Alt+A` thật sự: nút công cụ Header Editor, listener
    toàn cục `Alt+A`, cập nhật `TmcutShortcutsModal.vue` sang badge hoạt động
    thật `badge: 'ai'`. Parity tuyệt đối 2782/2782 keys.
- [ ] **H-3 · Auto-reframe 9:16**: core đã có `reframeTransform`; thiếu
  detection subject (cần model) → v1 = manual preset ratio (đã có) · L.
- [ ] **H-4 · Smart tracking/mask (Alt+T)** — giữ badge "Sắp ra mắt"
  trong help modal (đang làm đúng) until model.
- [ ] **H-5 · AI voice** — blocked như D-5.

### Phase I — Export & Render (P1, nối architecture Phase 6)

- [x] **R1 · Speed & reverse trong compiler** (`setpts`/`asetpts`/
  `reverse`/`areverse` theo **C4**) · M — `compiler.ts`.
  **✅ R25 (§92)**: core C4 `retime.mjs` (5 API ticks +7 test → 101/101)
  · compiler retiming5 chuỗi audio+video · thử FFmpeg: **`areverse`
  phải đứng TRƯỚC `asetpts`** (đặt sau vô hiệu speed — đo1.0s vs0.52s);
  video thứ tự nào cũng byte-identical · harness e2e PASS3.5s
  (2s +1s +1s/speed2).
- [x] **R2 · Keyframes → expression** (scale/x/y/opacity/volume map
  expression FFmpeg theo **C3**) · L → **R60 ✅ (§128)**: helper
  `keyframeExpr` trong `tmcut-core` sinh biểu thức nội suy FFmpeg
  (`eval=frame`) từ ticks · hỗ trợ đủ 5 easings (`linear`, `ease-in`,
  `ease-out`, `ease-in-out`, `step`) + clamp 2 đầu · video scale
  (`scale=w=...:h=...:eval=frame`) + position (`overlay (W-w)/2+...`)
  + opacity (`geq` kênh alpha theo biến `T`) + audio `volume='...':eval=frame`
  + `drawtext` animated x/y/alpha · UI Inspector chuyển sang active badge
  (`i-lucide-sparkles` + `text-primary`) · 161/161 core tests PASS ·
  E2E FFmpeg dry-run PASS.
- [x] **R3 · Transitions → `xfade` + `acrossfade`** (theo **C5**; gộp
  chuỗi clip liền nhau) · L → **R59 ✅ (§127)**: map 6 transition
  (`fade`, `dissolve`, `wipeleft`, `wiperight`, `slideleft`, `zoomin`)
  thành chuỗi `xfade` + `acrossfade=d=...:c1=tri:c2=tri` · chuẩn hóa
  timebase `settb=1/${fps},fps=${fps}` triệt tiêu lỗi timebase mismatch
  của FFmpeg · tính cumulative offset chính xác theo running duration ·
  fallback an toàn sang hard cut `concat` khi clip không có transition ·
  hỗ trợ cả `compileAudioOnly` · UI `TmcutExportModal` đổi sang active
  confirmation badge (`i-lucide-sparkles`) · i18n parity 2573/2573 ·
  dry-run FFmpeg 6/6 test PASS.
- [x] **R4 · Effects graph** (map registry **C6** → filter chain, thứ tự
  ổn định: fit → effect → keyframe → text → zone-trim) · L → **R61 ✅ (§129)**:
  cập nhật `renderReady: true` cho 8 effects trong `EFFECT_REGISTRY` (`blur`,
  `sharpen`, `vignette`, `grain`, `chromakey`, `lut3d`, `stabilize`, `eq-grade`) ·
  cung cấp `buildFfmpegEffectFilters` trong `@tmcut/core` · tích hợp vào
  `compiler.ts` theo đúng pipeline (`fit → effects → setsar=1 → transform → opacity`) ·
  166/166 tests core PASS · dry-run FFmpeg 8/8 effects exit code 0.
- [x] **R5 · Fade → `volume` expression** (**C12**) · S → **R45 ✅
  (§113)**: helper `fadeFilter` trong `compiler.ts` — core
  `volumeExpr` (mốc A/D-B/D theo fade ticks đã clamp nửa duration)
  → `,volume='EXPR':eval=frame` · **`eval=frame` BẮT BUỘC** (volume
  filter default `eval=once` — expression đóng băng at init, fade
  không hiệu lực; test FFmpeg thật: -91dB silence / ramp
  -39.9→-21.1→-34.5)
  · 4 chuỗi audio (video-track ×2 path, BGM ×2) — BGM chèn fade
  TRƯỚC `adelay` (t phải là clip-local) · không fade → chuỗi byte-
  identical · volume tĩnh vẫn `volume=` riêng (hợp đồng core) ·
  keyframed volume chờ **R2**.
- [x] **R6 · Export form đầy đủ theo design #3**: bitrate options
  (CRF/MBps), format & codec selector (libx264/libx265/h264_qsv/
  h264_nvenc — detect HW thật), destination picker, advanced
  checklist · M → **R58 ✅ (§126)**: `TmcutExportModal.vue` đầy đủ theo
  mockup #3 · bitrate selector (22/32/45 Mbps + custom) · format & codec
  (MP4 H.264/H.265, MOV ProRes, WEBM VP9) · HW acceleration toggle +
  4 encoder profiles với probe HW thật (`detectGpuSupport`) · tách
  fileName & dirName với browse folder thật qua `pickFolder` · autoPreview
  qua `media://` protocol · i18n +18 keys (parity 2573/2573).
- [x] **R7 · Export queue** (hàng đợi nhiều tác vụ —
  `useToolTaskManager('ffmpeg')` đã có task system, thêm UI queue) · M → **R62 ✅ (§130)**:
  composable `useTmcutExportQueue.ts` quản lý hàng đợi xuất nền singleton · tự động
  chuyển giao tác vụ tuần tự không chặn UI · giao diện `TmcutExportQueueModal.vue` đầy đủ
  Start/Pause/Resume/Cancel/Retry/Clear · tích hợp nút "Thêm vào hàng đợi" trong modal xuất
  và nút "Hàng đợi xuất" kèm huy hiệu trên navbar editor · i18n parity 2717/2717 keys.
- [x] **R8 · Social presets** (TikTok 1080×1920 30fps, YouTube 1080p,
  Reels…) — chỉ chọn preset có thật của pipeline · S
  → **R51 ✅ (§119)**: row 3 chip trong export modal (video mode):
  `TikTok·Reels·Shorts 1080×1920` / `YouTube 1080p 1920×1080` /
  `Instagram 1:1 1080×1080` @30fps — **`presetFit` exact**: output =
  canvas×scale theo đúng công thức compiler `trunc(iw*s/2)*2` phải
  ra ĐÚNG target (output luôn chẵn → ±2px sẽ là nói dối) · sai
  aspect → chip **disabled + tooltip "cần canvas {ratio}"** (compiler
  scale, không reframe — không letterbox ngầm) · click = set
  `outScale = targetW/canvasW` (float bất kỳ — compiler nhận) +
  fps30 (bằng canvas fps → giữ "follow canvas") · chip sáng khi
  khớp ✓ · test 9 case (720p/4K/iPhone 750×1334 fit, sai aspect +
  canvas lẻ 1919 disabled) · i18n +5 → 2480.
- [x] **R9 · Refactor `compiler.ts` → `render/` graph** (architecture
  Phase 6) · L → **R70 ✅ (§138)**: Tách compiler monolithic (~893 lines)
  thành kiến trúc RenderGraph mô-đun hóa trong `app/utils/tmcut/render/`
  (`types.ts`, `graph.ts`, `text.ts`, `audio.ts`, `video.ts`, `encoder.ts`,
  `index.ts`) · Bảo toàn 100% logic FFmpeg phức tạp (keyframe expressions,
  xfade/acrossfade, LUT3D grading trước text, areverse trước asetpts, text
  animations & transparent canvas rotation, GIF palettegen) · `compiler.ts`
  thành facade re-export tương thích ngược 100% · Bổ sung test suite
  `test:render` (8/8 tests pass) · 191/191 core tests pass · ESLint 0 errors,
  Nuxt typecheck 0 errors.
- [x] **R10 · Video transform → export** — **R20 ✅**: `buildFfmpegTransform`
  (core `canvas.mjs`) — `color` bg + `overlay=x:y:shortest=1` (bg d =
  duration+2s headroom), identity → `null` giữ chain cũ nguyên vẹn;
  đơn vị canvas-px khớp preview từ R18. Thử nghiệm FFmpeg thật: `pad` bỏ
  qua offset âm + không crop được input lớn → phải dùng `overlay` (§87.2).
  Rotation vẫn chờ **C7**. Opacity còn preview-only → thêm **R11** · M —
  `compiler.ts`, tests core82/82, harness e2e PASS · §87.- [x] **R11 · Opacity → export** (video: blend với bg theo `opacity`;
  text: `drawtext alpha=…`) — preview, Inspector và canvas handles đã
  ghi model · S/M — `compiler.ts`
  → **R56 ✅ (§124)**: video `format=rgba,colorchannelmixer=aa={o}` +
  composite trên nền bgColor (có transform → fg gains alpha trên cặp
  bg+overlay sẵn có; không transform → build inline shape §87.2
  `color+overlay shortest=1, +2s headroom`) · text
  `fontcolor={color}@{o}` + shadow/border cùng @alpha (element-wide
  opacity của preview) · `opacityAlpha()` không float noise · 100% =
  byte-identical · GIF được · keyframed opacity chờ **R2** · FFmpeg
  thật kiểm chứng BLEND MATH: white@0.5 trên red → pixel fd807f ≈
  (ff8080) · i18n giữ 2552 (không có UI mới).
- [x] **R12 · Text rotation → export** (preview đã xoay text nhưng
  `drawtext` không có góc quay — cần render text ra ảnh rồi `rotate` +
  `overlay`) · M — `compiler.ts`; **A8 chỉ expose slider cho video**
  tới khi item này xong (§88.5)
  → **R57 ✅ (§125)**: `textOverlayChains` — rotation ≠ 0 → drawtext
  trên canvas trong suốt (`color=@0.0,format=rgba`) → `rotate
  (fillcolor=none)` → `overlay` với counter-translate **T = d − R(d)**
  (block quay quanh CHÍNH nó = semantics transform-origin của preview;
  đo bằng FFmpeg thật: góc dương = CW như CSS · map (dx,dy) →
  (dx·cos−dy·sin, dx·sin+dy·cos) · glyph bar đúng P(xOff,yOff)) ·
  align center ONLY — left/right cần text_w không qua được
  filtergraph → **throw loud** (modal toast i18n trước, R48 rule) ·
  rotation = 0 → chuỗi byte-identical · **A8 unlock**: slider rotation
  cho text trong Inspector · i18n +2 → 2554.

### Phase J — Home & Templates (P2)

- [x] **J-1 · Template engine & library** (JSON template layout text+media placeholder áp vào project thật, thư viện mẫu studio) · M → **R69 ✅ (§137)**:
  - `@tmcut-core` (`src/templates.mjs`, `src/index.mjs`, `src/index.d.ts`, `types/dsl.ts`, `test/templates.test.mjs`): Pure core module quản lý template: `BUILTIN_TEMPLATES` (6 templates chuẩn: TikTok Hook Intro 9:16, YouTube Cinematic Title 16:9, Split-Screen Duo 9:16, Instagram Square Promo 1:1, YouTube Outro 16:9, Minimal Vlog Lower-Third 16:9), `getBuiltinTemplates`, `getTemplateById`, `validateTemplate`, `filterTemplates`, `createTemplateFromTimeline`, `instantiateTemplate` (sinh id mới độc nhất, giữ đúng transforms/timing, áp dụng replacements), `replacePlaceholder`. 191/191 tests core passing.
  - Composable (`useTmcutTemplates.ts`, `types/tmcut.ts`): Quản lý builtin templates + user templates lưu `localStorage` (`tmcut_user_templates_v1`). Hỗ trợ tạo project mới từ template một chạm (`createProjectFromTemplate`), lưu timeline hiện tại thành custom template (`saveCurrentProjectAsTemplate`), xóa template cá nhân.
  - Template Library UI (`app/pages/tmcut/templates.vue`): Nâng cấp toàn diện thành Studio Template Library với bộ lọc danh mục (Tất cả, Mở đầu, Kết thúc, Màn hình ghép, Quảng cáo, Tối giản, Của tôi), bộ lọc tỷ lệ (9:16, 16:9, 1:1), ô tìm kiếm, card preview tỷ lệ thu nhỏ, thống kê slots video/text/tracks, nút "Dùng mẫu này" tạo ngay, modal tùy biến tiêu đề & placeholder text trước khi tạo, và nút "Lưu thành mẫu dự án" trên Editor.
  - i18n: `tmcut.templateLibrary.*` 37 leaf keys đầy đủ EN & VI (2749 leaf keys đồng bộ tuyệt đối giữa en.json và vi.json, 0 missing, 0 duplicates).

- [x] **J-2 · Theo design #1 còn lại**: Recently opened sort thật (đã
  sort?), pin project (lưu flag trong project file) · S
  → **R50 ✅ (§118)**: audit — sort `recent` hiện có = "Recently
  edited" theo `updated_at` ✓ trung thực (không đổi) · thêm field
  `lastOpenedAt` ghi trong `loadProject` qua
  `persistProjectMetadata` (**metadata write không bump
  `updated_at`** — nếu bump thì "Recently edited" thành "mở gần đây")
  + sort option "Mở gần đây" (`sortOpened`) · pin: `pinned?: boolean`
  trong project file + `togglePinProject` (cùng no-bump path) + menu
  card Pin/Unpin (icon `pin`/`pin-off` đã verify) + **pinned luôn
  lên đầu trong MỌI sort mode** + badge pin ở grid/list · mở project
  ghi `lastOpenedAt` SAU `detectRecovery` (không được che recovery
  file) · i18n +4 → 2475.
- [ ] **J-3 · Cloud widget/Share** — vẫn bỏ (không backend) · giữ §77.

### Phase K — Shortcut (song song, luôn cập nhật help modal) — HOÀN TẤT

- [x] Ctrl+scroll zoom (§79) · dòng help đã thêm (**A2** · R13).
- [x] K1: `N` magnet (A6) · K2: `M` marker (B5) · K3: `Ctrl+G`/
      `Ctrl+Shift+G` (B4) · K4: `Ctrl+L` link · K5: `Alt+[`/`Alt+]` trim
      (B7) · K6: `Ctrl+=`/`Ctrl+-` zoom · K7: `Home`/`End` nhảy đầu/cuối ·
      K8: `Shift+D` fade (D-1) — **mỗi shortcut thêm lúc feature thật
      hoạt động**, sửa help modal cùng round (trung thực)
      → **R49 ✅ (§117)**: audit — K1–K5 đã bound + có help từ trước
      (N/M/Ctrl+G/Ctrl+L/Alt+[]) · thêm **K6** (zoom ±10 step y hệt
      Ctrl+wheel, neo tại playhead, preventDefault chặn page-zoom
      Chromium) · **K7** (Home/End → seek + `scrollPlayheadIntoView`) ·
      **K8** Shift+D (`toggleFadeSelection` trong useTmcutProject —
      bật/tắt fade 0.5s CẢ 2 cạnh, clamp nửa clip, text track =
      no-op, hằng số chung `TMCUT_DEFAULT_FADE_SEC` với Inspector) ·
      help modal +3 item + `Ctrl+K` vào item Help · i18n +9 → 2471.

### Phase L — Architecture Phases 4–6 (nối docs, song song dần)

- [x] **Phase 4 Canvas Engine** (docs): ratios/custom ✓ · fit modes ✓ · background canvas (color/image/transparent — DSL + UI ✅ R89, export side R76) · safe area (C13/F1 ✓) · zoom preview (F2 ✓; PAN để ngỏ có chủ đích — R55: per-clip move/scale đủ, preview giữ nguyên frame) · smart reframe foundation (reframeTransform ✓).
- [x] **Phase 5 Preview Engine** ✅ (R90/§154): seam `useTmcutPreviewEngine` (`kind` / `capabilities` / `resolveSrc`) — Electron: media:// + proxy/stabilize (F-4); Web: blob/data/https qua `toURL`. Preview không gọi FFmpeg trên cả hai runtime (đúng từ F-4). `WebPreviewEngine` WebCodecs để ngỏ như engine tương lai implement cùng interface.
- [x] **Phase 6 Render**: R9 ✅ (= R70 — render graph + real-FFmpeg smoke).

---

## 5. Bảng phím tắt master (nguồn sự thật cho help modal)

### Đã implement (hiện trong help modal — truthful)

| Phím | Hành động | Nơi |
|---|---|---|
| Ctrl+Z · Ctrl+Shift+Z/Y | Undo · Redo | TmcutTimeline |
| Ctrl+C / Ctrl+V / Ctrl+D | Copy · Paste · Duplicate | TmcutTimeline |
| Ctrl+S · Ctrl+E · Ctrl+K | Save · Export · Shortcuts | TmcutTimeline |
| S | Split tại playhead | TmcutTimeline |
| Del / Backspace | Delete (theo rippleMode) | TmcutTimeline |
| R | Bật/tắt Ripple | TmcutTimeline |
| I · O | Đặt In/Out render zone | TmcutTimeline |
| ? / F1 | Mở help | Timeline + header |
| Space | Play/Pause | TmcutPreviewPlayer |
| ← / → (Shift = 5 frame) | Step frame | TmcutPreviewPlayer |
| J / K / L | Shuttle về/trừ/tiến | TmcutPreviewPlayer |
| **Ctrl + Cuộn chuột** | **Zoom timeline (anchor con trỏ)** | **TmcutTimeline (§79)** |
| N · M | Bật/tắt magnet · Thêm marker | TmcutTimeline (§117) |
| Ctrl+G / Ctrl+Shift+G | Group · Ungroup | TmcutTimeline (§117) |
| Ctrl+L | Link / Unlink | TmcutTimeline (§117) |
| Alt+[ / Alt+] | Trim cạnh về playhead | TmcutTimeline (§117) |
| Ctrl+= / Ctrl+- | Zoom ±10% (anchor playhead) | TmcutTimeline (§117) |
| Home / End | Nhảy đầu/cuối + scroll playhead vào view | TmcutTimeline (§117) |
| Shift+D | Bật/tắt fade 0.5s hai cạnh clip chọn | TmcutTimeline (§117) |
| F5 | Reload app (main) | electron/main.cjs |
| Ctrl+Shift+I | DevTools (main) | electron/main.cjs |
| Alt+A | AI Scriptwriter & Storyboard | Editor + TmcutAiScriptModal (§139) |
| Alt+T | Smart mask & tracking (badge "Sắp ra mắt") | Help modal planned |

### Dự kiến thêm (chỉ khi feature thật — sửa help modal cùng round)

Đã hết: K1–K8 đều implement × help modal (R49/§117) + Alt+A (R71/§139). Chỉ còn
`Alt+T` (Smart mask & tracking — chờ model).

---

## 6. Checklist theo dõi tổng hợp

```text
[x] Mockup #1–#5 (Rounds 8–12)
[x] F5-only reload · Ctrl+scroll zoom · review fixes (§79)   ← chưa commit
[x] Phase A — Design #2 còn thiếu … A1 ✅ A2 ✅ A3 ✅ A4 ✅ A5 ✅ A6 ✅ A7 ✅ A8 ✅ — HOÀN TẤT
[x] Phase B  — Timeline power (keyframe/speed/trans/link/marker) — B1 ✅ (R24) · B2 ✅ (R26) · B3 ✅ (R34) · B4 ✅ (R31) · B5 ✅ (R27) · B6 ✅ (R28) · B7 ✅ (R29) · B8 ✅ (R32) · B9 ✅ (R33) — HOÀN TẤT
[x] Phase C  — Text & Captions — C-1 ✅ (R41) · C-2 ✅ (R42) · C-3 ✅ (R44) · C-4 ✅ (R46) · C-5 ✅ (R65) — HOÀN TẤT
[x] Phase D  — Audio — D-1 ✅ (R38/R45) · D-2 ✅ (R61) · D-3 ✅ (R47) · D-4 ✅ (R55) · D-5,D-6 (blocked) — HOÀN TẤT
[x] Phase E  — Effects & Color — E-1 ✅ (R63) · E-2 ✅ (R63) · E-3 ✅ (R63) · E-4 ✅ (R48) · E-5 ✅ (R66) · E-6 (blocked) — HOÀN TẤT
[x] Phase F  — Preview & Canvas — F-1 ✅ (R53) · F-2 ✅ (R54) · F-3 ✅ (R55) · F-4 ✅ (R64) — HOÀN TẤT
[x] Phase G  — Media & IPC — G-1 ✅ (R41/R42) · G-2 ✅ (R43) · G-3 ✅ (R68) · G-4 (blocked) — HOÀN TẤT
[x] Phase H  — AI — H-1 ✅ (R72) · H-2 ✅ (R71) · H-3..H-5 (blocked)
[x] Phase I  — Export & Render — R1 ✅ (R25) · R2 ✅ (R60) · R3 ✅ (R59) · R4 ✅ (R61) · R5 ✅ (R45) · R6 ✅ (R58) · R7 ✅ (R62) · R8 ✅ (R51) · R9 ✅ (R70) · R10 ✅ (R20) · R11 ✅ (R56) · R12 ✅ (R57) — HOÀN TẤT
[x] Phase J  — Home & Templates — J-1 ✅ (R69) · J-2 ✅ (R50) · J-3 (blocked) — HOÀN TẤT
[x] Phase K  — Shortcuts (K1..K8) — K1–K8 ✅ (R49/§117) + Alt+A ✅ (R71/§139)
[x] Phase L  — Architecture Phases 4–6 ✅ HOÀN TẤT — Phase 4 ✅ (R89; PAN để ngỏ có chủ đích theo R55) · Phase 5 ✅ (R90: engine seam) · Phase 6 ✅ (R9=R70) · Core C17 blocked (needs backend)
[x] Core Phase 1–3 (66 tests)
[x] Core C0 (R14) · C1 (R15) · C2 (R33) · C3 (R23) · C4 (R25) · C5 (R34) · C6 (R35) · C7 (R21) · C8 (R16) · C9 (R30) · C10 (R36) · C11 (R37) · C12 (R38) · C13 (R39) · C14 (R40) · C15 (R32) · C16 (R78–R88) ✅ · C17 (blocked — backend) · Core C18 ✅ (R72/§140)

> **Round log summary:**
> - **R73** (§141): P0 security (path traversal + OOM), export queue persist, ESLint clean (190→0), fontmanager.node pack fix.
> - **R74** (§142): v1compat data-loss fixes (reverse, effects[], keyframes[], track flags), KEYFRAME_EASINGS export, lint:core 0 errors (first time since R62), 198/198 core tests.
> - **R75** (§143): Phase 4 Canvas Engine — buildBackgroundSource() for image/transparent background, 7 new tests, 205/205 core tests.
> - **R76** (§144): Render pipeline integration — `buildBackgroundSource()` descriptors wired into base layer + alpha codec (yuva420p), image looping input, transparent exports; 11 render tests (3 new); all gates green.
> - **R77** (§145): Per-clip transform over shared canvas background — `buildFfmpegTransform` `bgInput` support, shared `[v_bg]` reuse for image backgrounds, headroom trim; 12 render tests; all gates green.
> - **R78** (§146): C16-R1 (sub-round 1/3) — app model rational fps: `TmcutCanvas.fps: FrameRate` (DSL v3), app `normalizeCanvas` → core version, `canvasFpsValue()` accessor, migration of legacy number fps on open, all UI/render consumers migrated; all gates green. NOTE: Architecture doc §129–§145 reconstructed from this Roadmap after a truncating `write` incident (user restored base doc from backup).
> - **R79** (§147): C16-R2 slice 1 — render canonical clip model `RenderClip` + `toRenderClip()` single mapping seam (video/audio/text compile off views, core expr builders keep `raw`); fixed 3 real-FFmpeg graph bugs on image backgrounds (bare relabel, `[label],filter` empty-filter parse, overlay size negotiation vs concat) with `[v_bg]trim` + size-lock; new opt-in real-FFmpeg smoke spec 3/3; render suite 12/12; typecheck/lint 0.
> - **R80** (§148): C16-R2 slice 2 — timeline read/write via `clipTime` accessors; single derivation point for clip geometry (duration/start/end/media time). `useTmcutPlayback`, `useTmcutProject` migrated (totalDuration, addClip offset/collision, gap detection, split/trim/link); render suite unchanged 12/12; typecheck/lint 0.
> - **R81** (§149): C16-R2 slice 3 — UI accessor centralisation (Inspector `maxFadeSec`, TimelineClip `duration/left`). ~~retire `v1compat` per-edit; `applyV3Edit` works directly on v3~~ — **CORRECTED in §150.2: that retirement never happened**; `applyV3Edit` still runs `v1TracksToV3 → op → syncV3Result` per edit.
> - **R82–R85** (§150): **REVERTED** — a partially-done store flip to ticks (read side flipped, write/render/bridge side not) left the app broken in 5 verified ways (missing `secToTicks` export from `clipTime` → white-screen editor; double ×120000 conversion; `toRenderClip` feeding ticks into `trim=`; `v1ClipToV3` re-converting ticks; `< 1_000_000` seconds/ticks heuristic in migration). No gate caught it because `tsc` cannot see a wrong unit.
> - **R86** (§150): revert `app/` + `docs/` to the last consistent state (R81: seconds store + `clipTime`/`RenderClip` seams), re-apply R80's accessors that had never been committed (playback + project centralisation, Inspector `maxFadeSec`), and add the missing guard: `tests/unit/tmcut_time_domain.spec.ts` pins the unit of every seconds↔ticks boundary (6 checks; proven to fail on the reverted broken semantics). C16-R3 must be ONE atomic round — see §150.4. Gates: vue-tsc 0 · lint 0 · render 12/12 · FFmpeg smoke 3/3 · time-domain 6/6 · i18n 2795/2795.
> - **R87** (§151): **the typecheck gate was FAKE** — root `tsconfig.json` is solution-style (`files:[]` + references), so every `tsc/vue-tsc -p tsconfig.json` run since R72 exited 0 without checking a single file. Proven by planting a deliberate type error: only `nuxt typecheck` caught it. Fixed all **18 latent type errors** the fake gate had been hiding (missing core type re-exports `TmcutTextAnimationType`/`TmcutStabilizeLevel`/`TmcutStabilizeStatus`, missing `FrameRate`/`canvasFpsValue` imports, 4 malformed `Pick<T,'a','b'>` in clipTime, canvas fps rational vs number in editor.vue, core template d.ts claiming v3 while the runtime reads host-shaped items → loose `TmcutTemplateTrack`, `backgroundStreamLabel` null vs undefined). Added the missing behavioural layer: Node-importable store harness + `tmcut_store_behaviour.spec.ts` (13 checks over split/trim/ripple/undo/transition/fade/save-load; replaying R85's store against it fails instantly — surfacing defect #7 of R82–R85: `addClipToTrack` referenced an undefined `outPoint`). New `pnpm test:store`. Real gates: nuxt typecheck 0 · core 20/20 · lint 0 · time-domain 6/6 · store 13/13 · render 12/12 · smoke 3/3 · i18n 2795/2795.
```
> - **R88** (§152): **C16-R3 — THE FLIP LANDED.** Store `in/out/offset` are integer TICKS now (one atomic round per §150.4, nothing in between): schema 3 + one-time ×120000 migration stamped by `schemaVersion` only (no magnitude heuristic anywhere); user-templates key bumped `_v1`→`_v2` with the same one-time rule; core v1compat split into a SECONDS flavor (file migration only) and a TICKS flavor (`ticksTracksToV3`/`syncTicksResult` — identity on time fields, pinned apart by new core tests); `clipTime.ts` now the unit oracle (ticks math + byte-compatible seconds API); `fadeFilter`/preview `gainAt` hand core the v3 shape `{timeline:{duration}}` so the legacy seconds branch never sees ticks; `closeProjectGaps` returns ticks; Inspector/drag/trim/snap/SRT/filmstrip convert exactly once; `toRenderClip` decodes — every FFmpeg string byte-identical (render 12/12, real-FFmpeg smoke 3/3). Branded `Ticks` type deliberately dropped (§152.3). Gates: nuxt prepare+typecheck 0 · core 20/20 files · lint 0/0 · time-domain 7/7 (rewritten) · store 14/14 (rewritten, incl. migrate-once + no-double-scale) · render 12+len · ai 3/3 · i18n 2795/2795.
> - **R89** (§153): Canvas Workbench final gap — background IMAGE picker in the Canvas menu (desktop absolute path via pickFile, web session blob; preview paints it cover-centered through resolveMediaSrc, matching the R76 export composite). Phase 4 ticked (PAN intentionally open per R55), Phase 6 ticked (R9=R70). Gates: typecheck 0 · lint 0 · render 12/12 · store 14/14 · i18n 2797/2797.
> - **R90** (§154): Phase 5 done as a BOUNDARY — player media decisions behind `useTmcutPreviewEngine` (`kind`/`capabilities`/`resolveSrc`); electron keeps the proxy-aware `resolveMediaSrc`, web resolves blob/data/https through `toURL` (URLs identical to the pre-seam behaviour on both runtimes). Proxy toggle asks capabilities now, not `isDesktop`. Phase 5 ticked; the WebCodecs canvas compositor stays a named follow-up implementing the same interface. Gates: typecheck 0 · lint 0 · store 14/14 · time-domain 7/7 · render 12/12.
> - **R91** (§155): QA round — new `tmcut_templates.spec.ts` (4 checks, `pnpm test:templates`): seconds-era templates migrate to ticks EXACTLY once, save/instantiate round-trip keeps integer ticks + durationMs, delete persists. It caught a REAL defect on first run: `createProjectFromTemplate` wrote canvas/timeline on the RAW object returned by `createProject()` — Vue never tracked it, `totalDuration` kept the stale 5s floor and every template-created project persisted a wrong `durationMs`. Fixed to write through the ref. Added `test:smoke` script. Gates: templates 4/4, store 14/14, autocut 4/4.
> - **R92** (§156): follow-up to the raw-write audit — home quick presets + template-preset strip patched `.canvas` on the RAW object after `createProject()` and never re-saved, so the editor's `loadProject` (storage-first) opened every preset project with the default 1920x1080 canvas. `createProject(name, canvas?)` now takes the canvas at creation (first save carries it); preset pages pass it in. New store check pins the mirror contents (15/15). Rule: post-creation project mutations go through store actions or creation args, never the raw object.
> - **R93** (§157): two never-before-run gates — `nuxt build` passes CLEAN post-R88 (32.5 MB out; bundler resolves the whole graph incl. the `@tmcut-core` symlink — typecheck alone never proved that), and the tmcut lint partition (components/composables/pages/utils/tests) is now 0/0: its only offender was `TmcutAiScriptModal.vue` template formatting, fixed by `eslint --fix` (attribute re-wrapping only). Full-repo lint stays a pre-existing ~4.1k baseline, out of scope. Gates: build 0 · partition lint 0 · typecheck 0 · 6 specs green.
> - **R94** (§158): QA round — new `tmcut_history.spec.ts` (7 checks, `pnpm test:history`) pins B8 coalescing behaviour (same-key burst = ONE undo, different key = new entry, restore breaks the burst, edit invalidates redo) and caught a REAL defect: the undo/redo stacks are module-level and snapshots carry no project id, so after switching projects Ctrl+Z transplanted the PREVIOUS project's timeline+canvas into the open one (and autosaved it). `resetHistory()` now runs in `loadProject`, `createProject`, `duplicateAsProject`. Gates: history 7/7, store 15/15, typecheck 0, lint 0.
> - **R95** (§159): QA round — new `tmcut_save_lifecycle.spec.ts` (5 checks, `pnpm test:save`, raw-timer spy on the fixed 2000ms debounce) pinned the disk-save lifecycle and forced two defects: project switches (`loadProject`/`createProject`/`duplicateAsProject`) silently DROPPED the outgoing project's pending 2s autosave, and deleting the CURRENT project left its timer armed so the late fire RESURRECTED the deleted files. Fix: flush before every project swap; delete clears the timer + resets `saveStatus`. Gates: save 5/5, history 7/7, store 15/15, typecheck 0, lint 0.
> - **R96** (§160): QA round — new `tmcut_ripple.spec.ts` (5 checks, `pnpm test:ripple`) pins ripple-mode insert behaviour: OFF = overlay (no shift), ON + collision = core `insertClipRipple` push-later-clips, ON + empty gap = overlay, locked target falls back to overlay (no silent loss), and ripple is track-scoped. Gates: ripple 5/5, save 5/5, history 7/7, store 15/15, typecheck 0, lint 0.
> - **R97** (§161): QA round — new `tmcut_markers.spec.ts` (7 checks, `pnpm test:markers`) pins the B5 marker/snap seam end-to-end: add/update/remove are all one undo entry, markers persist via the localStorage mirror and round-trip on `loadProject`; `snapTimeSec` correctly considers clip starts/ends, zero, playhead and markers, threshold & ignoreIds work, and the store never bridges seconds into the snap math. No defect found; behaviour locked.
> - **R98** (§162): QA round — new `tmcut_transitions.spec.ts` (5 checks, `pnpm test:transitions`) pins the B3/C5 transition seam: `checkClipTransition` validates before history, `applyClipTransition` shifts the clip left by duration and is undoable, `clearClipTransition` restores the cut, duration exceeds neighbor → refusal, and `timelineTransitionCount` reflects the live count. No defect found; behaviour locked.
> - **R99** (§163): QA round — new `tmcut_split_trim.spec.ts` (6 checks, `pnpm test:split-trim`) pins split/trim/close-gaps: `splitClip` respects 0.1s margin, creates two pieces with correct in/out/offset and drops `transitionIn` on the tail; refuses edge splits; `trimSelectedEdgeAt` trims the selected edge with margin guard and keeps durations >0; `closeProjectGaps` pre-scans for gaps, routes to core `closeGaps` and returns closed TICKS, no-op when already tight; combined ops keep all ticks integer and no negative durations. Gates: split-trim 6/6, transitions 5/5, markers 7/7, typecheck 0, lint 0.
> - **R100** (§164): consolidation — `pnpm test:tmcut` (`tests/unit/run-all.mts`, one process per spec, `--smoke` opts into FFmpeg renders) is now the single gate ritual; its FIRST run caught `tmcut_phase2.spec.ts` silently broken since R88 (asserted bare-number fps against C16's rational FrameRate — the spec was wired into no script, so it rotted red for ~12 rounds). Fixed to the real contract. Full gate: 14/14 specs + smoke 3/3 + core 210/210 + core tsc/eslint 0 + boundaries PASS + i18n parity 2797/2797. Lesson: a spec nobody runs is a spec that lies.
> - **R101** (§165): QA round — new `tmcut_groups.spec.ts` (6 checks, `pnpm test:groups`) pins B4/C9 at the store layer: overlap-based cross-track linking with toggle-off, locked/no-selection honesty (`'none'`), group of the EXPANDED selection (lone clip fails honestly, linked pair reaches 2), ungroup + no-op honesty, `relatedOffsetsFor` returns relatives in integer STORE TICKS excluding the dragged clip. No defect found. Runner now 15/15.
> - **R102** (§166): QA round — new `tmcut_projects_lifecycle.spec.ts` (6 checks, `pnpm test:projects`) pins the web-survival rule (J-2) for dashboard mutations and caught a real defect: renaming a NON-open project never mirrored to localStorage (web reload reverted the name), now it does; `duplicateProject` additionally mirrors the clone (index/reload correct immediately). Pin without `updated_at` bump and normalized-path relink verified honest. Runner 16/16.
> - **R103** (§167): QA round — new `tmcut_tracks.spec.ts` (7 checks, `pnpm test:tracks`) pins the daily-use seams: eye/lock/mute are view state (saved, NOT undoable); locked tracks refuse ripple delete AND track removal with no history touch; A5 add/remove route through `applyV3Edit` (undo restores a removed track WITH its clips, selection clears with its killed clip); `switchCanvas` keeps the timeline and reframes manual offsets (strong undo proof via clip-removal/redo); `duplicateAsProject` clones to the preset ratio, source file untouched, clone mirror persisted, clone history empty. No defect found. Runner 17/17.
> - **R104** (§168): QA round — new `tmcut_copy_paste.spec.ts` (8 checks, `pnpm test:copy-paste`) pins C15: expanded copy with baseStart, offset-preserving paste (ONE undo entry, selects last), duplicate drops linkIds + fresh groupIds (selects first), portable module-level clipboard surviving a project switch (paste lands in the CURRENT project, source file untouched). Defect fixed: refused paste/duplicate (all target tracks locked) had pushed phantom undo entries via `applyV3Edit` — both now pre-run the op on the throwaway v3 copy and open history only when something lands (R99/R103 refusal rule). Runner 18/18.
> - **R105** (§169): QA round — new `tmcut_recovery.spec.ts` (7 checks, `pnpm test:recovery`) drives the store IPC seam with a fake `window.electronAPI.tmcut`: none / suggest / force verdicts, apply / dismiss, snapshot list-save-delete round-trip with plain-copy payloads, web no-ops. Defect fixed: `loadProject` ran `detectRecovery` only after a SUCCESSFUL disk read — the crash case lacking a project file (only the recovery or the localStorage mirror present) skipped it, so the force verdict never fired; detection now runs on every load path. Runner 19/19.
> - **R106** (§170): QA round — new `tmcut_dashboard.spec.ts` (5 checks, `pnpm test:dashboard`) pins `deleteProject` (current: mirror + memory + IPC + timer neutralized; other: targeted delete leaves current untouched) and `refreshProjects` (unknown added, newer disk replaces, older disk rejected, open project NEVER overwritten, web no-op). Defect fixed: `createProject` never cleared `selectedClipId` or `pendingRecovery`, leaking alien ids into the new project; both now cleared alongside history and disk flush. Runner 20/20.
> - **R107** (§171): closing battery at R106 state — test:tmcut --smoke 21/21 (incl. 3 real-FFmpeg renders), core 210/210, core tsc/eslint 0, boundaries PASS, nuxt typecheck 0, lint 0, nuxt build 0, i18n parity 2797/2797, core 3885ba9. Chain total since R91: 13 new specs, 8 product defects fixed, 1 rotted spec resurrected.
> - **R108** (§172): dead code — the exported `setupAutosave()` 3-second debouncer was never called by anything (the real autosave is `scheduleDiskSave` from `saveProject`, following the R95 discipline). Left unwired it was a phantom second timer holding the store; left wired it would have re-introduced the R95 bug class verbatim. Removed. The module-level state audit closes at four members: the undo/redo stacks (R94), the disk timer (R95), the clipboard (portable by design, R104) — nothing else. Runner 20/20.
> - **R109** (§173): final store-seam coverage — new `tmcut_ripple2.spec.ts` (8 checks, `pnpm test:ripple2`) pins `rippleDeleteSelected` (same-track default vs acrossTracks A/V shift, locked tracks never shift, locked selection refused with NO history entry), `restoreSnapshot` (reads by {id,ts}, migrates, mirrors WITHOUT resetting history — same project id, so undo after restore walks back the user's own edits; web no-op), `setCanvasBackground` normalization + mirror, `init()` boot-scan of `tmcut_project_*` localStorage keys (dedup, corrupt skipped). Spec lesson pinned: undo() swaps the project container, so pre-undo object refs go stale — re-read via accessors. Runner 21/21.
> - **R110** (§174): BUGFIX (user-reported: every Electron import painted the amber "unreadable" tile) — all media IPC handlers were gated by `isPathSafe()`, a whitelist of userData + resources ONLY; real videos live anywhere on disk, so `analyzeAsset` answered ok:false before even stating them and the store honestly mapped that to `missing`. Replaced with structural `isUserMediaPath()` (non-empty, absolute, canonicalized; tolerates the forward-slash store form and UNC shares). New `tmcut_import_path.spec.ts` (`pnpm test:importpath`, 5 checks) pins the pass/refuse matrix; runner 22/22.
> - **R111** (§175): studio LIGHT MODE (user-reported: light mode left the editor fully dark) — the studio hardcoded dark-palette Tailwind tokens; Nuxt UI v4 mode tokens exist but plain `neutral-*` classes bypass them. Scripted transform over the 10 studio files pairs every dark-palette utility with its light twin (`light dark:dark` pattern, opacity modifiers preserved), flips light-shade text, flips `text-white` only away from dark-surface elements; video viewport canvas deliberately stays dark in BOTH modes (grading matte). Two repair passes collapsed transform collateral (`dark::` artifacts, duplicate dark-scoped utilities). 493 pairings; runner 22/22, TC 0, lint 0, build 0.
> - **R112** (§176): FX LIBRARY PANEL + full inspector tabs (user-reported: the More tab had no effect categories; the right form lacked tabs) — TmcutFxLibrary browses Effects/Transitions/Filters entirely from the core registries (EFFECT_REGISTRY minus lut3d/stabilize, KNOWN_TRANSITIONS, the five lut3d presets with swatch tiles); effects/filters toggle on the selected clip, transitions go through the store validator with core-reason toasts, all pure math in app/utils/tmcut/fxLibrary.ts + 7-check spec. Inspector: tab model video→visual rename, VIDEO clips now get Visual/Audio/Speed/Animation/Effects; the new media Animation tab writes Fade/Fade In/Fade Out/Zoom In/Zoom Out presets as ordinary opacity/scale keyframes (edge clamp = half clip, channel-scoped replace). 23/23 runner, lint 0, i18n 2818/2818, TC 0, build 0.
> - **R113** (§177): inspector polish round (▷ user-reported) — (1) the tab strip was a flex row sized for three short labels; five video tabs with Vietnamese labels overflowed the 288px panel ("broken form") — now a tab-count-aware 3/2-column grid with truncated labels, wrapping to a tidy second line; (2) the toolbar AI Script button (and Alt+A) silently did nothing: TmcutAiScriptModal still used the Nuxt UI v3 modelValue contract while v4 UModal is driven by open/v-model:open — converted to the same defineModel('open') pattern every other studio modal uses, editor mount + all close paths flipped. 23/23 runner, lint 0, TC 0, build 0.
> - **R114** (§178): keyframe honesty round (▷ user-reported) — keyframe chips and tooltips now state explicitly that scale/x/y/opacity/volume are rendered by the desktop FFmpeg pipeline (video.ts/text.ts/audio.ts), not "preview-only" in Electron; web build gets an explicit preview-only hint. Docs §178 + i18n update. 23/23 runner, lint 0, TC 0, build 0.
> - **R115** (§179): color-grade accordion + project clips hover fix (▷ user-reported) — the Visual tab now carries a Color Grade block (Brightness/Contrast/Saturation) that lazily creates the core `eq-grade` effect on first touch and patches only the touched param (slider bursts coalesce via pushHistoryCoalesced); the "Video Clips in Project" sidebar rows no longer shift on hover — duration stays visible, action buttons fade in. 23/23 runner, lint 0, TC 0, build 0, i18n 2825/2825.
> - **R116** (§180): blend mode per clip (mock private/tmcut/2) — store field `blend` (normal/screen/overlay/multiply); the desktop render pipeline composites non-normal modes with FFmpeg 2-input `blend=all_mode=…` (normal keeps the byte-identical overlay chain), the preview mirrors it with CSS `mix-blend-mode`, and the inspector Visual tab gains a Blend Mode dropdown (video clips only). Also re-landed the project-clips hover fix (duration pinned far right, buttons fade in OVER it on hover) after the R115 commit accidentally reformatted editor.vue. 23/23 runner, lint 0, TC 0, build 0, i18n 2830/2830.
> - **R117** (§181): color temperature end-to-end (mock Accordion 3) — core `eq-grade` gained a `temp` param (b1b56b5, 210/210), export maps it to `colorbalance=rs=r:bs=-r` clamped [−1,1] (zero emits nothing — byte-identical legacy projects), the inspector Temp slider reads the mock signed readout ("−12 (Lạnh)"), preview approximates with sepia/hue-rotate(180deg); grade sliders now read registry defaults via effectDefaultParams — no hand-copied numbers. Also folded in: the deferred R116 blend-mode app commit + the project-clips hover re-landing on the lint-clean editor.vue. core 210/210, runner 23/23, lint 0, TC 0, build 0, i18n 2833/2833.
> - **R118** (§182): preview quality selector (Full Res / 1/2 Res / 1/4 Res / Proxy 720p) matching mock player HUD — monitor box scales via quality factor, no re-encoding, honest preview. runner 23/23, lint 0, TC 0, i18n 2838/2838.
> - **R119** (§183): editor layout rebalance (user: center too big, left needs data) — left library w-80 -> responsive 38% (360-560px, @container) and the 2-col thumbnail grid becomes the mock's horizontal media cards (thumb + name + meta line + status/hover actions, ~4 fields per row); center preview cap xl -> 3xl but the stage budget drops 40vh -> 36vh and the quality selector defaults back to Full Res (performance step-down knob, not a permanent half-res). runner 23/23, lint 0, TC 0, build 0.
> - **R120** (§184): mock subtab bar realized — Effects/Transitions/Filters become real left-panel tabs (TmcutFxLibrary gains the `tab` prop, inner switcher only in legacy `all` mode, labeled chips replace the "More" aggregate), honest dB readout (20*log10 of the preview gain) beside the volume slider, and progressive media-bin rendering (first 120 rows + 400px lookahead, reset on search/folder/tab) keeps the data-rich R119 list fast on huge bins. runner 23/23, lint 0, TC 0, build 0.
> - **R121** (§185): hover-honesty rule enforced app-wide (user: hover must only change the border, never grow a row) — media cards rebuilt with the quick-actions as an absolute overlay on the fixed-size thumbnail (opacity fade, pointer-events only on the buttons; drag/click untouched), the card root carries group/thumb and hover changes border color only; folder color chips + project/template card image zooms + QR preview zoom removed. Kept (documented): 16px-class icons scaling inside fixed boxes. runner 23/23, lint 0, TC 0, build 0.
> - **R122** (§186): trim/drag stability (sliding left trim so the edge never stalls, persist-once gestures instead of a localStorage write per mousemove, handle z-order so narrow clips stay grabbable), preview HUD split into a label column and an action row, media bin grid/list views (grid default, 2 columns, xs actions, hover strip obeys the §185 rule), audio-only containers routed by `effectiveAssetKind` (WebM-without-video now lands on an audio track everywhere), and parallel-track preview + per-track stacking order (topmost video track wins, text overlays merge across tracks, export banner warns that the compiler is still first-track-only). runner 23/23, lint 0, TC 0, build 0, parity 2845/2845.
> - **R123** (§187): media bin follow-up — list rows rebuilt as thumbnail | info | fixed `w-24` RIGHT action column (ghost icons, hover-fade + pointer-events gating, relink/add share slot), grid now container-query responsive 2→5 columns (360→560px panel, fullscreen = 5 per row) with the meta line and move-to-folder hidden at the tightest tier; gaps 8→6px. lint 0, TC 0, build 0.
> - **R124** (§188): audio-track preview engine (hidden <audio> per clip under the playhead, media-clock drift-corrected at 0.35s, scrub-follows-playhead when paused, per-clip volume/rate, reverse silent by design) — WebM audio finally plays; pointer-captured trim/drag gestures with a shared gesturePreview map painted on move and committed ONCE on release (the lost-mouseup stale-listener and the per-frame store writes behind "laggy, works sometimes"); vertical track scroll with sticky ruler and header sync; drop below the rows lands the last lane of its type or creates a new parallel audio/video track; HUD rebuilt as two guaranteed rows (labels / icon actions). runner 23/23, lint 0, TC 0, build 0, parity 2845/2845.
> - **R124.5** (§189): live browser QA harness on the RUNNING dev app — playwright-core + system Edge headless against :3100 with the auth stub hub on :4100, dev-only `tmcutQaStore` hooks, real WAV/PNG fixtures, trusted pointer/wheel input, 11 checks (play advances the media clock, trim paints preview and commits once, sliding trim, DnD parallel clip + new-track-below-rows, vertical scroll sync, HUD rows, zero pageerror). The harness caught the surviving "trim doesn't work" bug: `pxToTicks` routed signed pointer DELTAS through core `secToTicks`, which clamps ≤0 → every leftward drag was silently zeroed; fixed by direct px→ticks conversion. Same pass: track-header rows got `shrink-0` (flex-crush broke sticky header sync), drop-below-rows now always creates a fresh lane. Follow-up (§189.4): preview audio volume normalized percent→0..1 before the DOM binding (the store's 0..100 unit leaked into `el.volume` → "value 100 is invalid" warn), harness fixture switched to the real unit + a 12th check fails the run on any "Failed setting prop" warn. runner 23/23, lint 0, build 0, live UI 12/12. Follow-up (§189.5): Electron MCP audit remediation — will-navigate lockdown + isTrustedSender origin checks on the five privileged IPC handlers (generic setWindowOpenHandler removed after it was found to shadow the OAuth popup handler).
> - **R126** (§190): `webSecurity:false` removed — the single CRITICAL audit finding — by moving the media protocol into `electron/media-protocol.cjs` with origin-scoped CORS (ACAO + Range preflight echoed ONLY for the app origins, so remote frames can no longer read local files through media://, which the blanket webSecurity-off allowed). Proven twice: new 7-checkpoint unit spec on the real module (206 slices, suffix range, 416, CORS echo/deny, preflight, 404) and a real-Electron probe (`tests/e2e/electron_media_probe.cjs`) that plays a WAV through `<audio>` from media:// AND CORS-fetches the waveform JSON under `webSecurity:true` — 3/3. Unit 24/24, lint 0, build 0, live UI 12/12.
> - **R127** (§191): Electron 43.7.7 → **44.9.0** (newest stable) — closes audit WARN #13 (unsupported version). Breaking-change review vs the codebase: renderer `clipboard` removal, `setLoginItemSettings` fields, `net.request` Sec-Fetch restriction, 32-bit drops, ANGLE static link — no matching call sites anywhere (grep-clean; x64-only NSIS already). Install gotcha: pnpm skipped the binary postinstall (dist/ absent) — fixed with `node install.js` in the electron package; prod main re-bundled with esbuild for a real boot sim. ABI proof: real 44.9.0 binary boots the actual app (better-sqlite3 + fontmanager.node load, BOOT_OK). Probe 3/3, unit 24/24, lint 0, build 0, live UI 12/12, MCP audit 12/13 with #13 now PASS and 0 FAIL.

---

## 7. Quy trình verify mỗi round (checklist dán vào lúc finish)

```text
□ pnpm typecheck (= nuxt typecheck)   → EXIT=0. CẢNH CÁO R87: root tsconfig.json
  là solution-style (files:[]) nên MỌI biến thể `tsc/vue-tsc -p tsconfig.json`
  trả exit 0 mà không check file nào (gate giả từ R72). Chỉ tin exit 0 của lệnh
  custom sau khi cấy lỗi thử và thấy nó fail.
□ tests/unit/tmcut_time_domain.spec.ts → 6/6 (pin đơn vị giây↔ticks; bắt buộc
  chạy khi đụng clipTime / render clip / v1compat / migration)
□ tests/unit/tmcut_store_behaviour.spec.ts → 13/13 (hành vi store: split/trim/
  ripple/undo/transition/fade/save-load; chạy khi đụng useTmcutProject.ts)
□ tests/unit/tmcut_render_graph.spec.ts → 12/12; đụng filter graph → chạy thêm
  tmcut_render_smoke.spec.ts (FFmpeg thật)
□ npx eslint <tất cả file chạm>      → 0 lỗi (Vue stylistic: --fix trước)
□ i18n: parity en/vi (cùng số key)    → script đếm nhanh
□ Đụng tmcut-core?
    pnpm test:core      → pass (66+ tests)
    pnpm check:core     → pass (boundaries)
    pnpm lint:core      → 0 lỗi
    pnpm typecheck:core → 0 lỗi
□ Help modal khớp sự thật (badge "Sắp ra mắt" cho thứ chưa chạy)
□ Không còn chuỗi hardcode / comment tiếng Việt
□ Renderer-only → F5 (đã 1 lần restart app sau §79); main/preload → full restart
□ Ghi log round vào docs/TMCut Architecture v3.md (§ mới)
□ Tick checkbox ở section 6 file này
```

