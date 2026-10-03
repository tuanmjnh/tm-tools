# VC (Video Creator) — Roadmap module chỉnh sửa video kiểu CapCut trong tm-tools

Tài liệu này ghi lộ trình chi tiết cho module **VC** — trình chỉnh sửa video đầy đủ
(tham khảo CapCut desktop), có **lưu cấu hình để tái sử dụng** (template/preset) và
**AutoCut** — bộ tự cắt clip bằng AI (kết nối model của opencode qua OpenRouter).

---

## 0. Đặt tên module — prefix `vc`

| Hạng mục | Quy ước |
|----------|---------|
| Route | `/vc`, `/vc/editor`, `/vc/templates`, `/vc/autocut` |
| Pages | `app/pages/vc/*.vue` |
| Components | `app/components/vc/*` → auto-import thành `<VcXxx>` |
| Composables | `useVc*` (vd `useVcTimeline`, `useVcRender`) |
| i18n | `nav.vc*` (menu) + section `vc.*` (nội dung UI) |
| API Nitro | `/api/vc/*` |
| Bảng DB (Supabase) | `vc_projects`, `vc_templates`, `vc_render_jobs` |
| system_routes (hub) | `group_vc` + `vc` (hidden landing) + `vc_editor`, `vc_templates`, `vc_autocut` |

> Prefix `vc` (Video Cut/Creator) là giả định — đổi tên chỉ cần rename 1 lần ở Phase 0.

---

## 1. Tham khảo CapCut

Cấu trúc portable `D:\MMO\CapCut 1.5.0.230 portable`:

```
CapCut 1.5.0.230 portable/
├─ App/            Qt native app (Qt5Compat, QtQml, QtQuick, cef, plugins, VEAngle, Resources, website)
├─ Data/Local/     dữ liệu user: projects, cache, effects, thumbnails
├─ Registry/
└─ CapCut.exe / CapCut.ini
```

- CapCut là app **Qt native** (không phải Electron) → không port code được, chỉ tham khảo
  **cấu trúc tính năng** và cách tổ chức dữ liệu (Data/Local = nơi lưu projects + cache
  render → tương đương VC: Supabase (timeline JSON) + thư mục render local).
- Nhóm tính năng cần bám (theo CapCut desktop):

| # | Nhóm | Nội dung chính |
|---|------|----------------|
| 1 | Timeline đa track | Video / Text / Audio / Overlay / Sticker; zoom, snap, ripple delete |
| 2 | Thao tác clip | Split, trim/extend, speed (bình thường + curve), reverse, tách audio |
| 3 | Transitions | dissolve, slide, zoom, glitch, page… (~40 loại) |
| 4 | Filters & Video effects | glow, blur, grain, RGB split, distortion, LUT |
| 5 | Text | thư viện font, text style, animation (entrance/emphasis/exit), karaoke, auto captions, text templates |
| 6 | Audio | nhạc nền, voiceover, TTS, effects (echo/reverb), volume ducking, beat sync |
| 7 | Color | brightness/contrast/saturation/temperature/tint, curves, HSL |
| 8 | Sticker & Overlay | GIF, PNG, cutout, mask, chroma key (green screen) |
| 9 | Keyframes | position/scale/rotation/opacity theo thời gian |
| 10 | Templates | lưu cấu hình & áp lại 1 chạm (One-tap template) |
| 11 | AI features | auto captions, beat sync, auto zoom (Ken Burns), remove background |
| 12 | Export | 720p/1080p/4K, fps, MP4/MOV/WebM, bitrate |

### Tận dụng hạ tầng hiện có trong tm-tools

- `/tools/video` (`app/pages/tools/video.vue`) + `components/tools/video/*` (SplitPanel,
  JoinPanel, TransitionsModal, EffectsForm, AudioToolPanel, FramePreview…) đã chạy pipeline
  **ffmpeg qua Electron IPC**: `window.electronAPI.tools.ffmpeg` +
  `useToolTaskManager('ffmpeg')` (setTasks → start → onProgress/onError),
  presets trong `useFfmpegPresets()`, binary cấu hình bằng `TOOLS_FFMPEG_PATH` v.v.
- VC **không làm lại pipeline render** — tái dụng (reuse) task manager + presets ffmpeg có sẵn;
  VC thêm **timeline UI + compiler (JSON → ffmpeg filtergraph)** + AI + lưu dự án.
- Media: `/media` (Cloudinary + local link history) làm nguồn media sẵn có cho VC.

---

## 2. Kiến trúc tổng

```
┌────────────────────────────── Frontend (Nuxt UI v4) ──────────────────────────────┐
│  /vc (projects)   /vc/editor (timeline + preview + inspector)                    │
│  /vc/templates    /vc/autocut (wizard 4 bước)                                    │
│  Components: Vc* · Composables: useVc* · i18n: vc.*                              │
└───────────────┬──────────────────────────┬───────────────────────────────────────┘
                │ Nitro /api/vc/*          │ Electron IPC (window.electronAPI.tools.ffmpeg)
┌───────────────▼───────────────┐   ┌──────▼──────────────────────────────────────┐
│ Nitro API                       │   │ Electron main (có sẵn)                     │
│ · projects/templates CRUD       │   │ · ffmpeg binary local (TOOLS_FFMPEG_PATH)  │
│   (Supabase vc_*)               │   │ · task manager: progress/retry/timeout     │
│ · POST /analyze  (ffprobe/      │   │ · VC render jobs chạy ở đây                │
│   ffmpeg waveform+keyframes)    │   └────────────────────────────────────────────┘
│ · POST /autocut  (job)          │   ┌────────────────────────────────────────────┐
└───────────────┬───────────────┘   │ AI (opencode) — OpenAI-compatible            │
                │                     │ (config ai.* : AI_PROVIDER/AI_API_KEY/       │
┌───────────────▼───────────────┐   │  AI_BASE_URL/AI_MODEL)                       │
│ Supabase                      │   │ · AutoCut: EDL JSON (segments, captions,     │
│ · vc_projects (timeline jsonb)│   │   beats, style)                              │
│ · vc_templates (preset/style) │   │ · (tùy chọn) ASR transcript                  │
│ · vc_render_jobs              │   └────────────────────────────────────────────┘
└───────────────────────────────┘
Media files: đĩa local (Electron) là chính · Cloudinary /media (import)
```

 Quyết định kiến trúc đã chốt (03/10/2026):

 - **Electron-only** (đã chốt, không hỗ trợ browser): timeline JSON được *compile*
   thành chuỗi lệnh ffmpeg (concat + xfade + eq/curves + drawtext + volumeduck…),
   gửi vào `useToolTaskManager('ffmpeg')` có sẵn; media `local://` là chính.
 - **Output tối đa 1080p** (đã chốt — không làm 4K).
 - **Không dùng Pinia** — state module bằng composables thuần (quy ước repo).
- **Dự án = 1 document JSON** (timeline DSL, mục 3) lưu Supabase `vc_projects.timeline`
  → lưu/mở/tái sử dụng cấu hình triệt để; file media chỉ lưu *reference* (local path
  hoặc Cloudinary URL), không lưu binary vào DB.
- **i18n mọi string UI** qua section `vc.*` (en + vi), label menu `nav.vc*`.

---

## 3. Mô hình dữ liệu

### 3.1 Bảng Supabase

```sql
-- vc_projects: dự án + timeline
create table vc_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  app_id text not null,
  name text not null,
  cover text,                     -- url preview (Cloudinary/local)
  duration_ms int not null default 0,
  canvas jsonb not null,          -- {width, height, fps}
  timeline jsonb not null,        -- Timeline DSL (3.2)
  settings jsonb not null,        -- export: {resolution, fps, format, bitrate}
  source text,                    -- 'manual' | 'autocut:<jobId>' | 'template:<id>'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- vc_templates: cấu hình tái sử dụng (template/preset/autocut-profile)
create table vc_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                   -- null = builtin preset
  app_id text not null,
  kind text not null check (kind in ('template','preset','style','autocut_profile')),
  name text not null,
  description text,
  payload jsonb not null,         -- template: timeline DSL; preset: effect/text/transition set;
                                  -- style: canvas+fps+màu tổng thể; autocut_profile: params profile
  tags text[] default '{}',
  usage_count int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- vc_render_jobs: lịch sử render (jobId IPC từ task manager; không queue server-side)
create table vc_render_jobs (
  id text primary key,            -- jobId
  project_id uuid references vc_projects(id) on delete cascade,
  status text not null default 'pending',  -- pending|running|done|failed
  progress int not null default 0,
  output text,
  error text,
  created_at timestamptz default now(),
  finished_at timestamptz
);
```

### 3.2 Timeline DSL (jsonb `vc_projects.timeline`)

```jsonc
{
  "version": 1,
  "tracks": [
    {
      "id": "t-video-1", "type": "video",
      "items": [{
        "id": "c1",
        "src": "local://D:/videos/a.mp4",   // hoặc "https://res.cloudinary.com/..."
        "in": 0, "out": 5.2, "offset": 0,   // giây; offset = vị trí trên timeline
        "speed": 1, "reverse": false,
        "opacity": 100, "scale": 100, "x": 0, "y": 0, "rotation": 0,
        "effects": [
          { "type": "eq", "params": { "brightness": 0.05, "contrast": 1.1, "saturation": 1.2 } },
          { "type": "blur", "params": { "sigma": 2 } },
          { "type": "glow", "params": { "preset": "soft" } }
        ],
        "transitionIn": { "type": "dissolve", "duration": 0.3 },
        "keyframes": [
          { "t": 0, "prop": "scale", "value": 100 },
          { "t": 2, "prop": "scale", "value": 120 }
        ]
      }]
    },
    {
      "id": "t-text-1", "type": "text",
      "items": [{
        "id": "x1", "text": "Chào mừng 👋",
        "style": { "font": "Inter", "size": 48, "color": "#ffffff", "stroke": "#00000040", "align": "center" },
        "position": { "x": 0, "y": -400 },
        "in": 0.5, "out": 3.0,
        "animation": { "entrance": "pop", "emphasis": null, "exit": "fade" }
      }]
    },
    {
      "id": "t-audio-1", "type": "audio",
      "items": [{
        "id": "a1", "src": "https://res.cloudinary.com/.../music.mp3",
        "in": 0, "out": 30, "volume": 80,
        "ducking": { "enabled": true, "thresholdDb": -20, "when": "voiceover" }
      }]
    }
  ]
}
```

### 3.3 Lưu cấu hình để tái sử dụng (yêu cầu riêng)

- **Save as Template**: từ dự án bất kỳ → lưu `timeline` + `canvas` + `settings`
  vào `vc_templates (kind='template')`. Áp lại: mở template → copy timeline vào dự án mới
  (media references giữ nguyên nếu cùng máy, hoặc map lại media).
- **Preset** (`kind='preset'`): tập effect / text style / transition set — lưu payload nhỏ,
  áp vào 1 clip hoặc cả track (khác template: không kèm media/duration).
- **Style** (`kind='style'`): canvas + fps + bảng màu + font mặc định cho cả dự án.
- **AutoCut Profile** (`kind='autocut_profile'`): bộ tham số AutoCut (mục 7) lưu lại
  để chạy lại cùng "gu" cắt trên clip khác.
- **Batch apply**: chọn template + N source clips (từ /media hoặc ổ đĩa) → render N video
  cùng cấu hình (dùng lại task manager — queue sẵn có).
- Builtin presets: seed 1 set nhỏ (3-5 style: Shorts dọc 1080x1920@30, YouTube ngang
  1920x1080@30, Instagram feed, glow/retro preset) với `user_id=null`.

---

## 4. Routes & Pages

| Route | Page | Vai trò |
|-------|------|---------|
| `/vc` | `vc/index.vue` | Landing + grid dự án (VcProjectCard), New Project, Import media (local + Cloudinary), route hidden như `/tools` |
| `/vc/editor` | `vc/editor.vue` | Editor: preview player trên, timeline dưới, inspector phải (mở `?project=<id>`); dự án mới thì `?new=1` |
| `/vc/templates` | `vc/templates.vue` | Thư viện template/preset (của tôi + builtin): áp, chỉnh, nhân bản, xoá |
| `/vc/autocut` | `vc/autocut.vue` | Wizard AutoCut 4 bước (upload → profile → review EDL → render) |

`system_routes` (seed hub, app tm-tools):

```
group_vc   #vc            nav.vc           i-lucide-clapperboard  sort 11
vc         /vc            nav.vc           i-lucide-clapperboard  sort 110  is_visible:false (landing)
vc_editor  /vc/editor     nav.vc_editor    i-lucide-film          sort 111
vc_templates /vc/templates nav.vc_templates i-lucide-layout-template sort 112
vc_autocut /vc/autocut    nav.vc_autocut   i-lucide-scissors      sort 113
```

+ `allowed_routes` role admin: thêm cả 5 id.

---

## 5. Components (`app/components/vc/`)

| Component | Vai trò | Phase |
|-----------|---------|-------|
| `VcProjectCard.vue` | Card dự án (cover, duration, updated) | P1 |
| `VcNewProjectModal.vue` | Canvas size + fps + import media đầu | P1 |
| `VcEditorShell.vue` | Bố cục editor (preview/timeline/inspector) | P1 |
| `VcPreviewPlayer.vue` | `<video>` + overlay text + audio sync theo playhead | P1 |
| `VcTimeline.vue` | Ruler + tracks container, zoom, snap, selection | P1 |
| `VcTimelineClip.vue` | Clip: drag move / resize trim / split at playhead | P1 |
| `VcTimelineTrack.vue` | Track video/text/audio (multi P2) | P1/P2 |
| `VcInspector.vue` | Panel thuộc tính clip đang chọn | P1 |
| `VcEffectPanel.vue` | Filters & effects (eq/blur/glow/grain…) | P2 |
| `VcTextPanel.vue` | Font, style, position, animation | P1 (basic) / P2 (full) |
| `VcAudioPanel.vue` | Volume, ducking, nhạc nền | P2 |
| `VcTransitionPicker.vue` | Chọn transition giữa 2 clip | P1 (3 loại) / P2 (10+) |
| `VcKeyframeEditor.vue` | Thêm/sửa keyframes scale/position/opacity | P2 |
| `VcExportModal.vue` | Resolution/fps/format/bitrate + start render | P1 |
| `VcTemplateCard.vue` + `VcTemplateLibrary.vue` | Browse/áp/quản lý template & preset | P3 |
| `VcAutocutWizard.vue` | Wizard 4 bước | P3 |
| `VcEdlReview.vue` | Xem/soát segments AI trên mini-timeline (chấp nhận/bớt/đổi thứ tự) | P3 |
| `VcAutocutProgress.vue` | Progress AI + render | P3 |

Quy ước: mọi component mới đặt tên `Vc*`, cùng folder `app/components/vc/`, auto-import.

---

## 6. API Nitro (`server/api/vc/`)

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/vc/projects` | GET/POST | Danh sách (cursor paging) + tạo dự án mới (batch delete theo `?id=a,b` theo quy ước repo) |
| `/api/vc/projects/[id]` | GET/PUT/DELETE | Đọc / cập nhật timeline+settings / xoá |
| `/api/vc/projects/[id]/save-template` | POST | `{kind, name, tags}` → `vc_templates` |
| `/api/vc/templates` | GET/POST/DELETE | `?kind=template|preset|style|autocut_profile` (bulk delete theo quy ước) |
| `/api/vc/analyze` | POST | `{src}` (local path hoặc Cloudinary URL) → `{duration, fps, width, height, hasAudio, videoCodec, audioCodec, waveform[64], keyframes[{t, url}]}` (ffmpeg/ffprobe chạy local; local path chỉ hợp lệ khi Electron) |
| `/api/vc/autocut` | POST | `{mediaRef, profile {mode: 'visual' | 'transcript', style, targetLengthSec, language, asr?: 'api' | 'local', features {captions?, beatSync?, removeSilence?, kenBurns?}, model?}}` → `{jobId}`; job: analyze → (ASR nếu mode='transcript') → gọi AI opencode → lưu EDL vào job |
| `/api/vc/autocut/[jobId]` | GET | `{status, edl? {segments, captions, beats, stylePreset}}` (polling) |

> Render **không có endpoint Nitro** — Electron-only (đã chốt): render luôn qua
> `useToolTaskManager('ffmpeg')` IPC. `vc_render_jobs` chỉ dùng để log lịch sử
> render (jobId IPC + status + output), không phải queue server-side.

RBAC: giữ middleware hiện có; các endpoint `/api/vc/*` chỉ cần authenticated user
(permissionMap hiện rỗng — nhất quán với module khác của app).

---

## 7. AutoCut bằng AI opencode

### 7.1 Định nghĩa

AutoCut nhận 1 (hoặc nhiều) clip gốc + profile mong muốn → AI phân tích → trả về
**EDL (Edit Decision List)**: danh sách đoạn giữ/bớt, thứ tự, captions, điểm nhạc,
style. Người dùng **soát** trên timeline trước khi render — AI không render thẳng.

**Hai chế độ (tùy biến trong wizard, đã chốt):**

| Mode | Cách cắt | ASR | Phù hợp |
|------|---------|-----|---------|
| `visual` | AI dựa motion/energy + cảnh quay (keyframes 1fps) + gợi ý kịch bản người dùng gõ (vd "video review sản phẩm, giữ đoạn demo") | không | montage, visual-heavy, không có lời nói |
| `transcript` | AI đọc transcript (word timestamps) → cắt theo câu, giữ hook/chốt, bỏ đoạn im/lặp | **bắt buộc** | talking head, vlog, review có giọng nói |

### 7.2 Pipeline

```
1. UPLOAD        mediaRef (local://... | cloudinary://...)
2. ANALYZE       ffprobe (định dạng) + ffmpeg astats (waveform 64 điểm) + keyframes 1fps
                  + audio energy (để dò đoạn im lặng)
3. (ASR)         chỉ mode='transcript'; nguồn tùy chọn người dùng (đã chốt):
                  • 'api'   : Whisper/DeepL API qua HTTP (key cấu hình riêng VC_ASR_API_KEY)
                  • 'local' : whisper.cpp chạy local qua Electron IPC (offline, chậm hơn)
                  → transcript + word timestamps
4. AI CALL       POST {AI_BASE_URL}/chat/completions (OpenAI-compatible, model = AI_MODEL
                 của opencode) — system prompt gán schema EDL JSON (7.3) + rules:
                 • tổng duration ≤ targetLengthSec
                 • segment < 0.5s bị loại
                 • captions ≤ 12 từ/đoạn, đọc trôi
                 • ưu tiên giữ đoạn có chuyển động/giọng mạnh (dựa energy + transcript)
5. EDL REVIEW    VcEdlReview: mini-timeline các segment — accept/reorder/trim/bớt
                 (mọi thay đổi = chỉnh timeline sau, không gọi lại AI)
6. APPLY         EDL → build VcProject (timeline DSL, source='autocut:<jobId>')
7. RENDER        pipeline render thường (ffmpeg qua `useToolTaskManager('ffmpeg')` IPC)
8. PROFILE SAVE  "Lưu làm AutoCut Profile" → vc_templates kind='autocut_profile'
```

### 7.3 Schema EDL (JSON AI phải trả)

```jsonc
{
  "segments": [
    { "start": 3.2, "end": 8.1, "reason": "câu hook mạnh + chuyển động camera" },
    { "start": 12.4, "end": 15.0, "reason": "điểm nhấn nhạc" }
  ],
  "captions": [
    { "text": "Bạn chưa biết điều này?", "start": 0.0, "end": 1.8 }
  ],
  "musicBeats": [0.0, 2.0, 4.0],
  "transitions": [ { "after": 0, "type": "dissolve", "duration": 0.25 } ],
  "stylePreset": "fast-cut",            // map tới preset built-in (màu/speed cap)
  "kenBurns": [ { "segment": 1, "from": { "scale": 100 }, "to": { "scale": 115 } } ]
}
```

### 7.4 Kết nối AI (opencode)

- Dùng config `ai.*` có sẵn trong `server/config/index.ts`:
  `AI_PROVIDER` (mặc định gemini — có thể = openrouter), `AI_API_KEY`, `AI_BASE_URL`,
  `AI_MODEL` (model opencode đang dùng, qua OpenRouter).
- Provider adapter mỏng `server/modules/ai/provider.ts`: 1 hàm
  `chatJson(messages, schemaHint) -> T` (structured output: JSON mode + validate
  schema EDL bằng zod → retry 1 lần nếu sai format).
- **ASR adapter** (`server/modules/vc/asr.ts`, mode='transcript'):
  - `api`: HTTP đến Whisper/DeepL API, key riêng `VC_ASR_API_KEY` (thêm vào
    `.env` + `server/config/index.ts`).
  - `local`: gọi whisper.cpp qua Electron IPC (`window.electronAPI.vc.asr`) —
    model tải 1 lần, cache local.
  - Trả về format thống nhất `{ text, words: [{w, start, end}] }`.
- Chi phí/độ trễ: chỉ gửi metadata + transcript rút gọn (≤ 4000 token), waveform/giá trị
  thô không gửi; log job để tune prompt theo từng lần chạy.

---

## 8. Phases & milestones

### Phase 0 — Nền tảng (ước 1–2 tuần)
- [ ] Supabase migrations: `vc_projects`, `vc_templates`, `vc_render_jobs` (+RLS/app-scoping theo quy ước hub)
- [ ] Types: `app/shared/types/vc.ts` (VcProject, VcTemplate, Timeline DSL, EDL)
- [ ] Seed hub: `group_vc` + 4 routes + `allowed_routes` admin; i18n `vc.*` (en+vi)
- [ ] Page `/vc` landing (grid dự án + New Project) + media import (local path + Cloudinary từ `/media`)
- [ ] Builtin presets seed (3 canvas: 1080x1920/1080x1080/1920x1080 + 2 effect preset)
- [ ] Verify ffmpeg binary (`checkExecutable` qua task manager, `TOOLS_FFMPEG_PATH`)
- **Accept**: tạo dự án, import media, lưu Supabase, mở lại đúng timeline.

### Phase 1 — Editor MVP (ước 2–3 tuần)
- [ ] `VcEditorShell` + `VcPreviewPlayer` (playhead, seek, overlay text đơn giản)
- [ ] `VcTimeline`: 1 track video + 1 track text; split/trim/drag/snap; zoom
- [ ] `VcInspector`: speed, opacity, vị trí text, text nội dung/font màu cơ bản
- [ ] Transitions cơ bản: dissolve / fade / slide (ffmpeg `xfade`)
- [ ] **Compiler**: timeline JSON → ffmpeg filtergraph (concat/xfade/eq/drawtext)
      + gửi render qua `useToolTaskManager('ffmpeg')` (Electron)
- [ ] `VcExportModal`: 720p/1080p, MP4, H.264
- [ ] Save/reopen dự án (autosave debounce)
- **Accept**: clip 3 segments + text + 1 transition → export MP4 1080p phát đúng,
      audio/video sync, dự án mở lại nguyên trạng.

### Phase 2 — Editor đầy đủ (ước 3–4 tuần)
- [ ] Multi-track: 2 video, N text, N audio, overlay (GIF/PNG)
- [ ] Effects/filters: brightness/contrast/saturation/temperature/tint (eq/colortemperature),
      blur, glow, grain (ffmpeg)
- [ ] Speed curve + reverse; keyframes (scale/position/opacity)
- [ ] Transitions mở rộng (10+ loại xfade + custom)
- [ ] Audio: nhạc nền + voiceover, volume, ducking (`volumeduck`)
- [ ] Text: stroke/shadow/align/full style + animation cơ bản (pop/fade — render bằng
      filter keyframe; animation phức để P4)
- [ ] Export full: fps/resolution/format/bitrate (GOP keyframe interval)
- **Accept**: dự án 5 track dùng hết effect ở trên, render sync chính xác tại frame
      được kiểm tra (đối chiếu keyframes có sẵn của `/tools/video`).

### Phase 3 — Templates & AutoCut cơ bản (ước 2–3 tuần)
- [ ] `/vc/templates`: VcTemplateLibrary (template + preset + style), save-as-template,
      áp 1 chạm, nhân bản, xoá (bulk theo quy ước)
- [ ] Batch apply: template + N clips → N jobs trong task manager
- [ ] `/vc/autocut`: wizard 4 bước (upload → profile → review EDL → render);
      profile: **mode `visual`/`transcript`** (đã chốt), style, target length,
      language, asr (`api`/`local`), removeSilence, kenBurns
- [ ] AI adapter (`chatJson`) + EDL schema (zod) + job API `/api/vc/autocut`
- [ ] ASR adapter (mode='transcript'): `api` = Whisper/DeepL qua HTTP
      (key `VC_ASR_API_KEY`); `local` = whisper.cpp qua Electron IPC
- [ ] `VcEdlReview`: review/adjust segments trên mini-timeline → APPLY thành VcProject
- [ ] Auto captions cơ bản (từ transcript, word timestamps)
- [ ] Lưu AutoCut Profile tái sử dụng
- **Accept**: "Save as style" rồi áp vào 3 clip khác → 3 video đồng nhất; AutoCut
      mode `visual` + `transcript` đều tạo EDL hợp lý (≥ 70% segments được chấp
      nhận mà không chỉnh tay nhiều).

### Phase 4 — AutoCut full & nâng cao (liên tục)
- [ ] Captions karaoke highlight (word-level), auto captions style tùy chỉnh
- [ ] Beat sync (nhạc + chuyển cảnh theo beat), remove-silence tự động, Ken Burns auto
- [ ] LUT, glitch, motion blur; tăng tốc NVENC/H264_HW detect (render **max 1080p** — đã chốt)
- [ ] Export lên `/media` (Cloudinary) để share
- [ ] Prompt tuning: A/B profiles theo ngôn ngữ/ngoại hình nội dung (talking/funny/montage/news)

---

## 9. Rủi ro & lưu ý kỹ thuật

| Rủi ro | Mitigation |
|--------|------------|
| Encode CPU-only (Windows, chưa rõ NVENC) → render 1080p chậm | Đo thời gian render Phase 1; bật NVENC/H264_HW theo máy (detect qua `ffmpeg -encoders`); render preview low-res trước |
| Sync audio/video qua `xfade`/concat lossy | Render bằng 1 pipeline duy nhất (không concat file trung gian); test sync trên clip chuẩn (mark frame) |
| `drawtext` giới hạn với text animation phức | Phase 1-2 chỉ animation đơn (fade/pop); animation phức Phase 4 bằng pre-render frame (offscreen canvas → ffmpeg rawvideo input) |
| AI trả JSON sai schema / chiều dài overflow | zod validate + retry 1 lần; transcript truncate; timeout job; fallback EDL = cut đều theo target length nếu AI fail |
| Media local path mất (đổi máy) | reference dạng `local://` + validation khi mở dự án (thiếu file → cảnh báo, không crash); khuyến nghị Cloudinary cho dự án chia sẻ |
| Music/font bản quyền | Chỉ dùng media user tự upload (từ /media); không bundle nhạc có sẵn |
| whisper.cpp local (mode transcript) tải nặng/bản quyền model | Chạy on-demand qua IPC, tải model 1 lần vào `Data/Local`-style cache; fallback 'api' nếu local fail |
| SQLite/Supabase downtime | timeline JSON có thể export/import file `.vcproj` (1-click backup) |

---

## 10. Đã chốt (03/10/2026)

1. **Chạy Electron-only** (như `/tools/video` hiện tại): render luôn qua
   `useToolTaskManager('ffmpeg')` IPC; media `local://` là chính, Cloudinary
   chỉ là nguồn import. Không làm browser fallback.
2. **AutoCut: 2 chế độ tùy biến** trong wizard — `visual` (cắt theo
   motion/energy, không cần ASR) và `transcript` (cắt theo lời nói, cần ASR).
3. **ASR tùy biến theo lựa chọn** mỗi run: `api` (Whisper/DeepL qua HTTP,
   key `VC_ASR_API_KEY`) hoặc `local` (whisper.cpp qua Electron IPC, offline).
4. **Render max 1080p** (khuyến nghị) — không làm 4K; Phase 4 chỉ tăng tốc
   bằng NVENC/H264_HW nếu GPU có.
