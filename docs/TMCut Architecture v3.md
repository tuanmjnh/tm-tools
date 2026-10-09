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
