# TMCut Architecture & Roadmap v3

## Cross-Platform Video Editor — Web + Electron + Local Render + AI

**Status:** Architecture / Implementation Roadmap  
**Addendum:** v3.1 — Implementation bridge & next optimizations (10/2026, tm-tools)
**Product:** TMCut  
**Host applications:** `tm-tools` / `tmcut-web`  
**Primary runtime:** TypeScript + Vue/Nuxt + Electron  
**Future runtime:** WebCodecs/WASM/WebGPU + optional Rust core  
**Reference architecture:** OpenCut concepts, adapted to TMCut  
**Core principle:** Build TMCut as an independent editing engine, not as an Electron-only feature.

---

# 1. Mục tiêu kiến trúc

TMCut phải có khả năng chạy trên nhiều runtime:

```text
                    TMCut Core
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
      Electron          Web          Headless
      Runtime          Runtime       Runtime
          │              │              │
          ▼              ▼              ▼
       FFmpeg       WebCodecs/WASM   FFmpeg
       Native       WebGPU           Server
       GPU          Browser          GPU
```

UI không được phụ thuộc trực tiếp vào:

- Electron IPC
- FFmpeg binary
- Node.js filesystem
- browser-only APIs
- WebCodecs
- WebGPU
- một renderer cụ thể

Tất cả platform-specific functionality phải đi qua adapter/interface.

---

# 2. Những nguyên tắc lấy từ OpenCut

TMCut áp dụng có chọn lọc các ý tưởng sau:

## 2.1 Engine tách khỏi UI

```text
UI
 │
 ▼
Editor API
 │
 ▼
TMCut Core
```

UI chỉ điều khiển Core.

Không đặt business logic vào:

```text
Vue component
Pinia store
Electron IPC handler
Nuxt page
```

---

## 2.2 MediaTime thay cho floating-point seconds

Không dùng:

```ts
start = 1.333333
duration = 2.666666
```

làm đơn vị thời gian nội bộ.

Dùng:

```ts
type MediaTime = bigint
```

với:

```ts
const TICKS_PER_SECOND = 120_000
```

Ví dụ:

```text
1 second  = 120000 ticks
0.5 sec   = 60000 ticks
```

Lợi ích:

- frame-accurate
- không tích lũy floating-point error
- split/trim chính xác
- transition chính xác
- speed chính xác
- audio/video sync tốt hơn
- dễ snap theo frame

OpenCut hiện cũng dùng `MediaTime` 120.000 ticks/giây và rational `FrameRate`; đây là một trong những phần nên học trực tiếp về mặt kiến trúc. 

---

# 3. Rational Frame Rate

Không lưu:

```ts
fps: 29.97
```

làm giá trị chuẩn duy nhất.

Dùng:

```ts
interface FrameRate {
  numerator: number
  denominator: number
}
```

Ví dụ:

```ts
23.976 = {
  numerator: 24000,
  denominator: 1001
}

29.97 = {
  numerator: 30000,
  denominator: 1001
}

30 = {
  numerator: 30,
  denominator: 1
}
```

Tất cả:

```text
frame ↔ MediaTime
timecode
snap
seek
duration
export
```

đều sử dụng cùng một hệ thống.

---

# 4. Kiến trúc tổng thể

```text
┌───────────────────────────────────────────────┐
│                  TMCut UI                     │
│                                               │
│ Vue / Nuxt / Electron / Web                  │
│ Timeline / Inspector / Preview Controls      │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│                TMCut Editor API               │
│                                               │
│ Project API                                   │
│ Timeline API                                  │
│ Media API                                     │
│ Canvas API                                    │
│ Animation API                                 │
│ Effect API                                    │
│ Audio API                                     │
│ History API                                   │
│ Render API                                    │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│                  TMCut Core                   │
│                                               │
│ Project Engine                                │
│ Timeline Engine                               │
│ Media Engine                                  │
│ Canvas Engine                                 │
│ Animation Engine                              │
│ Effect Engine                                 │
│ Audio Engine                                  │
│ Subtitle Engine                               │
│ Template Engine                               │
│ History Engine                                │
│ Analysis Engine                               │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│              Timeline DSL v3                  │
│                                               │
│ MediaTime                                     │
│ Rational FPS                                  │
│ Tracks                                        │
│ Clips                                         │
│ Effects                                       │
│ Keyframes                                     │
│ Audio                                         │
│ Canvas                                        │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│                 Render Graph                  │
│                                               │
│ Normalize → Resolve → Compose → Encode       │
└──────────────┬────────────────┬───────────────┘
               │                │
               ▼                ▼
       Preview Pipeline     Export Pipeline
               │                │
               ▼                ▼
        Preview Engine      Render Engine
```

---

# 5. QUAN TRỌNG: Preview và Render là hai Engine khác nhau

Đây là thay đổi kiến trúc quan trọng nhất của roadmap này.

Không làm:

```text
Timeline
   ↓
FFmpeg
   ↓
Preview
```

và cũng không làm:

```text
Timeline
   ↓
FFmpeg
   ↓
Export
```

dùng chung một pipeline.

Thay vào đó:

```text
                 Timeline
                    │
                    ▼
              Render Graph
                    │
             ┌──────┴──────┐
             │             │
             ▼             ▼
       Preview Plan    Render Plan
             │             │
             ▼             ▼
      Preview Engine   Render Engine
```

---

# 6. Preview Engine

Preview Engine phục vụ:

- playback
- scrubbing
- seek
- timeline preview
- canvas preview
- transform
- text
- effects preview
- keyframe preview
- low-resolution preview
- realtime interaction

Interface:

```ts
interface PreviewEngine {
  initialize(): Promise<void>

  loadProject(project: TmcutProject): Promise<void>

  seek(time: MediaTime): Promise<void>

  play(): Promise<void>

  pause(): Promise<void>

  renderFrame(time: MediaTime): Promise<PreviewFrame>

  setQuality(level: PreviewQuality): void

  dispose(): Promise<void>
}
```

---

# 7. Preview Engine — Electron

Electron có thể sử dụng:

```text
HTMLVideoElement
Canvas
WebGL/WebGPU
Native media
Local media:// protocol
```

và trong tương lai:

```text
Rust/WASM compositor
```

Pipeline:

```text
Timeline
   ↓
Preview Graph
   ↓
Media Decoder
   ↓
Compositor
   ↓
Canvas/WebGPU
   ↓
Screen
```

Không gọi FFmpeg cho từng frame preview.

FFmpeg chỉ được sử dụng cho:

- media probing
- proxy
- thumbnail generation
- waveform
- special processing nếu cần
- final export

---

# 8. Preview Engine — Web

Web dùng:

```text
HTMLVideoElement
WebCodecs
Web Worker
WASM
WebGPU
Canvas
IndexedDB
File API
File System Access API
```

Pipeline:

```text
Local File
   ↓
Browser Decoder
   ↓
WebCodecs
   ↓
Compositor
   ↓
WebGPU/WASM
   ↓
Preview Canvas
```

Mục tiêu:

```text
Scrubbing ≠ Server request
Preview ≠ Upload video
Preview ≠ FFmpeg server
```

Video có thể vẫn nằm trên máy người dùng.

---

# 9. Render Engine

Render Engine chịu trách nhiệm:

- final export
- encoding
- bitrate
- codec
- resolution
- FPS
- audio encoding
- subtitles
- transitions
- effects
- muxing
- output file

Interface:

```ts
interface RenderEngine {
  prepare(plan: RenderPlan): Promise<RenderJob>

  render(job: RenderJob): Promise<RenderResult>

  cancel(jobId: string): Promise<void>

  getProgress(jobId: string): RenderProgress
}
```

---

# 10. Render Engine implementations

## Electron

```text
ElectronRenderEngine
        ↓
FFmpeg
        ↓
libx264 / NVENC / QSV / AMF
```

## Web

Có 3 mức:

### Level 1

```text
Browser → WebCodecs → encode
```

cho export đơn giản.

### Level 2

```text
Browser → WASM FFmpeg
```

cho một số workflow.

### Level 3

```text
Web
 ↓
Cloud Render API
 ↓
GPU Worker
 ↓
FFmpeg
```

cho project nặng.

---

# 11. Render Engine không được phụ thuộc UI

Không:

```ts
await window.electronAPI...
```

trong Core.

Mà:

```ts
const renderEngine = runtime.render

await renderEngine.render(plan)
```

Electron cung cấp:

```ts
ElectronRenderEngine
```

Web cung cấp:

```ts
WebRenderEngine
```

Cloud cung cấp:

```ts
CloudRenderEngine
```

---

# 12. Runtime Adapter

Tạo abstraction:

```ts
interface TmcutRuntime {
  media: MediaRuntime
  filesystem: FileSystemRuntime
  preview: PreviewEngine
  render: RenderEngine
  gpu: GpuRuntime
  storage: StorageRuntime
  worker: WorkerRuntime
}
```

Electron:

```text
ElectronRuntime
├── ElectronMediaRuntime
├── ElectronFilesystem
├── ElectronPreview
├── ElectronFFmpegRender
├── ElectronGPU
└── ElectronStorage
```

Web:

```text
WebRuntime
├── BrowserMediaRuntime
├── BrowserFilesystem
├── WebPreview
├── WebRender
├── WebGPU
└── IndexedDBStorage
```

---

# 13. Capability System

Không giả định mọi platform có cùng capability.

```ts
interface TmcutCapabilities {
  filesystem: boolean
  nativeFFmpeg: boolean
  webCodecs: boolean
  webGPU: boolean
  hardwareEncoding: boolean
  backgroundRender: boolean
  cloudRender: boolean
  largeFileAccess: boolean
}
```

Electron:

```text
filesystem          true
nativeFFmpeg        true
webCodecs           true
webGPU              true
hardwareEncoding    true
backgroundRender    true
cloudRender         true
largeFileAccess     true
```

Web:

```text
filesystem          permission-based
nativeFFmpeg        false
webCodecs           true
webGPU              capability-based
hardwareEncoding    browser-dependent
backgroundRender    limited
cloudRender         true
largeFileAccess     limited
```

UI tự động disable/enable tính năng.

---

# 14. Timeline DSL v3

Timeline trở thành source of truth.

```json
{
  "version": 3,
  "project": {
    "id": "...",
    "name": "...",
    "duration": 7200000
  },
  "canvas": {
    "width": 1920,
    "height": 1080,
    "fps": {
      "numerator": 30,
      "denominator": 1
    },
    "background": {}
  },
  "tracks": [],
  "markers": []
}
```

Clip:

```json
{
  "id": "clip-01",
  "type": "video",
  "assetId": "asset-01",

  "source": {
    "in": 0,
    "out": 600000
  },

  "timeline": {
    "start": 120000,
    "duration": 600000
  },

  "speed": 1,

  "transform": {
    "x": 0,
    "y": 0,
    "scaleX": 1,
    "scaleY": 1,
    "rotation": 0,
    "opacity": 1
  },

  "crop": {},

  "effects": [],

  "transitions": {},

  "keyframes": [],

  "audio": {}
}
```

---

# 15. Không lưu path vật lý trực tiếp trong Timeline

Không:

```json
{
  "src": "D:/Videos/a.mp4"
}
```

Thay bằng:

```json
{
  "assetId": "asset-123"
}
```

Asset registry:

```json
{
  "id": "asset-123",
  "kind": "video",
  "name": "a.mp4",
  "source": {
    "type": "local"
  },
  "locator": {
    "runtime": "electron",
    "path": "D:/Videos/a.mp4"
  }
}
```

Web:

```json
{
  "source": {
    "type": "browser-file"
  }
}
```

Cloud:

```json
{
  "source": {
    "type": "cloud",
    "url": "..."
  }
}
```

Timeline không cần biết.

---

# 16. Media Engine

Media Engine quản lý:

```text
MediaAsset
MediaMetadata
MediaSource
MediaProxy
MediaThumbnail
MediaWaveform
MediaCache
MediaAnalysis
```

Interface:

```ts
interface MediaEngine {
  import(source: MediaSource): Promise<MediaAsset>

  probe(assetId: string): Promise<MediaMetadata>

  createProxy(assetId: string): Promise<MediaProxy>

  generateThumbnail(assetId: string, time: MediaTime): Promise<Thumbnail>

  generateWaveform(assetId: string): Promise<Waveform>

  relink(assetId: string, source: MediaSource): Promise<void>
}
```

---

# 17. Project Engine

Project:

```text
Project
├── Metadata
├── Canvas
├── Timeline
├── Assets
├── Settings
├── Markers
├── Templates
└── History
```

Project file local:

```text
project/
├── project.json
├── assets.json
├── cache/
├── thumbnails/
├── waveforms/
├── proxies/
└── renders/
```

Database chỉ lưu:

```text
project metadata
timeline
template
cloud synchronization
```

Không upload media local mặc định.

---

# 18. Canvas Engine

Canvas là first-class object.

Presets:

```text
16:9
9:16
1:1
4:5
4:3
21:9
Custom
```

Canvas:

```ts
interface CanvasConfig {
  width: number
  height: number
  fps: FrameRate
  background: CanvasBackground
  fitMode: "fit" | "fill" | "crop" | "stretch"
}
```

Future:

```text
Smart Reframe
Safe Area
Guides
Social Presets
Multi-format Project
```

---

# 19. History Engine

Dùng command pattern:

```text
AddClip
DeleteClip
SplitClip
MoveClip
TrimClip
SetSpeed
SetTransform
SetEffect
SetKeyframe
AddTransition
SetCanvas
```

Mỗi command:

```ts
interface EditorCommand {
  execute(): void
  undo(): void
}
```

Undo/Redo không được đặt trong Vue component.

---

# 20. Ripple Editing

Ripple không viết inline trong từng command.

Pipeline:

```text
Before Timeline
       ↓
Command
       ↓
After Timeline
       ↓
Timeline Diff
       ↓
Interval Set
       ↓
Ripple Adjustments
       ↓
Apply
```

Ví dụ:

```ts
interface RippleAdjustment {
  trackId: string
  from: MediaTime
  delta: MediaTime
}
```

Điều này giúp:

- dễ test
- dễ undo
- dễ batch
- dễ AI manipulation
- không phụ thuộc UI

---

# 21. Render Graph

Compiler cũ:

```text
Timeline JSON
   ↓
FFmpeg command
```

được thay bằng:

```text
Timeline DSL
      ↓
Normalize
      ↓
Resolve Assets
      ↓
Build Scene Graph
      ↓
Build Render Graph
      ↓
Render Plan
      ↓
Runtime Renderer
```

---

# 22. Render Graph nodes

Ví dụ:

```text
Source
Trim
Speed
Transform
Crop
Mask
Effect
Composite
Transition
Text
Subtitle
Audio
Mix
Encode
Mux
```

Ví dụ:

```text
Video
 ↓
Trim
 ↓
Speed
 ↓
Scale
 ↓
Color
 ↓
Blur
 ↓
Transform
 ↓
Composite
 ↓
Encode
```

---

# 23. Preview Graph và Render Graph dùng chung semantic graph

Không duplicate effect definitions.

Ví dụ:

```ts
BlurEffect {
  radius: number
}
```

Preview:

```text
BlurEffect
 ↓
GPU shader
```

Render:

```text
BlurEffect
 ↓
FFmpeg filter
```

Cùng một definition.

---

# 24. Effect Registry

```ts
interface EffectDefinition {
  id: string
  name: string

  parameters: EffectParameter[]

  preview: PreviewEffectAdapter

  render: RenderEffectAdapter
}
```

Ví dụ:

```text
blur
glow
brightness
contrast
saturation
grain
sharpen
chromatic-aberration
vignette
lut
```

Preview và Render có thể implement khác nhau.

---

# 25. Đây là nguyên tắc cực kỳ quan trọng

Không đảm bảo:

```text
Preview implementation === Render implementation
```

Chỉ đảm bảo:

```text
Preview semantic result ≈ Render semantic result
```

Ví dụ:

```text
Preview:
GPU Blur

Render:
FFmpeg boxblur
```

hoặc:

```text
Preview:
WebGPU shader

Render:
FFmpeg filtergraph
```

Mục tiêu là preview nhanh, render chính xác.

---

# 26. Preview Quality System

Có:

```text
Draft
Low
Medium
High
Full
```

Preview có thể:

```text
720p
1/2 resolution
1/4 resolution
proxy
skip expensive effects
```

Render luôn sử dụng:

```text
Full Resolution
Full Quality
Final FPS
Final Effects
```

---

# 27. Proxy Engine

Khi media lớn:

```text
Original 4K/8K
      ↓
Proxy 720p/1080p
      ↓
Preview
```

Export:

```text
Original
   ↓
Render
```

Proxy chỉ phục vụ preview.

---

# 28. Cache Engine

Cache:

```text
Media Probe
Thumbnail
Waveform
Proxy
Frame
Preview
Analysis
Caption
Beat
Scene
```

Key:

```text
assetHash
+
sourceModification
+
engineVersion
+
effectVersion
```

Ví dụ:

```text
cache/
  media/
  thumbnails/
  waveform/
  proxy/
  frames/
  analysis/
```

---

# 29. Rust/WASM Strategy

Không chuyển toàn bộ TMCut sang Rust ngay.

Giai đoạn đầu:

```text
TypeScript Core
```

Sau đó chỉ chuyển workload nặng:

```text
MediaTime
FrameRate
Compositor
Effects
Masks
Image processing
Geometry
```

Architecture:

```text
TypeScript
    │
    ├── Core API
    │
    └── Native/WASM Adapter
              │
              ▼
          Rust/WASM
```

Sau này:

```text
TypeScript Core
      ↓
Rust Core
```

mà Editor API vẫn giữ nguyên.

---

# 30. Vì sao không chuyển Rust ngay?

TMCut hiện đã có:

- Vue
- Nuxt
- Electron
- FFmpeg
- Timeline
- Compiler
- Task Manager

và Phase 1 đã hoàn thành.

Do đó không nên rewrite toàn bộ.

Thay đổi:

```text
architecture
```

trước khi thay đổi:

```text
implementation language
```

---

# 31. TMCut Package Architecture

Tách TMCut thành workspace/packages.

```text
tmcut/
│
├── packages/
│   │
│   ├── core/
│   │   ├── project/
│   │   ├── timeline/
│   │   ├── media/
│   │   ├── canvas/
│   │   ├── animation/
│   │   ├── effects/
│   │   ├── audio/
│   │   ├── subtitle/
│   │   ├── history/
│   │   └── editor-api/
│   │
│   ├── types/
│   │
│   ├── render/
│   │   ├── graph/
│   │   ├── compiler/
│   │   └── plan/
│   │
│   ├── preview/
│   │   ├── core/
│   │   ├── canvas/
│   │   └── compositor/
│   │
│   ├── media/
│   │
│   ├── ai/
│   │
│   ├── templates/
│   │
│   └── wasm/
│
├── apps/
│   ├── desktop/
│   └── web/
│
└── tools/
    └── cli/
```

---

# 32. Desktop App

Trong `tm-tools`:

```text
tm-tools
└── TMCut
      │
      ├── @tmcut/core
      ├── @tmcut/preview
      ├── @tmcut/render
      └── @tmcut/media
```

Electron cung cấp:

```text
ElectronRuntime
ElectronRenderEngine
ElectronMediaEngine
ElectronFileSystem
```

---

# 33. Web App

Tách sau này:

```text
tmcut-web
```

có:

```text
Nuxt
Vue
@tmcut/core
@tmcut/preview
@tmcut/media
@tmcut/ai
```

và:

```text
WebRuntime
WebPreviewEngine
WebRenderEngine
BrowserMediaEngine
```

---

# 34. Web App không upload media mặc định

Flow:

```text
User
 ↓
Select File
 ↓
Browser File / FileSystemHandle
 ↓
MediaAsset
 ↓
TMCut Core
 ↓
Preview
```

Server chỉ nhận:

```text
project metadata
timeline
AI request
template
optional cloud asset
```

Nếu user chọn Cloud Render:

```text
Project
 ↓
Cloud Render API
 ↓
Upload required assets
 ↓
Render
 ↓
Download result
```

---

# 35. TM Hub Integration

TMCut sử dụng TM Hub cho:

```text
Authentication
Application identity
AI configuration
User settings
Templates
Permissions
Cloudinary
Notifications
Feature flags
```

Nhưng TMCut Core không phụ thuộc TM Hub.

```text
TMCut Core
    │
    └── optional services
             │
             ▼
          TM Hub
```

Điều này giúp TMCut vẫn chạy offline.

---

# 36. AI Architecture

AI không được trực tiếp gọi:

```text
FFmpeg
filesystem
Vue
Electron IPC
```

AI flow:

```text
User
 ↓
AI Assistant
 ↓
Media Analysis
 ↓
AI Decision
 ↓
Editor Operations
 ↓
Timeline DSL
 ↓
Validation
 ↓
Render Graph
```

---

# 37. Editor API dành cho AI

Ví dụ:

```ts
editor.timeline.addClip()

editor.timeline.splitClip()

editor.timeline.removeClip()

editor.timeline.moveClip()

editor.timeline.setSpeed()

editor.timeline.setVolume()

editor.timeline.addTransition()

editor.timeline.addEffect()

editor.timeline.addKeyframe()

editor.canvas.setAspectRatio()

editor.subtitle.add()

editor.export.createPlan()
```

AI chỉ tạo operations.

---

# 38. AI phải tạo Edit Plan

Ví dụ:

```json
{
  "version": 1,
  "operations": [
    {
      "type": "removeSilence",
      "threshold": -35
    },
    {
      "type": "setCanvas",
      "width": 1080,
      "height": 1920
    },
    {
      "type": "addCaption",
      "style": "shorts"
    },
    {
      "type": "addMusic",
      "assetId": "music-01"
    }
  ]
}
```

Sau đó:

```text
AI Plan
 ↓
Schema Validation
 ↓
Permission Validation
 ↓
Timeline Validation
 ↓
Normalize
 ↓
Apply
```

---

# 39. AutoCut Engine

Pipeline:

```text
Import
 ↓
Probe
 ↓
Scene Analysis
 ↓
Audio Analysis
 ↓
Speech/Transcript
 ↓
Face/Person Analysis
 ↓
Beat Analysis
 ↓
Media Summary
 ↓
AI
 ↓
Edit Plan
 ↓
Review
 ↓
Apply
 ↓
Timeline
```

AI không cần nhận toàn bộ video.

---

# 40. Media Analysis Engine

Analysis:

```text
FFprobe
Scene Detection
Motion
Blur
Brightness
Audio Level
Speech
Transcript
Face
Person
Object
OCR
Beat
BPM
```

Kết quả lưu:

```text
tmcut_media_analysis
```

và cache theo asset.

---

# 41. AutoCut không được phá Timeline

AutoCut phải tạo:

```text
Draft Project
```

trước.

Flow:

```text
Source Project
      │
      ▼
AutoCut Draft
      │
      ▼
Mini Timeline Review
      │
      ├── Accept
      ├── Edit
      └── Regenerate
```

Chỉ khi user Apply:

```text
Draft
 ↓
Main Project
```

---

# 42. Template Engine

Template không lưu absolute path.

Template:

```text
Canvas
Timeline structure
Text styles
Transitions
Effects
Animations
Audio behavior
Placeholders
```

Ví dụ:

```json
{
  "placeholders": [
    {
      "id": "video-main",
      "type": "video"
    },
    {
      "id": "title",
      "type": "text"
    }
  ]
}
```

---

# 43. Batch Render

```text
Template
+
Media Set
      ↓
Project Generator
      ↓
N Projects
      ↓
Render Queue
      ↓
Render Engine
```

Electron:

```text
Local queue
```

Cloud:

```text
Server queue
```

---

# 44. Headless TMCut

Tạo CLI:

```bash
tmcut render project.json
```

hoặc:

```bash
tmcut render project.json --output result.mp4
```

và:

```bash
tmcut batch template.json assets/
```

Mục tiêu:

```text
CI/CD
Batch
Automation
AI Agent
MCP
Server rendering
```

---

# 45. MCP

Sau khi Editor API ổn định:

```text
MCP Server
    ↓
Editor API
    ↓
TMCut Core
```

Tools:

```text
project.create
project.open
media.list
media.analyze
timeline.add
timeline.split
timeline.trim
timeline.move
timeline.effect
timeline.transition
caption.generate
autocut.generate
render.preview
render.export
```

Không expose raw filesystem/FFmpeg command.

---

# 46. Plugin System

Thiết kế từ đầu nhưng triển khai sau.

```ts
interface TmcutPlugin {
  id: string
  name: string

  effects?: EffectDefinition[]
  transitions?: TransitionDefinition[]
  exporters?: ExporterDefinition[]
  analyzers?: AnalyzerDefinition[]
}
```

Plugin có thể thêm:

```text
Effect
Transition
Analyzer
Template
Exporter
AI provider
```

---

# 47. Database v2

Giữ:

```text
tmcut_projects
tmcut_templates
tmcut_render_jobs
```

Thêm:

```text
tmcut_assets
tmcut_media_analysis
tmcut_project_snapshots
tmcut_export_profiles
tmcut_autocut_jobs
tmcut_ai_edits
```

---

# 48. `tmcut_assets`

```text
id
project_id
user_id
app_id
kind
name
mime_type
duration
width
height
fps
size
hash
source_type
source_locator
metadata
created_at
updated_at
```

---

# 49. `tmcut_media_analysis`

```text
asset_id
version
scenes
speech
transcript
faces
objects
motion
brightness
blur
audio
beats
bpm
ocr
created_at
```

---

# 50. `tmcut_project_snapshots`

Dùng cho:

```text
autosave
undo recovery
crash recovery
version history
AI rollback
```

Ví dụ:

```text
Project
 ├── Snapshot 1
 ├── Snapshot 2
 ├── Snapshot 3
 └── Current
```

---

# 51. Project Sync

Desktop:

```text
Local First
    ↓
Optional Cloud Sync
```

Web:

```text
IndexedDB First
    ↓
Optional Cloud Sync
```

Server:

```text
Supabase / MongoDB
```

Không để network latency ảnh hưởng timeline editing.

---

# 52. ROADMAP IMPLEMENTATION

## Phase 0 — Foundation

**Trạng thái: đã hoàn thành một phần**

Giữ lại:

- `/tmcut`
- `/tmcut/editor`
- `/tmcut/templates`
- `/tmcut/autocut`
- TMCut components
- existing FFmpeg task manager
- existing Electron IPC
- project CRUD
- i18n
- existing Timeline MVP

Nguồn roadmap cũ đã xác nhận các phần này đã có.

---

# Phase 1 — Core Extraction

**Ưu tiên cao nhất**

**Trạng thái 10/2026:** đã khởi tạo — `D:/Applications/tmcut-core` (engine thuần,
zero-dep, 55 unit tests chạy bằng plain node; `types/` chứa DSL v3 — logical
`@tmcut/types`, versioned cùng repo). Verify: `pnpm test:core`,
`pnpm check:core`, `pnpm lint:core`, `pnpm typecheck:core` (tsc strict).

Mục tiêu:

> Tách TMCut khỏi Electron-specific architecture.

Tasks:

- tạo `@tmcut/types`
- tạo `@tmcut/core`
- tạo `@tmcut/render`
- tạo `@tmcut/preview`
- tạo `MediaTime`
- tạo `FrameRate`
- tạo runtime interfaces
- chuyển Timeline DSL vào Core
- chuyển History vào Core
- chuyển Project Engine vào Core
- tạo Editor API
- viết unit tests

Không thêm feature lớn trong phase này.

---

# Phase 2 — Timeline Engine v3

**Trạng thái 10/2026:** engine thuần trong `D:/Applications/tmcut-core`
(`timeline` + `selection` + `markers` + `editing` + `v1compat` bridge):
multi-select, group/link expand, markers, track lock-guard, ripple delete,
magnetic snap, copy/paste, duplicate. App nối qua `applyV3Edit` (convert
v1→v3 → op → merge theo id, clip không đụng không bị rewrite; undo cũ bọc
ngoài): toolbar Duplicate/Paste/Ripple-toggle, phím Ctrl+C/V/D/S, i18n đủ.
Verify: `pnpm test:core` (66 tests), `pnpm lint:core`, `pnpm check:core`,
`pnpm typecheck` app PASS.

Tasks:

- Timeline DSL v3
- MediaTime
- Rational FPS
- frame snapping
- timecode
- multi-track
- multi-select
- grouping
- linked clips
- markers
- track lock
- track mute
- track visibility
- ripple editing
- magnetic snapping
- copy/paste
- duplicate
- undo/redo

Definition of Done:

```text
Timeline không import:
Vue
Nuxt
Electron
FFmpeg
```

---

# Phase 3 — Media Engine

**Trạng thái 10/2026:** pure engine trong `D:/Applications/tmcut-core`
(`assets` registry, `probe` normalize ffprobe, `cache` key FNV-1a + proxy
args plan) + types `TmcutMediaMetadata`/`TmcutMediaProxy`; app nối core qua
alias `@tmcut-core` (3 utils rewired, typecheck PASS). Runtime adapters:
Electron gom pipeline analyze thành 1 IPC `tmcut:analyzeAsset`
(stat + probe JSON + thumb/waveform), renderer chuẩn hóa bằng core
`normalizeProbe`, cache key thống nhất portable (file sha1 cũ thành orphan,
tự tái tạo). Còn lại: Browser runtime.
Verify: `pnpm test:core` (66 tests), `pnpm lint:core`, `pnpm check:core`.

Tasks:

- Asset Registry
- MediaAsset
- MediaSource
- FFprobe adapter
- thumbnail
- waveform
- metadata
- media relink
- hash
- cache
- proxy
- local file abstraction

Electron:

```text
ElectronMediaRuntime
```

Web:

```text
BrowserMediaRuntime
```

---

# Phase 4 — Canvas Engine

Tasks:

- 16:9
- 9:16
- 1:1
- 4:5
- 4:3
- 21:9
- Custom
- fit
- fill
- crop
- stretch
- background
- safe area
- guides
- zoom
- pan
- smart reframe foundation

---

# Phase 5 — Preview Engine

**Đây là phase tách Preview khỏi Render.**

## Electron

Implement:

```text
ElectronPreviewEngine
```

với:

```text
HTMLVideoElement
Canvas
WebGPU/WebGL fallback
local media protocol
proxy
```

## Web

Implement:

```text
WebPreviewEngine
```

với:

```text
WebCodecs
Web Worker
WebGPU
Canvas
WASM fallback
```

Preview không được gọi final FFmpeg pipeline.

---

# Phase 6 — Render Graph & Render Engine

Refactor compiler hiện tại:

```text
compiler.ts
```

thành:

```text
render/
├── graph/
├── normalize/
├── resolver/
├── ffmpeg/
├── plan/
└── adapters/
```

Flow:

```text
Timeline
 ↓
Normalize
 ↓
Resolve
 ↓
Render Graph
 ↓
Render Plan
 ↓
ElectronRenderEngine
 ↓
FFmpeg
```

Giữ nguyên:

```text
useToolTaskManager('ffmpeg')
```

làm execution layer hiện tại.

---

# Phase 7 — Effects & Animation

Tasks:

- Effect Registry
- Blur
- Glow
- Grain
- Color
- LUT
- Sharpen
- Vignette
- RGB split
- Mask
- Chroma key
- Keyframe
- interpolation
- easing
- bezier
- speed curve
- reverse

Mỗi effect có:

```text
semantic definition
preview adapter
render adapter
```

---

# Phase 8 — Audio Engine

Tasks:

- volume
- fade
- normalize
- audio trim
- speed
- maintain pitch
- ducking
- voice detection
- waveform
- beat detection
- BPM
- beat markers
- music sync
- audio transitions

---

# Phase 9 — Text & Subtitle Engine

Tasks:

- text elements
- font registry
- styles
- entrance
- emphasis
- exit
- karaoke
- caption
- word-level timestamp
- subtitle import
- subtitle export
- safe area
- caption templates

---

# Phase 10 — Proxy & Performance

Tasks:

- proxy generation
- preview resolution
- frame cache
- GPU detection
- dropped-frame monitor
- memory management
- worker scheduling
- large-project optimization
- 4K test
- 8K stress test

Target:

```text
Timeline interaction
→ UI thread không bị block
```

---

# Phase 11 — Web Runtime

Tạo:

```text
apps/tmcut-web
```

hoặc project riêng:

```text
tmcut-web
```

Stack:

```text
Nuxt 4
Vue
TMCut Core
TMCut UI
Web Preview Engine
Web Media Runtime
Web Render Engine
```

Features:

- local import
- timeline
- preview
- basic effects
- text
- captions
- local export
- cloud export

---

# Phase 12 — Web Local Processing

Implement:

```text
Web Worker
WebCodecs
WebGPU
WASM
IndexedDB
File System Access
```

Mục tiêu:

```text
Không upload video
→ edit
→ preview
→ export local
```

khi browser capability cho phép.

Fallback:

```text
Cloud Render
```

---

# Phase 13 — Desktop Power Features

Electron:

- FFmpeg native
- NVENC
- QSV
- AMF
- batch rendering
- watch folders
- huge files
- network storage
- proxy
- local AI
- background render
- automation
- filesystem integration

---

# Phase 14 — Template Engine

Tasks:

- template schema
- placeholders
- media replacement
- text replacement
- style replacement
- template preview
- template versioning
- builtin templates
- user templates
- batch apply

---

# Phase 15 — Batch Render

```text
Template
+
Media Collection
 ↓
Project Generator
 ↓
Render Queue
 ↓
Render Engine
```

Support:

```text
Electron local
Web cloud
Headless
```

---

# Phase 16 — Media Analysis Engine

Implement:

```text
FFprobe
Scene detection
Motion
Blur
Brightness
Audio level
Speech
Transcript
Face
Person
Object
OCR
Beat
BPM
```

Analysis must be cacheable.

---

# Phase 17 — AutoCut AI

Pipeline:

```text
Import
 ↓
Analyze
 ↓
Generate Edit Plan
 ↓
Validate
 ↓
Review
 ↓
Apply
 ↓
Timeline
```

AI providers:

```text
OpenAI-compatible
OpenRouter
Ollama
OpenCode proxy
9Router
OmniRoute
Custom provider
```

TMCut Core không phụ thuộc provider.

---

# Phase 18 — AI Editing Assistant

User có thể nói:

```text
"Remove boring parts."

"Make this a 30-second short."

"Focus on the speaker."

"Make it 9:16."

"Add captions."

"Make the intro faster."
```

AI tạo:

```text
Edit Plan
```

không trực tiếp sửa FFmpeg.

---

# Phase 19 — Smart Reframe

Pipeline:

```text
Person Detection
+
Face Detection
+
Motion
+
Composition
      ↓
Focus Point
      ↓
Keyframes
      ↓
Canvas 9:16
```

Support:

```text
16:9 → 9:16
16:9 → 1:1
16:9 → 4:5
```

---

# Phase 20 — Headless Engine

CLI:

```bash
tmcut render project.json
tmcut preview project.json
tmcut analyze video.mp4
tmcut autocut video.mp4
tmcut batch template.json assets/
```

Không cần UI.

---

# Phase 21 — MCP

```text
AI Agent
 ↓
TMCut MCP
 ↓
Editor API
 ↓
TMCut Core
```

Mục tiêu:

```text
OpenCode
Claude
Codex
ChatGPT
Custom Agents
```

có thể điều khiển TMCut qua API an toàn.

---

# Phase 22 — Plugin System

Plugin API:

```text
Effect
Transition
Analyzer
Template
Exporter
AI Provider
Media Provider
```

Plugin không được truy cập trực tiếp internal state.

---

# Phase 23 — Rust/WASM Optimization

Chỉ chuyển workload cần hiệu năng:

```text
MediaTime
FrameRate
Compositor
Effects
Masks
Geometry
Image Processing
```

Kiến trúc:

```text
TMCut Editor API
        ↓
TMCut Core
        ↓
Native/WASM Adapter
        ↓
Rust
```

Không rewrite UI.

---

# 53. Folder structure cuối cùng

```text
tmcut/
│
├── packages/
│
│   ├── types/
│   │
│   ├── core/
│   │   ├── project/
│   │   ├── timeline/
│   │   ├── media/
│   │   ├── canvas/
│   │   ├── animation/
│   │   ├── effects/
│   │   ├── audio/
│   │   ├── subtitle/
│   │   ├── history/
│   │   ├── templates/
│   │   └── editor-api/
│   │
│   ├── media/
│   │
│   ├── preview/
│   │   ├── core/
│   │   ├── web/
│   │   └── electron/
│   │
│   ├── render/
│   │   ├── graph/
│   │   ├── normalize/
│   │   ├── plan/
│   │   ├── ffmpeg/
│   │   ├── webcodecs/
│   │   └── cloud/
│   │
│   ├── ai/
│   │
│   ├── templates/
│   │
│   └── wasm/
│
├── apps/
│   ├── desktop/
│   ├── web/
│   ├── cli/
│   └── mcp/
│
└── docs/
    ├── architecture/
    ├── timeline/
    ├── rendering/
    ├── preview/
    ├── plugins/
    └── ai/
```

---

# 54. Dependency rules

Đây là luật bắt buộc.

```text
UI
 ↓
Editor API
 ↓
Core
 ↓
Interfaces
 ↓
Runtime Adapter
```

Không được:

```text
Core → Vue
Core → Nuxt
Core → Electron
Core → Node
Core → FFmpeg
```

Không được:

```text
Timeline → Preview
Timeline → Render
```

Mà:

```text
Timeline
   ↓
Render Graph
   ↓
Preview / Render
```

---

# 55. Preview và Render dependency

```text
                 Timeline DSL
                      │
                      ▼
                Render Graph
                 │        │
                 │        │
                 ▼        ▼
             Preview    Render
              Engine     Engine
                 │        │
        ┌────────┘        └─────────┐
        ▼                           ▼
 WebGPU/WebCodecs             FFmpeg/NVENC
 WASM                         WebCodecs
 Canvas                       Cloud GPU
```

---

# 56. Definition of Done

Mỗi phase phải đạt:

```text
TypeScript strict
ESLint
Unit tests
Runtime tests
No circular dependency
No UI logic in Core
No Electron import in Core
No FFmpeg import in Core
i18n
Error handling
Loading state
Empty state
Progress state
Cancel state
Retry state
```

---

# 57. Architecture tests

Tạo automated architecture checks:

```text
core cannot import electron
core cannot import vue
core cannot import nuxt
core cannot import ffmpeg
preview cannot import render
render cannot import preview
timeline cannot import UI
```

Đây là phần rất quan trọng để dự án không bị architecture drift.

---

# 58. Testing Matrix

Mỗi feature cần test:

```text
Timeline
   ├── Unit
   ├── Editor
   ├── Preview
   └── Render

Effects
   ├── Preview
   └── Render

Audio
   ├── Preview
   └── Render

Canvas
   ├── Web
   └── Electron
```

Đặc biệt cần snapshot:

```text
Timeline DSL
Render Graph
Render Plan
```

---

# 59. Compatibility

Timeline DSL phải có:

```json
{
  "version": 3
}
```

Migration:

```text
v1
 ↓
v2
 ↓
v3
```

Không được phá project cũ.

---

# 60. Roadmap ưu tiên thực tế

Không nên làm tất cả cùng lúc.

Thứ tự nên là:

```text
1. Core Extraction
        ↓
2. MediaTime + Rational FPS
        ↓
3. Timeline v3
        ↓
4. Media Engine
        ↓
5. Preview Engine
        ↓
6. Render Graph
        ↓
7. Render Engine
        ↓
8. Effects
        ↓
9. Audio
        ↓
10. Canvas
        ↓
11. Web Runtime
        ↓
12. Proxy/Performance
        ↓
13. Templates
        ↓
14. Batch
        ↓
15. Analysis
        ↓
16. AutoCut
        ↓
17. AI Assistant
        ↓
18. Headless
        ↓
19. MCP
        ↓
20. Rust/WASM optimization
```

---

# 61. MVP milestones

## MVP A — Desktop Editor

```text
Electron
+
TMCut Core
+
Preview Engine
+
FFmpeg Render Engine
```

Đây là mục tiêu gần nhất.

---

## MVP B — Web Editor

```text
Nuxt
+
TMCut Core
+
Web Preview Engine
+
Web Render Engine
```

Có thể import local mà không upload.

---

## MVP C — AI Editor

```text
TMCut Core
+
Media Analysis
+
AutoCut
+
Editor API
```

---

## MVP D — Automation Platform

```text
Headless
+
CLI
+
MCP
+
Batch Render
```

---

# 62. Kiến trúc sản phẩm cuối

```text
                         TM Hub
                           │
           ┌───────────────┼────────────────┐
           │               │                │
           ▼               ▼                ▼
       TMCut Web      TMCut Desktop      TM Tools
           │               │                │
           └───────────────┼────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ TMCut Core  │
                    └──────┬──────┘
                           │
               ┌───────────┼───────────┐
               ▼           ▼           ▼
           Timeline      Media       Canvas
               │           │           │
               └───────────┼───────────┘
                           ▼
                    Render Graph
                       │      │
                       │      │
              ┌────────┘      └────────┐
              ▼                        ▼
       Preview Engine             Render Engine
              │                        │
       ┌──────┴───────┐          ┌─────┴────────┐
       ▼              ▼          ▼              ▼
    WebGPU        WebCodecs   FFmpeg         Cloud GPU
    WASM          Browser     NVENC          Server
```

---

# 63. Nguyên tắc cuối cùng

TMCut không nên trở thành:

> "Một bản clone CapCut bằng Vue + FFmpeg."

TMCut nên trở thành:

> **Một Video Editing Engine có nhiều runtime.**

Trong đó:

```text
Timeline DSL
      +
Editor API
      +
Render Graph
      +
Preview Engine
      +
Render Engine
      +
Media Engine
      +
AI Editing Engine
```

là sản phẩm lõi.

Electron, Web, CLI, MCP chỉ là các **host/client khác nhau**.

Đây là điểm quan trọng nhất để TMCut có thể phát triển lâu dài mà không bị khóa vào một framework hoặc một renderer.

---

# 64. v3.1 — Cầu nối giữa roadmap và code hiện tại (tm-tools, 10/2026)

## 64.1 Những phần đã bám đúng doc

```text
Preview (HTMLVideoElement + media://local) ≠ Render (FFmpeg task manager)   (§5–§7)
FFmpeg chỉ dùng cho: probe / thumbnail / waveform / export                  (§7)
Cache theo asset (thumbnails/, waveforms/ keyed sha1 path+mtime+size)       (§28)
Snapshot + recovery + local-first, i18n / empty / loading states            (§50, §51, §56)
CapCut-like editor UI: transport disable khi timeline trống, library grid +
badge thời lượng / "Đã thêm", filmstrip, waveform audio, undo/redo snapshot,
track eye/lock/mute, panel Chi tiết project, tab bar danh mục media
```

## 64.2 Khoảng cách còn lại (ghi trung thực để lập kế hoạch)

```text
Doc yêu cầu                          Hiện trạng tm-tools
─────────────────────────────────    ─────────────────────────────────────
MediaTime 120.000 ticks (§2)         float seconds (in/out/offset, playhead)
assetId thay path (§15)              clip.src lưu path trực tiếp, relink
                                     dựa trên normalize path
Command-pattern History (§19)        snapshot JSON timeline+canvas (undo/redo
                                     chạy được nhưng chưa phải command,
                                     chưa ripple §20)
Effect Registry dual-adapter (§24)   tab Effects/Transitions/Filters mới là
                                     placeholder "Sắp ra mắt"
Audio Engine (Phase 8)               chưa có engine phát/đồng bộ audio;
                                     mute audio mới ở mức lưu flag
AutoCut (Phase 17, §39–§41)          mới là stepper UI (step 1 đã wire
                                     import + tạo project)
AI provider (Phase 17)               tm-tools chưa có gateway; TM Hub đã có
                                     config per-app (aiProvider/aiModel/
                                     aiApiKey/aiBaseUrl)
Text overlay                         scale cứng fontSize * 0.7, x/y theo px
                                     thô — chưa đồng bộ canvas scale
```

---

# 65. 🚀 Sáu đề xuất triển khai tiếp theo

Thứ tự đề xuất: nhỏ → lớn, local trước → network sau (lý do ở §67).

## 65.1 Keyboard shortcuts hoàn chỉnh (nhỏ nhất, làm trước)

**Trạng thái 10/2026:** đã triển khai — Ctrl+E mở Export (emit),
S split, Delete xóa, ? mở `TmcutShortcutsModal` (13 thao tác, i18n đủ).

Đã có: `Space` / `←` / `→` (player), `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` (timeline).
Thêm:

```text
Ctrl+S      flushDiskSave — lưu đĩa ngay (hàm đã có trong useTmcutProject)
Ctrl+E      mở TmcutExportModal
S           split clip tại playhead (nối vào handleSplit sẵn có)
Del         xóa clip đang chọn (nối vào handleDelete sẵn có)
?           mở help modal liệt kê toàn bộ shortcut
```

Tái dùng guard input/textarea/contentEditable đã có trong player/timeline.
Thêm i18n cho help modal (en + vi, theo convention repo).

Nghiệm thu: mọi thao tác chính làm được không cần chuột; help modal đầy đủ 2 ngôn ngữ.

## 65.2 Text rendering đồng bộ canvas scale

Vấn đề: `TmcutPreviewPlayer` đang dùng hệ số cứng `fontSize * 0.7`, `x/y` theo px thô —
sai tỉ lệ khi đổi canvas (16:9 ↔ 9:16) hoặc resize vùng preview.

Fix:

```text
scale = playerContainerWidth / canvas.width   (đo qua ref + ResizeObserver)
fontSize_css = fontSize_canvas * scale
x_css, y_css tương tự
```

Đặt nền cho Phase 9: tách `TextStyle { fontFamily, size, color, stroke, box, align }`
khỏi component, để sau này nhấc nguyên vào `@tmcut/core`.

Nghiệm thu: đổi canvas preset, chữ giữ đúng tỉ lệ và vị trí tương đối.

## 65.3 Waveform trên video clip

`extractWaveform` (tmcut.controller.cjs) decode audio stream nên đã chạy được với
mọi file có audio — kể cả `.mp4`. Không cần IPC mới:

```text
TmcutTimelineClip.refreshWaveform: mở điều kiện cho trackType video
  → findAssetBySrc(clip.src) → loadWaveform(asset) (cache sẵn có)
Render TmcutWaveform dưới lớp filmstrip (opacity thấp),
  text/duration nổi trên như hiện tại
```

Nghiệm thu: clip video hiện sóng âm sau import; không gọi IPC thừa khi chuyển tab
(cache-hit qua `waveformCache`).

## 65.4 Export watch folder

**Trạng thái 10/2026:** đã triển khai — `tmcut:watch-output`/`unwatch-output`
+ `fs.watch` debounce 2s, chặn báo nhầm file stale bằng baseline stat,
event `tmcut:renderDone`, ExportModal có checkbox + preview ngay.

`TmcutExportModal` đã có task manager + preview kết quả (`PreviewModal` dùng
`media://`). Thêm:

```text
Checkbox "Theo dõi thư mục" trong ExportModal
  → Electron main fs.watch(outputDir) (chỉ chạm electron/, không chạm core —
     đúng §54: filesystem thuộc runtime adapter)
  → IPC event tmcut:render-done
  → toast + nút "Preview ngay"
```

Nghiệm thu: export xong file hiện toast trong ~2s, bấm là xem được.

## 65.5 AI provider linh hoạt, free-first (chi tiết ở §66)

**Trạng thái 10/2026:** đã triển khai gateway — `electron/tools/ai-gateway.cjs`
(zero-dep fetch, families openai-compatible + anthropic, per-task model
override, sliding-window rate-limit, ndjson audit, stable error codes),
IPC `tools:ai-gateway:{complete,transcribe,getStatus}`, composable
`useTmcutAi`, 15 unit tests chạy bằng plain node, script `pnpm test:ai`.
Key không vào renderer; config qua env + per-call override (TM Hub wiring sau).

Xây gateway trong main process theo đúng pattern đã chứng minh ở
`tm-trading/ai/gateway.mjs` (zero-dependency fetch, 3 families, rate-limit,
audit log), config per-app lấy từ TM Hub. Free model làm default, paid là
fallback đổi bằng config — không sửa code gọi.

## 65.6 AutoCut AI pipeline: scene → EDL → gợi ý theo profile → editor

**Trạng thái 10/2026:** đã triển khai — core `analysis.mjs` (parse showinfo/
silencedetect + scorer 3 profile), IPC `tmcut:analyzeScenes`/`analyzeSilence`
trả raw log, gateway transcribe thêm `verbose_json`, composable
`useTmcutAutocut` (analyze best-effort transcript + apply draft project mới,
không đụng source), wizard autocut 4 bước review EDL thật (score bar, bỏ
chọn, kept-duration, transcript badge). Verify: core 74 tests, gateway 18
tests, app typecheck PASS. Cần restart Electron + key AI để test end-to-end.

`autocut.vue` hiện mới dừng ở step 1 (import + tạo project). Pipeline đề xuất,
khớp §39–§41:

```text
Import → Probe (ffprobe sẵn có)
  → Scene detect: ffmpeg lavfi select='gt(scene,0.4)',showinfo
     parse pts_time (chạy qua runFfmpeg sẵn có trong tmcut.controller)
  → Silence detect: silencedetect (bổ cho podcast/vlog)
  → Transcript: Whisper (§66 — Groq free 2.000 RPD)
  → EDL JSON: segments [{ start, end, score, reason, thumb }]
  → Profile scorer (pure TS, không Electron — sau này nhấc vào core):
       viral-shorts: giữ đoạn face + speech nhịp nhanh, ép 9:16
       podcast:      cắt silence > 1.5s, giữ nguyên khung
       vlog:         ưu đoạn motion cao + audio ổn định
  → Draft project (clone — KHÔNG phá timeline gốc, đúng §41)
  → Mini review (Accept / Edit / Regenerate)
  → Apply (đi qua pushHistory để undo được)
```

EDL schema + scorer viết pure TS ở `app/utils/tmcut/edl.ts` ngay từ đầu để sau
này nhấc nguyên vào `@tmcut/core` (đúng §54).

Nghiệm thu: video 10 phút → draft shorts 9:16 trong thời gian < 2× thời lượng
video trên máy dev.

---

# 66. Chiến lược AI provider: một interface hẹp, nhiều backend, free-first

## 66.1 Nguyên tắc (khớp §36–§38, §46)

```text
AutoCut / Assistant
  ↓ canonical request { messages, jsonSchema?, task }
TmcutAiGateway (main process, zero-dep fetch — API key KHÔNG vào renderer)
  ├─ families: openai-compatible (OpenAI, OpenRouter, Groq, Ollama,
  │            9Router / OmniRoute, custom) + anthropic
  ├─ per-task routing table (transcribe / triage / plan) + fallback chain
  ├─ sliding-window rate-limit + retry 429 + timeout
  ├─ cache: tmcut_media_analysis theo assetHash (transcript/EDL gọi 1 lần/asset)
  ├─ audit log ndjson (prompt excerpt, usage, latency, ok/error)
  ↓ Edit Plan JSON
Schema validation → permission → timeline validate → normalize → apply
  (đi qua pushHistory để AI rollback được — §50)
```

Config per-app đã có trong TM Hub (`apps` → aiProvider / aiModel / aiApiKey /
aiBaseUrl — UI ở `CreateModal.vue`): Electron đọc lúc start, không hardcode
model trong code. Nhiệt độ thấp cho tác vụ cấu trúc (`temperature` 0.1–0.3,
JSON mode) — AI chỉ tạo operations, không động vào FFmpeg/filesystem (§36).

## 66.2 Backend free đề xuất (kiểm chứng 10/2026 — set free thay đổi theo tuần,
## vì vậy để model ID trong config/routing table, KHÔNG hardcode)

```text
Nhu cầu AutoCut              Backend free                    Vì sao
───────────────────────────  ──────────────────────────────  ─────────────────────────
Transcribe (speech→text)     Groq whisper-large-v3-turbo     20 RPM / ~2.000 RPD,
                             (endpoint OpenAI-compatible      đúng chuẩn gateway đã có;
                             /openai/v1/audio/transcriptions) nhanh, hào phóng
Triage/phân loại đoạn         Groq llama-3.1-8b-instant       30 RPM / ~14.400 RPD —
(nhiều request, nhanh)                                        RPD cao nhất free tier
Sinh Edit Plan (lập luận)    Groq llama-3.3-70b (30 RPM /     chất lượng lập luận;
                             ~1.000 RPD) hoặc Gemini free     Gemini context dài,
                             tier (Flash) cho transcript dài  hợp tóm tắt transcript dài
Fallback/prototype           OpenRouter `:free` /             đa model, OpenAI-
                             openrouter/free router          compatible; lưu ý: 50 RPD
                                                             (1.000 nếu đã mua ≥10
                                                             credits), set đổi liên
                                                             tục, prompt có thể bị
                                                             dùng train
Offline / media nhạy cảm     Ollama local                    0 đồng, không gửi media
                             (qwen / llama / gemma)          ra ngoài — đúng §35
Vượt free                    cùng interface, đổi baseUrl/     không sửa code gọi
                             model sang paid (OpenRouter
                             paid, Gemini paid, Groq dev)
```

Riêng tư: free tier có thể train trên prompt → chỉ gửi transcript/EDL text
(không gửi media, không gửi PII); media nhạy cảm ép về Ollama local.

## 66.3 Bước code cụ thể (tm-tools)

```text
1. electron/tools/ai-gateway.cjs — port pattern tm-trading/ai/gateway.mjs:
   aiConfig (guard số học chống NaN) / families openai+ollama+anthropic /
   RateLimiter / AIGatewayError code ổn định + IPC ai:complete, ai:transcribe
2. app/composables/useTmcutAi.ts — gọi IPC, không chứa key, không gọi fetch
   trực tiếp (đúng §54: network thuộc runtime)
3. app/utils/tmcut/edl.ts — EDL JSON schema + validator pure TS
4. autocut step 2→4 gọi gateway theo task routing, lưu kết quả vào
   tmcut_media_analysis (mở rộng assetsFile hoặc file analysis riêng/asset,
   key = assetHash + analyzerVersion — §28)
5. test: node test cho gateway (copy pattern test.mjs của tm-trading) +
   pnpm typecheck + eslint file đã sửa
```

---

# 67. Mapping đề xuất → phase roadmap hiện có

```text
§65.1 shortcuts       → Phase 2 (editor UX)
§65.2 text scale       → Phase 9 (Text & Subtitle)
§65.3 video waveform   → Phase 8 (Audio, một phần)
§65.4 watch folder     → Phase 13 (Desktop Power Features)
§65.5 + §66 gateway    → Phase 17 (AutoCut AI) + Phase 18 (Assistant)
§65.6 autocut pipeline → Phase 16 (Analysis) + Phase 17
```

Không mở phase mới — cả 6 mục đều nằm trong roadmap cũ, v3.1 chỉ là cầu nối
thực thi.

---

# 68. Definition of Done cho v3.1

```text
Mỗi mục §65 phải đạt (kế thừa §56):
  pnpm typecheck PASS
  eslint file đã sửa sạch
  i18n en + vi cho mọi chuỗi user-facing mới
  empty / loading / error / retry state (không còn màn đen im lặng —
    bài học từ fix preview player + mediaLoadError 3-lớp guard)
  undo được mọi mutation do AI/autocut tạo ra (pushHistory)
  không thêm dependency mới (gateway zero-dep fetch, như tm-trading)
  model ID và key nằm trong config (TM Hub / env), không hardcode
```

---

# 69. Fix playback / thumbnail / preview audio (10/2026)

Ba lỗi user báo trên editor (Capture2.PNG), đã sửa:

```text
1. Seek xong video đứng hình (chỉ timecode chạy, chỉ về 00:00 mới chơi)
   Nguyên nhân: protocol.handle('media') trả net.fetch(file://) —
   response 200, KHÔNG có Accept-Ranges, KHÔNG forward Range header.
   Media pipeline seek bằng Range request → treo mãi ngoài vùng
   buffer đầu. Fix: stream thẳng từ disk qua fs.createReadStream,
   xử lý Range → 206 Partial Content + Content-Range, kèm
   Accept-Ranges: bytes, Content-Type theo extension (demuxer của
   Chromium chọn từ Content-Type), HEAD + 416.
   (electron/main.cjs — MEDIA_CONTENT_TYPES + handler mới)

2. Thumbnail timeline giống nhau / không đúng
   Nguyên nhân: extractThumbnail chỉ lấy 1 frame tại 0.5s,
   renderer tile lặp (repeat-x) → cả clip là 1 frame.
   Fix: filmstrip 8 frame trải đều cả source
   (fps=8/duration,scale=160:-2,tile=8x1) thành 1 PNG rộng;
   renderer căn strip theo source time: background-size =
   duration × zoom px, background-position = -in × zoom px
   → mỗi clip hiện đúng đoạn [in, out] của nó.
   Cache key bump v2 (core src/cache.mjs + mirror controller)
   để still cũ regenerate; checkMissing() migration: asset đã
   phân tích dưới key cũ → clear thumbPath/waveformPath +
   re-analyze 1 lần (key mới khớp → no-op về sau).

3. Preview không có tiếng
   Nguyên nhân: thẻ <video> hardcode muted.
   Fix: :muted="isVideoMuted" (muted khi video track bị mute
   trên timeline header) + :volume từ clip.volume/100.
   Timeline audio clip vẫn chưa có preview engine (mute state
   đã persist cho engine tương lai).

Bonus: dọn stray text ngoài thẻ <video> trong TmcutPreviewPlayer
(template có đoạn attribute rơi ra ngoài thẻ → render thành
text rác trong preview).
```

Verify: core 74 tests, AI 18 tests, lint:core, typecheck:core,
check:core (boundaries), eslint 5 file sửa, pnpm typecheck —
đều PASS. Phim thử 9:16 24.45s: ffmpeg filmstrip → 1280×284,
8 frame có màu center khác nhau (pixel-sampled). Electron main
change → cần restart app để test lại seek + audio + filmstrip.

---

# 70. Fix round 2: lệch scrub + crash + thumb library (10/2026)

```text
1. Scrub lệch sau khi scroll timeline (bị lệch + chết app)
   Nguyên nhân: updatePlayheadFromPointer cộng thêm
   scrollLeft trong khi rulerRef nằm BÊN TRONG container
   cuộn — getBoundingClientRect() đã tính scroll rồi →
   double-count: mỗi lần scrub sau khi scroll lệch đúng
   bằng khoảng cách scroll, seek bị kẹt ở cuối timeline.
   Fix: bỏ + scrollLeft (rect đã là tọa độ content).
   Thêm try/catch quanh currentTime trong seek()
   (self-heal pattern như step()).
   Hardening protocol handler: diskStream() gắn 'error'
   listener (unhandled 'error' trên Node stream =
   uncaught exception = chết main process khi file bị
   lock/abort giữa lúc scrub nhanh) + hỗ trợ suffix
   range (bytes=-N) + 416 đúng chuẩn.

2. Thumbnail media library "ghép nhiều ảnh"
   Nguyên nhân: <img> trong library grid hiển thị cả
   filmstrip 1280×284 (8 frame) với object-cover trong
   hộp aspect-video → 8 frame bị ép vào 1 ô.
   Fix: wrapper overflow-hidden + img width 800% (chỉ
   video có filmstrip; image asset thumbPath = file ảnh
   thật và dataURL web là single-frame → width 100%)
   → mỗi frame chiếm đúng 1 ô, object-cover crop như
   ảnh đơn.
```

Verify: eslint 4 file, pnpm typecheck PASS; range parsing
test full case (0-, 100-200, 950-, -500, -0, 2000-,
0-9999, 500-300, null) đều đúng. Crash reproduction
cần test lại trên máy user sau restart — nếu vẫn chết
app thì cần console output từ DevTools (View → Toggle
Developer Tools) để xác định renderer vs main process.

---

# 71. Fix image asset thumbnail (10/2026)

```text
Bug: image asset thumbnail hiện placeholder icon
thay vì ảnh.

1. Web runtime (importWebFiles): chỉ video mới được
   capture thumb — image asset không bao giờ có
   thumbPath → library grid rơi về UIcon placeholder.
   Fix: thumbPath = blob: URL (image file chính là
   thumbnail của nó — mirror desktop pipeline, nơi
   thumbPath = source path).

2. Protocol content-type map thiếu TIFF (media filter
   cho phép .tiff/.tif nhưng map không có → served
   application/octet-stream → <img> không decode
   được → placeholder). Fix: thêm .tif/.tiff
   (image/tiff) + .ico.
```

Verify: eslint + node --check + pnpm typecheck PASS.
Desktop image asset (thumbPath = source path qua
analyzeAsset IPC) đã hoạt động từ trước — flow đã
verify bằng simulation (URL roundtrip + stream +
Content-Type trên ảnh thật Capture.PNG).

---

# 72. Tách cover (library) vs filmstrip (timeline) (10/2026)

```text
Bug: media library thumbnail hiện cả 8 frame ghép
giống timeline thay vì 1 ảnh (user: "thumbnail asset
đang lấy cả 8 frame ảnh để làm ảnh hiển thị giống
timeline mà không phải 1 ảnh dẫn đến lỗi").

Nguyên nhân gốc: extractThumbnail chỉ sinh 1 file
(filmstrip 1280×284), library grid buộc phải CSS-crop
(width 800% + height auto + căn giữa) để chỉ hiện
frame đầu → giòn: phụ thuộc hardcode số frame = 8,
nếu đổi frame count là vỡ.

Fix: controller sinh 2 artifact trong 1 ffmpeg call
(1 decode, 2 output):
  • ${key}-cover.png — single frame 320px
    (seek min(0.5, 25% duration) để tránh black
    intro frame) → library grid (<img> object-cover
    đơn giản như gốc, bỏ CSS crop trick).
  • ${key}-strip.png — filmstrip 8 frame 160px
    (fps=8/duration,scale=160:-2,tile=8x1) → timeline
    clip (TmcutTimelineClip filmstripStyle).
Duration unknown: cover + strip 1 frame (layout cache
luôn đầy đủ → migration không loop).

Data model: TmcutAsset.filmstripPath (string | null,
types/tmcut.ts + types/electron.ts TmcutAnalyzeResult
.filmstripCachePath). Renderer boundary:
  • Library: getThumbUrl(asset) → thumbPath (cover).
  • Timeline: filmstripPath || thumbPath (web session
    dataURL thumb + legacy record fallback → stretch
    như cũ).
  • Migration checkMissing(): video stale khi cover ≠
    ${key}-cover.png HOẶC strip ≠ ${key}-strip.png
    → clear cả hai + re-analyze. Audio: ${key}.json
    (giữ nguyên).
  • relink(): đổi kind → clear thumbPath +
    filmstripPath + waveformPath.

Asset records cũ (thumbPath = ${key}.png) tự heal
lần launch đầu: migration phát hiện mismatch →
regenerate thành cặp cover/strip. File cũ ${key}.png
còn sót trong cache (garbage, không ảnh hưởng).
```

Verify: node --check controller, pnpm typecheck,
core 74/74 tests, eslint 5 file (editor.vue 173
problems pre-existing — vùng sửa clean; tổng giảm
182→173 nhờ img multi-line), ffmpeg 2-output test
trên phim thật: cover 320×568 + strip 1280×284,
EXIT 0. Electron main change → restart app để test:
library chỉ hiện 1 frame, timeline vẫn filmstrip
aligned, image asset vẫn hiện thumb.

---

# 73. Import media feedback + chẩn đoán (10/2026)

```text
Bug user báo: import video trong Electron "không
được và cũng không có thông báo gì" (file mới,
không trùng lặp).

Phân tích chuỗi import (handleImportMedia →
pickFile → dialog IPC → importFiles → analyzeAsset
IPC → controller): KHÔNG có đường nào im lặng với
file mới — mọi nhánh đều phải toast. Bằng chứng:
assets.json vẫn còn scheme cũ (915a864b.png, chưa
filmstripPath) → app đang chạy code cũ, chưa
restart đầy đủ (main process chỉ load khi khởi
động; HMR renderer thôi là không đủ — mix
old-main/new-renderer).

Hardening (đã áp dụng) — mọi kết quả đều có toast:
  • importFiles giờ trả { added, duplicates, failed }
    thay vì số; status 'error' (analysis throw)
    → failed (trước tính là thành công).
  • handleImportMedia (editor + autocut): try/catch
    BỌC CẢ pickFile (dialog IPC lỗi trước đó cũng
    im lặng) → toast "Import failed" + console.error.
  • i18n thêm: tmcut.media.alreadyInLibrary
    ("Already in your media library" / "Đã có trong
    thư viện media"), tmcut.media.importFailed
    ("Import failed" / "Nhập media thất bại").

ROOT CAUSE (user xác nhận: library rỗng, file
mới, nhưng toast "đã có trong media"):
  Asset trong assets.json có usedBy: ["8usf0sct"]
  (project khác). Library grid = projectAssets
  filter usedBy.includes(currentProject.id) →
  rỗng. Nhưng dedup cũ build từ TOÀN BỘ
  assets.value → trùng path → toast lỗi ngữ.
  Fix: importFiles giờ RELINK asset đã có ở
  project khác vào project hiện tại
  (CapCut-style: 1 asset, nhiều project) —
  usedBy.push(projectId), đếm vào added,
  persistLibrary. Chỉ toast "already in library"
  khi asset ĐÃ link project hiện tại (trùng
  thật sự).

Verify: pnpm typecheck EXIT 0; eslint vùng sửa
clean; pickSourceAsset (autocut) dùng
findAssetBySrc nên vẫn tìm thấy asset relink.

Cần user xác nhận sau khi restart đầy đủ
(Ctrl+C terminal rồi pnpm dev:electron lại):
  1. Hộp thoại chọn file có mở không?
  2. Sau khi chọn, library có item nào không
     (kể cả viền cam = missing)?
  3. Toast xuất hiện không — cái nào?
     (Success / Already in library / Analysis
     failed / Import failed)
  4. DevTools (View → Toggle Developer Tools →
     Console) có lỗi đỏ nào khi import không?
```

# 74. UI round: bảng phím tắt theo design #5 + hotkey mới (10/2026)

## 74.1 Nguồn design

```text
private/tmcut/ có 5 mockup (mỗi folder: code.html + DESIGN.md + screen.png):
  1 = Home/dashboard · 2 = Editor top toolbar · 3 = Export/Render modal
  4 = AutoCut wizard stepper · 5 = Shortcuts help modal
Round này hoàn thiện design #5 (nhỏ, self-contained, §65.1) — các
design còn lại nằm ở74.6.
```

## 74.2 TmcutShortcutsModal — dựng lại theo design #5

```text
• Header: icon keyboard + title + badge "v3.1 Engine (MediaTime Accurate)"
  + nút X (Đóng).
• Search live filter: match label + mô tả (đã dịch) + keyword EN (token
  kỹ thuật để giữ source constant bằng tiếng Anh — tiếng Việt tìm được
  qua label/desc đã dịch).
• Pill counter "N thao tác mặc định" = số item CHƯA planned (phải thật).
• 4 tab: Tất cả (N) / Timeline & Biên tập / Trình phát Preview /
  Quản lý Dự án & Xuất file / AI & Tự động hóa.
• 4 section grid 2 cột: item = label + mô tả + kbd (chip, ngăn bằng "/");
  section ripple rộng full (md:col-span-2) + badge "Dynamic Mode".
• Section tag trung thực với stack: mockup "WebGPU DirectMedia" →
  "HTML5 Preview Engine" (preview là HTMLVideoElement, §5–§7).
• Empty state khi search rỗng; footer: UCheckbox toggle tips + note §65.1
  + nút Đóng (Esc).
```

## 74.3 Toggle gợi ý phím tắt trên toolbar (thật, không phải dead control)

```text
• useTmcutUiPrefs (mới): ref shortcutTips persist localStorage
  `tmcut.shortcutTips` + helper tip(label, keys).
• Timeline toolbar title giờ dạng "Split clip (S)", "Undo (Ctrl+Z)",
  "Ripple (R)"... khi bật; tắt thì chỉ còn label.
```

## 74.4 Hotkey mới — help liệt kê cái gì thì phải có thật

```text
Backspace = Delete (xóa clip)                 → TmcutTimeline
F1        = ? (bật/tắt help)                  → TmcutTimeline
R         = toggle rippleMode                 → TmcutTimeline
Ctrl+K    = mở help + focus search            → TmcutTimeline + modal
J/K/L     = shuttle (1x→2x→4x→8x / stop / -1x→-8x)
                                             → TmcutPreviewPlayer +
                                               useTmcutPlayback

Shuttle kỹ thuật:
• Forward: playhead ×= rate (trong step loop) + video.playbackRate = rate
  → 2 luồng đồng bộ, drift vẫn tự sửa bằng cơ chế >0.3s cũ.
• REVERSE: HTMLVideoElement không decode backward tin cậy → seek-driven:
  video pause, playhead -= delta×rate, set currentTime khi drift >0.25s
  (tần suất seek tự giảm khi rate cao). playhead về 0 → pause().
• K/pause()/Space reset shuttleRate = 1.
• Help đang mở: chỉ ?/F1 hoạt động (toggle đóng) — S/Del/R/Ctrl+*
  không bắnbehind modal; Space/mũi tên/J-K-L vẫn live (navigation vô hại).
```

## 74.5 Item "planned" (badge Sắp ra mắt) — trung thực theo §64.2

```text
• I/O (In/Out export zone): cần compiler range + export modal selector
  (thuộc design #3) → chưa làm; hiện badge planned + kbd mờ.
• Alt+A (AutoCut silence) / Alt+T (Smart Mask): feature chưa tồn tại
  (§64.2 gap) → planned.
• Counter hiển thị "12 thao tác mặc định" = 15 item − 3 planned.
```

## 74.6 i18n + verify + round tiếp

```text
• en/vi: block tmcut.hotkeys mở rộng ~40 key (title mới, tabs, sections,
  sectionTags, badges, desc.*, search/close/empty/footer).
• Sửa vi stepBackward/stepForward "Lùi 1 khung" → "Lùi 1 giây"
  (code thật: arrow = 1s, Shift = 5s — help không được nói dối).
• Verify: pnpm typecheck EXIT=0; eslint 5 file chạm = 0
  (TmcutTimeline --fix theo style repo — HEAD version clean nên không
  thêm nợ lint mới); i18n parity 2269/2269 key.

Round tiếp theo (map design → component):
  #3 Export modal  → TmcutExportModal (specs grid, range In-Out,
                     hardware status — làm I/O thật ở round này)
  #2 Editor toolbar/workspace → editor.vue + TmcutInspector
  #1 Home dashboard → pages/tmcut/index.vue
  #4 AutoCut wizard steps 2–4 → autocut.vue
```

---

## 75. Round 9 — design #3: Export modal + vùng In/Out thật

### 75.1 Nguồn design

```text
private/tmcut/3/code.html — "Cấu hình & Xuất Video • TMCut Render Engine v3.1".
Header (icon + title + badge MASTER ENCODE), grid tên tệp (7 cột) + thư mục
đích (5 cột), checkbox Watch Folder, cột trái (poster + specs 2×2 + range
selector + hardware status), cột phải (mode tabs Video/Chỉ Audio/GIF, độ
phân giải, fps, bitrate, encoder cards, filter nâng cao), footer (dung lượng
ước tính + thời gian ước tính + Hủy/hàng đợi/Xuất ngay), section social
share (TikTok/YouTube).
```

### 75.2 Vùng In/Out thật (đóng item "planned" của §74.5)

```text
• useTmcutPlayback: renderIn/renderOut (ref module-level) + renderRange
  (computed hợp lệ: cả hai điểm, out − in ≥ 0.05s) + setRenderMark/clear.
• Timeline hotkey I/O (scope timeline, cùng guard INPUT/TEXTAREA như các
  phím khác): bấm I/O = đặt điểm tại playhead; bấm lại tại CÙNG vị trí
  (±0.05s) = toggle xóa → không cần phím xóa riêng.
• Visual: overlay vùng In/Out tint primary trên ruler (border-x + 2 flag
  I/O) và trên dải tracks (bg-primary/5 border-x-2, z-20 pointer-events-none);
  chip "I mm:ss → O mm:ss ✕" trên toolbar timeline (click = xóa) — hiển
  thị khi ít nhất một điểm được đặt.
• Export modal: selector 2 nút "Toàn bộ timeline" / "Điểm In-Out (in – out)".
  Khi chưa đủ điểm → nút In-Out disabled + label "(chưa đặt)" + hint gõ I/O;
  renderRange về null thì tự rơi về "Toàn bộ".
• Help modal: item inOut bỏ badge "Sắp ra mắt" → số shortcut thật = 13
  (khớp design #5). desc.inOut cập nhật kể cả cách xóa.
```

### 75.3 Compiler — options mới (app/utils/tmcut/compiler.ts)

```text
CompileOptions mở rộng: mode ('video' | 'audio' | 'gif'), range {start,end},
outScale (bội số so với canvas, áp SAU drawtext → text giữ toạ độ canvas),
outFps (mặc định fps canvas), audioBitrate (kbps, audio mode).
CompileResult.duration = thời lượng ĐẦU RA (range-aware) → progress/ETA đúng.

• Range: clamp vào timeline (≥0.05s); trim/atrim là BƯỚC CUỐN cùng graph
  (drawtext enable giữ giây tuyệt đối) — text ngoài vùng bị cắt tự nhiên.
• mode 'audio': graph audio riêng (video clip audio + bgm), aresample=48000
  mỗi input (concat đồng nhất + MP3 encoder chuẩn), .wav → pcm_s16le còn
  lại → libmp3lame; timeline CHỈ có audio track giờ export được (case màu
  trước đây bỏ qua bgm hoàn toàn).
• mode 'gif': không build bất kỳ chain audio nào (hasAudio guard) — tránh
  lỗi "filter output unconnected" vì GIF không map audio; terminal
  fps=15 + scale max 1280px + palettegen/paletteuse 1-pass.
• BUG FIX (latent từ HEAD): bỏ '-f lavfi' ở case không có clip video —
  lavfi là INPUT demuxer, truyền thành output muxer → ffmpeg
  "Requested output format 'lavfi' is not known" → case màu + text chưa
  từng chạy được (case 2 có clip thì không chạm nhánh này).
```

### 75.4 TmcutExportModal — dựng lại theo design #3

```text
• Header: icon clapperboard + title (i18n "Cấu hình & Xuất Video • TMCut
  Render Engine v3.1") + badge MASTER ENCODE + X; hàng grid: ô "Tên tệp"
  (basename editable, hậu tố .{{ext}} động) + ô đích (BaseFilePicker mode=save,
  readonly + nút browse có sẵn) tách từ một outputPath duy nhất; Watch Folder
  checkbox + icon + hint giữ nguyên pipeline fs.watch/onRenderDone cũ.
• Cột trái: poster = cover thumb của video clip đầu (mediaUrl — web blob +
  Electron media:// đều chạy; không có → placeholder trung thực), badge
  W×H + aspect (gcd) + timecode thời lượng xuất; specs 2×2: Thời lượng xuất /
  Dung lượng ước tính (heuristic ~0.07 bit/pixel/frame, CRF-scaled, luôn
  tiền tố ~; GIF → "—") / Độ phân giải canvas / Âm thanh xuất (AAC 192k /
  MP3 {kbps} / WAV PCM — theo mode); range selector; hardware status (pulse
  dot + encoder đang chọn + mô tả; web → "cần app desktop").
• Cột phải: mode tabs Video / Chỉ Audio / GIF; Video → resolution segment
  0.5×/1×/1.5×/2× (nhãn kèm WxH động, even-dimension), fps select (24/25/30/
  50/60 + fps canvas nếu lạ, default = fps canvas), quality segment
  (fast/medium/high → CRF 26/22/18 — nhãn i18n cũ có sẵn), encoder cards
  CPU/GPU (từ select cũ); Audio → format MP3/WAV + bitrate 128/192/320 +
  hint 48 kHz; GIF → note 15fps/1280px/palette.
• Footer: trạng thái trái (idle: dung lượng + thời lượng | exporting: progress
  bar + % + ETA (từ speed của task) + speed | done: ✓ + 3 nút preview/mở tệp/
  mở thư mục | error: message truncate + title), phải: nút Đóng/Hủy xuất/
  Xuất ngay như cũ; giữ guard desktop + validate tên tệp.
• Tự đổi đuôi file khi đổi mode/format (mp4/mp3/wav/gif).
```

### 75.5 Các phần design #3 KHÔNG làm (trung thực)

```text
• Social share (TikTok/YouTube): không có integration thật (§64.2) → bỏ
  hẳn, không render checkbox chết.
• AI de-noise / HDR 10-bit: filter registry chưa có → bỏ (khác help modal:
  phần này không có badge "Sắp ra mắt" vì là control trong form — render
  disabled vẫn khuyến khích bấm vô nghĩa).
• Nút "Thêm vào hàng đợi Render": taskManager.setTasks replace hiện tại,
  queue thật cần đổi manager → để round sau nếu làm.
• Codec select H.265/ProRes/VP9: encoder mới = tham số -c:v khác quality
  flag (VP9/ProRes) → giữ libx264/h264_nvenc như cũ, đãi ngộ qua encoder
  cards. Selector fps chỉ đổi -r output (resample frame) — không đụng fps
  timeline.
• Poster "hover play": không snapshot được frame thật (canvas taint với
  media://) → chỉ dùng thumb tĩnh.
```

### 75.6 i18n + verify + test harness

```text
• en/vi: block tmcut.export 28 → 62 key (title mới, badgeMaster, fileName,
  posterEmpty, spec*, range*, hw*, desktopOnly, mode*, res*, fps*, audio*,
  gifNote, etaLabel, labelSize); + timelineActions.clearMarks;
  hotkeys.desc.inOut cập nhật cách toggle-xóa. Parity 2304/2304.
• Verify: pnpm typecheck EXIT=0; eslint 5 file chạm = 0 lỗi.
• Test harness (temp, không commit): esbuild bundle compiler → chạy ffmpeg
  THẬT resources/ffmpeg.exe với 11 case: A mặc định (clips+text+bgm 4.5s),
  B range 1.5s, C outScale→320×180, D gif+range, E mp3 (44.1k→48k),
  F wav+range, G case màu+text (bug -f lavfi), H màu+range+2×, I audio-only
  4s, J duration field, K audio rỗng throw → ALL PASS.
  (case D trước fix FAIL "asetpts unconnected"; G/H FAIL "lavfi not known").

Round tiếp theo (map design → component):
  #2 Editor toolbar/workspace → editor.vue + TmcutInspector
  #1 Home dashboard → pages/tmcut/index.vue
  #4 AutoCut wizard steps 2–4 → autocut.vue
```

## 76. Round 10 — design #2: Editor toolbar/workspace

### 76.1 Tổng quan round

```text
Đưa editor (pages/tmcut/editor.vue) + player + inspector về gần design #2
(toàn trang editor: HUD canvas, scrub/transport, inspector tabs, media
search, footer status). Nguyên tắc xuyên suốt: chỉ làm control THẬT —
proxy toggle, camera record, AI cutout, color LUT, stabilizer, markers
đều vắng mặt (xem 76.5) thay vì render toggle chết.
```

### 76.2 Player — HUD + scrub + transport mới (TmcutPreviewPlayer.vue)

```text
• HUD header (hàng trên cùng của cột preview, design #2 "Canvas TMCut"):
  chấm trạng thái xanh + tên canvas + WxH + tỉ lệ (GCD reducer:
  1920×1080→16:9, 1440×2560→9:16; kích thước lạ không rút gọn được
  <64 thì hiển thị W:H thô) + FPS + badge "HTML5 Preview Engine"
  (một decision Round 8 — preview KHÔNG giả vờ WebGPU render).
• Overlay toggles (safe/guides/grid/center) dời lên HUD phải + thêm
  nút fullscreen (requestFullscreen trên khung monitor).
• Scrub bar mới: playhead/total + progress gradient; seek bằng
  click + drag (mousedown → window mousemove/mouseup, có cleanup
  listener); disabled khi timeline rỗng.
• Transport deck trong panel bo góc:
  LEFT  = Loop toggle + IN + OUT + skip-to-start + step-back;
  CENTER = play/pause;
  RIGHT = step-forward + skip-to-end + mute + volume slider.
  IN/OUT dùng chung setRenderMark('in'/'out') với hotkey I/O trên
  timeline (toggle-clear như Round 9); nút sáng (solid primary)
  khi mark đã đặt.
• Loop THẬT (useTmcutPlayback.loopPlayback): wrap tại cuối vùng
  In/Out khi cả hai mark hợp lệ, nếu chưa đặt thì wrap cuối timeline;
  có carry-over overshoot khi wrap ngược (shuttle J). play() tự
  nhảy về zone start nếu playhead đã vượt zone end.
• Volume master mới (previewVolume + previewMuted trong playback
  composable) — element.volume = clipVolume × previewVolume,
  muted = trackMuted || previewMuted. Khác volume per-clip (Inspector).
• Style scoped .tmcut-monitor:fullscreen {100vw/100vh !important} —
  author !important thắng inline style của monitorBoxStyle nên khung
  fullscreen không cần re-measure.
```

### 76.3 Timeline — shortcuts chung + zoom-fit

```text
• showShortcuts cục bộ → dùng chung useTmcutUiPrefs().shortcutsOpen:
  modal help giờ mở được từ timeline (?/F1/Ctrl+K) VÀ nút ở editor
  header — một instance duy nhất (khớp quyết Round 8).
• Nút "Fit timeline to screen" (zoomToFit): zoom = (viewport − 8) /
  (duration + 10), clamp 15..200 — khớp thuật toán timelineWidth
  (content + padding 10s) nên cuộn biến mất đúng mức cần.
```

### 76.4 Editor page + Inspector

```text
• Header #right: nút Shortcuts (mở shortcutsOpen chung) + chip trạng
  thái phần cứng TRUNG THỰC: WebGPU detect qua 'gpu' in navigator
  (không đoán), engine side = FFmpeg (desktop) hoặc "Web preview".
• Media library: ô search lọc theo tên asset (assetSearch +
  filteredAssets), chỉ hiện ở các tab asset.
• Footer status bar (h-7, cuối workspace): tên project · WxH · fps ·
  duration · số clip · chip hardware — dữ liệu đều từ currentProject.
• Inspector: chuyển flat sections → tabs Video / Âm thanh / Tốc độ
  (availableTabs theo loại clip: video→cả 3, text→Video+Tốc độ,
  audio→Âm thanh+Tốc độ; không bao giờ có tab chết; currentTab tự
  fallback về tab hợp lệ đầu tiên). Nội dung giữ nguyên: fitting +
  transform + text editor ở Video, volume ở Âm thanh, in/out/offset/
  speed ở Tốc độ, Actions (delete) luôn nằm ngoài tabs.
```

### 76.5 Các phần design #2 KHÔNG làm (trung thực)

```text
• Undo/Redo center toolbar: đã có sẵn trong timeline toolbar (Ctrl+Z/Y
  thật) → không nhân đôi.
• Proxy toggle ("Bật Proxy 1080p"): không có hệ thống proxy → bỏ hẳn.
• Canvas zoom "100% Fit": preview tự fit theo measureViewport → bỏ.
• Camera record (media bin): không có capture backend → bỏ.
• Nút chụp frame (camera) trên HUD: canvas từ video media:// bị
  taint (không có ACAO header) trên Electron; extractThumbnail IPC
  hiện không nhận timestamp. Cần IPC extractFrame mới → để round sau
  nếu làm. Web thì được (blob same-origin) nhưng bỏ để nhất quán.
• Inspector tabs "Hoạt ảnh" + "Theo dõi" (animation/tracking): không
  có pipeline → không tạo tab rỗng.
• Smart Cutout AI / Color LUT / Stabilizer (accordion design): chưa
  có filter trong render pipeline (§24) → bỏ.
• Timeline razor tool (C) + snap "Bắt dính" (N): razor = split sẵn
  có; snap cần đổi logic drag của clip → để riêng (rủi ro cao).
• "Zero-Drop" + quality select (proxy 1080p/4K) trên transport:
  không có proxy → bỏ.
```

### 76.6 i18n + verify

```text
• en/vi: + player 8 key (hudCanvas, engineBadge, fullscreen, loop,
  markIn, markOut, mute, volume); + inspectorProps.tabVideo/tabAudio/
  tabSpeed; + timelineActions.zoomFit; + media.search; + block MỚI
  tmcut.workspace (shortcutsBtn, hardwareStatus, clipCount,
  previewOnly) — không dùng được tmcut.editor.* vì tmcut.editor đã
  là string ("Editor"). Parity 2427/2427.
• Verify: pnpm typecheck EXIT=0 (sau eslint --fix); eslint 6 file
  chạm = 0 lỗi (editor.vue có hàng trăm violation pre-existing theo
  vue/max-attributes-per-line + html-indent → eslint --fix toàn bộ
  6 file, chỉ stylistic).
• Ctrl+R là đủ (renderer-only, không đụng main/preload).
```

## 77. Round 11 — design #1: Home dashboard

### 77.1 Tổng quan round

```text
Dựng lại pages/tmcut/index.vue theo design #1 (hero + quick actions +
filter bar + grid/list cards + preset strip). Nguyên tắc cũ: chỉ control
THẬT — toàn bộ khối cloud storage (dung lượng 42.5/100 GB, sync toggle,
avatar cộng tác, mời thành viên, footer RAM/Render Engine) là data bịa
đặt của mockup → bỏ hết.
```

### 77.2 Hero deck + Quick actions dock

```text
• Hero: eyebrow (chấm animate) + headline + description + nút "+ Dự án
  mới" gradient; 2 blob glow trang trí (chỉ CSS).
• Dock 5 card ĐÍNH HƯỚNG THẬT:
  1. Nhập video → tạo project + mở editor (import xảy ra trong editor)
  2. Dự án dọc 9:16 → createProject + normalizeCanvas(1080×1920@30)
  3. Dự án ngang 16:9 → createProject + normalizeCanvas(1920×1080@30)
  4. AutoCut AI → /tmcut/autocut
  5. Templates → /tmcut/templates
  (2/3 là preset canvas THẬT — cùng applyPreset của templates.vue,
  không phải link rỗng như card cũ vốn cùng gọi handleNewProject).
• Chip hardware trung thực (WebGPU detect + "FFmpeg") thay "GPU
  Accelerated" của mockup.
```

### 77.3 Filter bar + sort + view switcher

```text
• Search theo tên (real filter).
• Chips aspect: Tất cả (n) / Dọc 9:16 (n) / Ngang 16:9 (n) / Vuông 1:1 (n)
  — count tính thật từ canvas; bỏ chip "Shared" (không có sharing).
• Sort USelect: Mới chỉnh sửa (updated_at) / Tên A-Z / Thời lượng dài
  nhất (durationMs) — bỏ "Dung lượng lớn nhất" (không có data size).
• View switcher grid/list (2 render mode thật, state local).
```

### 77.4 Project cards (grid + list) + menu

```text
• Card grid: thumb 16:9 (cover thật hoặc icon) + badge aspect (GCD
  reducer) + badge resolution trung thực từ width (≥3840→4K UHD,
  ≥1920→1080p, ≥1280→720p) + chip duration (durationMs→mm:ss, ẩn khi
  =0) + hover play overlay + tên + ⋯ menu + meta "Đã sửa {date}"
  (toLocaleString theo locale i18n) + fps/WxH.
• Menu card: Mở / Đổi tên (modal input) / Nhân bản / Xóa (modal
  confirm — cải tiến: bản cũ xóa không hỏi). Bỏ "Share" (không có).
• List view: row compact (tên + aspect + duration + edited + menu).
• Composable thêm 2 hàm thật: renameProject(id, name) — ghi thẳng
  disk qua ipc.writeProject (project không cần đang mở; nếu là project
  hiện tại thì đi qua saveProject), và duplicateProject(id, suffix) —
  deep copy + id mới + persist; suffix do caller truyền (module-scope
  composable không có vue-i18n instance). Web session: in-memory
  (như saveProject — đã có note webSession).
```

### 77.5 Template presets strip (thật, không trending bịa)

```text
Mockup có thanh "Mẫu thịnh hành" với số liệu 1.2M dùng/Beat-Sync bịa
đặt → thay bằng strip 3 preset THẬT dùng chung data với /tmcut/templates
(Shorts 1080×1920, YouTube 1920×1080, Instagram 1080×1080) — bấm là tạo
project đúng canvas; link "Mở thư viện mẫu" sang trang templates.
```

### 77.6 KHÔNG làm (trung thực)

```text
• Toàn bộ Cloud widget: bộ nhớ đám mây/sync toggle/avatar team/mời
  thành viên/sao lưu 5 phút/Nâng cấp dung lượng → không có backend → bỏ.
• Footer "ClipForge Desktop v2.4.0 · RAM 4.2/32 GB · Metal/CUDA" →
  version tự chế + performance.memory không phải RAM thật → bỏ.
• Chip "Shared (Dự án nhóm)" filter → không có sharing.
• Sort "Dung lượng lớn nhất" → không có data size file project.
• Card menu "Share" → bỏ.
• Hover-play thật từ file media (poster) → cần snapshot frame (cùng
  bài toán canvas taint như §76.5) → overlay play chỉ là visual, click
  card mở editor.
```

### 77.7 i18n + verify

```text
• en/vi: block MỚI tmcut.home (32 key: hero*, quickTools, action*,
  searchPlaceholder, filter*, sort*, view*, editedAt, noMatches,
  menu*, renameTitle, deleteTitle/desc/Confirm, dupSuffix,
  templatesLink). Reuse: presets.*, presetSizes, templatesDesc,
  shortcuts.autocut*, workspace.hardwareStatus, apply, global.cancel.
  Parity 2460/2460.
• Verify: pnpm typecheck EXIT=0 (sau --fix); eslint 2 file chạm
  (index.vue viết lại hoàn toàn + useTmcutProject.ts) = 0 lỗi sau
  --fix; /tmcut render HTTP 200.
• Renderer-only → Ctrl+R đủ.

### 77.8 Sửa Ctrl+F5/F5 reload trong Electron (main process)

```text
• Vấn đề: electron/main.cjs gọi Menu.setApplicationMenu(null) → mất
  toàn bộ role/accelerator mặc định của Electron, trong đó có Ctrl+R
  reload. Handler before-input-event cũ chỉ bắt Ctrl+Shift+I.
• Fix: bắt F5 / Ctrl+R (reload) và Ctrl+Shift+R (reloadIgnoringCache)
  ngay trong before-input-event; sau đó trả lại event.preventDefault
  để renderer không xử lý trùng. Verify: node --check + eslint = 0.
• Lưu ý: đụng main process → phải KHỞI ĐỘNG LẠI app một lần (đóng
  hẳn, chạy lại pnpm dev:electron); từ đó Ctrl+R/F5 hoạt động trong
  app. Không liên quan round mockup — là QoL fix kèm theo.
```

## 78. Round 12 — design #4: AutoCut wizard (review split view)

### 78.1 Tổng quan round

```text
Round cuối trong 5 mockup. Dựng lại autocut.vue theo design #4
(stepper vòng tròn + split view 7/5 + segment cards + mini player +
breakdown panel + bottom action bar). Wizard 4 bước thật hiện có
(upload → profile → analyze/EDL → draft) giữ nguyên logic; nâng cấp
toàn bộ lớp review UI. Block i18n MỚI đặt tên tmcut.wizard (tmcut.autocut
đã là string "AutoCut AI" — trùng tên như case tmcut.editor ở round 10).
```

### 78.2 Mở rộng useTmcutAutocut (data thật cho review UI)

```text
• Bỏ interface AutocutAnalysis KHÔNG ĐỘC (khai báo trùng lặp y hệt
  2 lần — pre-existing, TS hợp nhất im lặng).
• AutocutAnalysis thêm 5 field thật, tính trong analyzeSource:
  - sourceDurationSec (từ FFmpeg scene probe)
  - silenceCount + silenceRemovedSec (đếm/tổng từ silenceList)
  - speechSec (tổng thời lượng transcript overlap)
  - transcript[] GIỮ LẠI text từng dòng Whisper (scoreSegments chỉ
    cần timing → text bị bỏ; giờ giữ lại để card hiển thị lời thoại
    THẬT — map: mỗi EDL segment gộp các dòng Whisper chồng lấn).
```

### 78.3 Stepper + status chip trung thực

```text
• Stepper kiểu design: vòng tròn (✓ done / số active glow / số pending
  opacity-40) + nhãn "Bước 0X" + tiêu đề, chevron phân cách; bước
  active có pill nền highlight.
• Chip phải (thay "AutoCut Neural Engine v3.1 / Confidence 97.8%"
  bịa đặt): analyzerVersion THẬT từ edl.analyzerVersion + điểm TB
  THẬT (avgScore = trung bình seg.score × 100).
```

### 78.4 Left panel: EDL list + scorer (xl:col-span-7)

```text
• Header: icon + "{count} phân đoạn được phát hiện" + chip
  "EDL · {profile} · {analyzerVersion}" (data thật từ EDL).
• Metric strip: "Thời lượng giữ lại {kept} / gốc {source}" +
  "Cắt giảm {pct}%" (compressionPct = 1 − kept/source, computed
  thật) + bulk actions THẬT: "Chọn tất cả (N)" / "Chọn ≥ 70 điểm".
• Profile scorer selector 3 card (viral/podcast/vlog): click =
  chọn profile + CHẠY LẠI analyzeSource thật (re-score pipeline),
  disabled khi đang analyzing. Không phải switch ảo.
• Segment card (thay card cũ chỉ có range+score bar): checkbox
  (@update:model-value — bug cũ: UCheckbox có @click.stop nhưng
  không bind update → bấm checkbox chết) + #seq + thumbnail
  (poster nguồn + chip In/Out; thumbnail theo timestamp cần IPC
  extractFrame mới → để đó, ghi §78.6) + timecode + (X.Xs) +
  score badge (96/100, màu theo ngưỡng 70/40) + score bar +
  TRANSCRIPT italic (text Whisper thật nếu có) + reason chip +
  nút play preview. Card active = viền primary; card bị bỏ chọn
  = grayscale + opacity-60.
• Nút "tune In/Out" trong design KHÔNG có implementation → bỏ
  (rule: không render control chết).
```

### 78.5 Right panel: mini player + breakdown (xl:col-span-5)

```text
• Mini player THẬT: <video> qua toURL (media://) + click card
  segment → seek đúng seg.start; auto-PAUSE tại seg.end
  (@timeupdate) = mini-review bound; scrubber click-seek trong
  [In, Out]; nút Lùi 5s / Play-Pause / Tới 5s; overlay timecode
  (currentTime − seg.start / duration seg); @loadedmetadata seek
  về active segment (video mount TRƯỚC khi selectSegment set).
• Guide 9:16: mask overlay giữa màn hình (shadow ring) + nhãn
  "9:16 CROP / Khung an toàn" + ghi chú "Vùng bị che bởi UI
  TikTok" — CHỈ là guide thị giác; Face box + "Face Lock 99.4%"
  trong design KHÔNG có face tracking → bỏ.
• Breakdown panel 4 pill (chỉ metric THẬT): Cảnh cắt (sceneCount),
  Khoảng lặng (silenceCount + tổng thời lượng), Lời thoại (speechPct
  + transcript on/off), Thời lượng nguồn. Bỏ "Chuẩn âm thanh -14.2
  LUFS" (pipeline không đo loudness) + "Face Tracker Tích cực 91%"
  (không có) → ghi §78.6.
• Notice §41: draft non-destructive — statement đúng bản chất
  applyDraft (tạo project mới, không sửa nguồn).
• Bottom bar sticky: chấm pulse + "N/M phân đoạn được chọn" +
  "Thời lượng xuất bản {kept}" (thật) | Hủy (về step 2) +
  "Chạy lại phân tích" (re-run) + CTA acceptDraft (giữ).
```

### 78.6 KHÔNG làm (trung thực)

```text
• Face Lock box + % confidence → không có face detection pipeline.
• Loudness -14.2 LUFS / True Peak → analyzeSilence không trả dBFS.
• Thumbnail theo timestamp từng segment (seg.thumb) → cần IPC
  extractFrame mới (main + preload, full restart) → dùng chung
  poster nguồn; đánh dấu needing-IPC.
• Nút "Cắt tinh chỉnh In/Out" (tune) per-card → không có editor
  In/Out trong wizard.
• Footer "TMCut v2.4.0 · VRAM 6.2/24GB · độ trễ 3ms" → số bịa → bỏ.
• Confidence chip 97.8% → thay bằng avgScore thật (§78.3).
```

### 78.7 i18n + verify

```text
• en/vi: block MỚI tmcut.wizard (30 key: analyzer, avgScore,
  reviewList, keptLabel, sourceLabel, compression*, bulk*,
  scorerLabel, playSegment, playerTitle, guide*, replay5, forward5,
  play/pause, breakdownTitle, metric*, draftNotice*, selectedSummary,
  publishDuration, rerun). Reuse: steps.* (analyzing/retry/keptInfo/
  transcriptOn-Off/noSegments/acceptDraft…), aiProfiles.*, back.
  Parity 2491/2491.
• Verify: pnpm typecheck EXIT=0 (2 lần); eslint 2 file chạm = 0
  lỗi sau --fix (autocut.vue stylistic pre-existing + mới);
  /tmcut/autocut render HTTP 200.
• Renderer-only (composable + page + i18n) → Ctrl+R/F5 đủ.
• Round 12 = round cuối cùng của 5 mockup (#1 home ✓, #2 editor ✓,
  #3 export ✓, #4 autocut ✓, #5 shortcuts ✓).
```

---

## §79 — Round QoL: F5-only reload, Ctrl+scroll zoom, review design #2

**Trạng thái 10/2026:** các round UI 8–12 đã xong; round này là rà soát
tổng thể design #2 + sửa nhỏ + **lập kế hoạch tiếp**. Tất cả renderer +
main, chưa commit.

### 79.1 F5 = reload duy nhất (theo yêu cầu)

```text
• electron/main.cjs: bỏ nhánh Ctrl+R / Ctrl+Shift+R trong
  before-input-event; còn lại F5 → webContents.reload() (event
  .preventDefault()) + Ctrl+Shift+I devTools.
• Lý do: app set Menu.setApplicationMenu(null) nên cần wiring reload
  thủ công (§77.8); giờ user chỉ muốn F5.
• Main process → 1 lần full restart app để áp; sau đó F5 reload đủ
  cho mọi round renderer.
```

### 79.2 Ctrl + cuộn chuột = zoom timeline (thiếu so design #2)

```text
• TmcutTimeline.vue: thêm onTracksWheel() trên vùng scroll tracks
  (@wheel): Ctrl/Cmd + deltaY → preventDefault (chặn page-zoom của
  Electron/Chromium) → zoom ±10, clamp 15..200 (khớp slider), giữ
  anchor: time dưới con trỏ = (scrollLeft + offsetX) / zoom cũ →
  nextTick set scrollLeft theo zoom mới.
• Cuộn thường không Ctrl → scroll ngang mặc định (không đổi).
```

### 79.3 Review design #2 vs hiện tại (rà toàn bộ 5 mockup)

```text
• Sửa i18n hardcode: "+ Video" (TmcutTimeline) → t('tmcut.addVideo')
  (key đã có sẵn en/vi).
• Sửa 4 comment tiếng Việt → English (editor.vue, TmcutInspector ×3)
  — vi phạm "comments must be English".
• Chênh lệch CHƯA làm (ghi vào Roadmap, không tạo control chết):
  playhead đỏ ≠ primary (A1), transform handles trên canvas (A3),
  drag media→timeline (A4), minimap (A7), track V2/A2 (A5),
  rotation slider — bị chặn vì compiler chưa có filter rotate (C7),
  help modal thiếu dòng Ctrl+scroll (A2).
• Snap: core ĐÃ có snapTime nhưng drag chưa gọi → A6 (Roadmap).
• 5/5 mockup đã đối chiếu; phần nào đạt (toolbar, media bin, player
  transport, inspector tabs, timeline tools, export forms, help
  modal planned-badge…) = bỏ qua, không làm lại.
```

### 79.4 Kế hoạch xây dựng tiếp

```text
• File MỚI: docs/TMCut Roadmap v3.md — kế hoạch chi tiết + theo dõi:
  phân công nơi làm (app / @tmcut/core / electron / compiler), section 3
  liệt kê ĐẦY ĐỦ các hạng mục core C0..C17 (module, signature, types,
  test cases, consumer app, verify), các Phase A..L tính năng kiểu
  CapCut, bảng phím tắt master, checklist trạng thái, quy trình verify.
• Nguyên tắc: hạng mục nào nên code trong @tmcut/core (thuần, ticks,
  zero-dep, node:test) phải ghi đủ 5 thành phần: module · kiểu ·
  test · boundaries · consumer (section 2 của Roadmap).
```

### 79.5 Verify

```text
• pnpm typecheck EXIT=0 (sau Ctrl+scroll); eslint file chạm
  (main.cjs, TmcutTimeline, TmcutEditor, TmcutInspector) = 0;
  node --check electron/main.cjs = 0.
• i18n: không thêm key mới round này (dùng lại tmcut.addVideo).
```

---

## §80 — Round 13: quick wins theo Roadmap (playhead primary + help Ctrl+scroll)

**Trạng thái 10/2026:** round đầu tiên bám `docs/TMCut Roadmap v3.md`
(Phase A). User chọn **không commit checkpoint** → các round sẽ commit
gộp/lẻ sau khi test.

### 80.1 Nội dung

```text
• A1: playhead timeline bg-red-500 → bg-primary (2 chỗ: vạch dọc +
  needle head) — khớp design #2 "primary accent needle"; comment đổi
  đúng English.
• A2: help modal (TmcutShortcutsModal) +1 item nhóm editing:
  id zoomScroll, label "Zoom timeline", keys ['Ctrl + Scroll'],
  keywords en+vi — khớp shortcut thật §79.2; implementedCount tự
  tăng (item không có badge planned).
• i18n: +2 key ×2 locale: tmcut.hotkeys.zoomScroll + desc.zoomScroll.
```

### 80.2 Verify

```text
• pnpm typecheck EXIT=0.
• eslint TmcutTimeline.vue + TmcutShortcutsModal.vue = 0 lỗi.
• Parity EN = VI (script đếm leaf keys: 2385/2385 — số tuyệt đối
  khác mốc 2491 trước đây vì cách đếm khác; điều quan trọng EN === VI).
• Renderer-only → F5 đủ.
```

### 80.3 Roadmap

```text
• Tick: A1 ✅ A2 ✅ (Phase A còn A3..A8).
• Round kế (R14): C0 — gộp app/utils/tmcut/canvas.ts về @tmcut/core
  (xóa 2 bản song song buildFfmpegFitFilters/...), verify
  pnpm test:core + check:core + typecheck + harness compiler.
```

---

## §81 — Round 14 (C0): gộp `app/utils/tmcut/canvas.ts` về @tmcut/core

**Trạng thái 10/2026:** round tái cấu trúc đầu tiên theo Roadmap
(`docs/TMCut Roadmap v3.md` mục C0). Đúng nghĩa "strangler": xóa bản
copy song song, trả toàn bộ geometry về 1 nguồn sự thật.

### 81.1 Nội dung

```text
• app/utils/tmcut/canvas.ts: bỏ toàn bộ logic copy (TMUTCANVAS_PRESETS,
  TMUTCUT_SOCIAL_PRESETS, TMUTCUT_FIT_MODES, gcd, aspectValue,
  orientationOf, ratioIdOf/ratioLabel, findCanvasPreset*,
  computeFitObjectStyle, buildFfmpegFitFilters, reframeTransform)
  → re-export từ '@tmcut-core' (mẫu strangler như media.ts).
  GIỮ local normalizeCanvas: app model v1 còn fps:number (types/tmcut),
  core normalizeCanvas trả rational fps DSL v3 → chuyển fully ở C16.
  Ghi chú điều kiện ngay trong header file (English).
• core/src/index.d.ts:
  - + interface TmcutCanvasPresetDef / TmcutSocialPresetDef;
  - + const TMUTCANVAS_PRESETS / TMUTCUT_SOCIAL_PRESETS /
    TMUTCUT_FIT_MODES (đang THIẾU — trước đây không ai import từ core);
  - orientationOf trả TmcutOrientation (thay string);
    findCanvasPreset* trả TmcutCanvasPresetDef|null;
  - re-export thêm TmcutFitMode + TmcutOrientation từ types/dsl.ts.
• Kết quả: 15 export chỉ còn 1 bản trong core/src/canvas.mjs.
```

### 81.2 Verify

```text
• Core: pnpm check:core PASS (boundaries) · pnpm test:core PASS ·
  pnpm typecheck:core = 0 · pnpm lint:core = 0.
• App: pnpm typecheck = 0 · eslint canvas.ts = 0.
• Harness runtime (temp KHÔNG commit, mẫu round trước): copy
  compiler.ts+canvas.ts → rewrite '~/utils/tmcut/canvas'→'./canvas' →
  esbuild --alias:@tmcut-core=../tmcut-core/src/index.mjs → node:
  - identity buildFfmpegFitFilters (fit/smart/fill đúng chuỗi cũ);
  - compileTimelineToFfmpeg có fit filter + drawtext + filter_complex;
  - FFmpeg resources/ffmpeg.exe render THẬT out.mp4 (51878 bytes)
    → "HARNESS PASS — Render 1 clips to 640x360 (2.0s)".
• Renderer-only (1 file app) → F5 đủ.
```

### 81.3 Roadmap

```text
• C0 ✅ tick.
• Round kế (R15): C1 + A6 — snapCandidates/snapTimeDetailed trong
  core editing.mjs + drag/trim timeline gọi snap + toggle Magnet (N)
  + help modal.
```

---

## §82 — Round 15 (C1 + A6): snap/magnet thật — bỏ bản local, nối core

**Trạng thái 10/2026:** round theo Roadmap (C1 + A6). Phát hiện thêm:
`TmcutTimelineClip` đang có **bản snap local tự viết** (candidates giây,
không markers, không ignoreIds.core, luôn bật) — trùng chức năng
`snapTime` của core đúng pattern C0 phải dọn.

### 82.1 Core (@tmcut/core)

```text
• editing.mjs: tách snapTime → snapTimeDetailed(timeline, targetTicks,
  options) → { ticks, snapped: { ticks, kind, fromId? } | null },
  kind ∈ zero | playhead | clip-start | clip-end | marker. snapTime cũ
  GIỮ NGUYÊN chữ ký/đối số/điều kiện tie-break (chỉ wrap .ticks) →
  không đổi hành vi consumer cũ.
• index.d.ts: + khai báo snapTimeDetailed (kind union).
• test/editing.test.mjs: +1 case (snapTimeDetailed: tie boundary
  clip-start/clip-end, playhead, zero, không snap → snapped null,
  ignoreIds loại chính nó). Fail đầu do giả định tie sai → sửa test
  theo semantics thật (addClip append sát nhau → boundary chung).
  75/75 PASS.
```

### 82.2 App (tm-tools)

```text
• useTmcutProject.snapTimeSec(target, playhead, options?): + ignoreIds
  + thresholdSec → ticks (trước đây export mồ côi, giờ clip dùng).
• useTmcutUiPrefs: + snapOn (default ON, localStorage 'tmcut.magnet')
  — khớp hành vi cũ (snap luôn bật) khi chưa toggle.
• TmcutTimelineClip: XÓA snapCandidates/applySnap local → applySnap
  gọi snapTimeSec (core) với ignoreIds [clip hiện tại] + threshold
  8px/zoom; MỚI: trim-left snap cạnh trái (derive in từ offset đã snap,
  clamp về source), trim-right snap cạnh phải (derive out từ end đã
  snap). Magnet OFF → giữ nguyên hành vi cũ từng bit (nhánh if riêng).
• TmcutTimeline: nút Magnet (i-lucide-magnet, active theo snapOn,
  title tip(..., 'N')) kế nút Ripple; phím N trong handleGlobalKeydown.
• TmcutShortcutsModal: + item editing snapMagnet keys ['N'].
• i18n: +3 key ×2 locale (timelineActions.magnet, hotkeys.snapMagnet,
  desc.snapMagnet) — parity 2388/2388.
```

### 82.3 Verify

```text
• Core: test:core 75/75 PASS · check:core PASS · typecheck:core = 0 ·
  lint:core = 0.
• App: pnpm typecheck = 0 · eslint 5 file chạm = 0 · parity OK.
• Renderer-only (2 composable + 2 component + i18n) → F5 đủ.
```

### 82.4 Roadmap

```text
• C1 ✅ · A6 ✅ tick. Phase A còn A3 (transform handles), A4 (drag
  media→timeline), A5 (thêm track), A7 (minimap), A8 (rotation —
  chặn bởi C7).
• Round kế (R16): C8 + A5 — core addTrack/nextTrackName/removeTrack
  + nút "+" track header.
```

---

## §83 — Round 16 (C8 + A5): thêm/xóa track

**Trạng thái 10/2026:** round theo Roadmap (C8 + A5). Trước round này
app CHỈ CÓ 3 track tĩnh (Text/Video 1/Audio 1 sinh từ
`buildDefaultProject`) — không cách nào tạo thêm V2/A2.

### 83.1 Core (@tmcut/core)

```text
• timeline.mjs:
  - nextTrackName(timeline, trackType) → "Video 2"/"Text 2"/"Audio 2":
    đếm cả tên có số ("Video 1") lẫn tên mặc định không số ("Text")
    → không bao giờ trùng default của app.
  - addTrack(timeline, trackType, name?) → TmcutTrack: id qua
    nextTrackId (cùng pattern ensureTrack), name mặc định từ
    nextTrackName, items rỗng, push cuối tracks.
  - removeTrack(timeline, trackId, options?) → boolean: từ chối
    track.locked (đúng convention lock-guard của timeline.mjs) và id
    lạ; default xóa KÈM clips; { keepClips: true } chuyển clips sang
    track cùng type khác, false nếu không còn chỗ.
• v1compat.mjs syncV3Result: THÊM bước prune — v1 track không còn id
  trong v3 bị splice (add đã được hỗ trợ sẵn ở nhánh create). Giờ
  applyV3Edit add/remove track sync 2 chiều đúng.
• index.d.ts: + nextTrackName / addTrack / removeTrack.
• Tests: timeline.test.mjs +1 case (tên unique, keepClips chuyển &
  từ chối khi hết target, lock guard, id lạ, xóa thường → còn
  [t-text-1, t-audio-1]); v1compat.test.mjs +1 case (sync 2 chiều:
  tạo track v3-only → v1, prune v1-only kèm clip). 77/77 PASS.
```

### 83.2 App (tm-tools)

```text
• useTmcutProject: + addTrackToProject(type) / removeTrackFromProject(id)
  — bọc applyV3Edit (undo/history/autosave tự động); remove rảnh
  selectedClipId nếu clip bị nằm trong track xóa; check locked app-side
  trước để không push history cho thao tác bị từ chối.
• TmcutTimeline:
  - Góc "TRACKS" (ruler corner) + nút "+" → UDropdownMenu 3 mục
    Video/Text/Audio (addTrackMenuItems computed).
  - Header mỗi track + nút trash (i-lucide-trash-2) kế eye/lock/mute,
    :disabled="track.locked" → removeTrackFromProject(track.id).
    (Roadmap ghi "menu chuột phải" — làm nút hiện diện trực tiếp cho
    dễ phát hiện; không thêm phím tắt mới → không thêm dòng help.)
• Track mới push CUỐI array → hiển thị dưới cùng (app v1 chưa có
  kéo-đổi-vị-trí track; nằm trong C16/L).
• i18n: +5 key ×2 locale (tracks.addTrack/addVideoTrack/addTextTrack/
  addAudioTrack/removeTrack) — parity 2393/2393.
```

### 83.3 Verify

```text
• Core: test:core 77/77 PASS · check:core PASS · typecheck:core = 0 ·
  lint:core = 0.
• App: pnpm typecheck = 0 · eslint TmcutTimeline + useTmcutProject = 0 ·
  parity OK.
• Renderer-only → F5 đủ (undo Ctrl+Z khôi phục cả track đã xóa).
```

### 83.4 Roadmap

```text
• C8 ✅ · A5 ✅ tick. Phase A còn A3 (transform handles), A4 (drag
  media→timeline), A7 (minimap), A8 (rotation — chặn bởi C7).
• Round kế (R17): A4 — drag & drop media từ Media bin → timeline
  (dùng snap + track type phù hợp).
```

---

## §84 — Round 17 (A4): drag & drop media → timeline

**Trạng thái 10/2026:** round theo Roadmap (A4). HTML5 Drag & Drop —
không thêm dependency, không IPC.

### 84.1 Nội dung

```text
• NEW app/utils/tmcut/dnd.ts — giao thức DnD dùng chung:
  TMCUT_ASSET_MIME ('application/x-tmcut-asset') + interface
  TmcutAssetDragPayload { id, kind } (JSON string trong dataTransfer).
  Hai đầu (grid/timeline) cùng import → không thể lệch MIME.
• editor.vue (grid thẻ media):
  - thumb div: :draggable="status !== 'missing'" + @dragstart →
    handleAssetDragStart setData(payload), effectAllowed 'copy';
  - <img> thêm draggable="false" để ảnh không chiếm quyền drag (quy
    tắc chuẩn: ảnh có draggable ngầm định) → kéo từ thẻ CHA.
  - Click "+" và click thẻ giữ nguyên (append cuối như cũ).
• TmcutTimeline.vue (drop target = "Tracks Canvas"):
  - @dragover: chỉ accept MIME của mình (file ngoài bị ignore) +
    preventDefault + dropEffect copy.
  - @drop: getData → JSON parse (fail → return);
    sec = max(0, (clientX − rect.left)/zoom) — cùng công thức ruler
    scrub (rect đã gồm scroll, không cộng scrollLeft lần 2);
    snapTimeSec(sec, playhead, { thresholdSec: 8/zoom }) — bán kính
    8px như drag clip (C1);
    row hit-test Math.floor((y − rect.top)/56) (mọi row h-14 = 56px);
    row đúng type → trackId của row đó; sai type / trỏ dưới row cuối
    → undefined → addClipToTrack tự tìm/ tạo track type phù hợp.
• useTmcutMedia.addAssetToTimeline(assetId, options?): + { offset?,
  trackId? } — offset undefined = append cuối (hành vi cũ y hệt);
• useTmcutProject.addClipToTrack(type, item, trackId?): + trackId —
  chỉ nhận khi id thuộc đúng type, sai → fallback find theo type
  (không bao giờ tạo track trùng do sai đích).
• i18n: KHÔNG thêm key (DnD thuần chuột, không text mới) — parity giữ
  2393/2393.
```

### 84.2 Verify

```text
• pnpm typecheck = 0 · eslint 5 file chạm = 0 · parity OK.
• Core không đụng → không chạy lại suite (77/77 vẫn là mốc).
• Renderer-only → F5 đủ.
```

### 84.3 Roadmap

```text
• A4 ✅ tick. Phase A còn A3 (transform handles trên canvas), A7
  (minimap), A8 (rotation — chặn bởi C7).
• Round kế (R18): A3 — transform handles (scale/move) cho video trên
  preview canvas (Inspector đã có ô X/Y/Scale; thêm handles kéo).
```

---

## §85 — Round 18 (R18): A3 · Transform handles trên preview canvas

### 85.1 Phạm vi

Roadmap A3: bounding box + handle cho **video clip đang được chọn** trên
preview monitor — kéo body để move (`x/y`), kéo góc để resize (`scale`).
Mượn pattern kéo sẵn của text overlay (`onTextMouseDown`).

**Không có rotate handle** — giữ nguyên quy tắc trung thực: export chưa có
rotate filter (C7) nên slider rotation trong Inspector vẫn ẩn, handle xoay
cũng không thêm (khác với text mô tả roadmap — deviation này được ghi ở
§85.4).

### 85.2 Thực hiện — `TmcutPreviewPlayer.vue` (file duy nhất)

1. **Fix đồng bộ đơn vị `videoTransformStyle`**: `x/y` của video trước đây
   là **screen px** (`translate(${x}px…)` thô) trong khi text overlay là
   **canvas px** (`× textScale`). cùng model 1 DSL → 2 diễn giải preview.
   Di chuyển computed xuống sau `textScale` và nhân `× textScale` — giờ
   video và text cùng canvas-px, offset không còn đổi theo kích thước
   window. Export chưa dùng `x/y` của video (xem §85.4) nên không có
   break runtime nào.
2. **`selectionBoxClip`** (computed): chỉ trả về khi clip tại playhead
   (`activeVideoClip`) **chính là** `selectedClipId` và track không hidden,
   không lỗi load → không có box trôi trên canvas trống.
3. **`selectionBoxStyle`**: cùng `transform` với video (translate/scale/
   rotate) + `borderWidth: 2/scale px` để viền luôn ~2px screen (transform
   scale mọi CSS length).
4. **Handlers**:
   - `onSelectionBodyMouseDown` — move: delta screen px `/ textScale`
     → canvas px (giống hệt text drag), gộp tròn 0.1.
   - `onSelectionResizeMouseDown` — scale: `newScale = initialScale ×
     (distance(pointer, center) / distance(grab, center))`. Screen-px ratio
     = scale ratio (origin là center) và distance bất biến với rotation →
     clip xoay vẫn resize đúng. Clamp **10–300** = Inspector input.
   - Cả hai: `pushHistory()` một lần đầu gesture, threshold3px trước khi
     ghi, `suppressCanvasClickUntil` khi drag (không toggle play), capture
     `clipId` string để closure không mất narrowing TS.
   - Handle size: `handleInverseScale = 1/scale` → handle luôn ~10px
     screen dù clip scale10% hay300%.
5. **Template**: box đặt **TRƯỚC** text overlay block → text vẫn nằm trên
   và vẫn kéo được; box nhận mousedown trên phần còn lại của canvas.
   4 corner `<span>` với cursor `nwse/nesw-resize`.

### 85.3 i18n / deps

- **Không thêm key mới** — parity giữ nguyên **2393/2393** (EN=VI).
- Không thêm dependency.

### 85.4 Khoảng trống export (ghi nhận → thêm item R10)

`compiler.ts` hiện **không áp** `x/y/scale/rotation` của video clip khi
export (chỉ text có `drawtext` x/y; video chỉ có fit filters). Handles +
ô Inspector X/Y/Scale cùng viết vào model → **cùng trạng thái**:
preview-trước-export, giống speed (R1 pending). Đã thêm roadmap
**R10 · Video transform → export** (`scale`+`crop`/`pad`/`overlay` per-clip
trước `concat`; rotation chờ C7) để gap này không bị quên.

### 85.5 Verify

```text
• pnpm typecheck → 0 lỗi (fix2× TS18047: capture clipId trong closure).
• eslint TmcutPreviewPlayer.vue → 0 problem.
• i18n parity → 2393/2393 OK (không thêm key).
• Core không đụng → không chạy lại suite (77/77 vẫn là mốc).
• Renderer-only → F5 đủ.
```

### 85.6 Roadmap

```text
• A3 ✅ tick (move + resize; rotate handle hoãn tới C7 — ghi chú trong
  text item).
• Phase I + R10 (video transform → export) — [ ].
• Phase A còn A7 (minimap), A8 (rotation — chặn C7).
• Round kế (R19): A7 minimap, hoặc C7 rotate filter → mở A8; xem thứ tự
  ưu tiên trong §7 roadmap.
```

---

## §86 — Round 19 (R19): A7 · Minimap timeline

### 86.1 Phạm vi

Roadmap A7: thanh overview nhỏ phía trên ruler — tổng duration dự án +
khung viewport + playhead, click nhảy (pan). Nằm trong `TmcutTimeline.vue`
(không cần selector mới — data lấy thẳng từ `currentProject.timeline`,
nên điều kiện "nếu effort > dự kiến thì ghi 延期" không kích hoạt).

### 86.2 Cấu trúc layout (điểm dễ sai nhất)

Minimap phải **không scroll theo nội dung** nên đặt TRONG cột phải nhưng
NGOÀI `tracksContainerRef`:

```text
Timeline Workspace (flex row)
├─ Left header (w-44)
│   ├─ [MỚI] spacer h-4 mt-1 mx-1   ← cân bằng với minimap, giữ TRACKS
│   │                                   corner (h-6) thẳng với ruler (h-6)
│   └─ TRACKS corner + track rows
└─ [MỚI] Right wrapper (flex-1 flex-col overflow-hidden min-w-0)
    ├─ Minimap strip (h-4 mt-1 mx-1, shrink-0, overflow-hidden)
    └─ Scrollable area (tracksContainerRef — giữ nguyên)
```

Không có spacer bên trái → toàn bộ track rows lệch20px so với header.

### 86.3 Geometry & state

- `minimapState = { scrollLeft, width }` (ref) — mirror DOM vì
  `scrollLeft/clientWidth` không reactive. Đồng bộ ở3 nơi:
  `onTracksScroll`, `watch([zoom, timelineWidth]) + nextTick`,
  `window resize` (đăng ký trong `onMounted/onUnmounted` có sẵn).
- Quy đổi content px → bar px: `× (width / timelineWidth)` với
  `timelineWidth = max(1200, (totalDuration+10) × zoom)` (giữ nguyên
  công thức cũ → mapping khớp1-1 với scroll).
- `minimapClipBlocks`: mọi track × item → block `left/width`; độ dài
  `max(0.01, (out−in)/speed)` (đúng duration hàng timeline); màu theo
  loại track: blue/amber/emerald-400/50 (khớp icon cột header).
- Khung viewport: `left = scrollLeft/denom × w`,
  `width = clamp(w−left, ≥4px, w²/denom)` → nội dung hẹp hơn viewport
  = frame full-width (không có frame 0px).
- Playhead:1px `bg-primary`, luôn render (vị trí0 khi project rỗng).

### 86.4 Tương tác

- `@mousedown` → `panFromMinimap` ngay + kéo chuột tiếp tục pan
  (cùng pattern drag của text/selection): `scrollLeft =
  ratio × timelineWidth − clientWidth/2` (click nào cũng căn giữa
  viewport vào vị trí bấm). Browser tự clamp; event `scroll` bắn về →
  frame cập nhật qua `syncMinimapState`.
- Seek playhead **không** nằm ở đây — ruler đã làm (phân tách trách
  nhiệm); tooltip ghi rõ "click or drag to pan".

### 86.5 i18n / deps

- +1 key: `tmcut.timelineActions.minimap` (en/VI) → parity
  **2394/2394**.
- Không thêm dependency; Tailwind classes đều là literal trong file
  (JIT quét được).

### 86.6 Verify

```text
• pnpm typecheck → 0.
• eslint TmcutTimeline.vue → 0 (sau --fix:91 vue/html-indent do thêm
  wrapper — chỉ indent, không đổi logic).
• i18n parity → 2394/2394 OK.
• Core không đụng →77/77 giữ mốc.
• Renderer-only → F5.
```

### 86.7 Roadmap

```text
• A7 ✅ tick. Phase A còn A8 (rotation — chặn bởi C7).
• Round kế (R20): R10 — video transform (x/y/scale) → export,
  đóng gap trung thực §85.4.
```

---

## §87 — Round 20 (R20): R10 · Video transform → export

### 87.1 Phạm vi

Đóng gap trung thực đã ghi ở §85.4: preview (CSS `translate(x,y)
scale(s)`) và Inspector/transform handles đã ghi `x/y/scale` vào model
từ trước, nhưng `compiler.ts` bỏ qua khi export. Round này làm export
xem đúng giá trị đó — **không có rotation** (chờ C7, giữ quy tắc slider
rotation còn ẩn).

Đơn vị đã đồng bộ từ R18: cả preview và export đều dùng **canvas-px**
cho `x/y` → không cần convert.

### 87.2 Thử nghiệm FFmpeg trước khi viết code (quyết định thiết kế)

Chạy thật `resources\ffmpeg.exe` + parse pixel `rawvideo`:

| Test | Kết quả |
|---|---|
| `pad` offset âm (`x=-20`) | **FAIL** — FFmpeg bỏ qua, fallback về center `(ow-iw)/2` (pixel scan: content ở x=25 chứ không phải −20) |
| `pad` input > output (scale>1) | **FAIL** — "Padded dimensions cannot be smaller than input dimensions" |
| `overlay` offset âm (`x=-10`) | **PASS** — pixel boundary đúng [0,40) |
| `overlay` fg > bg (scale>1) | **PASS** — exit0, bg strip hiện đúng |
| `overlay` `shortest=1` (bg3s + fg1s) | **PASS** — duration = **1.0s** (default `shortest=0` =3.0s) |

→ Thiết kế chốt: **`color` bg + `overlay`** với `shortest=1` và bg
`d = duration + 2` (headroom hấp thụ lệch frame do `trim` quantize theo
source fps) → segment luôn kết thúc đúng frame cuối của clip → concat
A/V không drift.

### 87.3 Core — `buildFfmpegTransform` (`tmcut-core/src/canvas.mjs`)

```ts
buildFfmpegTransform(options?: {
  canvasW: number; canvasH: number          // evenized như fit filters
  scale?: number                            // clip.scale percent (default100)
  x?: number; y?: number                    // canvas px, có thể âm/lẻ (Math.round)
  fps?: number                              // default30
  duration?: number                         // default1, headroom +2s
  bgColor?: string                          // default 'black'
}): null | { bg: string, tail: string, overlay: string }
```

- **`null` = identity** (`scale100 + x0 + y0`) → caller giữ nguyên pipeline
  cũ, không tốn filter (99% clip bình thường không đổi1 byte lệnh).
- Công thức: `content = scale(round2(W·s), round2(H·s))` (min2px, scale≤0
  kẹp về0.01 ≈ near-invisible); `pos = (canvas − content)/2 + offset`.
- Trả về3 mảnh để app tự gắn label: `bg` (source chain), `tail` (append
  vào clip chain), `overlay` (ghép2 input).
- Doc comment trong source giải thích đầy đủ vì sao là `overlay` chứ
  không phải `pad` (kết quả test ở §87.2).
- Xuất xứ: `canvas.mjs` export qua barrel `index.mjs` + `index.d.ts`
  (`TmcutFfmpegTransform` interface).
- Tests: **+5** → `canvas.test.mjs` (identity/null, centered math,
  offset rounding±âm, evenize + degenerate scale, default fps/duration).

### 87.4 App — `compiler.ts` Case2

```ts
const clipDuration = (clip.out - clip.in) / speed
const transform = buildFfmpegTransform({ canvasW, canvasH, scale: clip.scale, x: clip.x, y: clip.y, fps, duration: clipDuration, bgColor })
if (transform) {
  //3 chains: color bg / clipChain+scale / overlay → v_scaled_i
} else {
  // clipChain như cũ (byte-identical với trước R20)
}
```

`vStreams` nhận output cuối như cũ → concat/text/audio không đổi.
Không thêm key i18n, không thêm dependency.

**Gap còn lại được ghi nhận trung thực:** `opacity` (video + text
`drawtext alpha`) vẫn preview-only → thêm roadmap **R11**.

### 87.5 Runtime harness (e2e)

Harness temp được cập nhật:2 video clip — c1 **identity** (nhánh cũ) +
c2 `scale50, x100, y−200` (nhánh mới) + text + audio:

```text
HARNESS PASS — Render2 clips to640x360 (3.0s) size=83315 duration=3
```

Asserts: `overlay=x=260:y=-110:shortest=1`, `scale=320:180`,
bg `d=3.000` (=1s+2), duration thật qua ffprobe =3.0s (2+1) ✓.

### 87.6 Verify

```text
• pnpm typecheck (app) →0.
• eslint compiler.ts + canvas.ts →0.
• Core: test:core82/82 PASS (+5), check:core PASS, lint:core PASS,
  typecheck:core PASS.
• i18n parity không đổi (round này không thêm key).
• Harness e2e → PASS (render thật3.0s).
• Renderer + core only → F5 đủ (không restart main).
```

### 87.7 Roadmap

```text
• R10 ✅ tick (color+overlay, shortest=1; rotation vẫn chờ C7).
• Thêm R11 (opacity → export) — [ ].
• Phase I checklist: R1..R11.
• Round kế (R21): C7 rotate filter (mở cả rotate handle A8 và
  rotation slider A8) — hoặc B1/C3 keyframes; xem §7.
```

---

## §88 — Round 21 (R21): C7 · Rotation trong fit filters

### 88.1 Thử nghiệm FFmpeg trước khi code

| Test | Kết quả |
|---|---|
| `rotate=90*PI/180:ow=iw:oh=ih` vs `transpose=1` (CW) | **byte-identical** → FFmpeg rotate dương = **clockwise = CSS `rotate(deg)`** ✓ không cần đổi dấu |
| `rotate=…:fillcolor=red` (45°, input trắng) | corner = red, center = white ✓ fillcolor hoạt động |
| Expression `90*PI/180` | parse OK ✓ |

Ý nghĩa `ow=iw:oh=ih`: giữ nguyên kích thước box = canvas → corner bị
crop, góc trống được `fillcolor` lấp — **trùng khớp preview** (monitor
`overflow:hidden` cắt clip xoay, nền là canvas background).

### 88.2 Core — `buildFfmpegFitFilters(..., { rotation })`

- Helper `withRotation(filters, options)` (trong `canvas.mjs`): append
  `rotate=<deg>*PI/180:ow=iw:oh=ih:fillcolor=<padColor>` **SAU** mọi fit
  filter (thứ tự đúngchuỗi preview: fit → rotate → scale/translate của
  R20).
- **Identity**: `rotation` undefined / `0` / `360` / `-360` → **không
  append gì** → output byte-identical với trước R21.
- `fillcolor` dùng chung `padColor` (nền canvas) — tự động khớp màu nền.
- `index.d.ts`: +`rotation?: number`.
- Tests: **+1** (`appends rotation after the fit filters`) — thứ tự sau
  fit, identity bỏ qua, fillcolor mặc định · **83/83 PASS**.

### 88.3 App — `compiler.ts`

+`rotation: clip.rotation` vào options của `buildFfmpegFitFilters`
(trong nhánh Case2, trước khi ghép transform R20).

### 88.4 Verify (harness e2e)

```text
HARNESS PASS — Render2 clips to640x360 (3.0s) size=82992 duration=3 rotation-e2e=differs
```

- Args assert: `rotate=45*PI/180…` có mặt và **index rotate <
  index scale=320:180** (rotate chạy trước transform scale).
- Rotation e2e: render cùng clip **có** rotation90 vs **không** → frame
  t=0.5 khác nhau hoàn toàn (sample88% non-black) → filter thực sự áp.
- Core:83/83 + lint + typecheck PASS; app typecheck0, eslint0; parity
  giữ2394/2394 (không thêm key).

### 88.5 Gap trung thực còn lại

- **Text rotation**: preview đã xoay text (CSS rotate) nhưng `drawtext`
  không có góc quay → export chưa xoay text → thêm roadmap **R12**;
  tới A8 sẽ chỉ expose slider Rotation cho **video clip**.
- Corner crop khi xoay: chấp nhận theo đúng đề bài C7 (ghi chú §88.1).

### 88.6 Roadmap

```text
• C7 ✅ tick (§88). Core checklist: C0 C1 C7 C8 ✅.
• Round kế (R22): A8 — Inspector Rotation slider (video-only) +
  rotate handle trên selection box canvas (R18 hoãn) — blocker đã gỡ.
```

---

## §89 — Round 22 (R22): A8 · Rotation slider Inspector + rotate handle canvas

### 89.1 Phạm vi

C7 (R21) đã verify export xoay thật → gỡ blocker. Round này expose
rotation ở2 nơi, **cả hai đều video-only** (text rotation chưa export —
R12; slider cho text sẽ là dead control):

1. **Inspector** — `USlider` −180..180 + giá trị °, trong Transform
   section, `v-if="trackType === 'video'"`. Ghi qua
   `handleUpdate('rotation', Number($event))` (key đã có trên item type
   từ trước, default0).
2. **Preview canvas** — rotate handle trên selection box (R18): stem
   (`w-px h-4 bg-primary/70` từ top-center lên trên) + knob tròn
   (`cursor-grab`), **counter-scale** bằng `handleInverseScale` nên knob
   luôn ~12px screen; stem theo scale của box (chấp nhận — mọi editor
   cũng vậy ở scale extremes).

### 89.2 Toán xoay (`onSelectionRotateMouseDown`)

- Center lấy từ `getBoundingClientRect()` của box đã xoay — AABB center
  = center thật của element bất kể rotation.
- `startAngle = atan2(pointer − center)` (screen space, y-down → atan2
  TĂNG theo chiều kim đồng hồ) → `deg = initial + Δangle` → **không
  cần đảo dấu**, khớp CSS `rotate(deg)` và (từ R21) khớp export
  `rotate==transpose CW`.
- Normalize về `[−180,180]`, làm tròn integer, threshold3px trước khi
  ghi, `pushHistory()`1 lần/gesture, `suppressCanvasClickUntil` khi drag
  (pattern chung từ text drag).

### 89.3 i18n / deps

- +1 key: `tmcut.inspectorProps.rotation` (en "Rotation (°)" / vi "Góc
  xoay Rotation (°)") → parity **2395/2395**.
- Không dependency mới (`USlider` là component có sẵn của Nuxt UI v4 —
  verify `Slider.vue` + `defineModel` trong node_modules trước khi dùng).

### 89.4 Verify

```text
• pnpm typecheck →0 (USlider props qua defineModel OK).
• eslint TmcutInspector.vue + TmcutPreviewPlayer.vue →0.
• i18n parity →2395/2395 OK.
• Core không đụng →83/83 giữ mốc.
• Renderer-only → F5.
```

### 89.5 Roadmap

```text
• A8 ✅ tick. Phase A — Design #2 còn thiếu: HOÀN TẤT (A1..A8 ✅).
• R18 ghi chú "rotate handle hoãn C7" → nay đã thêm (§89).
• Round kế (R23): B1/C3 keyframes UI (C3 core trước) — hoặc R1 speed/
  reverse; xem §7 ưu tiên.
```

---

## §90 — Round 23 (R23): C3 · Keyframes core (eval + easing)

### 90.1 Module mới `tmcut-core/src/keyframes.mjs`

Module mới **không** vi phạm boundaries (zero-dep, thuần JS thuần dữ
liệu — `pnpm check:core` PASS). Barrel `index.mjs` + `index.d.ts` khai
báo `TmcutKeyframe`, `TmcutKeyframeEasing` và đủ6 API đúng đề bài C3:

```ts
evalKeyframe(clip, prop, atTicks): number | undefined
  // clamp ngoài2đầu (trước kf đầu = kf đầu, sau kf cuối = kf cuối);
  // prop chưa có kf / atTicks NaN → undefined
keyframeAt(clip, prop, atTicks, toleranceTicks =0): TmcutKeyframe | null
  // trả LIVE object (không copy), mặc định exact, tolerance cho hit-test
setKeyframe(clip, prop, atTicks, value, easing?): TmcutKeyframe | null
  // thay đúng t (mutate hàng cũ, không duplicate), giữ mảng sorted;
  // input NaN/null clip → null (an toàn với input rỗng từ UI, không throw)
removeKeyframe(clip, prop, atTicks, toleranceTicks?): boolean
propsWithKeyframes(clip): string[]   // unique, theo thứ tự xuất hiện
keyframeTimes(clip, prop): number[]  // ticks tăng dần
```

**Easing thuộc kf TRÁI** của segment (chuẩn editor):

| Easing | Công thức giữa a→b |
|---|---|
| `linear` | `u` |
| `ease-in` | `u²` |
| `ease-out` | `1-(1-u)²` |
| `ease-in-out` | `2u²` (u<½) / `1-2(1-u)²` |
| `step` | giữ `a.value` đến đúng `b.t` (boundary bấm sang giá trị b) |

Unknown easing → về linear (dung sai, không crash).

### 90.2 Test — `test/keyframes.test.mjs` (module riêng)

Theo đúng checklist test C3: clamp2đầu · eval = `undefined` khi chưa
có kf · linear giữa · step giữ cũ đến boundary (và boundary bấm giá
trị mới) · `keyframeAt` exact vs tolerance (nearest wins) · ease-in
25 / ease-out75 / linear50 tại giữa (≠ linear) · ease-in-out = linear
đúng½ nhưng12.5≠37.5 ở¼ · set/replace/sort/không duplicate · remove
tolerance · props unique thứ tự · times sort · NaN-safe.

**94/94 PASS** (+11) · check + lint + typecheck core PASS.

### 90.3 App

- `useTmcutProject.TmcutTimelineItem.keyframes` đã có sẵn
  `{ t, prop, value }` → **+`easing?`** (union5giá trị) + ghi chú
  preview-only trong JSDoc kiểu dữ liệu (trung thực: export chưa
  render keyframes — sẽ là R-item Phase K).
- typecheck0 · eslint `useTmcutProject.ts`0 · parity giữ2395/2395
  (chưa thêm key i18n — UI là R24).

### 90.4 Roadmap

```text
• C3 ✅ tick. Core checklist: C0 C1 C3 C7 C8 ✅.
• Round kế (R24): B1 · Keyframes UI — ⏱ thêm/xóa keyframe ở Inspector,
  diamond trên timeline, preview áp evalKeyframe; PHẢI gắn nhãn
  preview-only (điều kiện trung thực của C3, §199-200 roadmap).
```

---

## §91 — Round 24 (R24): B1 · Keyframes UI (Inspector + timeline + preview)

### 91.1 Ngữ nghĩa thời gian — **CLIP-LOCAL ticks** (quy ết định chung)

`keyframe.t` = ticks (120000/giây) **tính từ đầu clip** (0 = clip bắt
đầu trên timeline), KHÔNG phải thời gian toàn project:

```ts
atTicks = (playheadSec - clip.offset) * TICKS_PER_SECOND
```

Ưu điểm: kéo/di chuyển clip mang keyframe theo tự động (không phải
dời kf khi move), không phụ thuộc `speed`, và là một công thức chung cho cả eval
(preview) và diamond (% duration). Quy ước này ghi ở core JSDoc
(`keyframes.mjs`) + comment preview/inspector.

### 91.2 Inspector — nút ⏱ toggle (`TmcutInspector.vue`)

- `toggleKeyframe(prop)`: tại playhead — nếu đã có kf → `removeKeyframe`,
  ngược lại `setKeyframe(prop, at, giá trị HIỆN TẠI của field)`.
  **Copy mảng trước khi mutate** → `updateClip({ keyframes })` ghi đúng
 1 entry undo (mutate trực tiếp sẽ lách history).
- Vị trí: label4 ô Transform (scale/opacity/x/y) + hàng Volume.
  Active state: icon diamond primary + nền `bg-primary/15`; title đổi
  theo trạng thái (thêm/xóa keyframe tại playhead).
- **Gate trung thực**: ⏱ Volume chỉ hiện khi `trackType === 'video'`
  — timeline audio track **chưa có preview engine** → kf trên audio
  clip sẽ không thấy gì = dead control. Rotation KHÔNG có ⏱ (ngoài
  scope B1 — tránh ngụ ý export).
- Chip **"Preview only — not xuất yet"** hiện ở header Transform VÀ
  header Volume ngay khi clip có ≥1 kf (cảnh báo trung thực, yêu cầu
  của C3 §199-200).

### 91.3 Preview — áp keyframes (`TmcutPreviewPlayer.vue`)

Helper `localTicks(clip)` + `evalKeyframe` (core C3) vào mọi chỗ đọc
giá trị tĩnh:

| Nơi | Prop eval |
|---|---|
| `videoTransformStyle` (active clip) | scale, x, y, opacity (rotation giữ tĩnh) |
| `textOverlayStyle` (text overlay) | x, y, scale, opacity |
| `videoVolume` | volume |

`evalKeyframe` trả `undefined` khi chưa có kf → fallback đúng giá trị
tĩnh cũ (không đổi hành vi project không keyframe). Reactive theo
`playhead` ✓ (render đọc ref → scrub/play cập nhật ngay).

### 91.4 Timeline — diamond markers (`TmcutTimelineClip.vue`)

`keyframePercents`: union thời điểm kf mọi prop (`propsWithKeyframes`
+ `keyframeTimes`) → sort → `% của duration` (clamp0-100). Render
`span w-1.5 h-1.5 rotate-45 bg-white/90` tại `left: calc(pct% - 3px)`,
`pointer-events-none`. Không có kf → mảng rỗng → không render gì.

### 91.5 i18n / verify

- +3 key (en+vi): `addKeyframe`, `removeKeyframe`,
  `previewOnlyKeyframes` → parity **2398/2398**.
- typecheck **0** · eslint3 file chạm **0** · core không đổi (94/94
  giữ mốc) · renderer-only → F5.

### 91.6 Roadmap

```text
• B1 ✅ tick. Phase B: B1 ✅ · còn B2..B9.
• Gap đã ghi: keyframes CHƯA export (Phase K — item R) · preview đã
  thật (eval C3). Text rotation đã có R12; opacity export R11.
• Round kế (R25): R1 · Speed & reverse trong compiler (đóng nhanh
  R-item) — hoặc C3 tiếp B2 (speed UI)... xem §7 ưu tiên.
```

---

## §92 — Round 25 (R25): C4 + R1 · Speed & reverse (retime core + compiler)

### 92.1 Core — module mới `tmcut-core/src/retime.mjs`

**Đơn vị: ticks** (120000/giây, DSL v3) — app lưu seconds thì đổi ở
biên (`sec * TICKS_PER_SECOND`). Mô hình clip-local:

```text
forward: source = in + t * speed     (speed>1 = nhanh hơn)
reverse: source = out - t * speed     (đảo từ cuối nguồn)
duration = (out - in) / speed        (offset không đổi)
```

5 API đúng đề bài C4:

- `validateSpeed(speed)` — non-finite → `1`; `< 0.01` (gồm số âm) →
  `0.01`. `reverse` là cờ riêng nên speed âm không hợp lệ → clamp floor.
- `isRetimed(clip)` — switch cho compiler: `speed !== 1 || reverse`.
- `timelineToSource` / `sourceToTimeline` — map2 chiều, **clamp** cả2
  đầu (timeline về `[0, duration]`, source về `[in, out]`) → caller
  hỏi ngoài phạm vi không vỡ; trả về có thể fractional (round ở biên).
- `withSpeed(clip, speed)` — **pure** (copy), GIỮ nguyên source range
  `[in, out]` (CapCut: nguồn giữ, duration đổi), `offset` không đổi,
  sàn `out ≥ in + 0.2s` (khớp minimum trim của editor).

Tests `test/retime.test.mjs` **+7 → 101/101 PASS** (clamp validate,
isRetimed, speed2 → duration/2, speed0.5 → ×2, map đầu↔cuối reverse,
roundtrip ±1 tick cho {0.5,1,2}×{fwd,rev}, withSpeed giữ nguồn + sàn
0.2s + NaN-safe). check + lint + typecheck core PASS.

### 92.2 Thử FFmpeg — bài học thứ tự (quan trọng nhất round này)

| Test (1s source, speed2) | Duration | Kết luận |
|---|---|---|
| video `setpts/2 → reverse` | 0.533s | ✅ |
| video `reverse → setpts/2` | 0.533s | ✅ **byte-identical** với chuỗi trên → video thứ tự nào cũng được |
| audio `asetpts/2 → areverse` | **1.0s** | ❌ **areverse ghi lại PTS theo sample rate → vô hiệu speed** |
| audio `areverse → asetpts/2` | 0.52s | ✅ **đúng** |

→ Quy tắc compiler: **audio luôn `atrim → [areverse] → setpts/asetpts`**
(đặt `areverse` TRƯỚC bước nén PTS). Ghi comment + trích bảng này ngay
tại chuỗi clip audio (§92.3) để không ai "tối ưu" thứ tự lại.

### 92.3 App — `compiler.ts` (5 chuỗi chạm)

1. **Case2 video**: `,reverse` sau `setpts`, trước fit chain.
2. **Case2 audio clip**: `asetpts=(PTS-STARTPTS)/speed` (chuẩn hóa
   speed — trước đây chỉ có reset → audio MISMATCH video khi speed≠1,
   concat lệch A/V) + `areverse` đứng trước.
3. **BGM (video mode)**: retime rồi mới `adelay` (đảo/nén nội dung
   trước, đặt lên timeline sau).
4. **Audio-only — track audio**: speed + reverse + `aresample=48000`.
5. **Audio-only — BGM**: speed + reverse trước `adelay`.

Total duration, text `enable` windows, `clipDuration` (transform bg)
đã speed-aware từ trước ✓. **Ghi chú trung thực**: speed audio dùng
`asetpts` thuần → **không pitch-correction** (hiệu ứng băng); `atempo`
để item sau nếu cần · không có UI speed/reverse nào mới trong round
này (B2 làm UI; `clip.reverse` chưa UI set → compiler sẵn data-path).

### 92.4 Verify

```text
• Core: 101/101 PASS + check + lint + typecheck PASS.
• App: typecheck0 · eslint compiler.ts0 · parity giữ2398/2398.
• Harness e2e: HARNESS PASS — Render3 clips to640x360 (3.5s)
  size=117388 duration=3.566667 rotation-e2e=differs
  (c3: speed2+reverse → assert setpts/2, ,reverse,, asetpts/2,
  areverse trong args + duration ∈ [3.4,3.6] = 2+1+0.5 ✓).
• Renderer-only → F5.
```

### 92.5 Roadmap

```text
• C4 ✅ + R1 ✅ tick. Core: C0 C1 C3 C4 C7 C8 ✅ · Phase I: R1 ✅.
• Round kế (R26): đề2 chọn — (a) B2 · Speed UI (tab Tốc độ preset +
  reverse, dùng withSpeed — mở data cho compiler round nãy) hoặc
  (b) R5 · Fade → volume expression (S, đóng R-item nhanh).
```

---

## §93 — Round 26 (R26): B2 · Speed UI + Reverse toggle

### 93.1 Inspector — tab Tốc độ

- **Preset +4.0x** (roadmap B2:0.5/1/2/4 —0.75/1.25/1.5/3 giữ nguyên).
- **`handleSpeedUpdate`**: speed change đi qua core **C4 `withSpeed`**
  — validate speed + giữ sàn nguồn `out ≥ in + 0.2s`, chỉ gửi2field
  đã đổi (`speed`, `out`) →1entry undo sạch. Duration tự suy ra
  `(out-in)/speed` ở mọi nơi (editor + export R25).
- **Reverse toggle** (`USwitch`) — sau2grid in/out/offset/speed.
  **Gate `trackType !== 'text'`**: text không có playback hướng →
  toggle trên text đổi mọi nơi = dead control. (Video: preview seek
  ngược + export `reverse/areverse` R25 ✓; audio track: export ✓ —
  preview engine audio chưa có, cùng hiện trạng volume slider.)

### 93.2 Preview reverse — seek-driven (`useTmcutPlayback`)

- `mediaCurrentTime` giờ có2 nhánh (C4 semantics):
  `forward: in + t*speed` · `reverse: out − t*speed`.
- Step loop (nhánh phát thường): clip `reverse` → **pause element +
  seek khi drift >0.25s** — đúng cơ chế shuttle J đang dùng (element
  HTML chỉ phát được chiều tới, không thể phát ngược native).
- `syncPreviewToPlayhead` (PreviewPlayer): không `play()` khi active
  clip là reverse (step loop sở hữu frame của nó).

### 93.3 Ghi chú / deferred

- **Speed preview mượt**: element đang chạy1× + drift-seek (cơ chế cũ,
  có từ trước B2). Bind `playbackRate = clip.speed` sẽ mượt hơn nhưng
  `playbackRate` hiện thuộc quyền J/K/L shuttle (set ở4 chỗ) — không
  đụng trong round này, ghi nhận polish sau (guard `shuttleRate === 1`
  nếu làm).
- Boundary: playhead = clipStart của reverse clip seek đúng `out` (edge
  frame trong ~33ms) — chấp nhận, export trim không affected.

### 93.4 Verify

```text
• typecheck0 · eslint (Inspector + PreviewPlayer + useTmcutPlayback)0.
• i18n parity2399/2399 (+1: inspectorProps.reverse).
• Core không đổi → 101/101 giữ mốc · compiler không đổi → không chạy
  harness round này.
• Renderer-only → F5.
```

### 93.5 Roadmap

```text
• B2 ✅ tick. Phase B: B1 ✅ B2 ✅ · còn B3..B9.
• Round kế (R27): (a) B5 · Marker UI (S — core addMarker đã có, nút M
  + gutter + dblclick) hoặc (b) R5 · Fade volume expression (S). Ưu
  tiên B5 theo thứ tự Phase B.
```

---

## §94 — Round 27 (R27): B5 · Marker UI

### 94.1 Data & composable (`useTmcutProject`)

- Type `TmcutMarker { id, at: ticks, label?, color? }` (structural
  với core `types/dsl.ts`) + field `timeline.markers?: TmcutMarker[]`.
- `markers: []` trong `buildDefaultProject` + `ensureDefaultTracks`;
  `applyProjectMigration` backfill cho project cũ (core `addMarker`
  **throw** khi thiếu mảng).
- Helpers mới (export qua return):
  - `ensureMarkers()` — lazy-init mảng.
  - `markerShim()` — object `{ version: 3, tracks: [], markers }` tối
    giản để gọi core (ops chỉ đụng `.markers`; **không** đi qua
    `applyV3Edit` vì bridge đó chỉ convert TRACKS).
  - `timelineMarkers` (computed) · `addMarkerAt(sec)` ·
    `updateMarker(id, {label?, color?})` · `removeMarkerById(id)` —
    mỗi op: guard → `pushHistory()` → core/mutate → `saveProject()`.
    `updateMarker` không core API → assign trực tiếp; label chỉ push
    history khi thật sự đổi.
- **Snap**: `snapTimeSec` giờ gán `v3.markers = ensureMarkers()` —
  core `snapTimeDetailed` đã đọc `timeline.markers` (tolerant) nhưng
  `v1TracksToV3` luôn khởi `markers: []` → marker giờ tham gia snap.

### 94.2 UI (`TmcutTimeline.vue`)

- **Pin trên ruler**: `markerPins` = ticks → px (`/TICKS_PER_SECOND *
  zoom − 6`, hit-strip 12px giữa line 2px). Flag = ô xoay 45° + line
  màu; label (nếu có) hiện chip bên phải. mousedown bubbling lên ruler
  → **click = seek** (cơ chế sẵn có); `@dblclick.stop` mở editor.
- **Phím M** (nhánh mới trong `handleGlobalKeydown`, sau N):
  `addMarkerAt(playhead)` — guard input-focus sẵn có (dòng 518).
- **Editor dblclick** (`fixed` — ruler `overflow-hidden` sẽ clip nếu
  đặt trong ruler): input nhãn (autofocus) + 6 chấm màu + nút trash.
  - Enter/click ngoài → commit (chỉ gọi `updateMarker` nếu label đổi);
    Esc → discard; listener `window mousedown` đăng ký qua
    `watch(editingMarkerId)` và dọn trong `onUnmounted`.
- Marker **text-agnostic** (mọi track) — marker thuộc ruler, không
  phụ thuộc clip.

### 94.3 Help modal (trung thực)

- Mục mới `addMarker` (category editing, `keys: ['M']`, **không badge**
  — implemented thật). Comment "All 15 documented actions" → bỏ số
  cứng ("Every documented action").

### 94.4 i18n

```text
• +4 keys: hotkeys.addMarker, hotkeys.desc.addMarker,
  tmcut.marker.color, tmcut.marker.delete (en+vi).
• parity 2403/2403.
```

### 94.5 Verify

```text
• typecheck 0 · eslint (useTmcutProject + TmcutTimeline +
  TmcutShortcutsModal) 0 · parity 2403/2403.
• Core không đổi → 101/101 giữ mốc · không chạy harness.
• Renderer-only → F5.
```

### 94.6 Roadmap

```text
• B5 ✅ tick. Phase B: B1 ✅ B2 ✅ B5 ✅ · còn B3, B4, B6..B9.
• Round kế (R28): tiếp chuỗi item S — (a) B6 · Razor toàn track
  (S: S khi chưa chọn clip = cắt mọi clip dưới playhead) rồi
  B7 · Trim by keyboard (Alt+[ / Alt+], core trimClip đã có);
  B4 (cần core C9) và B3 (cần core C5 + badge trung thực chờ R3)
  làm sau vì nặng hơn.
```

---

## §95 — Round 28 (R28): B6 · Razor toàn track

### 95.1 `handleSplit` mới (`TmcutTimeline.vue`)

Trước: chọn clip → cắt; chưa chọn → fallback tìm clip **video track
đầu tiên** dưới playhead (cắt 1 clip).

Sau (roadmap B6):

```text
1. Có clip được chọn → splitClip(selected, playhead) (giữ nguyên).
2. Không (hoặc playhead ngoài clip đã chọn) → RAZOR: lặp mọi track
   không locked × mọi clip chứa playhead → splitClip từng cái.
   • Duyệt trên snapshot [...items] vì splitClip splice mảnh thứ 2
     vào đúng mảng — mảnh mới không được cắt tiếp (infinite guard).
   • Bỏ qua track.locked; margin 0.1s do splitClip tự reject.
   • Track text/audio cũng cắt được (splitClip generic).
3. Toast "Split {count} clips at playhead" / 0 → warning cũ.
```

- Mỗi `splitClip` tự `pushHistory` + `saveProject` → razor N cut = N
  entry undo (mỗi nhát cắt undo riêng — ghi nhận là hành vi có ích,
  không gom batch để tránh thêm cơ chế history mới).
- `selectedClipId` kết thúc ở mảnh cuối (splitClip set sẵn).

### 95.2 i18n

```text
• Đổi key splitVideoAtPlayhead (khôi consumer) → razorSplitCount
  (en "{count} clips" / vi "{count} clip") — net 0 key.
• hotkeys.desc.split cập nhật mô tả razor (trung thực help).
• parity 2403/2403.
```

### 95.3 Verify

```text
• typecheck 0 · eslint (TmcutTimeline) 0 · parity 2403/2403.
• Core không đổi → 101/101 · renderer-only → F5.
```

### 95.4 Roadmap

```text
• B6 ✅ tick. Phase B: B1 ✅ B2 ✅ B5 ✅ B6 ✅ · còn B3, B4, B7..B9.
• Round kế (R29): B7 · Trim by keyboard (Alt+[ / Alt+] cắt In/Out về
  playhead, core trimClip đã có — S), rồi B4 (link/unlink + group,
  cần core C9) và B3 (transitions, cần core C5 + badge chờ R3).
```

---

## §96 — Round 29 (R29): B7 · Trim by keyboard

### 96.1 Composable `trimSelectedEdgeAt(edge, timeSec)` (`useTmcutProject`)

```ts
function trimSelectedEdgeAt(edge: 'in' | 'out', timeSec: number): boolean
```

- Guard: clip được chọn + track không locked + playhead nằm **trong**
  clip với margin 0.1s (cùng准 với `splitClip`) → sourceTicks
  `in + (timeSec − offset) × speed` luôn nằm trong (in, out) → core
  không phải clamp, không thể over-extend vượt source.
- Gọi core **`trimClip`** qua `applyV3Edit` (cầu v1↔v3; left-trim
  dời `timeline.start` được `syncV3Result` map về `offset`).
- Export qua return.

### 96.2 Component (`TmcutTimeline`)

- Nhánh `e.altKey && (key === '[' || ']')` trong `handleGlobalKeydown`
  (sau I/O marks) → `handleTrimEdge(edge)` — toast success
  `trimAtPlayhead` / warning `trimNotPossible` (gộp mọi no-op: chưa
  chọn clip, locked, playhead ngoài clip).
- Comment header danh sách phím tắt cập nhật (M, Alt+[/], razor).

### 96.3 Help modal

- Mục mới `trimKeyboard` (editing, `Alt + [` / `Alt + ]`, keySep,
  **không badge** — implemented thật).

### 96.4 i18n

```text
• +4 keys: hotkeys.trimKeyboard, hotkeys.desc.trimKeyboard,
  timelineActions.trimAtPlayhead, timelineActions.trimNotPossible.
• parity 2407/2407.
```

### 96.5 Verify

```text
• typecheck 0 · eslint (useTmcutProject + TmcutTimeline +
  TmcutShortcutsModal) 0 · parity 2407/2407.
• Core không đổi → 101/101 · renderer-only → F5.
```

### 96.6 Roadmap

```text
• B7 ✅ tick. Phase B: B1 B2 B5 B6 B7 ✅ · còn B3, B4, B8, B9.
• Round kế (R30): B4 · Link/unlink A-V (Ctrl+L, linkId DSL đã có) +
  Group (Ctrl+G, cần core C9) — cần khảo sát DSL trước; B3
  transitions (cần core C5 + badge trung thực chờ R3 xfade) làm sau.
```

---

## §97 — Round 30 (R30): Core C9 · Group / ungroup

### 97.1 `selection.mjs` (+2 API)

```ts
groupClips(timeline, ids): string | null   // groupId mới, null nếu <2 target
ungroupClips(timeline, ids): number        // số clip mất groupId
```

- `groupClips`: resolve qua `resolveClips`, **bỏ track locked**, cần
  ≥2 target → gán groupId mới (`grp_<ts36><counter>`); groupId cũ bị
  overwrite → grouping **merge** các nhóm khác nhau.
- `ungroupClips`: clear `groupId` của các id đã resolve (locked bỏ
  qua) — caller thường truyền `expandRelated(...)` để gỡ cả nhóm.
- Barrel `export *` tự expose · d.ts +2 dòng.

### 97.2 Sửa `v1compat` (gap thật)

- `v1MatchesV3` **không compare `groupId/linkId`** → core op chỉ đổi
  quan hệ (C9 group) sẽ bị `syncV3Result` coi là "untouched" và **mất
  khi merge-back**. Thêm `groupId`, `linkId` vào `COMPARE_STRINGS`.
- `reverse` cố ý KHÔNG thêm: v1 fixture thiếu field (undefined) còn v3
  chuẩn hóa `false` → so strict sẽ báo mọi clip untouched là đổi
  (comment trong code giải thích).

### 97.3 Tests

```text
• selection-markers.test.mjs +describe "groups (C9)":4 its
  (group ≥2 + expandRelated · merge nhóm + ghost id · <2 → null ·
  ungroup + locked skip).
• v1compat.test.mjs +1: "detects relation-only changes (groupId/linkId)"
  — regression guard cho compare fix.
• CORE 106/106 PASS (101 +5) · check-boundaries PASS ·
  tm-tools pnpm typecheck:core 0.
```

### 97.4 Roadmap

```text
• C9 ✅ tick (core checklist dòng 726 cập nhật).
• B4 (UI: Ctrl+G/Ctrl+Shift+G + Ctrl+L link, help modal) → R31.
```

---

## §98 — Round 31 (R31): B4 · Group / Link UI

### 98.1 Composable (`useTmcutProject`, +4 helpers)

- `expandedUnlockedIds()` — members của expanded selection bỏ track
  locked (core cũng skip).
- `groupSelection()` — Ctrl+G: cần ≥2 unlocked targets →
  `applyV3Edit(v3 => groupClips(...))` (core C9; compare fix §97 đảm
  bảo groupId sống sót merge-back).
- `ungroupSelection()` — Ctrl+Shift+G: pre-check có member nào mang
  groupId rồi mới push history.
- `toggleLinkSelection(): 'linked' | 'unlinked' | 'none'` — Ctrl+L:
  tìm clip chồng thời gian (overlap `[start,end)`) trên track khác
  (không locked) → gán `linkId` chung; nếu clip + mọi overlap ĐÃ chung
  1 linkId → toggle UNLINK. Mutate trực tiếp (pushHistory +
  saveProject) — không có core API cho link.
- `relatedOffsetsFor(clipId)` — offsets của relatives (loại locked)
  để drag mang theo.

### 98.2 Drag move cùng nhóm (`TmcutTimelineClip`)

- `onDragStart` capture `relatedOffsetsFor(clip.id)` một lần; mỗi
  mousemove: update clip được kéo (đã snap) + mọi relative với
  `base + moved` (cùng adjusted delta → giữ khoảng cách, tôn trọng
  snap). Trim handles vẫn đơn lẻ (chỉ MOVE đi theo nhóm — đúng
  hành vi CapCut).

### 98.3 Keyboard + toasts (`TmcutTimeline`)

- Ctrl+G / Ctrl+Shift+G / Ctrl+L / Ctrl+Shift+L (nhánh mới sau Ctrl+K,
  `preventDefault` — chặn overlay omnibox của Chromium với Ctrl+L).
- Toast trung thực cho mọi kết quả: groupCreated/ungrouped/
  relationsNone ("chưa có clip liên kết hoặc cùng nhóm") /
  linkCreated/linkRemoved/linkNotPossible.

### 98.4 Help modal + i18n

```text
• +2 mục: groupUngroup, linkUnlink (editing, không badge — thật).
• +10 keys (6 toast + 4 hotkeys, en+vi) → parity 2417/2417.
```

### 98.5 Verify

```text
• typecheck 0 · eslint (useTmcutProject + TmcutTimelineClip +
  TmcutTimeline + TmcutShortcutsModal) 0 · parity 2417/2417.
• Core không đổi ở round này (106/106 giữ mốc) · renderer-only → F5.
```

### 98.6 Roadmap

```text
• B4 ✅ tick (kèm core C9 ✅ §97). Phase B: B1 B2 B4 B5 B6 B7 ✅ ·
  còn B3, B8, B9.
• Round kế (R32): xem B8/B9 (S?) trước; B3 transitions cần core C5 +
  badge trung thực chờ R3 (xfade) → làm chung một round core+UI.
```

---

## §100 — Round 32 (R32): C15 + B8 · History batch & coalesce

### 100.1 Core C15 (`history.mjs`)

```ts
pushBatch(history, entries, label?): void   // N entries → 1 undo (first.before → last.after)
coalesce(history, entry, windowMs?): boolean // burst cùng name trong window → gộp
```

- `createHistory` thêm accessor nội bộ `_top()` / `_replaceAfter(after)`
  (coalesce cần đọc/sửa entry trên cùng; `_replaceAfter` cũng clear
  redo như `commit`). d.ts: interface `CoreHistoryCommand` tách riêng.
- **Deviation có chủ đích**: tham số `windowMs` (wall-clock) thay
  `windowTicks` của spec — coalescing đo "burst gõ chữ" là wall time;
  ticks là media time không đo được pause. Ghi chú trong JSDoc + đây.
- Tests: +3 (pushBatch depth/undo/redo + empty no-op · coalesce
  gộp/không gộp khác name/khác window, dùng `_top().createdAt` giả lập
  clock) → **CORE 109/109 PASS** · boundaries PASS ·
  `pnpm typecheck:core` (tm-tools) 0.

### 100.2 App B8 (`useTmcutProject` + `TmcutInspector`)

- App dùng **snapshot stack** (không phải core `createHistory`) nên
  consumer thật của C15 là C16 (chuyển v3-native); B8 cài bản song
  thân trên snapshot stack:
  - `pushHistoryCoalesced(key)` — burst cùng key trong **800ms** →
    không push nữa (top entry đã giữ ảnh trước burst → undo = cả burst);
    khác key/qua window → push mới. `restoreHistorySnapshot` clear
    marker (undo/redo giữa chừng không dính burst cũ).
  - **Inspector `handleUpdate`** giờ push history qua coalescing —
    sửa lỗ hổng cũ: toàn bộ field của Inspector (text, slider,
    crop, volume…) **trước đây KHÔNG có undoเลย**.
  - Discrete ops (toggleKeyframe ⏱, handleSpeedUpdate, handleFitUpdate)
    → `pushHistory()` thường (1 entry/thao tác); sửa comment B1 cũ
    ("updateClip records ONE undo entry" — sai, updateClip không push).

### 100.3 Verify

```text
• CORE 109/109 · boundaries PASS · typecheck:core 0.
• typecheck app 0 · eslint (useTmcutProject + TmcutInspector) 0.
• parity giữ 2417/2417 (round này không thêm key) · F5.
```

### 100.4 Roadmap

```text
• C15 ✅ (deviation windowMs ghi nhận) · B8 ✅.
• Phase B: B1 B2 B4 B5 B6 B7 B8 ✅ · còn B3 (transitions, core C5 +
  badge chờ R3), B9 (ripple insert, core C2).
• Round kế (R33): B9 = core C2 (`insertClipRipple` + `closeGaps`) +
  UI thả clip đè khi rippleMode · R34: B3 = core C5 transitions +
  preview crossfade + badge trung thực (export thật chờ R3).
```

---

## §101 — Round 33 (R33): C2 + B9 · Ripple insert & close gaps

### 101.1 Core C2 (`editing.mjs`, +2 API)

```ts
insertClipRipple(timeline, trackType, partial, atTicks, options?): { clip, shifted } | null
closeGaps(timeline, options?): number   // GIÂY đã đóng (spec — API duy nhất trả seconds)
```

- `insertClipRipple`: `addClip` tại `atTicks` rồi dịch mọi clip
  `start >= atTicks` sang phải bằng duration mới. Lock: track đích
  locked → `null`; shift bỏ qua track locked. Option thêm
  `acrossTracks` (ngoài spec — mirror `rippleDelete`) để dịch mọi
  track (giữ đồng bộ A/V).
- `closeGaps`: sort từng track theo start, kéo mọi clip chạm
  predecessor (leading gap kéo về 0). Options `trackType` (ngoài
  spec, cần cho per-track tidy) + `acrossTracks` (mặc định **true**
  — ngược `rippleDelete`: đây là thao tác tổng thể; `false` = chỉ
  track đầu tiên khớp). Trả `closedTicks / TICKS_PER_SECOND`.
- Tests +4 (shift đơn/làm việc cross-track + lock · empty/past-end ·
  gaps per-track + locked) → **CORE 113/113 PASS** · boundaries PASS ·
  typecheck:core 0.

### 101.2 App B9 (`useTmcutProject` + `TmcutTimeline`)

- `applyV3Edit` thêm option `{ skipHistory }` (caller đã push history
  → 1 user action = 1 undo entry).
- **Ripple insert trên drop** (`addClipToTrack`): `rippleMode` bật +
  clip mới **đè** nội dung hiện hữu (test overlap `[start,end)`) →
  giao toàn bộ cho core `insertClipRipple` qua bridge
  (`v1ClipToV3` + id tự sinh → syncV3Result merge về) — thả vào
  chỗ trống vẫn overlay bình thường. Bridge fail (locked) → rơi về
  path overlay cũ (drop không bao giờ "bị nuốt").
- **Close gaps toolbar** (`i-lucide-chevrons-left`, cạnh Magnet):
  `closeProjectGaps()` — pre-scan v1 tránh push history no-op →
  `applyV3Edit(closeGaps)` → toast "Closed {seconds}s of gaps" /
  warning "No gaps to close". (Consumer thật của `closeGaps`;
  autocut `applyDraft` đã auto-contiguous nên không cần.)
- i18n +3 (closeGaps / gapsClosed / noGaps) → **parity 2420/2420**.

### 101.3 Verify

```text
• CORE 113/113 · boundaries PASS · typecheck:core 0.
• typecheck app 0 · eslint (useTmcutProject + TmcutTimeline) 0 ·
  parity 2420/2420 · renderer-only → F5.
```

### 101.4 Roadmap

```text
• C2 ✅ · B9 ✅. Phase B giờ CHỈ còn B3 (transitions).
• Round kế (R34): B3 = core C5 (transitions: loại + duration) +
  preview crossfade (2 layer fade-op) + export thật chờ R3 (xfade) →
  badge "chưa xuất được" trung thực.
```

---

## §102 — Round 34 (R34): C5 + B3 · Transitions (kết thúc Phase B)

### 102.1 Core C5 (`transitions.mjs` — module mới, 4 API)

```ts
KNOWN_TRANSITIONS: string[]   // fade, dissolve, wipe-left, wipe-right, slide-left, zoom-in
canApplyTransition(timeline, clipId, type, durationTicks): { ok, reason?, overlapTicks? }
applyTransition(timeline, clipId, type, durationTicks): boolean
clearTransition(timeline, clipId): boolean
transitionWindows(track): Array<{ fromId, toId, startTicks, endTicks }>
```

- **Overlap model — deviation có chủ đích**: spec để `canApplyTransition`
  thiếu param `type` nhưng lại liệt kê reason `unknown-type` → thêm `type`
  làm param thứ 3; thêm reason `'locked'` (lock-guard core: locked track
  refuse apply/clear). Cả 2 ghi trong d.ts + header comment.
- **Semantics**: transition gắn vào clip SAU (`transitionIn.duration` —
  ticks). Apply = shift clip đó sang TRÁI đúng bằng duration để đầu clip
  chồng thật lên đuôi clip liền trước (đây là model duy nhất 2 layer phát
  liên tục — không nhảy frame ở rìa window; 2 model "đảo media time" đều
  giật). Re-apply un-shift cũ trước → duration stored = shift live.
  Clear = shift phải lại → cắt về vị trí gốc. **Chỉ clip mang transition
  dịch chuyển** (các clip sau giữ nguyên — gap sau nới rộng đúng bằng d,
  re-apply thuần thao tác cục bộ, reversible tuyệt đối).
- **Validation**: `effectiveStart = start + duration cũ` (un-shift view —
  re-validate luôn trên cut gốc) · neighbor = clip end gần cut nhất trong
  1ms EPS (round-trip v1 seconds) · `too-long` = d > min(2 clip)
  (derive từ source — `clipEndTicks`/`clipDurationTicks`, KHÔNG dùng
  `timeline.duration` trực tiếp để một nguồn sự thật) ·
  `transitionWindows` skip cặp vỡ (neighbor không còn end tại window end).
- Tests `test/transitions.test.mjs` **+9** (unknown/first/gap/too-long ·
  apply+window · re-apply không cộng dồn · un-shift view bắt gap · clear ·
  locked) → **CORE 124/124 PASS** · boundaries PASS · typecheck:core 0.

### 102.2 Fix đồng bộ phát hiện trong round

- **`v1MatchesV3` so `transitionIn`** (bug thật): trước đây clear
  transition → offset trôi về đúng giá trị cũ + field object không nằm
  COMPARE_NUMBERS/STRINGS → v1MatchesV3 = true → `syncV3Result` SKIP →
  v1 giữ transition cũ mãi. Thêm `sameTransition` (type + duration EPS) →
  +1 test.
- **`splitClip` strip `transitionIn` nửa sau** (core + app v1): deep-copy
  kế thừa field sai — nửa sau đã có clip liền trước MỚI (chính nửa đầu);
  nửa giữ vẹn (start vẫn chồng clip trước) → +1 test.
- **Containment guard** trong `transitionCrossfade` (playback): incoming
  phải còn phủ playhead — split/trim giữa window render plain cut thay vì
  dựng layer outgoing dưới clip đã đổi.

### 102.3 App B3 (playback + preview + menu + export badge)

- **`useTmcutProject`**: `checkClipTransition` (read-only, không push
  history) · `applyClipTransition` (pre-validate TRƯỚC pushHistory →
  refused = không có undo entry thừa) · `clearClipTransition` (probe trên
  bản conversion throwaway trước) · `timelineTransitionCount` (badge).
  `transitionIn.duration` cất **ticks** trong model v1 giây (v1compat
  passthrough — cùng pattern keyframes).
- **`useTmcutPlayback`**: `outgoingVideoRef` (module-level) +
  `transitionCrossfade` computed (video track: incoming = clip mang
  `transitionIn`, outgoing = clip end tại window end ±5ms, progress 0..1,
  `outgoingMediaTime` qua `mediaTimeAt` — helper gộp nhánh reverse) ·
  `activeVideoClip` skip outgoing trong window (main element LUÔN là
  incoming) · `syncOutgoingVideo()` mirror main (seek-driven khi reverse
  shuttle/reverse clip, play + drift-correction khi forward) — gọi ở
  `seek/step(2 nhánh)/play/pause`.
- **`TmcutPreviewPlayer`**: layer `<video>` thứ 2 (muted — audio theo
  incoming, documented simplification) + `@loadedmetadata` seek frame đầu ·
  stacking: outgoing positioned TRƯỚC main, main thêm `relative` → tree
  order đúng, badge/guides/text không đổi thứ tự · per-type ramp
  (`incomingRamp`): fade/dissolve = opacity ramp 1 chiều (**chỉ 1 layer
  ramp** — source-over 2 α mờ sẽ thấm nền đen: 0.5·in + 0.25·out), wipe =
  `clip-path inset`, slide = `translateX(%)`, zoom = `scale(0.85→1)` prepend
  · `outgoingStyle` = fit/transform/opacity của chính nó (không ramp).
- **`TmcutTimelineClip` menu chuột phải** (Teleport `fixed`, clamp
  viewport, Esc/outside đóng, suppress menu browser): **video clips
  CHỈ** — text/audio omit (không preview được = dead control theo honesty
  rule) · 6 loại từ `KNOWN_TRANSITIONS` + preset 0.2/0.5/1/2s + "None" ·
  click = apply ngay (menu mở cho lặp type/duration) · default type/duration
  lấy từ transition hiện có · `reasonFor` live-validate từng nút (disabled
  + title) · dòng reason inline khi combo đang chọn không hợp lệ · footnote
  "Preview only — export support is on the way".
- **Export badge** (`TmcutExportModal`): amber banner khi
  `timelineTransitionCount > 0 && mode !== 'audio'` — "Transitions ({n})
  will export as hard cuts" (trung thực đến khi R3 xfade).
- i18n **+17** (clipMenu 15 + export 2) → **parity 2437/2437**.
- Không thêm shortcut → help modal không đổi (chỉ ghi feature thật).

### 102.4 Verify

```text
• CORE 124/124 (113 + 9 C5 + 2 fix) · boundaries PASS · typecheck:core 0.
• typecheck app 0 · eslint (useTmcutProject, useTmcutPlayback,
  TmcutPreviewPlayer, TmcutTimelineClip, TmcutExportModal) 0 ·
  parity 2437/2437 · renderer-only → F5.
```

### 102.5 Roadmap

```text
• C5 ✅ · B3 ✅ → PHASE B HOÀN TẤT (B1..B9 xong hết).
• Round kế (R35) dự kiến: C6 — Effect registry + validate (core S,
  module mới effects.mjs; consumer UI nằm Phase E).
• Rounds 8–34 (§77–§102) vẫn CHƯA COMMIT — HEAD 482ec4a 2026.10.04.
```

---

## §103 — Round 35 (R35): C6 · Effect registry + validate (core-only)

### 103.1 Core C6 (`effects.mjs` — module mới)

```ts
EFFECT_REGISTRY: Record<string, EffectDescriptor>   // blur, sharpen, vignette, grain,
                                                    // chromakey, lut3d, stabilize, eq-grade
validateEffect(effect): string[]                    // lỗi kiểu validateTimeline
normalizeEffects(list): TmcutClipEffect[]
```

- **`EffectParam` kinds** (đúng spec): `number` (min/max bắt buộc),
  `color` (hex #rgb/#rrggbb/#rrggbbaa), `enum` (options), `bool`.
  Registry wave 1 đi kèm default cho MỖI param (normalize dựa vào đó).
- **`renderReady: false` toàn bộ 8 effect** — cờ trung thực: compiler
  chưa map effect nào (R4) → consumer Phase E (accordion Inspector)
  sẽ badge "chưa xuất bản" thay vì ngầm hiểu file có hiệu ứng.
  `label` = hằng số English; UI dịch theo `type` key (AGENTS.md).
- **`validateEffect`**: chỉ check param CÓ mặt (thiếu = hợp lệ —
  normalize lấp sau) · lỗi: unknown type/param, `must be a number`,
  `out of range [min, max]`, `must be a hex color`, `not in options`,
  `must be a boolean`.
- **`normalizeEffects`**: không phải array → `[]` · type lạ / entry rác
  → **drop** · param whitelist theo registry (field lạ biến mất) ·
  number clamp về range · giá trị sai kind → default · fill đủ mọi
  param registry → output **luôn** `validateEffect(...) === []`.
- **Deviation nhỏ có chủ đích**: LUT wave 1 dùng `enum` preset
  (neutral/warm/cool/cinematic/vintage) thay vì chọn file `.cube` —
  kind `file` sẽ mở rộng cùng R4 (compiler) để không có control
  chọn file mà không render được.
- Tests `test/effects.test.mjs` **+5** (registry 8 + không rỗng key +
  range/default bắt buộc · shape/unknown type · out-of-range/wrong kind/
  unknown param · normalize drop + whitelist · clamp + default) →
  **CORE 129/129 PASS** · boundaries PASS · typecheck:core 0 ·
  `TmcutClipEffect` thêm vào d.ts import/re-export (trước đó
  `normalizeEffects` trả type chưa bind).

### 103.2 Verify

```text
• CORE 129/129 (124 + 5 C6) · boundaries PASS · typecheck:core 0.
• typecheck app 0 (app không đổi — round core-only) · parity giữ
  2437/2437 · không có file app nào chạm → không cần eslint mới.
```

### 103.3 Roadmap

```text
• C6 ✅. Core còn: C10..C14, C16, C17 (section 3). Không có UI nào
  trong round này — consumer thật (Inspector accordion + badge) làm
  chung Phase E, compiler mapping làm R4 (đúng spec C6).
• Round kế (R36) dự kiến: C10 — EDL segments → clip inputs (glue
  AutoCut → Timeline, core S, edl.mjs).
• Rounds 8–35 (§77–§103) vẫn CHƯA COMMIT — HEAD 482ec4a 2026.10.04.
```

---

## §104 — Round 36 (R36): C10 · EDL segments → clip inputs (core + consumer)

### 104.1 Core C10 (`edl.mjs` — thêm vào module có sẵn)

```ts
segmentsToClips(edl, segments, options?: { minGapTicks?, trackType? })
  → Array<CoreClipInput & { in: number, out: number, offset: number }>  // ticks
```

- **Gate an toàn**: EDL không hợp lệ (`validateEdl` ≠ `[]`) → `[]`
  — không tin output model; consumer nhận `[]` → từ chối áp dụng
  (trước đây `applyDraft` ghép object tay nên EDL rác vẫn lọt).
- **Filter + sort**: drop entry không phải object / span ≤ 0 / start < 0,
  còn lại sort theo start (spec C10).
- **Bố cục mặc định — concatenate**: segment giữ liền nhau, dead air
  của nguồn biến mất (khớp hành vi `applyDraft` cũ + ghi chú §101
  "autocut đã contiguous") · cursor ticks tích lũy từ 0.
- **`minGapTicks`**: gap nguồn ≥ ngưỡng → GIỮ nguyên (khoảng nghỉ thật
  trong draft), gap < ngưỡng → vẫn đóng. Tính bằng ticks tuyệt đối
  trên nguồn; drift do micro-gap đã đóng tích lũy tự nhiên (documented:
  gap thứ n = offset trước + duration + gap nguồn nếu giữ).
- **`trackType`**: validate intent `'video' | 'audio'` ('text' → `[]`);
  shape clip hôm nay giống nhau 2 loại — option phòng khi EDL audio
  (podcast-summary) có default riêng (vd volume) ở lần tới.
- **`{ in, out, offset }` flat** — core `addClip` map `offset` →
  `timeline.start`, tính `duration` từ in/out (không trả field thừa
  addClip bỏ qua).

### 104.2 Consumer (`useTmcutAutocut.applyDraft`)

```ts
const clips = segmentsToClips(edl, segments)     // core: validate+sort+layout
if (clips.length === 0) return null
...
addClipToTrack('video', { ...clip, name, src })  // ticksToSec ở biên
```

- Loop `included` giờ chỉ GOM segment (bỏ filter/sort tay — core làm).
- Biên v1 seconds: `ticksToSec(in/out/offset)` — giống mọi bridge core
  (`v1ClipToV3`/`secToTicks` đã có sẵn pattern ở R33).
- EDL invalid → `null`, không tạo project mồ côi (analyzeSource vốn
  đã chặn EDL rác ở bước phân tích — đây là lớp bảo vệ thứ 2).

### 104.3 Verify

```text
• CORE 134/134 (129 + 5 C10) · boundaries PASS · typecheck:core 0.
• typecheck app 0 · eslint file chạm (useTmcutAutocut.ts) 0 ·
  i18n giữ nguyên 2437/2437 (round không có chuỗi UI).
• Test C10 ghi chú: offset gap-preserving có drift (7 → 13.5s khi
  micro-gap 0.5s đóng) — hành vi cố ý, test assert đúng 13.5.
```

### 104.4 Roadmap

```text
• C10 ✅. Core còn: C11..C14, C16, C17 (section 3).
• Round kế (R37) dự kiến: C11 — Caption/Auto-subtitle + SRT
  (module mới caption.mjs, M; consumer auto-captions Phase C).
• Rounds 8–36 (§77–§104) vẫn CHƯA COMMIT — HEAD 482ec4a 2026.10.04.
```

---

## §105 — Round 37 (R37): C11 · Caption/Auto-subtitle + SRT (core-only)

### 105.1 Core C11 (`caption.mjs` — module mới)

```ts
TranscriptCue { text, start, end }                 // GIÂY (Whisper/SRT native)
splitLongCue(cue, maxChars) → TranscriptCue[]
cuesToCaptionClips(cues, options?) → caption text clip inputs (ticks)
parseSrt(text) → TranscriptCue[]
serializeSrt(cues) → string
```

- **`TranscriptCue`** đặt tại `types/caption.ts` (k pattern `edl.ts`) +
  barrel `types/index.ts` · cue times GIÂY, clip times TICKS —
  `secToTicks` ở biên (nhất quán mọi module core).
- **`splitLongCue`**: greedy tích lũy từ theo budget ký tự — từ KHÔNG
  bao giờ bị cắt giữa (từ đơn dài hơn maxChars giữ nguyên thành 1 chunk
  riêng) · timing phân bổ tỉ lệ theo length chars, chunk cuối pin
  `end` gốc (không drift) · cue ngắn / maxChars invalid → passthrough
  `[cue]`; cue invalid → `[]`.
- **`cuesToCaptionClips`**: mỗi cue → (split theo `maxChars` mặc định
  42) → (time-slice theo `maxDurTicks` mặc định 7s — slice chia THỀU
  thời gian để mọi caption ≤ budget, words chia đều theo số lượng) ·
  `fromTicks` neo offset (vị trí timeline clip gốc) · `rangeTicks`
  {start,end} clamp cửa sổ nguồn: ngoài → drop, vắt biên → cắt timing
  (giữ nguyên text) · output `{ text, in: 0, out, offset }` ticks.
- **SRT**: `parseSrt` tolerant — index dòng đầu tùy ý, CRLF, decimal
  chấm HOẶC phẩy, toạ độ X1/Y1 sau end timestamp bị bỏ qua, block rác
  → skip (không bao giờ throw) · `serializeSrt` chuẩn
  `HH:MM:SS,mmm` đánh số từ 1, block cách dòng trắng, trailing
  newline · drop cue rỗng text / end ≤ start để `parse(serialize())`
  round-trip sạch.
- **Boundary fix**: chữ "window." trong comment dính regex
  `check-boundaries` (`/\bwindow\./`) → viết lại wording (core cấm
  tham chiếu `window` platform).

### 105.2 Verify

```text
• CORE 139/139 (134 + 5 C11) · boundaries PASS (sau fix comment) ·
  typecheck:core 0.
• Round core-only: app không đổi (UI auto-captions + xuất SRT nằm
  Phase C theo spec) → typecheck app giữ 0 từ R36 · i18n giữ nguyên
  2437/2437.
```

### 105.3 Roadmap

```text
• C11 ✅. Core còn: C12..C14, C16, C17 (section 3).
• Round kế (R38) dự kiến: C12 — Fade in/out + gain math (audio.mjs,
  S; DSL thêm fade?: { in, out } ticks; consumer Inspector tab âm
  thanh).
• Rounds 8–37 (§77–§105) vẫn CHƯA COMMIT — HEAD 482ec4a 2026.10.04.
```

---

## §106 — Round 38 (R38): C12 · Fade in/out + gain math (core + UI)

### 106.1 Core C12 (`audio.mjs` — module mới)

```ts
fadeDuration(clip, edge: 'in'|'out') → ticks        // clamp ≤ duration/2
gainAt(clip, atTicks) → 0..1                        // volume(0..1) × envelope
volumeExpr(clip) → FFmpeg expression                // marker A / D−B / D
```

- **DSL**: `TmcutTimelineClip.fade?: { in, out }` (TICKS) trong
  `types/dsl.ts` + `addClip` passthrough (`fade: partial.fade`, cùng
  style `transitionIn`).
- **Dual-shape** (cùng contract `evalKeyframe`): clip v3 đọc
  `timeline.duration`; item v1 flat tính từ `in/out` GIÂY ÷ speed →
  ticks — preview gọi trực tiếp, không cần bridge tốn kém.
- **`fadeDuration`**: clamp ≤ `duration/2` → fade-in + fade-out không
  bao giờ chồng lên nhau · edge invalid / fade ≤ 0 → 0.
- **`gainAt`**: atTicks clip-LOCAL (0 = đầu clip), clamp ngoài [0,
  duration] · volume 0..100 → 0..1 (mặc định 100 khi thiếu) ·
  envelope tam giác 2 đầu · keyframed volume là việc của caller —
  spread giá trị eval vào `volume` trước khi gọi (preview làm vậy).
- **`volumeExpr`**: expression CHỈ cho envelope (phần trăm volume vẫn
  là `volume=` filter riêng, R5 gộp) · đủ 3 mốc: A (hết fade-in),
  D−B (bắt đầu fade-out), D (hết clip) · float noise trim
  (`Number.toFixed(6)`) · không fade → `'1'`.

### 106.2 v1compat + UI

- **v1compat**: fade passthrough 2 chiều (`v1ClipToV3`/`v3ClipToV1`) +
  `sameFade` trong `v1MatchesV3` — clear fade PHẢI sync về v1 (lesson
  từ transitionIn R34: so sánh object tường minh, không dựa field số).
- **Inspector tab Âm thanh**: 2 chip Fade in/Fade out — click toggle
  0.5s mặc định (đổi màu khi active) · slider hiện ra khi active
  (0..min(5s, duration/2), step 0.1s, nhãn `x.xs`) · toggle = 1 undo
  entry (`pushHistory`), slider burst = coalesce (B8/C15) · patch
  `{ fade: { in, out } }` — edge còn lại giữ nguyên.
- **Preview**: `videoVolume = gainAt({ ...clip, volume: keyframed },
  localTicks(clip))` — fade + keyframe volume nhân vào nhau.
- **Export trung thực**: volume + fade CÙNG một gap family (compiler
  chưa map cả hai, R5 làm trọn) → không thêm badge mới; volume slider
  cũng chưa export từ trước, fade đi cùng đúng ngữ cảnh.
- **Shift+D KHÔNG thêm** — đúng tinh thần spec "chỉ thêm khi thật";
  shortcut sẽ tới khi fade UX chín.

### 106.3 Verify

```text
• CORE 144/144 (139 + 4 audio + 1 v1compat fade) · boundaries PASS ·
  typecheck:core 0.
• typecheck app 0 · eslint 3 file chạm 0 · i18n +2 (fadeIn/fadeOut) →
  parity 2439/2439.
• Deviation ghi nhận: d.ts `gainAt` nhận `CoreFadeClip` union (v3 |
  v1-flat | null) thay vì `TmcutTimelineClip` cứng — dual-shape là
  contract có chủ đích, type phải nói đúng.
```

### 106.4 Roadmap

```text
• C12 ✅. Core còn: C13, C14, C16, C17 (section 3).
• Round kế (R39) dự kiến: C13 — Safe-area rects (canvas.mjs, S;
  consumer TmcutPreviewPlayer thay hardcode inset 2.5%/5% + preset).
• Rounds 8–38 (§77–§106) vẫn CHƯA COMMIT — HEAD 482ec4a 2026.10.04.
```

---

## §107 — Round 39 (R39): C13 · Safe-area rects + ratio guides (core + UI)

### 107.1 Core C13 (thêm vào `canvas.mjs` có sẵn)

```ts
safeAreaRects(canvas) → { actionSafe, titleSafe }   // { x, y, w, h } fractions
SAFE_AREA_PRESETS: Array<{ id, label, ratio }>      // 16:9, 9:16, 1:1, 4:5, 4:3, 3:4, 21:9
```

- **`safeAreaRects`**: actionSafe = khung 0.9×0.9 GIỮA canvas,
  titleSafe = 0.8×0.8 — chuẩn broadcast (inset 5% / 10% thay cho
  hardcode 2.5% / 5% cũ — overlay đổi nhẹ về chuẩn chuẩn) · trả
  FRACTIONS (dimension-independent, CSS percentage-ready) · canvas
  invalid (thiếu/không dương width/height) → zero rects (overlay
  không bao giờ vẽ trên dữ liệu rác) · inset qua `toFixed(6)` trim
  float noise (0.05 sạch, không 0.04999…).
- **`SAFE_AREA_PRESETS`**: 7 preset tỉ lệ; `label` là hằng số
  "16:9"-style (số, không cần dịch) · `ratio` = width/height số thực.
- **UI (TmcutPreviewPlayer)**:
  - Overlay Safe Area giờ lấy rect từ core (computed `safeArea`,
    helper `pct()`) — hardcode biến mất.
  - HUD thêm dropdown **Frame guide** (icon rectangle-horizontal):
    item "None" + 7 preset, item active gắn icon check · chọn →
    overlay khung dashed `border-primary/60` căn giữa theo tỉ lệ
    (max-fit vào canvas) — **composition aid, không crop** ·
    computed `ratioGuideStyle` tính w/h max-fit rồi canh giữa.
- **i18n +2**: `tmcut.safeArea.ratioGuide` ("Frame guide"/"Khung dẫn
  tỷ lệ") + `tmcut.safeArea.none` ("None"/"Không") → parity 2441.

### 107.2 Verify

```text
• CORE 147/147 (144 + 3 C13) · boundaries PASS · typecheck:core 0.
• typecheck app 0 · eslint TmcutPreviewPlayer.vue 0 · parity
  2441/2441.
```

### 107.3 Roadmap

```text
• C13 ✅. Core còn: C14, C16, C17 (section 3).
• Round kế (R40) dự kiến: C14 — Frame plan (frames.mjs, S; filmstrip/
  thumbnail/extractFrame timestamp math; consumer G1 IPC
  tmcut:extractFrame — main + preload → FULL RESTART).
• Rounds 8–39 (§77–§107) vẫn CHƯA COMMIT — HEAD 482ec4a 2026.10.04.
```
