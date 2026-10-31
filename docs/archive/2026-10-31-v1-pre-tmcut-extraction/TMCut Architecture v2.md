# TMCut — Video Creator Engine

## Roadmap & Architecture v2

## 1. Mục tiêu

TMCut là module video editor trong `tm-tools`, xây dựng bằng:

* Nuxt 4
* Vue 3
* Nuxt UI v4
* Electron
* FFmpeg / FFprobe
* Supabase / MongoDB
* OpenAI-compatible AI API
* OpenCode-compatible AI provider

Mục tiêu:

> Xây dựng một video editor desktop kiểu CapCut nhưng tập trung vào local processing, timeline JSON, FFmpeg rendering, template/preset và AI AutoCut.

TMCut phải hỗ trợ:

* Manual video editing
* Multi-track timeline
* Video / image / audio / text / overlay / sticker
* Keyframe animation
* Transition
* Video effects
* Color adjustment
* Speed / speed curve
* Audio processing
* Subtitle / captions
* Multiple aspect ratios
* Smart crop / smart reframe
* Templates
* Batch rendering
* AI AutoCut
* AI-generated timeline
* AI photo motion
* AI smart reframe
* AI editing assistant

---

# 2. Nguyên tắc kiến trúc

Không xây TMCut thành một khối code duy nhất.

TMCut phải được chia thành các engine:

```text
TMCut
│
├── Project Engine
│
├── Media Engine
│
├── Canvas Engine
│
├── Timeline Engine
│
├── Preview Engine
│
├── Animation Engine
│
├── Effect Engine
│
├── Transition Engine
│
├── Audio Engine
│
├── Subtitle Engine
│
├── Template Engine
│
├── AI Editing Engine
│
├── Render Engine
│
└── Cache / Proxy Engine
```

Các engine giao tiếp với nhau thông qua TypeScript types và Timeline DSL.

Không cho UI component gọi trực tiếp FFmpeg.

Luồng chính:

```text
UI
 ↓
Composable
 ↓
Domain Engine
 ↓
Timeline DSL
 ↓
Compiler
 ↓
Render Plan
 ↓
Electron IPC
 ↓
FFmpeg
 ↓
Output
```

AI cũng không được gọi FFmpeg trực tiếp:

```text
AI
 ↓
AI Analysis
 ↓
Editing Decision
 ↓
Timeline DSL
 ↓
Compiler
 ↓
FFmpeg
```

---

# 3. Folder Architecture

Đề xuất:

```text
app/
├── pages/
│   └── tmcut/
│       ├── index.vue
│       ├── editor.vue
│       ├── templates.vue
│       └── autocut.vue
│
├── components/
│   └── tmcut/
│       ├── editor/
│       ├── timeline/
│       ├── preview/
│       ├── inspector/
│       ├── media/
│       ├── canvas/
│       ├── effects/
│       ├── transitions/
│       ├── audio/
│       ├── text/
│       ├── subtitle/
│       ├── templates/
│       ├── autocut/
│       ├── export/
│       └── settings/
│
├── composables/
│   └── tmcut/
│       ├── useTmcutProject.ts
│       ├── useTmcutTimeline.ts
│       ├── useTmcutCanvas.ts
│       ├── useTmcutMedia.ts
│       ├── useTmcutPreview.ts
│       ├── useTmcutHistory.ts
│       ├── useTmcutSelection.ts
│       ├── useTmcutRender.ts
│       ├── useTmcutTemplate.ts
│       └── useTmcutAutocut.ts
│
├── utils/
│   └── tmcut/
│       ├── compiler/
│       ├── timeline/
│       ├── canvas/
│       ├── effects/
│       ├── transitions/
│       ├── audio/
│       ├── keyframes/
│       ├── templates/
│       └── validation/
│
├── types/
│   └── tmcut/
│       ├── project.ts
│       ├── timeline.ts
│       ├── media.ts
│       ├── canvas.ts
│       ├── effects.ts
│       ├── transitions.ts
│       ├── audio.ts
│       ├── template.ts
│       ├── autocut.ts
│       └── render.ts
│
server/
└── api/
    └── tmcut/
        ├── projects/
        ├── templates/
        ├── media/
        ├── analyze/
        ├── autocut/
        └── render/
```

Electron:

```text
electron/
├── ipc/
│   └── tmcut/
├── services/
│   └── tmcut/
│       ├── ffmpeg/
│       ├── ffprobe/
│       ├── proxy/
│       ├── thumbnails/
│       ├── waveform/
│       ├── render/
│       └── analysis/
└── workers/
    └── tmcut/
```

---

# 4. Domain Model

## 4.1 Project

```ts
interface TmcutProject {
  id: string
  name: string

  canvas: TmcutCanvas

  timeline: TmcutTimeline

  settings: TmcutProjectSettings

  assets: TmcutAsset[]

  metadata: {
    createdAt: string
    updatedAt: string
    version: number
  }
}
```

---

# 5. Canvas / Aspect Ratio Engine

Canvas phải là domain riêng.

Không hard-code ngang/dọc trong editor.

```ts
interface TmcutCanvas {
  width: number
  height: number
  fps: number

  aspectRatio: {
    id: string
    value: number
    orientation: 'landscape' | 'portrait' | 'square'
  }

  background: {
    type: 'color' | 'image' | 'transparent'
    value?: string
  }
}
```

Preset:

```text
16:9
9:16
1:1
4:5
4:3
21:9
Custom
```

Presets social:

```text
YouTube
YouTube Shorts
TikTok
Instagram Reels
Instagram Feed
Facebook
Custom
```

Không để platform preset phụ thuộc vào renderer.

Platform preset chỉ tạo Canvas + Export Settings.

---

# 6. Smart Reframe

Media được import vào canvas phải hỗ trợ:

```text
Fit
Fill
Crop
Stretch
Smart Crop
```

Smart Crop có thể sử dụng:

```text
Face
Person
Object
Subject
Center
Manual focus point
```

Timeline item:

```ts
interface TmcutCrop {
  mode: 'fit' | 'fill' | 'crop' | 'smart'
  focus?: {
    x: number
    y: number
  }
}
```

---

# 7. Timeline DSL v2

Timeline DSL là source of truth.

Ví dụ:

```json
{
  "version": 2,
  "tracks": [
    {
      "id": "video-1",
      "type": "video",
      "items": []
    },
    {
      "id": "image-1",
      "type": "image",
      "items": []
    },
    {
      "id": "text-1",
      "type": "text",
      "items": []
    },
    {
      "id": "audio-1",
      "type": "audio",
      "items": []
    }
  ]
}
```

Mỗi item có:

```text
source
sourceIn
sourceOut
timelineStart
duration
speed
transform
crop
opacity
blend
effects
transition
keyframes
animation
audio
metadata
```

Không đặt logic render vào timeline data.

---

# 8. History Engine

Editor phải có:

```text
Undo
Redo
Command history
Snapshots
Project recovery
```

Mọi thay đổi timeline nên đi qua command:

```text
AddClipCommand
DeleteClipCommand
SplitClipCommand
MoveClipCommand
TrimClipCommand
SetSpeedCommand
SetTransformCommand
AddEffectCommand
RemoveEffectCommand
AddKeyframeCommand
```

Không trực tiếp mutate timeline ở nhiều component.

---

# 9. Phase 0 — Foundation

Trạng thái hiện tại: đã hoàn thành phần lớn.

Giữ:

* `/tmcut`
* `/tmcut/editor`
* `/tmcut/templates`
* `/tmcut/autocut`
* `useTmcutProject`
* Timeline types
* TMCut components
* Supabase/MongoDB integration

Không xây thêm feature lớn trong Phase 0.

Acceptance:

```text
Project có thể tạo
Project có thể mở
Project có thể lưu
Project có thể load lại
Timeline JSON hợp lệ
```

---

# 10. Phase 1 — Editor Core

Phần đã hoàn thành được giữ nguyên:

* Import media
* Video track
* Text track
* Audio track
* Split
* Trim
* Delete
* Move
* Preview
* Inspector
* Basic transform
* Speed
* Opacity
* Volume
* FFmpeg compiler
* FFmpeg render

Các tính năng tiếp theo:

```text
[ ] Undo / Redo
[ ] Multi-select
[ ] Copy / Paste
[ ] Duplicate
[ ] Group / Ungroup
[ ] Lock track
[ ] Hide track
[ ] Mute track
[ ] Snap
[ ] Ripple editing
[ ] Linked clips
[ ] Markers
```

Acceptance:

> Editor phải đủ ổn để dựng một video thủ công mà không cần sửa JSON.

---

# 11. Phase 1.5 — Project / Media / Cache

Đây là phase mới và bắt buộc trước khi đi sâu AI.

## Media Library

```text
Videos
Images
Audio
Fonts
Stickers
Generated
```

Mỗi media lưu metadata từ FFprobe.

## Cache

```text
thumbnails/
waveforms/
frames/
analysis/
proxies/
```

## Auto Save

```text
Auto Save
Backup
Recovery
Project snapshots
```

## Media Relink

Nếu file bị di chuyển:

```text
Missing media
 ↓
Locate
 ↓
Relink
 ↓
Update source
```

Acceptance:

> Đóng app → mở lại → project khôi phục đầy đủ.

---

# 12. Phase 2 — Canvas & Timeline Advanced

## Canvas

```text
[ ] 16:9
[ ] 9:16
[ ] 1:1
[ ] 4:5
[ ] 4:3
[ ] 21:9
[ ] Custom
```

## Media fitting

```text
[ ] Fit
[ ] Fill
[ ] Crop
[ ] Smart Crop
```

## Reframe

```text
[ ] Duplicate as 16:9
[ ] Duplicate as 9:16
[ ] Duplicate as 1:1
[ ] Duplicate as 4:5
```

## Safe Area

```text
[ ] Show safe area
[ ] Show guides
[ ] Show center
[ ] Show grid
```

Acceptance:

> Một project có thể chuyển từ 16:9 sang 9:16 mà không phá timeline.

---

# 13. Phase 3 — Animation / Keyframe Engine

Keyframe phải là engine riêng.

Properties:

```text
Position
Scale
Rotation
Opacity
Crop
Blur
Brightness
Volume
Speed
```

Interpolation:

```text
Linear
Ease In
Ease Out
Ease In Out
Bezier
```

Presets:

```text
Zoom In
Zoom Out
Pan Left
Pan Right
Pan Up
Pan Down
Shake
Fade
```

Đặc biệt cho ảnh:

```text
Ken Burns
Face Focus
Subject Focus
Cinematic Zoom
```

---

# 14. Phase 4 — Effects & Transitions

## Effects

```text
Basic
Blur
Glow
Sharpen
Grain
Vignette
Distortion
Glitch
RGB Split
Noise
Color
LUT
```

## Transitions

```text
Dissolve
Fade
Slide
Wipe
Zoom
Push
Spin
Blur
Glitch
Flash
Whip
```

Transition phải có:

```text
type
duration
direction
intensity
easing
parameters
```

Không hard-code từng transition vào UI.

---

# 15. Phase 5 — Audio Engine

```text
Volume
Fade
Normalize
Noise reduction
Voice enhancement
Ducking
Beat detection
BPM
Waveform
Markers
```

Audio analysis:

```text
BPM
Beat
Downbeat
Energy
Sections
```

Kết quả:

```json
{
  "bpm": 128,
  "beats": [],
  "sections": [],
  "energy": []
}
```

Đây là input cho AutoCut.

---

# 16. Phase 6 — Preview / Performance

Trước khi AI AutoCut phải giải quyết performance.

## Proxy

```text
Original
 ↓
Proxy 720p / 540p / 360p
 ↓
Preview
```

Export luôn sử dụng original.

## GPU

Detect:

```text
NVIDIA NVENC
AMD AMF
Intel QSV
CPU
```

## Preview

```text
Full
1/2
1/4
1/8
```

Có:

```text
FPS
Dropped frames
Render latency
```

Acceptance:

> Project nhiều clip 1080p/4K vẫn preview được ở mức hợp lý.

---

# 17. Phase 7 — Templates / Presets

Template phải chia:

```text
Template
Preset
Style
Autocut Profile
```

Đúng với model dữ liệu hiện tại của TMCut.

## Template

Chứa:

```text
Canvas
Timeline
Effects
Transitions
Text
Animation
Audio
```

## Preset

Chỉ chứa:

```text
Effect
Transition
Text style
Animation
Color
```

## Style

```text
Canvas
Color
Typography
Transition style
Motion style
```

## AutoCut Profile

```text
Pacing
Clip duration
Beat sensitivity
Transition preference
Face preference
Motion preference
Photo motion
Speed ramp
```

---

# 18. Phase 8 — Batch Render

Workflow:

```text
Template
+
100 source clips
+
100 photos
+
music
        ↓
Batch Engine
        ↓
100 projects
        ↓
Render Queue
```

Render queue:

```text
Pending
Running
Completed
Failed
Cancelled
```

Có:

```text
Pause
Resume
Cancel
Retry
Retry failed
Open output
```

---

# 19. Phase 9 — Media Analysis Engine

Đây là nền móng của AutoCut.

Không dùng LLM cho mọi thứ.

Local analysis:

```text
FFprobe
Scene detection
Motion detection
Blur detection
Brightness
Audio level
Face detection
Person detection
Object detection
OCR
```

Mỗi asset có:

```ts
interface TmcutMediaAnalysis {
  scenes: []
  faces: []
  subjects: []
  motion: []
  quality: {}
  audio: {}
  text: []
}
```

Cache kết quả.

Không phân tích lại nếu source không thay đổi.

---

# 20. Phase 10 — AutoCut AI

AutoCut gồm 5 bước:

```text
1. Import
2. Analyze
3. Generate
4. Review
5. Create Project
```

## Input

```text
Media
Music
Duration
Canvas
Style
Pacing
User instructions
```

## Local analysis

```text
Scene
Face
Motion
Quality
Beat
Transcript
```

## AI

LLM nhận dữ liệu đã phân tích.

LLM quyết định:

```text
Which clip
Which segment
Order
Duration
Transition
Speed
Photo motion
Text
Style
```

LLM trả:

```text
AutoCut DSL
```

Sau đó validate:

```text
AI JSON
 ↓
Schema validation
 ↓
Timeline validation
 ↓
Normalize
 ↓
Timeline DSL
```

Không cho AI trả FFmpeg command.

---

# 21. AutoCut DSL

Ví dụ:

```json
{
  "version": 1,
  "style": "cinematic",
  "duration": 30,
  "segments": [
    {
      "assetId": "video01",
      "sourceIn": 2.4,
      "sourceOut": 5.8,
      "speed": 1,
      "transition": {
        "type": "dissolve",
        "duration": 0.25
      }
    },
    {
      "assetId": "image01",
      "duration": 2.2,
      "motion": {
        "type": "kenBurns",
        "focus": "face"
      }
    }
  ]
}
```

Sau đó:

```text
AutoCut DSL
 ↓
Timeline DSL
 ↓
Editor
```

User phải có thể sửa kết quả AI bằng tay.

---

# 22. Phase 11 — Auto Captions

Pipeline:

```text
Audio
 ↓
ASR
 ↓
Transcript
 ↓
Word timestamps
 ↓
Subtitle Engine
 ↓
Timeline
```

Hỗ trợ:

```text
SRT
VTT
ASS
Embedded captions
Animated captions
Karaoke
```

Caption style:

```text
Default
Bold
Minimal
Karaoke
Social
```

---

# 23. Phase 12 — AI Smart Editing

Sau AutoCut mới làm AI assistant.

Ví dụ user:

> Làm video này nhanh hơn.

AI:

```text
Analyze timeline
 ↓
Reduce clip durations
 ↓
Increase pacing
 ↓
Adjust transitions
 ↓
Preview diff
```

Hoặc:

> Làm video cinematic hơn.

AI:

```text
Color
Motion
Transition
Speed
Music
```

AI không được sửa project trực tiếp.

Phải tạo:

```text
Edit Proposal
```

Ví dụ:

```text
AI proposes:

- Change 6 transitions
- Add 4 photo animations
- Change 3 clips to slow motion
- Apply cinematic color preset
```

User:

```text
Accept
Reject
Review
```

---

# 24. Phase 13 — Smart Reframe AI

Input:

```text
16:9 project
```

Output:

```text
9:16
1:1
4:5
```

AI xử lý:

```text
Face tracking
Subject tracking
Text reposition
Subtitle safe area
Crop
Scale
Keyframe adjustment
```

Đây là tính năng rất phù hợp cho:

```text
YouTube → Shorts
YouTube → TikTok
Landscape → Reels
```

---

# 25. Phase 14 — Export Profiles

Export profile:

```text
YouTube 1080p
YouTube 4K
Shorts 1080p
TikTok 1080p
Instagram Reels
Instagram Feed
Facebook
Custom
```

Advanced:

```text
Container
Codec
Encoder
Resolution
FPS
Bitrate
CRF
Audio codec
Audio bitrate
```

---

# 26. Database

Giữ các bảng hiện tại:

```text
tmcut_projects
tmcut_templates
tmcut_render_jobs
```

Nhưng bổ sung:

```text
tmcut_assets
tmcut_media_analysis
tmcut_project_snapshots
tmcut_export_profiles
tmcut_autocut_jobs
tmcut_ai_edits
```

Có thể để cache lớn ở local filesystem thay vì database.

---

# 27. AI Configuration

AI provider phải độc lập:

```ts
interface TmcutAiProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
}
```

Hỗ trợ:

```text
OpenAI-compatible
OpenRouter
Local Ollama
OpenCode proxy
9Router
OmniRoute
Custom API
```

AI config không hard-code trong AutoCut.

---

# 28. AI Prompt Architecture

Không gửi toàn bộ project JSON khổng lồ cho LLM.

Chia:

```text
System Prompt
+
Editing Rules
+
Media Summary
+
Music Analysis
+
User Instruction
+
Style Profile
```

Ví dụ:

```text
System:
You are a professional video editor.

Media:
20 clips
12 photos

Music:
128 BPM
32 beats
3 sections

Style:
Cinematic

Canvas:
9:16

User:
Create a 30 second travel montage.
```

AI trả JSON nhỏ.

---

# 29. Validation Layer

AI output bắt buộc:

```text
JSON Schema
 ↓
Zod validation
 ↓
Timeline validation
 ↓
Media existence validation
 ↓
Duration validation
 ↓
Canvas validation
 ↓
Normalize
```

Nếu AI trả sai:

```text
AI output
 ↓
Validation failed
 ↓
Repair
 ↓
Validate again
```

Không cho invalid data đi vào renderer.

---

# 30. Compiler Architecture

Không để một `compiler.ts` khổng lồ.

Tách:

```text
compiler/
├── index.ts
├── video.ts
├── image.ts
├── audio.ts
├── text.ts
├── transitions.ts
├── effects.ts
├── keyframes.ts
├── crop.ts
├── speed.ts
├── filters.ts
└── export.ts
```

Pipeline:

```text
Timeline DSL
 ↓
Normalize
 ↓
Build Render Graph
 ↓
Compile Video
 ↓
Compile Audio
 ↓
Compile Text
 ↓
Compile Effects
 ↓
Compile Transitions
 ↓
FFmpeg Command
```

---

# 31. Render Graph

Đây là một kiến trúc nên bổ sung sớm.

Không compile trực tiếp từ timeline sang command.

```text
Timeline DSL
     ↓
Render Graph
     ↓
FFmpeg
```

Render Graph:

```text
Source
 ↓
Trim
 ↓
Speed
 ↓
Crop
 ↓
Scale
 ↓
Transform
 ↓
Effect
 ↓
Transition
 ↓
Composite
 ↓
Output
```

Điều này giúp sau này thay FFmpeg hoặc thêm renderer khác dễ hơn.

---

# 32. Settings Architecture

Settings chia thành:

```text
Global Settings
Project Settings
Editor Settings
AI Settings
Export Settings
```

Global:

```text
Theme
Language
Cache
GPU
Default paths
AI provider
```

Project:

```text
Canvas
FPS
Background
Auto save
```

Editor:

```text
Snap
Timeline
Preview
Keyboard shortcuts
```

AI:

```text
Provider
Model
Temperature
Token limit
AutoCut defaults
```

Export:

```text
Encoder
Codec
Resolution
FPS
Bitrate
Output folder
```

---

# 33. Keyboard Shortcuts

TMCut phải có shortcut manager:

```text
Space       Play/Pause
S           Split
Delete      Delete
Ctrl+Z      Undo
Ctrl+Shift+Z Redo
Ctrl+C      Copy
Ctrl+V      Paste
Ctrl+D      Duplicate
M           Marker
I           Mark In
O           Mark Out
Home        Timeline start
End         Timeline end
```

Cho phép user customize.

---

# 34. Phase Execution Rules cho AI Coding Agent

Mỗi phase AI chỉ được:

1. Đọc architecture hiện tại.
2. Kiểm tra code đã tồn tại.
3. Không tạo duplicate engine.
4. Không phá API hiện tại.
5. Không thay đổi Timeline DSL mà không migration.
6. Hoàn thành types trước.
7. Hoàn thành domain logic trước.
8. Sau đó mới làm UI.
9. Sau đó integration.
10. Cuối cùng test.

Mỗi phase phải có:

```text
Implementation
Tests
Type checking
Lint
Build
Manual verification
```

---

# 35. Definition of Done

Một phase chỉ được đánh dấu hoàn thành khi:

```text
[ ] TypeScript không có error
[ ] ESLint không có error
[ ] Nuxt build thành công
[ ] Electron build thành công
[ ] Existing features không regression
[ ] UI hoạt động
[ ] IPC hoạt động
[ ] FFmpeg render hoạt động nếu liên quan
[ ] Project save/load hoạt động
[ ] Error handling hoàn chỉnh
[ ] Loading state hoàn chỉnh
[ ] Empty state hoàn chỉnh
[ ] i18n đầy đủ
```

Không đánh dấu `[x]` chỉ vì code đã được tạo.

---

# 36. Thứ tự triển khai chính thức

```text
PHASE 0
Foundation
       ↓
PHASE 1
Editor Core
       ↓
PHASE 1.5
Project + Media + Cache
       ↓
PHASE 2
Canvas + Aspect Ratio + Reframe
       ↓
PHASE 3
Keyframe + Animation
       ↓
PHASE 4
Effects + Transitions
       ↓
PHASE 5
Audio
       ↓
PHASE 6
Performance + Proxy + GPU
       ↓
PHASE 7
Template + Preset
       ↓
PHASE 8
Batch Render
       ↓
PHASE 9
Media Analysis
       ↓
PHASE 10
AutoCut AI
       ↓
PHASE 11
Auto Captions
       ↓
PHASE 12
AI Editing Assistant
       ↓
PHASE 13
AI Smart Reframe
       ↓
PHASE 14
Export Profiles
```

---

# 37. Ưu tiên thực tế

Nếu mục tiêu là nhanh chóng có một TMCut usable, không cần hoàn thành toàn bộ 14 phase.

MVP thực tế:

```text
Phase 0
   ↓
Phase 1
   ↓
Phase 1.5
   ↓
Phase 2
   ↓
Phase 3
   ↓
Phase 4
   ↓
Phase 5
   ↓
Phase 6
   ↓
Phase 7
   ↓
Phase 9
   ↓
Phase 10
```

Sau đó TMCut đã có thể đạt workflow:

```text
Import
  ↓
Chọn 16:9 / 9:16 / 1:1 / 4:5
  ↓
Import video + image + music
  ↓
AI phân tích
  ↓
AutoCut
  ↓
AI chọn đoạn
  ↓
Beat sync
  ↓
Photo zoom/focus
  ↓
Speed ramp
  ↓
Transition
  ↓
Text/caption
  ↓
Preview
  ↓
GPU Render
  ↓
MP4
```

---

# 38. Kiến trúc cuối cùng

Mục tiêu cuối:

```text
                         ┌─────────────────────┐
                         │       TMCut UI      │
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │   TMCut Domain      │
                         │                     │
                         │ Project             │
                         │ Media               │
                         │ Canvas              │
                         │ Timeline            │
                         │ Animation           │
                         │ Effects             │
                         │ Transition          │
                         │ Audio               │
                         │ Template            │
                         └──────────┬──────────┘
                                    │
                              Timeline DSL
                                    │
              ┌─────────────────────┴────────────────────┐
              │                                          │
       Manual Editing                              AI Editing
              │                                          │
              │                                  Media Analysis
              │                                          │
              │                                  Music Analysis
              │                                          │
              │                                       LLM
              │                                          │
              │                                    AutoCut DSL
              │                                          │
              └─────────────────────┬────────────────────┘
                                    │
                              Validation
                                    │
                              Render Graph
                                    │
                              FFmpeg Compiler
                                    │
                             Electron IPC
                                    │
                              Render Engine
                                    │
                           MP4 / MOV / WebM
```

---

# 39. Nguyên tắc quan trọng nhất

TMCut không nên phụ thuộc vào AI.

AI chỉ là một **Editing Engine**.

Người dùng vẫn có thể:

```text
Manual
   ↓
Timeline
   ↓
Render
```

hoặc:

```text
AI
 ↓
Timeline
 ↓
Manual adjustment
 ↓
Render
```

Điều này giúp TMCut không bị phụ thuộc vào một model AI, API hoặc nhà cung cấp AI duy nhất.

---

# 40. Kết luận

Roadmap mới ưu tiên theo thứ tự:

```text
Ổn định dữ liệu
      ↓
Editor
      ↓
Media
      ↓
Canvas
      ↓
Animation
      ↓
Effects
      ↓
Audio
      ↓
Performance
      ↓
Template
      ↓
Analysis
      ↓
AI
```

Đây là thứ tự nên giữ.

Đặc biệt **không nên đưa AutoCut AI lên quá sớm**. AutoCut chỉ thực sự tốt khi trước đó đã có:

* Media metadata
* Scene analysis
* Face/subject information
* Beat information
* Timeline DSL ổn định
* Transition engine
* Animation engine
* Photo motion
* Speed curve
* Smart crop
* Render graph

Khi đó AI chỉ cần làm phần khó nhất nhưng đúng phạm vi của nó:

> **"Từ dữ liệu media + nhạc + style + yêu cầu người dùng → quyết định cách dựng video."**

Còn TMCut sẽ chịu trách nhiệm biến quyết định đó thành **timeline có thể chỉnh sửa và render chính xác**.
