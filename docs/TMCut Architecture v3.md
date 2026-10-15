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

---

## §108 — Round 40 (R40): C14 · Frame plan (core-only)

### 108.1 Core C14 (`frames.mjs` — module mới)

```ts
filmstripTimes(startTicks, durationTicks, count) → number[]        // ticks
frameTimesForSegments(segments, perSegment) → [{ id, times[] }]
clampFrameTime(atTicks, startTicks, durationTicks) → number        // ticks
```

- **Module tách riêng** thay vì mở rộng `cache.mjs` — cache.mjs là
  cache-key/proxy (FNV-1a, buildProxyArgs), không dính frame timing.
- **`filmstripTimes`**: mỗi mốc nằm GIỮA slice riêng của nó
  (`guard + (i + 0.5) × slice`) — đại diện đúng cho khoảng thời gian
  thay vì point-mốc · lùi ≥ 2% mỗi đầu (`EDGE_GUARD_SHARE` — tránh
  frame đen/đang decode) · duration ≤ 0 / count không finite hoặc < 1
  → `[]` · count lẻ floors · kết quả rounded về ticks nguyên.
- **`frameTimesForSegments`**: dual-shape như evalKeyframe/gainAt —
  v3 clip đọc `timeline.start/duration` (ticks), v1 flat item tính
  từ `offset/in/out` SECONDS ÷ speed · entry không có id → drop ·
  span unusable → slot `{ id, times: [] }` GIỮ chỗ (caller zip 1:1
  được) · không phải array → `[]`.
- **`clampFrameTime`**: pin thời điểm frame về [start, start+duration]
  (seek/snap safety) · time NaN hoặc duration ≤ 0 → start · start
  NaN → 0.
- **Ranh giới trách nhiệm** (đúng spec): core chỉ tính DANH SÁCH
  timestamp ticks — `ticksToSec` + FFmpeg `-ss` là của Electron
  extractor (G1 IPC `tmcut:extractFrame`, main + preload → full
  restart).

### 108.2 Verify

```text
• CORE 151/151 (147 + 4 C14) · boundaries PASS · typecheck:core 0.
• Round core-only: app không đổi (filmstrip/thumbnail/snapshot là G1)
  → typecheck app + parity giữ nguyên 2441/2441.
```

### 108.3 Roadmap

```text
• C14 ✅. Core còn: C16, C17 (section 3) — hết phần core lớn.
• Round kế (R41) dự kiến: **G1** — IPC `tmcut:extractFrame` (main +
  preload → FULL RESTART) + consumer: thumbnail segment AutoCut,
  filmstrip timeline (thay cover 1 frame), nút snapshot HUD — dùng
  core C14 (§108) + cacheKeyForPath (§ cache.mjs).
• Rounds 8–40 (§77–§108) CHƯA COMMIT tại thời điểm ghi — user đã
  commit riêng (HEAD mới hơn 482ec4a 2026.10.04).
```

---

## §109 — Round 41 (R41): G-1 · IPC `tmcut:extractFrame` + 2 consumers

### 109.1 Main process (`electron/tools/tmcut.controller.cjs`)

```ts
tmcut:extractFrame { src, atSec, width? } → TmcutFrameResult
// { ok, path?, cached?, error? } — PNG trong cache/frames/
```

- **`extractFrameAt(filePath, atSec, width)`**:
  - **Giới hạn timestamp** (đúng spec G-1): `atSec` phải finite và
    ≥ 0 (không hợp lệ → `Invalid timestamp`) · khi probe được
    duration → clamp về `[0, duration − 0.05]` (tránh frame cuối
    chưa decode xong) · không probe được → cap `MAX_FRAME_TIME_SEC`
    = 24h.
  - **Cache**: `cache/frames/<key>.png` với key
    `cacheKeyFor(path, mtime, size) + -f<ms>-w<px>` — trùng seek +
    width → `cached: true`, không decode lại. Width clamp
    `[16, 1280]`, mặc định 320.
  - Args: `-ss <at> -i src -map 0:v:0 -frames:v 1 -vf scale=<px>:-2`,
    timeout 30s · `getDirs`/`ensureDirs` thêm `frames` dir.
  - Cache-check TRƯỚC khi probe duration (key dùng requested time,
    clamp chỉ lúc decode → miss mới tốn 1 lần ffprobe).
- **Preload**: thêm `'extractFrame'` vào `tmcut.invoke` list.
- **`types/electron.ts`**: `TmcutFrameResult` interface + method
  `extractFrame({ src, atSec, width? })` trên `TmcutNamespace`.

### 109.2 Consumers

- **`app/composables/useTmcutFrames.ts`** (mới): `available` (computed
  — ẩn control khi không có IPC/web) · `extractFrame(src, atSec,
  width)` → `string | null` (không throw) · `extractFrames(jobs,
  concurrency = 3)` — bounded-concurrency batch, Map<id, path>.
- **AutoCut segment thumbnails** (`pages/tmcut/autocut.vue`, §78.6):
  `loadSegmentThumbs()` chạy sau mỗi analysis — mỗi segment 1 job
  tại `segment.thumb` (finite) fallback midpoint, 224px ·
  `thumbRequest` guard bỏ batch cũ khi re-analysis · template: ảnh
  per-segment thay poster dùng chung, fallback `sourceThumbUrl`
  trong lúc extract / trên web · comment cũ "cần extractFrame IPC"
  cập nhật thành thật (đã có).
- **Snapshot HUD** (`TmcutPreviewPlayer.vue`): nút camera trong HUD
  (sau frame guide, trước fullscreen) — `v-if="canExtractFrames &&
  activeVideoClip"` (không có IPC → ẩn, không render dead control) ·
  extract frame tại `activeVideoClip.mediaCurrentTime`, 1280px ·
  toast success kèm path cache / toast warning khi fail ·
  `snapshotBusy` chống bấm trùng.

### 109.3 Deviation — G-1 tách 2 round

- **R41 làm 2/3 consumer** (IPC + AutoCut thumbs + HUD snapshot).
  Consumer còn lại **"filmstrip timeline thật"** (strip per-clip theo
  range `in..out` thay strip mức asset đang tile — TmcutTimelineClip
  hiện ghép strip của TOÀN asset vào mọi clip, frame không khớp
  range) → **R42**: N frame/clip × số clip + cache management là
  round riêng, dùng `filmstripTimes` (C14). G-1 giữ `[ ]` đến R42.

### 109.4 Verify

```text
• typecheck app 0 · eslint touched (renderer + electron .cjs) 0
• i18n +3 (player.snapshot/snapshotSaved/snapshotFailed) → parity
  2444/2444 · core không đổi (151/151 giữ nguyên)
• Electron main + preload đổi → CẦN FULL RESTART để test
  (autocut: step 3 thumbnail per-segment; editor: nút camera HUD)
```

---

## §110 — Round 42 (R42): G-1 · Filmstrip timeline thật (consumer cuối)

### 110.1 `useTmcutFrames.clipFilmstrip` + global slot pool

- **`clipFilmstrip(src, inSec, outSec, count = 8) → string[]`**:
  - Core C14 `filmstripTimes(secToTicks(in), secToTicks(out − in),
    count)` — 8 timestamp trong range NGUỒN của clip; ticks →
    `ticksToSec` tại call site (v1-seconds bridge) · `in/out` là
    source time nên speed không ảnh hưởng sampling.
  - Session cache `clipStripCache` keyed `(src, in(ms), out(ms))` —
    copy clip / remount (scroll) không extract lại; in-flight map
    dedup các request đồng thời cho cùng range.
  - Job width 160px · slot lỗi trả `''` (giữ vị trí — layer render
    trong suốt, strip asset phía sau hiện ra) · `out ≤ in` → `[]`.
- **Global slot pool** (module-level, `MAX_CONCURRENT_FRAMES = 3`):
  mọi `extractFrames` batch dùng chung 1 pool — trước đây N clip
  mount đồng thời = N batch × 3 worker → N×3 ffmpeg process cùng
  lúc (main process bị bào mòn). Worker `acquireFrameSlot` /
  `releaseFrameSlot` (waiter queue FIFO, release trong `finally`).
- **Deviation ghi nhận**: `extractFrames` trả cache **path** (thông
  tin để toast/copy); hiển thị phải qua `mediaUrl()`/`toURL` —
  **fix R41**: autocut segment thumb trước đó dùng raw path →
  `<img>` không render → wrap `mediaUrl(path)` (§109 consumer 1).

### 110.2 Controller: `probeDurationCached`

- Session map `(path|mtime|size) → duration` — batch frame trước đây
  spawn 1 ffprobe MỖI job (8 job/clip × hàng chục clip = hàng trăm
  process lặp lại cho cùng file). Kết quả ≤ 0 không cache (retry
  được). `extractFrameAt` chuyển sang bản cached.

### 110.3 `TmcutTimelineClip` — render layer

- State `stripFrames: string[]` + `refreshClipStrip()` (request-id
  bỏ kết quả cũ) · **debounce 300ms** (`scheduleClipStrip`) — trim
  drag update `in/out` mỗi mousemove, không debounce sẽ bão job
  extract (mỗi range mới = 8 job mới) · watch `src` (clear ngay) +
  watch `[in, out]` (immediate) · `onUnmounted` clear timer + bump
  request id.
- Template: layer `absolute inset-0 flex pointer-events-none` đặt
  TRƯỚC content body — mỗi frame 1 `<img>` `flex-1 min-w-0
  object-cover` (slot chia đều regardless aspect), `mediaUrl(frame)`
  khi render · `v-if="trackType === 'video' && stripFrames.length > 0"`
  — text/audio clip không bao giờ mount layer.
- **Stacking** (thay đổi 1 chỗ): content body `relative z-[1]` —
  trước đây nó non-positioned nên NẰM DƯỚI MỌI layer positioned
  (waveform đè text — mâu thuẫn comment "behind content"; diamonds
  z-5 và handles z-10 tự nhiên above). Sau khi thêm strip layer
  (positioned, auto-z) thì cần z: strip (auto) < content `z-[1]` <
  diamonds `z-[5]` < handles `z-10` — text nổi trên strip, diamonds
  vẫn thấy, waveform (auto, DOM sau) giờ thật sự BEHIND content
  đúng như comment gốc.
- **Progressive**: strip asset-level (background của root) vẫn giữ —
  loading / slot lỗi / web session đều có hình; per-clip `<img>`
  phủ lên khi xong (cùng range nên nội dung nhất quán, không nháy).

### 110.4 Verify

```text
• typecheck app 0 · eslint touched 0 · parity 2444/2444 (không thêm
  key — R42 thuần visual) · core không đổi 151/151
• G-1 roadmap → [x] (3/3 consumer) · main + preload vẫn là bản R41
  (restart 1 lần cho đủ R41+R42)
```

### 110.5 Roadmap

```text
• G-1 ✅ (3/3). Phase G còn: G-2 (DnD file ngoài), G-3 (folder), G-4.
• Round kế (R43) dự kiến: core C16 hoặc C17 (section 3) — hoặc G-2
  (S) tùy thứ tự ưu tiên roadmap.
• Rounds 8–42 (§77–§110): commit theo xác nhận của user.
```

---

## §111 — Round 43 (R43): G-2 · Media bin drag & drop file ngoài

### 111.1 Electron: `webUtils.getPathForFile`

- **Vấn đề**: Electron 43 (app đang `^43.2.0`) đã bỏ `File.path`
  (deprecated từ 32) → drop từ Explorer không đọc được đường dẫn.
- **Preload**: `require('electron')` thêm `webUtils` · expose
  `electronAPI.getPathForFile(file)` = `webUtils.getPathForFile(file)`
  — pattern contextBridge chính chủ (File là object clone được qua
  bridge) · `types/electron.ts` +`getPathForFile(file: File): string`.

### 111.2 Drop zone — media library `<aside>` (editor.vue)

- Handlers `dragenter / dragover / dragleave / drop` gắn trên cả
  panel (aside `w-80`):
  - `isFileDrag` = `dataTransfer.types.includes('Files')` — DnD
    nội bộ (asset card, MIME `TMCUT_ASSET_MIME`) KHÔNG có `Files`
    → rơi ra ngoài, grid dragstart cũ không bị ảnh hưởng.
  - **Depth counter** cho dragenter/leave (event bubble qua từng
    child — 1 con số nhảy lung tung sẽ tắt highlight giữa chừng) ·
    drop reset cả counter + highlight.
  - Highlight `ring-2 ring-primary/60` khi `dropActive`.
- **Import**:
  - Desktop: `files.map(getPathForFile)` → `importFiles(paths)` —
    đã có `classifyAssetKind` lọc extension bên trong (file `.txt`
    → skip, không probe).
  - Web: `importWebFiles(files)` trực tiếp (File → objectURL).
  - Toast giống luồng picker (`success: n`, `alreadyInLibrary`,
    `analysisFailed`) + **`tmcut.media.dropNoMedia`** (mới) khi
    mọi file bị lọc — thả file không im lặng.
- **Không mở rộng xuống timeline**: drop ngoài trên timeline vẫn
  bị ignore (comment cũ "external file drags are ignored" giữ
  đúng sự thật — thêm import-then-place là round riêng nếu cần).

### 111.3 Roadmap dọn stale

- Tick 3 mục đã làm từ trước nhưng còn `[ ]`: dòng 1.4 (transform
  handles = A3/R18, DnD media→timeline = A4/R17), **D-1** fade
  (R38 — export còn ở R5), **F-1** safe area (R39).

### 111.4 Verify

```text
• typecheck app 0 · eslint touched (editor.vue, types/electron.ts,
  preload.cjs) 0 · i18n +1 (tmcut.media.dropNoMedia) → parity
  2445/2445 · core không đổi 151/151
• preload đổi → CẦN FULL RESTART (kèm R41/R42 — vẫn 1 lần restart)
```

### 111.5 Roadmap

```text
• G-1 ✅ · G-2 ✅. Phase G còn: G-3 (folder, M/P2), G-4 (blocked).
• Round kế (R44) dự kiến: F-2 — Canvas zoom controls (S, P1).
• Rounds 8–43 (§77–§111): commit theo xác nhận của user.
```

---

## §112 — Round 44 (R44): F-2 · Canvas zoom controls

### 112.1 State + monitorBoxStyle

- `canvasZoom: ref<'fit' | number>` · `ZOOM_STEPS = [0.25, 0.5, 0.75,
  1, 1.5, 2]` (menu step list thay cho 2 nút ± rời — giữ HUD gọn;
  mọi mức đều là lõi render thật, không có mức "trang trí").
- `monitorBoxStyle`: fit → `scale = min(availW/w, availH/h)` (cũ
  y); zoomed → `scale = max(0.05, canvasZoom)` — box = canvas ×
  scale. `availH` lấy từ `monitorStageHeight` mới (cùng giá trị
  `max(200, 40vh)` với trước đây → fit pixel-identical).
- `textScale` / transform handles / selection box đều theo
  `containerWidth` (ResizeObserver trên monitorRef) → tự đúng ở
  mọi zoom level, không sửa chỗ nào khác.

### 112.2 Stage wrapper (scroll khi zoom)

- Bọc monitor 1 tầng `<div class="w-full">`:
  - **fit**: không class, không style → cao tự động (layout cũ
    từng pixel — monitor là block child, `m-auto` ngang giữ căn
    giữa như `items-center` cũ).
  - **zoomed**: `overflow-auto` + `height = monitorStageHeight`
    (40vh) — box lớn hơn thì scroll, HUD header và scrub/transport
    nằm NGOÀI stage nên luôn pin.
- **`m-auto` trên monitor** (không dùng flex center): auto margins
  = center khi vừa, về 0 khi tràn → góc trên trái luôn với tới
  (flex `items-center`+overflow cắt mất nửa trên, không scroll
  được — classic clipping bug).
- Ghi chú: stage là block-level nên vertical auto-margin center
  chỉ kích hoạt khi container có height cố định (đúng chế độ
  zoomed); fit mode stage auto-height → margin = 0, không đổi
  layout.

### 112.3 HUD

- Dropdown `i-lucide-zoom-in` (đặt sau overlay toggles, trước
  Frame guide): `Fit` + 6 mức %, check icon theo mức active, primary
  khi ≠ fit · i18n `tmcut.player.zoom` / `zoomFit` +2.

### 112.4 Verify

```text
• typecheck app 0 · eslint TmcutPreviewPlayer 0 (indent do --fix
  sau khi thêm wrapper) · parity 2447/2447 (+2) · core 151/151
• Renderer-only → F5 (không đụng main/preload)
```

### 112.5 Roadmap

```text
• F-2 ✅ (F-1 đã tick ở §111). Phase F còn: F-3 (crop on canvas, M),
  F-4 (proxy, M).
• Round kế (R45) dự kiến: **R5 — Fade → volume expression** (S,
  export honesty: đóng nốt đuôi D-1, giảm amber badge) hoặc C-4 SRT
  (S) — chọn R5 trước.
• Rounds 8–44 (§77–§112): commit theo xác nhận của user.
```

---

## §113 — Round 45 (R45): R5 · Fade → export (volume expression)

### 113.1 `fadeFilter` trong `compiler.ts`

- `import { volumeExpr } from '@tmcut-core'` (lần đầu compiler
  gọi core trực tiếp) + helper:
  `fadeFilter(clip) → `,volume='EXPR':eval=frame`` — trả `''` khi
  `volumeExpr === '1'` (không fade → chuỗi filter **byte-identical**
  với trước, không regression project cũ).
- **`eval=frame` BẮT BUỘC** — phát hiện khi test FFmpeg thật:
  `volume` filter mặc định **`eval=once`** (`-h filter=volume` xác
  nhận) → expression đóng băng ngay lúc init (evaluated tại
  t≈cuối → hằng số 1 → fade hoàn toàn vô hiệu; đo được
  -21.1dB cả 2 đoạn thay vì -91dB silence). Sau khi thêm
  `eval=frame`: silence 1s đầu = **-91.0dB** ✓.
- **Vị trí chuỗi** (4 site, quan trọng = `t` phải là clip-local):
  - Video-track audio (main path + audio-only): sau `asetpts`,
    sau `volume=${vol}` — không có `adelay` → append cuối.
  - BGM (main path + audio-only): chèn **SAU `asetpts`, TRƯỚC
    `adelay`** — `adelay` dịch timestamp sang timeline offset,
    đặt fade sau đó envelope sẽ đọc nhầm t (fade-in trễ bằng
    offset, fade-out vượt duration → sai hoàn toàn).
- `compileAudioOnly` signature: 2 mảng clip +`fade?: { in, out }`.
- Static `volume=` giữ nguyên là filter riêng (hợp đồng core:
  `volumeExpr` chỉ trả envelope) — 2 filter nhân vào nhau.
- Keyframed volume **chưa** vào expression → vẫn **R2** (gap có
  chủ đích, help/export không quảng cáo gì mới — badge amber giữ
  transitions-only).

### 113.2 Verify (FFmpeg thật — `resources/ffmpeg.exe`)

```text
• Test 1 (expression đơn): volume='if(lt(t,1),0,1)':eval=frame →
  0.2–0.5s = -91.0dB, 1.3–1.6s = -21.1dB ✓
• Test 2 (fade in/out 0.5s, clip 2s): đầu -39.9 · giữa -21.1 ·
  cuối -34.5 dB ✓ (ramp tuyến tính khớp gainAt preview)
• Test 3 (chuỗi BGM đúng hình dạng compiler:
  atrim→asetpts→fade:eval=frame→aresample→adelay→volume):
  fade-in -36.2 · normal -21.1 · fade-out -32.5 · sau clip im ✓
• typecheck app 0 · eslint compiler.ts 0 · i18n không đổi
  (parity giữ 2447/2447) · core không đổi 151/151
```

### 113.3 Roadmap

```text
• R5 ✅ — D-1 hoàn tất (đóng đuôi export). Phase I còn: R2, R3, R4,
  R6–R9, R11, R12 (R2/R3/R4 = L tích lũy dần theo architecture).
• Round kế (R46) dự kiến: **C-4 — Import/Export SRT** (S, Phase C):
  core C11 parse/serialize đã có + IPC dialog đã có.
• Rounds 8–45 (§77–§113): commit theo xác nhận của user.
```

---

## §114 — Round 46 (R46): C-4 · Import/Export SRT

### 114.1 UI — dropdown "SRT" trong timeline toolbar

- Vị trí: sau nút "+ Audio" (cùng nhóm add), `UDropdownMenu` 2 item
  (Import SRT… / Export SRT…) — `v-if="isDesktop"`: cả 2 luồng đều
  cần Electron dialog + file IPC → web session KHÔNG render (không
  có dead control).
- i18n +8 key `tmcut.timelineActions.srt*` → parity 2455/2455.

### 114.2 Luồng (core C11 là trung tâm)

- **Import**: `pickFile(filters .srt)` → `readText` → **`parseSrt`**
  (tolerant: CRLF/dot-decimals/junk theo test C11) → rỗng → toast
  `srtEmpty` · mỗi cue → `addClipToTrack('text', { name: slice 24
  ký tự, text, in: 0, out: max(0.1, end−start), offset: max(0,
  start), fontSize 42, color #ffffff })` — **offset = cue.start
  tuyệt đối** (ngữ nghĩa SRT: timeline bắt đầu từ 0), duration
  nằm ở in/out đúng model text clip · name sanitize
  `replace(/\s+/g,' ')`.
- **Export**: text track items → `{ text, start: offset, end:
  offset + (out−in)/speed }` · filter text rỗng + end≤start ·
  sort theo start (serializeSrt của core sort lại là đủ, nhưng
  filter trước để đếm cue thật) · `selectSaveFile(defaultPath
  'subtitles.srt', filters .srt)` → `writeText` · toast kèm path ·
  0 cue → toast `srtNoText`.
- Lỗi chung (đọc/ghi file) → toast `srtFailed` + console (không
  nuốt lỗi).

### 114.3 Verify

```text
• typecheck app 0 · eslint TmcutTimeline 0 · parity 2455/2455 (+8)
• core không đổi — 151/151 + boundaries PASS chạy lại ✓
• Renderer-only (không đụng main/preload) → F5
```

### 114.4 Roadmap

```text
• C-4 ✅. Phase C còn: C-1 (font table, M), C-2 (text style, M),
  C-3 (auto-captions, M), C-5 (text animation — chờ R2).
• Round kế (R47) dự kiến: **D-3 — Noise reduction** (S, Phase D):
  exporter option `afftdn` + checkbox trung thực (hiện khi compiler
  map thật — R45 vừa mở chuỗi audio).
• Rounds 8–46 (§77–§114): commit theo xác nhận của user.
```

---

## §115 — Round 47 (R47): D-3 · Noise reduction (exporter)

### 115.1 Compiler — 1 `afftdn` global, không per-clip

- `CompileOptions` +`denoise?: boolean`.
- **Audio-only path**: sau khi `current` (track concat / amix BGM)
  cố định, trước `if (range)`:
  `chains.push(`${current}afftdn=nr=12[a_denoised]`)`.
- **Video path**: trước "Shared tail", sau mọi concat/amix:
  `if (currentAudioStream && options.denoise)` → `[a_denoised]` —
  **null check = mode gate**: `hasAudio = mode !== 'gif'` nên GIF
  không build audio stream → không có chain mồ côi (GIF export giữ
  nguyên output).
- **Vị trí TRƯỚC range trim** (cả 2 path): ranged export vẫn đưa
  audio đã warm-up vào profile của afftdn (đặt sau atrim thì ~1s
  đầu đoạn xuất bị filter "học" nhiễu trên chính nội dung).
- **1 lần thay vì per-clip**: afftdn profile tính theo signal đầu
  vào — chạy N lần (N clip) chỉ tốn N× CPU, cùng mức giảm nhiễu
  nghe được trên bus đã sum. `nr=12` = mức mạnh vừa phải của
  FFmpeg (test: tone sạch 440Hz qua filter KHÔNG đổi level
  -21.1dB → không phá tín hiệu sạch).
- Chọn `afftdn` (FFT) thay `anlmdn` (nonlinear): nhanh hơn, không
  smear transients.

### 115.2 Export modal — checkbox trung thực

- `denoise` ref (default `false`) → truyền `denoise: denoise.value`
  vào options của `compileTimelineToFfmpeg`.
- Checkbox sau cụm settings theo mode, `v-if="mode !== 'gif'"` —
  **đúng spec "chỉ hiện khi đã map trong compiler"**: video/audio
  map thật, GIF thì không.
- Label + hint 1 span (pattern `watchFolder`), icon `i-lucide-waves`
  — **verify tồn tại** trong
  `node_modules/@iconify-json/lucide/icons.json` trước khi dùng
  (kiểm tra luôn `i-lucide-captions` của R46 ✓).
- **Export-only, trung thực**: browser không chạy được afftdn →
  checkbox chỉ trong export modal, không thêm control ở
  preview/inspector (không có gì hứa hẹn mà không làm được).
- i18n +2 (`export.denoiseLabel`/`denoiseNote`) → 2457/2457.

### 115.3 Verify (FFmpeg thật — `resources/ffmpeg.exe`)

```text
• afftdn standalone: OK, tone sạch -21.1dB (không đổi) ✓
• Chuỗi y hệt compiler output (`aresample,afftdn=nr=12 → atrim
  1..5 → asetpts`): OK, Duration 4.00s ✓
• typecheck app 0 · eslint (compiler + export modal) 0 ·
  parity 2457/2457 (+2) · core không đổi 151/151
• Renderer-only → F5
```

### 115.4 Roadmap

```text
• D-3 ✅. Phase D còn: D-2 (volume keyframes — R2), D-4 (voiceover,
  M), D-5 (TTS — blocked).
• Round kế (R48): rà lại danh sách S-wins còn pending rồi chọn —
  ứng viên: C-4 done → còn E-4 (S), K shortcuts?, phần còn Phase A.
• Rounds 8–47 (§77–§115): commit theo xác nhận của user.
```

---

## §116 — Round 48 (R48): E-4 · LUT (.cube) export

### 116.1 Compiler

- `CompileOptions` +`lut3dPath?: string`.
- Chèn **sau** `currentVideoStream = '[v_concat]'`, **TRƯỚC** vòng
  drawtext + trước outScale:
  `[v_concat]lut3d=file='...'[v_graded]` → `currentVideoStream =
  '[v_graded]'` — grading FOOTAGE trước, title/graphics giữ màu
  authored (tránh bug kinh điển "tiêu đề trắng bị vàng"), LUT chạy
  ở full-res trước khi scale.
- **`lutFileFilter` — 2 tầng parse FFmpeg** (đo đạc, không đoán):
  1. Filtergraph scan (`av_get_token` delim `=,;[]`) tôn trọng
     quote khi SPLIT (chống `,` `;` `[` ` ` cắt chuỗi) rồi **STRIP
     quote khỏi output**.
  2. Option parser level 2 split theo `:` → quote đã biến mất →
     `C:/...` tách ở dấu `:` → `No option name near '/Users/...'`.
  - **Pattern pass**: wrap `'...'` (level-1 split protection) +
    **backslash-escape mọi `:`** (`C\:`) — backslash bên trong
    level-1 quote đi qua literal, level-2 thấy `\:` → escape ✓.
  - Test 4 biến thể với `resources/ffmpeg.exe`: escape-quote `\'`
    (pass), quote+escaped-colon (pass), no-quote (fail), double
    escape (fail). Integration: path gồm **space + comma + colon**
    → OK.
  - Normalization: `\` → `/` trước (Windows FFmpeg nhận `D:/x.cube`,
    thoát hẳn luật escape backslash).
  - **Apostrophe**: không có escape nào sống sót qua 2 tầng
    (`\'` fail -2, triple-backslash fail -2) → `lutFileFilter`
    **throw** Error rõ ràng + picker **toast từ chối** trước khi
    chọn (fail sớm, dễ hiểu, thay vì FFmpeg graph error giữa chừng).

### 116.2 Export modal

- State `lut3dPath` (session ref như mọi option modal) +
  `lut3dName` (basename hiển thị) + `pickLutFile` (`pickFile` filters
  `.cube`).
- Row "LUT màu (.cube)" trong **video template** (encoder cards
  dưới), `v-if="isDesktop"` — web không dialog IPC → ẩn (dead
  control) · button `i-lucide-palette` (verify trong
  `@iconify-json/lucide`) + nút X dọn · note "không preview" —
  **export-only trung thực**: browser không render được 3D LUT tùy
  ý → không thêm preview giả ở inspector/player.
- GIF mode: LUT hợp lệ (grade trước palettegen) — row nằm trong
  video template nên video+GIF ✓, audio ẩn ✓.
- i18n +5 (`lutLabel/Choose/Clear/Note/BadPath`) → 2462/2462.

### 116.3 Verify (FFmpeg thật)

```text
• -filters: lut3d có sẵn trong build ✓
• Exact chain JS-emit (space+comma+colon trong path): OK ✓
• Apostrophe variants: FAIL → guard throw+toast (đã verify) ✓
• typecheck app 0 · eslint (compiler + export modal) 0 ·
  parity 2462/2462 (+5) · core không đổi 151/151 (registry core
  giữ nguyên — enum preset `lut3d` chờ R4, round này đi đường
  file .cube trực tiếp như spec E-4)
• Renderer-only → F5
```

### 116.4 Roadmap

```text
• E-4 ✅. Phase E còn: E-1/E-2/E-3/E-5 (M/L,Effect registry + R4),
  E-6 (blocked).
• Round kế (R49) dự kiến: **K shortcuts audit** — rà K1–K8 so với
  binding thật + help modal (N/R đã thấy trong tip() toolbar →
  nhiều cái có thể đã xong mà chưa tick); thêm keybind cho feature
  thật hoạt động, sửa help modal cùng round.
• Rounds 8–48 (§77–§116): commit theo xác nhận của user.
```

---

## §117 — Round 49 (R49): Phase K — shortcut audit K1–K8

### 117.1 Audit trước khi thêm

Rà `handleGlobalKeydown` (TmcutTimeline) + `handleKeydown`
(TmcutPreviewPlayer) + help modal (17 item: 15 shipped + 2 planned
`badge:'planned'`):

```text
• K1 N magnet      → ĐÃ bound (line ~787) + help item snapMagnet  ✓
• K2 M marker      → ĐÃ bound + help addMarker                    ✓
• K3 Ctrl+G/S+G    → ĐÃ bound + help groupUngroup                 ✓
• K4 Ctrl+L/S+L    → ĐÃ bound + help linkUnlink                   ✓
• K5 Alt+[/]       → ĐÃ bound + help trimKeyboard                 ✓
• K6 Ctrl+=/-      → CHƯA bound (mới có Ctrl+wheel + slider)      → thêm
• K7 Home/End      → CHƯA bound                                    → thêm
• K8 Shift+D fade  → CHƯA bound (feature D-1 đã xong trọn:
                     Inspector + preview gainAt + export R45)     → thêm
• Ngoài ra: Ctrl+K (open/focus help) bound nhưng CHƯA liệt kê
  trong help → bổ sung vào item Help (keys: ?, F1, Ctrl+K).
```

Kết luận: K1–K5 chỉ thiếu tick roadmap (đã làm từ round B4/B5/B7/A6);
round này đóng K6/K7/K8 + trau chuốt help.

### 117.2 K6 — Ctrl+= / Ctrl+- zoom

- `stepZoomKeyboard(direction)` cạnh `onTracksWheel`: cùng ±10 step
  và clamp `15..200` như Ctrl+wheel — **neo tại playhead** (keypress
  không có tọa độ chuột): tính `screenX = playhead*prev − scrollLeft`
  trước khi đổi zoom, set `scrollLeft = playhead*next − screenX`
  trong `nextTick` → playhead đứng yên từng pixel.
- Binding trong nhánh ctrl: `key === '=' || '+' || 'add'` (numpad)
  → in; `'-' || 'subtract'` → out · `preventDefault()` bắt buộc —
  nếu không Chromium sẽ page-zoom cửa sổ (Ctrl+- là browser zoom).
- Nhánh ctrl chạy TRƯỚC guard `shortcutsOpen` → zoom vẫn chạy sau
  modal — nhất quán với Ctrl+wheel vốn cũng không check (view-only,
  không phá state).

### 117.3 K7 — Home / End

- `seek(0)` / `seek(totalDuration)` — `seek` của playback đã clamp
  `[0, totalDuration]` sẵn.
- `scrollPlayheadIntoView()` mới: `seek` chỉ đổi time, không đụng
  scroll — helper cuộn ngang sao cho playhead vào vùng nhìn (margin
  40px, nếu đã visible thì đứng yên, nếu không thì căn giữa).
- Trong nhánh KHÔNG ctrl → bị `shortcutsOpen` guard chặn sau modal
  ✓ (đúng bất biến "editing keys không fire sau modal").

### 117.4 K8 — Shift+D fade (D-1)

- **`toggleFadeSelection()`** trong `useTmcutProject` (module-level,
  pattern `updateClip`): trả `'applied' | 'cleared' | null`.
  - Bật: cả 2 cạnh = `min(0.5s, clip/2)` (clamp đúng bằng slider
    Inspector) · Tắt: nếu MỘT trong 2 cạnh đang có fade → xóa cả 2.
  - `track.type === 'text'` → skip (text không có audio, không phải
    fade target) · sub-frame clip (`ticks<=0`) → return null TRƯỚC
    pushHistory (không tạo entry undo rỗng).
  - Discrete toggle → `pushHistory()` 1 lần (B8) giống Inspector.
- **Hằng số chung** `export const TMCUT_DEFAULT_FADE_SEC = 0.5` —
  Inspector import thay cho `const DEFAULT_FADE_SEC = 0.5` local →
  2 nơi không thể drift.
- Timeline `handleFadeToggle()` + toast trung thực 3 nhánh:
  `fadeApplied` / `fadeCleared` / `fadeNoTarget` (warning khi chưa
  chọn clip hoặc chọn text).
- Binding: nhánh không ctrl, `key === 'd' && e.shiftKey` — `'d'`
  thường không match nhánh nào (Ctrl+D vẫn duplicate ở trên) ✓.

### 117.5 Help modal

- +3 item: `zoomKeys` (editing), `fadeToggle` (editing),
  `jumpStartEnd` (playback) — `implementedCount` tự tăng 15 → 18.
- Item `help` thêm `Ctrl + K` vào keys (đã bound từ trước, nay
  liệt kê) · `desc.help` đổi thành "(F1 hoặc Ctrl+K)".
- i18n +9 (3 label + 3 desc + 3 timelineActions) → 2471/2471 ·
  planned badges (aiSilence/smartMask) giữ nguyên — vẫn "Sắp ra mắt".

### 117.6 Verify

```text
• typecheck app 0 · eslint (timeline, shortcuts modal, inspector,
  useTmcutProject) 0 · parity 2471/2471 (+9) · core không đổi 151/151
• Renderer-only (không đụng main/preload) → F5
```

### 117.7 Roadmap

```text
• Phase K ✅ (Ctrl+scroll từ R13 + K1–K8 round này). Help modal
  luôn đi kèm mọi shortcut mới (trung thực) — giữ nguyên nguyên tắc.
• Round kế (R50): rà S-wins còn lại — ứng viên: J-2 (recently
  opened sort/pin, S), C-1/C-2/C-3 (M), D-4 voiceover (M).
• Rounds 8–49 (§77–§117): commit theo xác nhận của user.
```

---

## §118 — Round 50 (R50): J-2 · Recently opened + Pin project

### 118.1 Audit "đã sort?"

- Home `/tmcut/index` đã có `sortBy` (recent/name/duration) +
  `sortOptions` — mode `recent` sort theo `updated_at||created_at`
  desc, label **"Recently edited"** → **đã sort và trung thực** ✓
  (không đổi gì ở chỗ này).
- Dashboard `/` (`recentProjects` top-4): cùng sort updated desc,
  heading "Recent Projects" generic → truthful ✓ không đụng.
- Thiếu thật sự: sort theo **lần mở cuối** + **pin** → làm nốt.

### 118.2 `persistProjectMetadata` — nguyên tắc no-bump

- `TmcutProject` +`lastOpenedAt?` +`pinned?` (interface, optional —
  project file cũ không có vẫn migrate lặng lẽ).
- Helper chung:
  `persistProjectMetadata(projectId, patch)` — gộp patch vào entry
  `projects` VÀ `currentProject` (nếu trùng id — 2 object khác nhau
  sau `syncProjectIndex` copy), mirror localStorage + `ipc.writeProject`.
- **KHÔNG bump `updated_at`** (khác `saveProject`): nếu pin/mở mà
  update updated_at thì label "Recently edited" nói dối (mở project
  = "edited"). Đây là lý do không gọi `saveProject()` cho việc này.
- Web (không IPC): memory + localStorage → pin vẫn sống qua reload
  (localStorage là fallback đọc của `loadProject` trên web).

### 118.3 loadProject hook — ghi open time

- Cả 2 nhánh thành công (disk / localStorage):
  `syncProjectIndex` → [`detectRecovery`] → `persistProjectMetadata(
  { lastOpenedAt: now })`.
- **SAU `detectRecovery`**: ghi project file TRƯỚC khi quyết định
  recovery sẽ làm mtime project > recovery → `decideRecovery` có thể
  nuốt file phục hồi sau crash. Ghi sau = an toàn tuyệt đối.
- Nhánh `buildDefaultProject` (id không tồn tại) không ghi — chưa
  phải "mở project thật".

### 118.4 Pin + sort UI (`/tmcut/index`)

- `SortKey` +`'opened'` · option "Mở gần đây" sort
  `lastOpenedAt || updated_at || created_at` desc.
- **Pinned-first trong MỌI mode**: mọi comparator thêm
  `rank(a)-rank(b) ||` (pinned = 0, normal = 1) — name/duration/
  opened/recent đều giữ thứ tự nội bộ bên trong từng nhóm.
- Card menu: item "Ghim lên đầu"/"Bỏ ghim" (icon `i-lucide-pin` /
  `i-lucide-pin-off` — **verify tồn tại** trong
  `@iconify-json/lucide`) ngay sau Open → `togglePinProject`.
- Badge: grid card góc trên phải thumbnail · list row sau icon phim
  — `i-lucide-pin` màu primary + `title` (i18n `pinnedTitle`).
- `togglePinProject` trả `boolean|null` (state mới) — lần này toast
  không cần: menu label đã đổi ngay (Unpin ↔ Pin) + badge hiện/ẩn
  = feedback đủ rõ.

### 118.5 Verify

```text
• typecheck app 0 · eslint (useTmcutProject, tmcut/index) 0 ·
  parity 2475/2475 (+4: sortOpened/menuPin/menuUnpin/pinnedTitle)
• core không đổi 151/151 · icons pin/pin-off verified trước khi dùng
• Renderer-only → F5
```

### 118.6 Roadmap

```text
• J-2 ✅. Phase J còn: J-1 (template engine, M), J-3 (bỏ — không
  backend, giữ §77).
• Round kế (R51): S-wins còn lại — nếu hết S thì vào M: C-1 (font
  table) / C-2 (text style) / D-4 (voiceover).
• Rounds 8–50 (§77–§118): commit theo xác nhận của user.
```

---

## §119 — Round 51 (R51): R8 · Social presets (export)

### 119.1 "Preset có thật của pipeline" nghĩa là gì

- Output resolution của compiler = **canvas × `outScale`**
  (`scale=trunc(iw*s/2)*2:trunc(ih*s/2)*2`) — **scale, không bao giờ
  reframe/pad**. Modal chỉ offer `scaleOptions [0.5, 1, 1.5, 2]`
  nhưng compiler nhận float bất kỳ → preset được phép set scale
  ngoài các step đó.
- Vì thế một preset "mạng xã hội" **chỉ được chọn khi canvas khớp
  aspect** — sai aspect mà vẫn bấm = video bị kéo méo/letterbox
  ngầm → violates honesty rule.

### 119.2 Implement (export modal, video mode)

- 3 chip: `TikTok · Reels · Shorts` 1080×1920 · `YouTube 1080p`
  1920×1080 · `Instagram 1:1` 1080×1080 — @30fps (30 ∈ `fpsOptions`
  [24,25,30,50,60] ✓ preset không offer fps ngoài pipeline).
- **`presetFit` exact** (không dung sai): `scaledSize(targetW /
  canvasW)` phải ra ĐÚNG `targetW×targetH`.
  - Lý do bỏ ±2px: output luôn **chẵn** → chênh với target chẵn
    luôn là số chẵn (0, 2, 4…) — "1080×1918 nhưng label 1080×1920"
    là nói dối 2px. Test 9 case: 720p/1080p/4K/iPhone 750×1334 →
    FIT; sai aspect → không; canvas 1080×**1919** → out 1918 →
    disabled (đúng: không có scale nào ra 1920 với width này).
- Click → `outScale = targetW/canvasW` + `fps = 30` — nhưng nếu
  `30 === canvasFps` thì để `fps = 0` (follow canvas) để selector
  giữ label trung thực "30 fps (canvas)".
- `presetActive` chip sáng khi scale+fps đang khớp → feedback.
- Chip disabled: `cursor-not-allowed` + title =
  `"{tên} — Cần canvas {ratio} — đặt trong trình chỉnh sửa"` (không
  có lý do ẩn, không có control chết).
- Không thêm IPC/mode nào — чисто renderer → F5.

### 119.3 Verify

```text
• typecheck app 0 · eslint export modal 0 · parity 2480/2480 (+5:
  presetsLabel/presetVertical/presetYoutube/presetSquare/
  presetNeedsCanvas) · core không đổi 151/151
• Preset math test (node, đúng công thức compiler): 9/9 case đúng
  dự kiến (7 FIT chuẩn, 2 disabled vì sai aspect/lẻ)
```

### 119.4 Roadmap

```text
• R8 ✅. Export còn: R6 (full form design #3, M), R7 (queue, M),
  R9 (refactor graph, L), R2–R4 (keyframe/volume/eq — chờ core
  R2), R11 (opacity export), R12 (text rotation export).
• Round kế (R52): hết S-wins → vào M theo thứ tự: C-1 (font table)
  / C-2 (text style) / D-4 (voiceover).
• Rounds 8–51 (§77–§119): commit theo xác nhận của user.
```
---

## §120 — Round 52 (R52): C-1 · Bảng font thật (app + core bridge fix)

### 120.1 Bối cảnh round trong

- C-1 app đã code & commit ở 30ff072 (không kèm log) — round này audit
  lại phần merge 66508df (conflict markers bị commit vào history) + chốt
  nốt lỗ hổng core.
- Working copy resolve conflict: giữ CẢ `textOverlayFilter` (C-1, HEAD)
  LẪN `lutFileFilter` (R48, incoming) — gộp chung helper `filterPathArg`
  (apostrophe reject + `:` → `\:` escape — 2 tầng parse FFmpeg) → 2
  filter không còn duplicate logic escape.
- `TmcutInspector.vue` bị IDE formatter reformat (gộp attributes 1 dòng)
  → 156 lỗi eslint → `--fix` → 0. Không bật format-on-save khác cấu
  trúc repo.

### 120.2 Pipeline font (app)

```text
resources/fontmanager.node (font-scanner, Node-API ABI-stable, đã bundle)
  → controller listSystemFonts() — lazy require, fail → [] (không throw)
  → preload 'listFonts' (allow-list invoke)
  → types/electron.ts TmcutFontEntry { family, path, style, weight, italic, monospace }
  → useTmcutFonts.ts — session single-flight (facesPromise ??=), pickFamilies:
    1 face/family, faceRank: Regular(0) < non-400(+1) < non-Regular(+2) < italic(+4)
  → Inspector USelectMenu (v-if fontChoices.length — web không IPC → ẩn,
    không dead control) · searchable
  → handleFontUpdate: guard null/'null', lookup fail → no-op,
    pushHistoryCoalesced(`${id}:font`) + updateClip({ fontFamily, fontFile })
    — CẶP đi cùng nhau, 1 entry undo → preview/export không thể lệch face
  → compiler textOverlayFilter: fontfile='filterPathArg(clip.fontFile)'
```

- Model: `TmcutTimelineItem.fontFamily?/fontFile?` (interface optional —
  project cũ không có vẫn mở được, migrate lặng lẽ).

### 120.3 Core fix — v1compat passthrough (phát hiện khi audit round-trip)

- **Bug**: `v1ClipToV3` KHÔNG mang `fontFamily`/`fontFile` sang v3 →
  `splitClip`/`duplicateClips`/`pasteClips` clone v3 clip verbatim
  (`JSON.parse(JSON.stringify)`) nhưng v3 clip không có field → nửa thứ
  hai sau split + các bản paste/duplicate mất font **im lặng**
  (`v3ClipToV1` cũng không emit → v1 item mới ra mặc định).
- Item hiện hữu sống sót chỉ nhờ `Object.assign` không ghi đè key vắng
  mặt trong patch — item MỚI hoàn toàn dựa vào passthrough → bug thật.
- **Fix** (đúng 5 thành phần contribution rules, roadmap §2):
  - `types/dsl.ts`: `TmcutTimelineClip` +`fontFamily?` +`fontFile?`
    (comment C-1); `src/index.d.ts` chỉ re-export → không sửa.
  - `src/v1compat.mjs`: passthrough cả 2 chiều (`v1ClipToV3`/`v3ClipToV1`)
    + `COMPARE_STRINGS` +`fontFamily`,`fontFile` (font-only edit sync
    về được; clone giữ face).
  - `test/v1compat.test.mjs` +3 tests: round-trip 2 chiều · split +
    duplicate → `syncV3Result` cả 3 item giữ font (stats added 2 /
    updated 1 — nửa đầu bị split cắt nên updated=1) · font-only change
    detect + sync-back. → core 154/154.

### 120.4 Verify

```text
• Core: test 154/154 (+3) · check-boundaries PASS · typecheck:core 0 ·
  eslint 3 file round này = 0 (13 lỗi pre-existing ở caption.mjs/effects.mjs/
  index.d.ts — có từ HEAD, không phải round này; không đụng tới)
• App: typecheck 0 · parity 2533/2533 · eslint 5 file tmcut = 0 (sau --fix)
• preload.cjs đổi trong working copy (allow-list listFonts) → FULL
  RESTART Electron (không phải F5)
```

### 120.5 Roadmap

```text
• C-1 ✅. Phase C còn: C-2 (text style), C-3 (auto-captions), C-5
  (text animation — chờ core C3 + render R2).
• Bảng shortcut master mục 5 cập nhật: K1–K8 chuyển sang bảng "Đã
  implement" (trùng help modal, §117) — mục "Dự kiến thêm" chỉ còn
  Alt+A/Alt+T AI.
• Round kế (R53): theo thứ tự roadmap — C-2 (text style: bold/italic/
  align/shadow/stroke, preview CSS + drawtext borderw/shadowx) · M.
• Rounds 8–52 (§77–§120): commit theo xác nhận của user.
```
---

## §121 — Round 53 (R53): C-2 · Text style (bold/italic/align/shadow/stroke)

### 121.1 Audit trước khi làm — 2 "lời nói dối" preview lộ ra

- Overlay text trong `TmcutPreviewPlayer` có **`font-bold` + `drop-shadow-md`
  hardcode** trong class → preview LUÔN bold + có bóng, trong khi export
  vẽ regular, không bóng. C-2 biến chúng thành flags thật.
- **Anchor lệch**: preview đặt top-left block tại (x, y)
  (`absolute left-0 top-0` + translate) trong khi export luôn
  `x=(w-text_w)/2+xOffset, y=(h-text_h)/2+yOffset` (center + offset) —
  clip (0,0) lệch nhau thấy rõ. Round này unify theo **export** (nguồn
  sự thật): preview đặt EDGE trái/giữa/phải theo `align` tại
  `left:0/50%/100%`, luôn `top:50%` + `translateY(-50%)` →
  WYSIWYW. Dự kiến di chuyển vị trí preview của clip cũ về đúng nơi
  export thật sự đặt (fix, không phải regression).
- `{{ textClip.text }}` collapse `\n` (không có `whitespace-pre-line`)
  trong khi drawtext xuống dòng thật → thêm `whitespace-pre-line`
  (C-11 caption nhiều dòng cũng lợi).

### 121.2 Model & bridge (core)

- `TmcutTimelineItem` +`bold? italic? align? shadow? stroke?` ·
  `TmcutTimelineClip` (core `types/dsl.ts`) tương ứng.
- `v1compat`: passthrough 5 field cả 2 chiều · `COMPARE_STRINGS`
  +`align` · **`COMPARE_FLAGS` mới** `['bold','italic','shadow','stroke']`
  so `(item??false)===(patch??false)` — file project cũ thiếu key không
  bị rewrite hàng loạt khi mở · +2 tests → core **156/156**.

### 121.3 Font face thật cho bold/italic (export truth)

- drawtext **không có faux bold** (rasterize 1 file) → `useTmcutFonts`
  giờ giữ **face matrix 4 quadrant/family** (regular/bold/italic/
  boldItalic — `pickFace` closest-weight-to-400/700, Regular style
  break tie) · `faceFileFor(choice, bold, italic)` fallback
  boldItalic→bold→italic→regular · `resolveFace(bold, italic, family?)`
  — family đang dùng thắng, không thì 'Segoe UI' → family đầu có
  quadrant · web không IPC → `null` (chỉ preview CSS, web không export).
- `handleFontUpdate` (C-1) giờ resolve theo flags **hiện tại** ·
  `handleStyleToggle('bold'|'italic')` ghi `fontFamily+fontFile` trong
  CÙNG 1 patch (1 entry undo, B8 `pushHistory()` discrete).
- UI Inspector: row icons `bold`/`italic` (soft/ghost toggle) ·
  segmented `align-left/center/right` (mặc định center = legacy) ·
  `moon` shadow · `blend` stroke (tất cả verify trong lucide icons.json).

### 121.4 Compiler + metrics dùng chung

- `app/utils/tmcut/textStyle.ts` (mới): `textStrokeWidth(fs)=max(1,
  round(fs/18))` · `textShadowOffset(fs)=max(1, round(fs/14))` —
  preview VÀ import chung (bài học C0: không 2 bản đồng tay).
- `textOverlayFilter`: `x` theo align — `0+(x)` /
  `(w-text_w)/2+(x)` (byte-identical legacy) / `w-text_w-(x)` ·
  shadow `shadowx/shadowy/shadowcolor=black` + stroke
  `borderw/bordercolor=black` append **SAU** options cũ → flag tắt =
  chuỗi y hệt trước · bold/italic KHÔNG vào string (fontFile đã trỏ
  face đúng ở Inspector).
- Preview CSS tương ứng: `fontWeight:700`, `fontStyle:italic`,
  `text-shadow` 0-blur (khớp drawtext), `-webkit-text-stroke` +
  `paintOrder:'stroke fill'`; shadow/stroke color cố định **black**
  (chọn không picker — phạm vi trung thực, biết trước).

### 121.5 Verify

```text
• Core: 156/156 (+2) · boundaries PASS · typecheck:core 0 · eslint 3 file core = 0
• App: typecheck 0 · eslint 6 file chạm = 0 (--fix multiline-ternary;
  thêm explicit import textStyle.ts — repo không auto-import subdirectory)
• parity 2540/2540 (+7: bold/italic/alignLeft/alignCenter/alignRight/shadow/stroke)
• FFmpeg thật (bundled): arialbd + left-align + shadow + border → exit 0 ·
  ariali + right-align (x=w-text_w-(10)) → exit 0
• Renderer-only (không đụng main/preload) → F5 (R52 preload vẫn chờ full restart 1 lần)
```

### 121.6 Giới hạn đã biết (trung thực)

- Family hiếm thiếu bold/italic face → `faceFileFor` fallback về face
  gần nhất trong CÙNG family; preview browser có thể vẫn hiển thị
  synthesized bold/italic — export vẽ face thật fallback. (Windows
  family hầu như luôn đủ 4 quadrant.)
- Shadow/stroke color cố định black — không picker (scope tối thiểu);
  thêm màu riêng là round sau nếu bạn muốn.
- Rotation của text vẫn preview-only (chờ R12) — A8 chỉ expose slider
  video, giữ nguyên.

### 121.7 Roadmap

```text
• C-2 ✅. Phase C còn: C-3 (auto-captions — Whisper đã có), C-5
  (text animation — chờ C3+R2).
• Round kế (R54): C-3 (auto-captions, M) theo thứ tự.
• Rounds 8–53 (§77–§121): commit theo xác nhận của user.
```
---

## §122 — Round 54 (R54): C-3 · Auto-captions (Whisper → text clips)

### 122.1 Pipeline

```text
Button "Phụ đề AI" (timeline toolbar, sau dropdown SRT, v-if isDesktop)
  → clip video dưới playhead (track không hidden, offset ≤ playhead < end)
    · không có → toast captionNoClip (warning)
  → IPC tmcut:extractAudio { filePath } — MAIN process:
    extractCaptionAudio(): getFileStat → cacheKeyFor →
    cache/caption-<key>.mp3 (runFfmpeg -vn -ac 1 -ar 16000 -b:a 48k,
    timeout 120s) · file đã có → skip extraction (reuse, keyed như thumbs)
  → useTmcutAi().transcribe(audioPath, { format: 'verbose_json' })
    → data.segments [{ start, end, text }] (GIÂY — Whisper native)
  → cues (trim, drop rỗng) → core cuesToCaptionClips(cues, {
      fromTicks: clip.offset ticks, rangeTicks: [clip start, clip end] })
    → split maxChars 42 / maxDur 7s, clamp trong range clip
    → addClipToTrack('text') per caption
      (ticksToSec tại v1 boundary — chuẩn bridge)
  → toast captionCreated { n } · lỗi → toast captionFailed + message
```

- Busy guard `captionBusy` (loading+disabled trên button) — không re-entry
  khi Whisper đang chạy (RPM limit của gateway).
- Clip dưới playhead = clip đang hiện trên preview → phụ đề luôn khớp
  thứ người dùng thấy · `rangeTicks` chặn cue rò sang clip khác.

### 122.2 Files

- `electron/tools/tmcut.controller.cjs`: `extractCaptionAudio()` + IPC
  `tmcut:extractAudio` (validate path giống extractFrame).
- `electron/preload.cjs`: allow-list +'extractAudio'.
- `types/electron.ts`: `extractAudio()` — `{ ok, path?, error? }`.
- `TmcutTimeline.vue`: `handleAutoCaptions()` + button `i-lucide-sparkles`
  (verified) + imports `cuesToCaptionClips/secToTicks/ticksToSec`.
- i18n +6 → 2546/2546 (captionCreate/captionShort/captionNoClip/
  captionEmpty/captionCreated/captionFailed).

### 122.3 Verify

```text
• typecheck app 0 · eslint (timeline, controller, preload, types) 0 ·
  node --check controller+preload OK · parity 2546/2546
• FFmpeg thật: testsrc+sine 3s mp4 → -vn 16kHz mono 48k mp3
  (18KB, duration 3.03s) exit 0 — đúng lệnh controller emit
• Core không đổi (caption.mjs C11 từ R37) — 156/156 giữ nguyên
• Whisper thật CHƯA test được: cần API key gateway (Groq) trên máy user
• Main + preload đổi → FULL RESTART (cộng dồn lệnh R52 preload)
```

### 122.4 Roadmap

```text
• C-3 ✅. Phase C còn: C-5 (text animation — chờ core C3 + render R2).
• Round kế (R55): theo roadmap — S-wins còn lại nếu có, không thì M:
  D-4 (voiceover) / C-5 blocked → xem §121.7.
• Rounds 8–54 (§77–§122): commit theo xác nhận của user.
```
---

## §123 — Round 55 (R55): D-4 · Ghi voiceover (media bin)

### 123.1 Pipeline

```text
Mic button (media bin header, cạnh Import — cả web lẫn desktop):
  → start(): navigator.mediaDevices.getUserMedia({ audio: true })
    · MediaRecorder mime: 'audio/webm;codecs=opus' → 'audio/webm' →
      'audio/mp4' (isTypeSupported chain — Chromium luôn có webm/opus)
    · recorder.start(250) — slice 250ms, crash mất tối đa 250ms
    · timer 250ms cập nhật elapsedSec → button đỏ hiện mm:ss
  → stop(): blob → releases mic TƯƠNG ỨNG (indicator tắt ngay)
    · take < 0.5s → discarded TRƯỚC khi ghi file (không junk)
    · Desktop: Uint8Array → IPC tmcut:saveRecording →
      <userData>/tmcut/recordings/voiceover-<ts>.<ext>
      → importFiles([path]) — reuse nguyên pipeline analysis/
      waveform/registry
    · Web: new File([blob], voiceover-<ts>.<ext>) → importWebFiles
      — session-only (blob: URL, cùng rule G-2)
  → toast: added / discarded / denied / failed (4 nhánh trung thực)
  · onUnmounted: stop recorder + releaseMic — rời editor giữa chừng
    không để mic nóng
```

- `useTmcutRecorder` (composable mới): state `recording/saving/
  elapsedSec` + `start()/stop()` trả `{ seconds, added, failed,
  discarded }`.
- Controller: `getDirs()` +`recordings` (ensureDirs kèm) ·
  `saveRecording` IPC — validate Uint8Array/ArrayBuffer, ext whitelist
  `/^[a-z0-9]{1,8}$/i`, writeFileSync, lỗi trả `{ ok:false, error }`.
- Preload allow-list +'saveRecording' · `types/electron.ts` +
  `saveRecording()`.
- Icon `i-lucide-mic` + `i-lucide-square-stop` (verify trong lucide).

### 123.2 Verify

```text
• typecheck app 0 · eslint (recorder, editor, controller, preload, types) 0
  (1 fix: bỏ import type TmcutAsset không dùng) · node --check controller
  +preload OK · parity 2552/2552 (+6 voiceover*)
• FFmpeg thật: libopus encode webm OK + ffprobe đọc duration 2.008s —
  output MediaRecorder (webm/opus) được pipeline phân tích/export đọc
  trọn vẹn · mic THẬT chờ user test (cần hardware)
• Core không đổi
• Main + preload đổi → FULL RESTART (cộng dồn R52 + R54)
```

### 123.3 Roadmap

```text
• D-4 ✅. Phase D còn: D-2 (volume keyframes — cần R2), D-5 (TTS —
  blocked: gateway chưa có endpoint speech).
• Round kế (R56): ứng viên theo thứ tự — R2 (keyframes → FFmpeg
  expression, L — mở khóa D-2 + C-5) hoặc S-wins còn lại trong
  Phases E–G. Chọn khi vào round.
• Rounds 8–55 (§77–§123): commit theo xác nhận của user.
```
---

## §124 — Round 56 (R56): R11 · Opacity → export

### 124.1 Nguyên tắc

- Preview + Inspector + canvas handles đã ghi `opacity` từ lâu (R10
  ghi chú "preview-only → thêm R11") — round này export CATCH-UP, không
  đổi model (v1 `opacity` 0–100; v3 `transform.opacity` 0–1 đã bridge
  từ đầu).
- **100% = chuỗi byte-identical** (nguyên tắc mọi round R5): mọi nhánh
  mới chỉ kích hoạt khi `opacity < 100`.

### 124.2 Video — fade against canvas background

- `colorchannelmixer=aa=` + `format=rgba` trên fg, composite trên nền
  `bgColor` — hai nhánh:
  - **Có transform** (R10): cặp bg+overlay đã sẵn — fg chain thêm
    `,format=rgba,colorchannelmixer=aa={o}` sau `transform.tail` là xong.
  - **Không transform + faded**: build inline ĐÚNG shape đã verify từ
    §87.2: `color=c={bg}:s=WxH:r={fps}:d={clipDuration+2}` +
    `overlay=shortest=1` (+2s headroom hấp thụ trim quantization).
- `opacityAlpha()` helper: `String(Number((o/100).toFixed(4)))` — không
  float noise (11/100 → "0.11").
- GIF mode: chain video giống hệt (trước palettegen) ✓ · audio-only:
  không có video bus → không ảnh hưởng · keyframed opacity vẫn
  preview-only chờ **R2** (cùng hợp đồng với keyframed volume).

### 124.3 Text — drawtext color-spec @alpha

- `fontcolor={color}@{o}` (color spec FFmpeg hỗ trợ sẵn
  `white@0.5`, `#ff0000@0.5`) — SHADOW + BORDER cùng nhận suffix
  (preview opacity là element-wide; stroke/border không fade theo sẽ
  lệch) → `shadowcolor=black@{o}` / `bordercolor=black@{o}`.

### 124.4 Verify — FFmpeg thật, kiểm chứng cả BLEND MATH

```text
• T1 fade video (white fg aa=0.5 → nền red, chuỗi y hệt compiler emit):
  exit 0 · pixel center = fd807f ≈ blend(0.5) của (ff0000,ffffff)
  = (ff8080) — lệch 2/255 do yuv420p round-trip → aa HOẠT ĐỘNG đúng
• T2 text fontcolor=white@0.5 trên nền red: exit 0 · pixel = fe7e7e ✓
• T3 shape có transform (scale tail + aa + overlay x/y): exit 0
• typecheck app 0 · eslint compiler.ts 0 · parity 2552/2552 (không đổi
  i18n — không có UI mới) · core không đổi (transform.opacity bridge
  sẵn) → 156/156 giữ nguyên
• Renderer-only → F5
```

### 124.5 Roadmap

```text
• R11 ✅. Export còn: R2 (keyframes expr, L — mở khóa D-2/C-5), R3
  (xfade, L), R4 (effects graph, L — mở khóa E-1/E-2/E-3), R6 (export
  form design #3, M), R7 (queue, M), R9 (refactor render/, L), R12
  (text rotation, M).
• Round kế (R57): ứng viên — R12 (text rotation → export, M; preview
  đã xoay, cần render text ra ảnh + rotate/overlay) hoặc R6 (export
  form đầy đủ, M). Chọn khi vào round.
• Rounds 8–56 (§77–§124): commit theo xác nhận của user.
```
---

## §125 — Round 57 (R57): R12 · Text rotation → export (A8 unlock)

### 125.1 Bài toán

- drawtext **không có góc quay** — preview đã xoay từ đầu (transform
  `rotate()` quanh tâm khối chữ, transform-origin 50% 50%). Export phải
  mô phỏng đúng semantics đó.
- A8 (R22) ngày đó chỉ expose slider rotation cho **video** vì item
  này còn treo — round này mở cho text.

### 125.2 Pipeline (`textOverlayChains` trong compiler.ts)

```text
rotation = 0 → 1 chuỗi drawtext cũ (byte-identical, mọi option C-1/C-2/R11)
rotation ≠ 0 →
  color=c=black@0.0:s=WxH:r=fps:d=tEnd+1,format=rgba,drawtext=[...][v_txtl]
  [v_txtl]rotate=a=rad:fillcolor=none[v_txtr]
  [bus][v_txtr]overlay=x=T_x:y=T_y[v_txt]
  với T = d − R(d), d = (xOffset, yOffset)
```

- **Vì sao T = d − R(d)**: `rotate` quay layer quanh TÂM CANVAS, trong
  khi preview quay quanh TÂM KHỐI CHỮ (đang ở canvas-center + offset).
  Hai phép quay cùng góc khác nhau đúng bằng một dịch chuyển — dịch
  chính xác là T, hằng số tính sẵn bằng JS (không phụ thuộc frame).
- **Chiều góc — đo, không đoán** (FFmpeg thật, box 8×8 tại TL):
  `rotate=PI/2` đẩy box sang **TR** → góc dương = **CW = cùng CSS** ·
  map toạ độ ảnh (y xuống): (dx,dy) → (dx·cos − dy·sin, dx·sin + dy·cos).
  Test cuối: glyph 'I' + Xoff=8 + xoay 90° + overlay T=(8,−8) → bar
  nằm x 23..56, y 30..33 — center đúng P(40, 32) từng pixel.
- **`fillcolor=none`** giữ góc trong suốt · layer trong suốt trước
  `tStart` (drawtext `enable`) → overlay vô hại · KHÔNG dùng
  `shortest=1` (sẽ cắt output theo layer).
- Ghi nhận phụ: `drawbox` KHÔNG ghi alpha trên rgba (test A: 0 pixel
  opaque) — chuỗi dùng drawtext (đã honor alpha từ R11) nên không vướng.

### 125.3 Ràng buộc trung thực — align center ONLY

- Anchor left/right cần `text_w` — số đo không crosses được ranh giới
  filtergraph (drawtext biết text_w bên trong, không export ra ngoài).
  Dự đoán approximate = nói dối → **throw loud** tại compiler:
  align≠center + rotation≠0 → `Error(...)`.
- Export modal pre-check TRƯỚC khi compile → toast i18n
  `rotationConflict` (+Desc) — pattern R48 (UI guard i18n + compiler
  throw làm backstop).

### 125.4 Verify

```text
• FFmpeg thật: 3 test hình học (hướng CW xác định bằng pixel scan ·
  alpha qua rotate (drawbox là thủ phạm, drawtext OK) · counter-translate
  đúng từng pixel) — exit 0 cả 3
• typecheck app 0 (rerun sau eslint --fix) · eslint 3 file = 0 ·
  parity 2554/2554 (+2) · core không đổi 156/156
• Renderer-only → F5
```

### 125.5 Roadmap

```text
• R12 ✅ + A8 hoàn toàn mở (text có slider rotation). Export Phase I
  còn: R2 (keyframes expr, L), R3 (xfade, L), R4 (effects graph, L),
  R6 (export form, M), R7 (queue, M), R9 (refactor, L).
• Round kế (R58): ứng viên — R6 (export form design #3, M) hoặc R2
  (L, mở khóa D-2 + C-5). Chọn khi vào round.
• Rounds 8–57 (§77–§125): commit theo xác nhận của user.
```

---

## §126 — Round 58 (R58): R6 · Export form đầy đủ theo design #3

### 126.1 Mục tiêu & Phạm vi

- Triển khai toàn diện modal xuất video TmcutExportModal.vue theo đúng mockup private/tmcut/3 (DESIGN.md, code.html, screen.png).
- Tách bạch tên tệp (fileName) và thư mục đích (dirName) với nút duyệt thư mục thật qua pickFolder (useFileSystem / tools:dialog).
- Lựa chọn Định dạng & Codec video đầy đủ:
  - mp4-h264: MP4 (H.264 / AVC - Tương thích tối đa).
  - mp4-h265: MP4 (H.265 / HEVC - Nén cao, 4K sắc nét).
  - mov-prores: MOV (Apple ProRes 422 HQ).
  - webm-vp9: WEBM (VP9 Web Engine).
- Điều khiển Bitrate (VBR):
  - Tiêu chuẩn (22 Mbps).
  - Khuyến nghị (32 Mbps).
  - Chất lượng cao (45 Mbps).
  - Tuỳ chỉnh (Custom Mbps).
- Tăng tốc phần cứng GPU Hardware Acceleration Engine (§10, §13):
  - Toggle bật/tắt tăng tốc phần cứng.
  - Bảng 4 hồ sơ Render Engine (NVIDIA NVENC, Intel QSV, AMD AMF, CPU Software Engine).
  - Probing phần cứng thật (detectGpuSupport) với dry-run execution trong electron/tools/ffmpeg.controller.cjs tránh crash trên driver GPU cũ (ví dụ Kepler NVENC API 11.1 < 13.1).
  - Trạng thái trung thực (Active / Ready / Unavailable), không nút chết.
- Tự động mở xem trước qua giao thức media:// (autoPreview) ngay khi render hoàn tất.
- Theo dõi thư mục xuất Watch Folder (media://watch-sync) qua Electron IPC.

### 126.2 Pipeline & Compiler (compiler.ts)

- Hỗ trợ rate control -b:v ${bitrate}M hoặc fallback CRF/CQ theo từng encoder (libx264, libx265, h264_nvenc, hevc_nvenc, h264_qsv, hevc_qsv, h264_amf, prores_ks, libvpx-vp9).
- Tự động map codec âm thanh thích hợp: libopus 128k cho .webm, aac 192k cho .mp4/.mov.
- Tính toán dung lượng ước tính chính xác theo bitrate và thời lượng render thực tế.

### 126.3 Verify

```text
• typecheck app 0 · eslint TmcutExportModal.vue = 0
• i18n parity 2573/2573 (+18 keys) · 0 duplicate keys
• detectGpuSupport probe dry-run exit 0, cache memory hợp lệ
• Renderer-only → F5
```

### 126.4 Roadmap

```text
• R6 ✅ (Export form design #3 hoàn tất).
• Export Phase I còn: R2 (keyframes expr, L), R3 (xfade, L), R4 (effects graph, L), R7 (queue, M), R9 (refactor render/, L).
• Round kế (R59): ứng viên — R2 (keyframes expr, L) hoặc các round AutoCut (design #4) / Home (design #1).
```

## §127 — Round 59 (R59): R3 · Transitions render qua xfade + acrossfade

### 127.1 Bối cảnh & Yêu cầu

- **Vấn đề**: Trước R59, compiler chỉ hỗ trợ hard-cut concat (`concat=n=...`). Khi người dùng thêm chuyển cảnh (Transitions: fade, dissolve, wipe, slide, zoom) trên timeline, modal xuất cảnh báo `transitionsWarning` và fallback sang concat phẳng, làm mất hiệu ứng chuyển cảnh trong video xuất ra.
- **Mục tiêu**:
  - Hỗ trợ đầy đủ 6 loại chuyển cảnh trong `KNOWN_TRANSITIONS` (`fade`, `dissolve`, `wipe-left` → `wipeleft`, `wipe-right` → `wiperight`, `slide-left` → `slideleft`, `zoom-in` → `zoomin`).
  - Video render qua filter `xfade` của FFmpeg.
  - Audio tương ứng render qua filter `acrossfade` (đường cong tam giác `c1=tri:c2=tri`).
  - Hỗ trợ cả chế độ xuất thông thường (video + audio) lẫn audio-only (`compileAudioOnly`).
  - Nhận diện chính xác cặp clip có transition hợp lệ và liền nhau (`Math.abs(prevEnd - (currOffset + transSec)) < 0.05`). Cặp clip không có transition hoặc hở thời gian vẫn fallback an toàn sang hard cut `concat`.
  - Thay thế cảnh báo hạn chế trong `TmcutExportModal.vue` bằng huy hiệu xác nhận tính năng đã hoạt động trung thực (`i-lucide-sparkles`).

### 127.2 Kiến trúc Filtergraph & Timebase Normalization

1. **Mapping Transition**:
   - `fade` → `fade`
   - `dissolve` → `dissolve`
   - `wipe-left` → `wipeleft`
   - `wipe-right` → `wiperight`
   - `slide-left` → `slideleft`
   - `zoom-in` → `zoomin`
   - Fallback an toàn: `fade`.

2. **Khắc phục lỗi Timebase Mismatch trong FFmpeg**:
   - Khi kết nối ngõ ra của chuỗi filter hoặc concat vào `xfade`, FFmpeg thường báo lỗi:
     `First input link main timebase (1/1000000) do not match the corresponding second input link xfade timebase (1/fps)`.
   - **Giải pháp**: Chuẩn hóa timebase bằng cách thêm `settb=1/${fps},fps=${fps}` cho cả input lẫn ngõ ra trung gian của mỗi bước chuyển cảnh:
     `[v_in0][v_in1]xfade=transition=${trans}:duration=${dur}:offset=${offset},settb=1/${fps},fps=${fps}[v_chain1]`.

3. **Tính toán Cumulative Offset**:
   - Trong chuỗi xfade tuần tự, offset phải tính theo thời lượng thực tế của luồng trước đó:
     `offset = runningDuration - transSec`
   - Cập nhật thời lượng luồng sau mỗi mắt xích:
     - Có transition: `runningDuration += currDur - transSec`
     - Không có transition: `runningDuration += currDur`

### 127.3 Verify & Quality Gate

```text
• typecheck app 0 errors · eslint 0 errors
• @tmcut/core: 156/156 tests passing (29 test suites)
• FFmpeg real dry-run test: cả 6 kiểu transition xfade + acrossfade exit code 0
• i18n: en.json & vi.json parity 2573/2573 keys, 0 duplicate keys
• UI: TmcutExportModal hiển thị badge xác nhận chuyển cảnh mượt mà
```

### 127.4 Roadmap

```text
• R3 ✅ (Transitions render qua xfade + acrossfade hoàn tất).
• Export Phase I còn: R2 (keyframes expr, L), R4 (effects graph, L), R7 (queue, M), R9 (refactor render/, L).
• Round kế (R60): ứng viên — R2 (Keyframes expression render, L) hoặc F-4 (Proxy preview / offline editing).
```

## §128 — Round 60 (R60): R2 · Keyframes render qua FFmpeg expressions

### 128.1 Bối cảnh & Yêu cầu

- **Vấn đề**: Trước R60, tính năng Keyframe (scale, position x/y, opacity, volume) chỉ hoạt động trên giao diện Preview Canvas (`evalKeyframe` trong `TmcutPreviewPlayer.vue`). Khi xuất video qua FFmpeg, toàn bộ thuộc tính chỉ lấy giá trị tĩnh đầu clip, bỏ qua các điểm biến đổi chuyển động của keyframe, và hiển thị nhãn hạn chế `previewOnlyKeyframes` ("Chỉ xem trước — chưa xuất ra file").
- **Mục tiêu**:
  - Biên dịch toàn bộ các điểm keyframe của clip (scale, x, y, opacity, volume) thành biểu thức toán học tương thích bộ phân tích biểu thức của FFmpeg (`eval=frame`).
  - Hỗ trợ đầy đủ 5 kiểu nội suy gia tốc (Easing) theo chuẩn core C3: `linear`, `ease-in`, `ease-out`, `ease-in-out`, `step`.
  - Giữ nguyên tính chất kẹp biên (Clamping): trước keyframe đầu lấy giá trị đầu, sau keyframe cuối giữ giá trị cuối.
  - Tích hợp mượt mà vào cả luồng xuất video đầy đủ lẫn luồng xuất audio-only (`compileAudioOnly`).
  - Cập nhật huy hiệu Inspector thành trạng thái hoạt động thực tế (`i-lucide-sparkles` + `text-primary`).

### 128.2 Kiến trúc Filtergraph & Biểu thức Toán học

1. **Sinh biểu thức nội suy (`keyframeExpr` trong `tmcut-core/src/keyframes.mjs`)**:
   - Chuyển đổi mốc thời gian từ ticks (`120000/s`) sang giây (`sa = a.t / 120000`).
   - Chuẩn hóa tiến độ $u = (t - sa) / span$.
   - Công thức gia tốc trong FFmpeg:
     - `linear`: $u$
     - `ease-in`: $u^2$ $\to$ `((u)*(u))`
     - `ease-out`: $1 - (1-u)^2$ $\to$ `(1-(1-u)*(1-u))`
     - `ease-in-out`: `if(lt(u,0.5), 2*u*u, 1 - 2*(1-u)*(1-u))`
     - `step`: giữ nguyên giá trị trước cho đến biên điểm kế tiếp.
   - Ghép nối đa phân đoạn qua hàm `if(lt(t, s_b), segExpr, expr)` lồng nhau.

2. **Ánh xạ vào các bộ lọc Video & Audio**:
   - **Scale động**: `scale=w='trunc(W*(scaleExpr)/100/2)*2':h='trunc(H*(scaleExpr)/100/2)*2':eval=frame`.
   - **Vị trí X/Y động**: `overlay=x='(W-w)/2+(xExpr)':y='(H-h)/2+(yExpr)':eval=frame:shortest=1`.
   - **Opacity video động**: Sử dụng `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*((opacityExpr)/100)'` với biến thời gian `T` (giây), sau đó overlay tự động hòa trộn kênh Alpha lên nền canvas.
   - **Âm lượng Audio động**: `volume='(volumeExpr)/100':eval=frame`. Hoạt động đồng thời và nối tiếp với bộ lọc mờ dần fade in/out (`fadeFilter`).
   - **Text Overlays**: `drawtext` tự động tính `x`, `y` và `alpha='(opacityExpr)/100'` theo thời gian clip-local `(t - tStart)`.

### 128.3 Verify & Quality Gate

```text
• typecheck app 0 errors · eslint 0 errors
• @tmcut/core: 161/161 tests passing (30 test suites, +5 tests cho keyframeExpr)
• FFmpeg real dry-run E2E: Toàn bộ chuỗi video scale + position + geq alpha + audio volume + drawtext x/y/alpha exit code 0
• i18n: en.json & vi.json parity 2573/2573 keys, 0 duplicate keys
• UI: TmcutInspector chuyển sang huy hiệu active "Keyframes active — renders on export"
```

### 128.4 Roadmap

```text
• R2 ✅ (Keyframes render qua FFmpeg expressions hoàn tất).
• Export Phase I còn: R4 (effects graph, L), R7 (queue, M), R9 (refactor render/, L).
• Round kế (R61): ứng viên — R4 (Effects graph, L) hoặc F-4 (Proxy preview / offline editing).
```

---

## §129 — Round 61 (R61): D-2 · Volume keyframes + R4 · Effects graph (renderReady)

### 129.1 D-2 — Volume keyframes → export
- **Core**: `keyframeExpr` (tmcut-core) sinh expression FFmpeg
  `volume='(${kfVol})/100':eval=frame` từ keyframes audio ticks, đủ 5 easing
  (`linear`, `ease-in`, `ease-out`, `ease-in-out`, `step`).
- **Preview Player**: `evalKeyframe(clip, 'volume', localTicks)` kết hợp
  `gainAt` fade envelope — âm lượng video/audio real-time theo playhead.
- **Inspector**: nút keyframe volume (`toggleKeyframe('volume')`) tại
  playhead + slider + chip trạng thái. **Timeline**: diamond keyframe trên
  clip audio/video.
- **Compiler**: bus audio gộp song song volume-keyframe + fade envelope
  (`fadeFilter`).

### 129.2 R4 — Effects graph
- `EFFECT_REGISTRY`: 8 effect đợt 1 (`blur`, `sharpen`, `vignette`,
  `grain`, `chromakey`, `lut3d`, `stabilize`, `eq-grade`) chuyển
  `renderReady: true`.
- `buildFfmpegEffectFilters` trong `@tmcut/core` map registry → filter
  chain FFmpeg; tích hợp vào `compiler.ts` theo pipeline ổn định
  `fit → effects → setsar=1 → transform → opacity`.
- **Verify**: 166/166 core tests PASS · dry-run FFmpeg 8/8 effects
  exit 0.

### 129.3 Roadmap
```text
• D-2 ✅ + R4 ✅. E-1..E-3 (Inspector effects tab) → R63.
• R7 (export queue) + R9 (render/ refactor) vẫn còn.
```

## §130 — Round 62 (R62): R7 · Export queue

### 130.1 Design
- `useTmcutExportQueue.ts`: singleton queue nền — tự động chuyển giao
  task tuần tự, không chặn UI; state Start/Pause/Resume/Cancel/Retry/Clear.
- `TmcutExportQueueModal.vue`: bảng hàng đợi đầy đủ (thời lượng, tiến độ,
  lỗi, retry).
- Tích hợp: nút "Thêm vào hàng đợi" trong `TmcutExportModal` + nút
  "Hàng đợi xuất" kèm badge đếm trên navbar editor.
- **i18n**: parity 2717/2717.

## §131 — Round 63 (R63): E-1/E-2/E-3 · Effects tab (Adjust, Filters, Chroma key)

### 131.1 E-1 — Adjust / Color grade
- Tab Effects trong `TmcutInspector.vue` — sliders `eq-grade`
  (brightness/contrast/saturation) → FFmpeg `eq`/`colorbalance`.
- Preview CSS filter mô phỏng real-time trong player; export qua pipeline
  R61.

### 131.2 E-2 — Filters
- blur (`gblur`), sharpen (`unsharp`), vignette (`vignette`), grain
  (`noise`) — slider cường độ, size grain; radial gradient vignette overlay
  preview.

### 131.3 E-3 — Chroma key
- `chromakey` + color picker phông (hex), sliders similarity/blend,
  switch khử spill; preview CSS approximation.

## §132 — Round 64 (R64): F-4 · Proxy preview

### 132.1 Pipeline
- Core `buildProxyArgs` (options + libx264/aac) → IPC
  `tmcut:generateProxy` (cache `cache/proxies/`).
- HUD preview: toggle "Proxy" (`proxyPreview` ref, badge `PROXY`).
- Media library: huy hiệu `PXY`, nút tạo nhanh + tạo hàng loạt.

## §133 — Round 65 (R65): C-5 · Text animation in/out

### 133.1 Model & core
- `TmcutTextAnimationType` ('none' | 'fade' | 'slide-up' | 'slide-down' |
  'slide-left' | 'slide-right' | 'zoom-in' | 'zoom-out'); fields
  `animIn/animInDuration/animOut/animOutDuration` sync 2 chiều qua
  v1/v3 bridge. 167/167 tests.

### 133.2 Export
- `drawtext` + expression ramp: `animAlphaExpr` (fade/zoom),
  `animXExpr` (slide-left/right), `animYExpr` (slide-up/down) — cú pháp
  `x='...'`, `y='...'` trích dẫn an toàn (bảo vệ dấu phẩy FFmpeg parser).

### 133.3 UI
- Preview Player: `textOverlayStyle` mô phỏng alpha ramp, slide offsets,
  zoom scale (0.3↔1.0) theo playhead.
- Inspector: tab "Animation" (wand-sparkles) — Quick Presets
  (Fade/Slide/Pop/Reset), chọn loại In/Out + slider thời lượng 0.1–2.0s.
- **i18n**: `tmcut.animation` → 2666 leaf keys.

## §134 — Round 66 (R66): E-5 · Video stabilizer (2-pass vidstab)

### 134.1 Core
- `src/stabilize.mjs`: `buildVidstabDetectArgs` (pass 1) +
  `buildVidstabTransformArgs` (pass 2), 3 preset `mild`(10)/
  `medium`(20)/`aggressive`(35) + colon-escaping path `D\:/...` an toàn
  trong filter string. 172/172 tests.

### 134.2 Runtime
- Electron controller: cache `cache/stabilized/` + `cache/stabilized_trf/`
  (FNV-1a key `(path, mtime, size, level)`); pass 1 → `.trf`, pass 2 →
  `.mp4`; auto-cleanup `.trf`.

### 134.3 UI
- Inspector: nhóm "Video Stabilizer" (desktop-only) — switch + mức độ +
  trạng thái + nút chạy. Timeline/Player: badge `STAB`; preview tự load
  footage đã ổn định; compiler đọc footage ổn định làm input render.
- **i18n**: `tmcut.stabilize` → 2678 leaf keys.

## §135 — Round 67 (R67): F-3 · Mask / crop trực tiếp trên canvas

### 135.1 Core
- `CROP_RATIO_PRESETS` (Free, 16:9, 9:16, 1:1, 4:3, 3:4, 21:9),
  `clampCropRect` (tọa độ [0..1], min-size an toàn), `applyCropRatio`,
  `sameCropRect` trong `v1MatchesV3` (fix lỗi nuốt thay đổi cropRect trên
  bridge). 175/175 tests.

### 135.2 UI
- Preview Player: chế độ crop (`isCropActive`) — `object-fit: contain`,
  4 khối mask `bg-black/65`, khung crop lưới 3×3 Rule-of-Thirds, 8 handle
  (`nw/ne/sw/se/n/s/w/e`), floating toolbar (chips tỷ lệ 1 chạm + Reset +
  Xong), Escape thoát.
- Inspector: toggle "Chỉnh sửa trên Canvas / Xong" + Reset, 2 chiều tức
  thì với 4 slider `cropRect`.
- **i18n**: `tmcut.crop.*` → 2687 leaf keys.

## §136 — Round 68 (R68): G-3 · Album/folder trong media bin

### 136.1 Core
- `src/folders.mjs`: `createFolder`, `renameFolder`, `updateFolderColor`,
  `removeFolder`, `getFolder`, `setAssetFolder`, `getAssetFolder`,
  `filterAssetsByFolder`, `getFolderCounts`; scoped per-project
  (`folderByProject`). 183/183 tests.

### 136.2 State & UI
- `useTmcutMedia.ts`: `folders` (persistent `tmcut_folders_v1`),
  `selectedFolderId` ('all'|'unassigned'|folderId), `projectFolders`,
  `folderCounts`; auto-gán folder khi import.
- `editor.vue`: Folder Bar (pills cuộn: Tất cả / thư mục dự án dot màu +
  badge + context menu / Chưa phân loại), kéo thả asset lên chip
  (`onFolderDrop`), badge folder trên card, modal Tạo/Sửa/Chuyển.
- **i18n**: `tmcut.folders.*` → 2709 leaf keys.

## §137 — Round 69 (R69): J-1 · Template engine & library

### 137.1 Core
- `src/templates.mjs`: `BUILTIN_TEMPLATES` (6 mẫu: TikTok Hook Intro,
  YouTube Cinematic Title, Split-Screen Duo, Instagram Square Promo,
  YouTube Outro, Minimal Vlog Lower-Third), `getBuiltinTemplates`,
  `getTemplateById`, `validateTemplate`, `filterTemplates`,
  `createTemplateFromTimeline`, `instantiateTemplate` (sinh id mới, giữ
  transforms/timing, áp replacements), `replacePlaceholder`. 191/191 tests.

### 137.2 App
- `useTmcutTemplates.ts` + `types/tmcut.ts`: builtin + user templates
  (`localStorage tmcut_user_templates_v1`), `createProjectFromTemplate`,
  `saveCurrentProjectAsTemplate`, xóa template cá nhân.
- `templates.vue`: Studio Template Library — lọc danh mục (Mở đầu/Kết
  thúc/Ghép/Quảng cáo/Tối giản/Của tôi), lọc tỷ lệ (9:16/16:9/1:1),
  tìm kiếm, card preview, thống kê slots, "Dùng mẫu này" 1 chạm, modal
  tùy biến tiêu đề/placeholder.
- **i18n**: `tmcut.templateLibrary.*` → 2749 leaf keys.

## §138 — Round 70 (R70): R9 · Refactor compiler → render/ graph

### 138.1 Kiến trúc
- Tách `compiler.ts` (~893 lines) thành `app/utils/tmcut/render/`:
  `types.ts`, `graph.ts` (RenderGraph + labels + chains), `text.ts`,
  `audio.ts`, `video.ts`, `encoder.ts`, `index.ts`
  (`compileTimelineToFfmpeg`).
- **100% logic FFmpeg được giữ**: keyframe expressions, xfade/acrossfade,
  LUT3D trước drawtext, `areverse` trước `asetpts`, text animations +
  transparent-canvas rotation, GIF palettegen/paletteuse.
- `compiler.ts` → facade re-export (backward-compat 100%).

### 138.2 Verify
- `tests/unit/tmcut_render_graph.spec.ts` (8/8), 191/191 core tests,
  ESLint 0 errors, vue-tsc 0 errors.

## §139 — Round 71 (R71): H-2 · AI script (ý tưởng → storyboard)

### 139.1 Models & utilities
- `app/utils/tmcut/aiScript.ts`: `TmcutAiScript`, `TmcutAiScriptScene`,
  `CURATED_SCRIPT_PRESETS` (TikTok Hook 30s, Tech Review 60s),
  `durationToSeconds`, `exportScriptMarkdown`.

### 139.2 Composable & UI
- `useTmcutAiScript.ts`: AI gateway (`useTmcutAi().complete`, system prompt
  storyboard + JSON mode); fallback curated preset khi chưa có API key;
  `createProjectFromScript`, `insertScriptToCurrentTimeline`.
- `TmcutAiScriptModal.vue`: 2 cột (thiết lập chủ đề/nền tảng/thời lượng +
  storyboard B-roll/dialogue/on-screen text); tạo project mới, chèn
  timeline, copy markdown.
- `Alt+A` thật (nút header + global listener) — help modal badge `ai`.
- **i18n**: parity 2782/2782.

## §140 — Round 72 (R72): H-1 · AutoCut v2 (vocabulary/filler analysis)

### 140.1 Core
- `src/analysis.mjs` (pure, zero-dep): `DEFAULT_FILLER_WORDS` (VN+EN ~150),
  `detectFillerWords`, `analyzeTranscriptSegment`, `scoreSegments`
  (options `filterFillerWords`/`keywords`/`customFillerWords`).
- Scoring: filler → `*0.4` (`reason: 'filler-word'`); highlight keyword
  → `+0.25` (`reason: 'highlight'`); metadata
  `hasFillerWords`/`detectedFillers`/`isHighlight`/`matchedKeywords`.
- `test/analysis.test.mjs` (11 tests) → 194/194 core.

### 140.2 App
- `useTmcutAutocut.ts`: `AutocutOptions`, stats `fillerSegmentCount` /
  `highlightSegmentCount`.
- `autocut.vue`: bước 2 card AutoCut v2 (switch lọc từ thừa + input từ
  khóa); bước 3 nút "Bỏ chọn từ thừa" / "Chọn đoạn nổi bật" + badge
  `fillerTag` (cam) / `highlightTag` (tím) trên card segment.
- **i18n**: `tmcut.autocutV2.*` → 2795 leaf keys.

## §141 — Round 73 (R73): P0 security + queue persist + ESLint cleanup

### 141.1 Security (P0)
- `tmcut.controller.cjs`: `isPathSafe` — chặn path traversal trên mọi IPC
  nhận file path (project files, media, LUT, proxies, frames).
- OOM guards: giới hạn danh sách asset/folder + size payload.

### 141.2 Export queue persist
- Queue export lưu state qua session (không mất khi F5).

### 141.3 Cleanup
- ESLint app: 190 → 0 errors (rules stylistic + fix); `fontmanager.node`
  pack fix (file addon bị pnpm ignore → `files`/pack config).

## §142 — Round 74 (R74): v1compat data-loss fixes + lint:core

### 142.1 Bridge fixes
- `reverse`, `effects[]`, `keyframes[]`, track flags (hidden/muted) bị
  drop khi merge-back v1→v3 → passthrough 2 chiều đầy đủ + tests
  v1compat.
- `KEYFRAME_EASINGS` export từ core (nguồn sự thật easing).

### 142.2 Verify
- `lint:core` 0 errors (lần đầu sau R62), 198/198 core tests.

## §143 — Round 75 (R75): Phase 4 · Canvas background (image/transparent)

### 143.1 Core — `buildBackgroundSource()`
- `tmcut-core/src/canvas.mjs`:
  - `color` → source chain `color=c=...:s=WxH:r=fps:d=D`;
    `toFfmpegColor()` convert `#RRGGBB` → `0xRRGGBB` (named colors
    pass-through; default `0x000000`) — **fix bug `#` color R74**.
  - `transparent` → `color=c=0x00000000:...` (real chain, alpha).
  - `image` → descriptor **input loop**: `inputFlags ['-framerate',
    String(fps), '-loop', '1']` + tail `scale=...:
    force_original_aspect_ratio=increase,crop=...,setsar=1` (NO `-t` —
    mỗi consumer tự trim; empty path → fallback black source).
- `test/canvas.test.mjs`: +7 tests (descriptors cố định, hex 0xff0000,
  default 0x000000, transparent 0x00000000, image flags, fallback,
  evenizing, fractional fps). **205/205 core tests.**

### 143.2 Note
- `movie=` bug (R75 trước) cũng fix trong round này — image dùng
  looping input thay vì filter `movie` (tránh quoting path Windows).

## §144 — Round 76 (R76): Render pipeline integration (background + alpha)

### 144.1 Pipeline
- `render/index.ts`: import `buildBackgroundSource` từ `@tmcut-core`;
  `bgDesc` computed per mode:
  - no clips: source chain `bgDesc.chain[v_base]` (color/transparent)
    hoặc `[v_bg]` (image) + `anullsrc...atrim` + text overlays.
  - image bg: `graph.addInput(bgDesc.file, bgDesc.inputFlags)` +
    `[idx:v]<tail>,trim=end=(totalDuration+2),setpts[v_bg]` đăng ký
    upfront.
  - `compileVideoPipeline(..., { bgBase: backgroundStreamLabel })`.
- `render/graph.ts`: `addInput(filePath, flags = [])` — flags emit TRƯỚC
  mỗi `-i`.
- `render/encoder.ts`: `alphaPixFmt(enc)` — libx264/x265/vp9 →
  `yuva420p`, prores_ks → `yuva444p10le`; `buildVideoCodecArgs` dùng
  alpha fmt khi `options.transparent`.
- `render/types.ts`: `CompileOptions.transparent?: boolean`.

### 144.2 Verify
- `tmcut_render_graph.spec.ts`: 11 checks (+3: image bg looping input,
  transparent+vp9→yuva420p, hex 0x regression). Core 205/205.

## §145 — Round 77 (R77): Per-clip transform over shared canvas background

### 145.1 Background
R76 đã nối `buildBackgroundSource()` vào base layer. Gap còn lại:
`buildFfmpegTransform` vẫn emit `color=` source inline per-clip → clip có
transform trên nền **image** mất hình nền (gap hiện solid color).

### 145.2 Changes
- `buildFfmpegTransform(options)`: thêm `bgInput?: string` — khi có,
  `bg` rỗng (caller cấp labeled base).
- `render/index.ts`: image bg trim `totalDuration + 2` (headroom y hệt
  color base) → `[v_bg]`; pass `bgBase` vào pipeline.
- `render/video.ts`: `VideoPipelineContext.bgBase?`; transform branch
  reuse `[v_bg]` trim per-clip (`clip.in → clip.out+2`,
  `setpts=PTS-STARTPTS`) + `overlay`; faded/opacity branch cũng reuse.

### 145.3 Verify
- 12 render checks (+1: image bg + scaled clip → `[v_bg]` +
  `scale=1920:1080`). Core 205/205, app typecheck 0, lint 0.

### 145.4 Open issue
- Chain no-op relabel `[intermediate][v_bg_N]` (không filter) — hợp lệ
  syntax filter_complex chưa verify bằng FFmpeg thật → cần render smoke
  test (unit tests chỉ assert string presence).

## §146 — Round 78 (R78): C16-R1 · App model sang DSL v3 rational fps

### 146.1 Scope (C16 sub-round 1/3)
Migrate fps từ `number` sang `FrameRate { numerator, denominator }`
(theo DSL v3 core) — bước đầu của "Đưa app sang DSL v3 đầy đủ".
Timeline items (seconds, `src`) CHƯA đổi (sub-round 2 — bề mặt lớn
~270 chỗ đọc field v1, cần tách riêng).

### 146.2 Changes
| # | Change | File |
|---|--------|------|
| 1 | `FrameRate` interface + `TmcutCanvas.fps: FrameRate` | `app/types/tmcut.ts` |
| 2 | Xóa app-side `normalizeCanvas` — re-export core version (rational fps) | `app/utils/tmcut/canvas.ts` |
| 3 | `canvasFpsValue(canvas?)` — rational/number → number (3-decimal, NTSC 29.97 an toàn) | `app/utils/tmcut/canvas.ts` |
| 4 | `TmcutProjectSettings.fps: FrameRate`; `buildDefaultProject` `{30,1}`; `TMCUT_PROJECT_SCHEMA_VERSION = 2` + `schemaVersion?` trên project; `applyProjectMigration` = cổng migrate MỘT LẦN khi mở (bare-number fps → rational, settings thiếu → dựng từ canvas, stamp version) — chỗ DUY NHẤT còn chấp nhận shape v1 cũ | `app/composables/useTmcutProject.ts` |
| 5 | `reframeCanvas`/`duplicateAsProject` đọc qua `canvasFpsValue` | `useTmcutProject.ts` |
| 6 | `createTemplateFromTimeline` canvas.fps qua `canvasFpsValue` (core template giữ number) | `app/composables/useTmcutTemplates.ts` |
| 7 | Render pipeline `fps = canvasFpsValue(project.canvas)` | `app/utils/tmcut/render/index.ts` |
| 8 | UI displays (editor HUD, Inspector, PreviewPlayer, ExportModal, home cards) qua `canvasFpsValue`; setters wrap `{ numerator: fps, denominator: 1 }` | `editor.vue`, `index.vue` (home/tmcut), `TmcutInspector.vue`, `TmcutPreviewPlayer.vue`, `TmcutExportModal.vue` |

### 146.3 Decision
- `TmcutAssetMeta.fps` giữ `number` (measured probe value, khác canvas
  fps — core `TmcutMediaMetadata.fps: number` cũng vậy).
- Social/quick preset UI giữ `fps: number` (local type) rồi wrap rational
  khi gọi `normalizeCanvas`.

### 146.4 Verify
- Core 20/20 test files (205 tests) · typecheck:core 0 · lint:core 0 ·
  app typecheck 0 · lint touched files 0 · render suite 12/12 ·
  i18n parity 2795/2795 (không đụng locale).

### 146.5 Note — Doc recovery
§129–§145 trong round này được **tái tạo từ Round log + Phase entries của
Roadmap v3.md** (file Architecture v3.md từng bị truncate bằng mistake
`write` trong round trước; git HEAD chỉ có tới §128). Nội dung tái tạo
đầy đủ dữ liệu fact-based (test counts, files, i18n parity) nhưng mô tả
có thể ngắn hơn bản gốc — chấp nhận, ghi nhận tại đây.

### 146.6 C16 kế tiếp
- Sub-round 2: timeline store sang ticks (xóa seconds trong `TmcutProjectTimeline`),
  components đọc `ticksToSec`.
- Sub-round 3: `v1compat` retire — chỉ dùng trong `applyProjectMigration`
  (legacy file open), không còn bridge per-edit.

## §147 — Round 79 (R79): C16-R2 slice 1 — render canonical clip model + real-FFmpeg smoke gate

### 147.1 Mục tiêu
C16-R2 (timeline store → ticks) cần một seam để không phải sửa khắp render
pipeline khi store flip sang v3. Slice 1: render pipeline **không còn đọc
thẳng field v1** của timeline item — mọi thứ đi qua canonical view
`RenderClip`. Đồng thời đóng open issue R77 (filter chain sai) bằng bằng
chứng chạy FFmpeg thật, không chỉ string assertion.

### 147.2 Canonical clip model — `app/utils/tmcut/render/clip.ts` (mới)
- `RenderClip`: `id`, `footagePath` (đã resolve stabilized-path), `text`,
  `inSec`, `outSec`, `offsetSec`, `speed`, `scalePct`, `opacityPct`, `x`, `y`,
  `rotation`, `volumePct`, `fit`, `focusX/Y`, `transitionIn`, `raw`.
- `toRenderClip(item)` — **điểm duy nhất** render layer map app-model field;
  C16-R3 chỉ cần rewrite hàm này khi store thành ticks.
- `raw` là item gốc, truyền nguyên vẹn cho core expression builders
  (`keyframeExpr`, `volumeExpr` — contract theo shape v1, gồm `keyframes[]`,
  `fade`, `effects`, `cropRect`, text props…).
- Helpers: `renderVideoClips/renderAudioClips/renderTextClips(track)`
  (filter+sort), `renderClipDuration(c) = (outSec-inSec)/speed`.
- `video.ts`/`audio.ts` consume `RenderClip`; `text.ts` giữ
  `TextOverlayClip` (= cấu trúc v1) cho drawtext builder, còn
  `applyTextOverlays` nhận `RenderClip[]` và truyền `.raw`. `index.ts` map
  một lần ở compile boundary (filter/sort/totalDuration cũng dồn về đây).

### 147.3 FIX render graph (smoke test FFmpeg thật bắt được)
Ba lỗi trên đường nền ảnh (canvas background = image), chỉ hiện ra khi chạy
FFmpeg thật (`resources/ffmpeg.exe`):
1. Bare relabel `[v_bg_trim_N][v_bg_N]` (chain không có filter) — open issue
   từ R77 → xóa; label trimmed feed thẳng overlay.
2. `${ctx.bgBase},trim=…` (label rồi mới dấu phẩy) parse thành filter RỖNG →
   `No such filter: ''`. Label phải dính thẳng vào filter: `[v_bg]trim=…`
   (cả transform branch lẫn opacity branch — `text.ts` không dính vì đã
   đúng dạng).
3. Overlay trên shared still-image base negotiate frame size từ SIZE ẢNH
   GỐC (vd 640x480) lúc config → `concat` reject "Input link … do not
   match". Fix: **size lock** `,scale=${canvasW}:${canvasH},setsar=1` sau
   overlay khi `ctx.bgBase` tồn tại (cả 2 branch). Graph color-background
   không đổi.

### 147.4 Smoke gate mới — `tests/unit/tmcut_render_smoke.spec.ts` (opt-in)
Sinh media thật bằng bundled ffmpeg (testsrc/smptebars/color), compile
project thật qua `compileTimelineToFfmpeg`, chạy FFmpeg thật, assert exit 0
+ output >1KB. 3 case: shared image bg + 2 transformed clips (R77/R79
regression), clip scale/opacity over color bg, xfade pipeline. Work dir
`.smoke-render` xóa sạch mỗi run. KHÔNG nằm trong string-gate hằng round
(cần binary + ~30s) — chạy khi đụng render graph.

### 147.5 Kết quả gate
- `tests/unit/tmcut_render_graph.spec.ts`: **12/12** — R76/R77 checks giữ
  nguyên ngoài assertion mới: `[v_bg]trim=…`, `!fc.includes('[v_bg],trim')`,
  size-lock `,scale=1280:720,setsar=1[v_scaled_1]`, regex chống bare-relabel.
- Smoke: **3/3** render thật pass (exit 0, file hợp lệ).
- `tsc --noEmit -p tsconfig.json`: 0 lỗi. ESLint render/ + 2 specs: 0
  (xóa import `TmcutTimelineItem` thừa trong `video.ts`).
- `compileVideoPipeline`/`compileAudioOnly`/`compileBackgroundAudio`/
  `applyTextOverlays` đổi signature sang `RenderClip[]`; API ngoài của
  `compileTimelineToFfmpeg` (facade `compiler.ts`) không đổi.

### 147.6 Ghi chú C16
Seam đã đặt: flip store → ticks chỉ đụng `toRenderClip` (+ tests). Sub-round
2 tiếp: Inspector/Timeline/Preview đọc `ticksToSec`; sub-round 3: retire
`v1compat` về file-migration-only.


## §148 — Round 80 (R80): C16-R2 slice 2 — timeline read/write qua `clipTime` accessors

### 148.1 Mục tiêu
Đặt **single derivation point** cho mọi phép toán thời gian-geometry của
clip (duration, start, end, media time) để C16-R3 flip store sang ticks
chỉ đụng `clipTime.ts`. Slice này thay các công thức rải rác
`(clip.out - clip.in) / (clip.speed || 1)` & `clip.offset` bằng
`clipDurationSec`, `clipStartSec`, `clipEndSec`, `clipMediaTimeSec`.

### 148.2 `app/utils/tmcut/clipTime.ts`
- `clipSpeed` — fallback 1; `clipSourceRange` = out − in.
- `clipDurationSec`, `clipStartSec`, `clipEndSec`, `clipMediaTimeSec`
  (B2 retime semantics, có reverse) — định nghĩa duy nhất, **.seconds**.
  Module không import gì ngoài type → dùng được từ mọi tầng.

### 148.3 Điểm đã migrate
- `useTmcutPlayback.ts`: `mediaTimeAt` → `clipMediaTimeSec`; crossfade
  window, active-video scan, active-text scan → `clipStartSec/clipEndSec`.
- `useTmcutProject.ts`: `totalDuration`, `addClipToTrack` (auto-offset +
  collision), `hasGap`/`closeProjectGaps`, fade toggle, `splitClip`,
  `canTrimClip`, `linkClips` overlap + `relatedOffsetsFor`.
- `TmcutTimelineClip.vue`: `duration`, `clipLeft`.
- `TmcutInspector.vue`: `maxFadeSec`.
Giữ nguyên semantics giây (v1); chỉ **đường code** được tập trung.

### 148.4 Kiểm tra
`vue-tsc` 0 · ESLint 0 · render suite 12/12 · smoke 3/3 ·
time-domain contract 6/6 · i18n 2795/2795.

## §149 — Round 81 (R81): C16-R2 slice 3 — UI dùng accessor

### 149.1 Đã làm
- `TmcutTimelineClip.vue`: `duration` = `Math.max(0.1, clipDurationSec(clip))`,
  `clipLeft` = `clipStartSec(clip) * zoom`.
- `TmcutInspector.vue`: `maxFadeSec` dùng `clipDurationSec(c) / 2`
  (bỏ công thức thủ công cuối cùng trong Inspector).
- Input `in/out/offset` của Inspector **vẫn bind thẳng field giây** của
  store — đây là thiết kế chủ đích cho tới C16-R3: store là giây nên
  không có bước chuyển đổi nào ở biên UI.

### 149.2 CORRECTION (ghi lại tại §150.2)
Bản §149 gốc tuyên bố "`applyV3Edit` bỏ `v1TracksToV3`/`syncV3Result`,
bridge chỉ còn khi mở file legacy`. **Điều đó chưa từng xảy ra**:
`applyV3Edit` vẫn chạy `v1TracksToV3` → op → `syncV3Result` trên MỖI
lượt sửa (đúng như thiết kế hiện tại), và `v1compat` vẫn là per-edit.
"sub-round 3 hoàn tất C16" là sai sự thật — C16-R2 mới dừng ở bước
centralization accessor, chưa hề retire bridge.

## §150 — Round 86 (R86): REVERT C16-R3 nửa vời + time-domain contract gate

### 150.1 Bối cảnh — vì sao phải revert
R82→R85 tuyên bố "store ticks migration" nhưng mỗi round chỉ đổi MỘT
phía của biên giây↔ticks, nên code rơi vào trạng thái không nhất quán và
không gate nào bắt được (typecheck không thấy sai số, render graph vẫn
compile — chỉ là yêu cầu `trim=start=240000`). Năm lỗi cụ thể, tất cả đều
đã verify bằng đọc code + chạy test:

1. **Chết runtime**: `TmcutInspector.vue` `import { secToTicks } from
   '~/utils/tmcut/clipTime'` — `clipTime.ts` không export tên đó. Vue SFC
   không nằm trong `tsc -p tsconfig.json` nên không ai thấy; app trắng
   trang ở editor. `vue-tsc` sau này cũng không bắt (module resolution của
   SFC khác), chỉ có chạy thật mới lộ.
2. **Double-conversion**: Inspector `secToTicks(value)` rồi `updateClip`
   lại `secToTicks(patch.in)` → mỗi lần gõ là ×120000 lần nữa.
3. **Export hỏng**: `toRenderClip` vẫn gán `inSec: item.in` trong khi store
   đã là ticks → `trim=start=120000:end=240000`, mọi khung hình rỗng.
4. **Core bridge hỏng**: `v1ClipToV3` gọi `secToTicks(num(item.in))`; với
   store ticks thì ripple/paste/trim/transition/snap nhân đôi hệ số.
5. **Migration heuristic sai**: `applyProjectMigration` đoán giây↔ticks
   bằng `value < 1_000_000` — một clip >13 giây (13·120000 > 10⁶) bị coi
   là ticks và bỏ qua, clip ngắn thì bị nhân đôi; và vì `schemaVersion`
   không bump nên chính nó cũng không phân biệt được file nào là kiểu gì.
   `addClipToTrack` còn nhân đôi cả `outPoint` mặc định (`secToTicks(5)`).

### 150.2 Hành động
`git checkout 2e445a8 -- app docs`: revert app về trạng thái nhất quán
cuối (R81) — store **giây**, seam `clipTime` + `RenderClip`, mọi gate xanh.
Không revert một mình `clipTime.ts`: semantics "field = ticks" của nó phải
đi kèm toàn bộ caller; giữ lại sẽ tái tạo đúng bug 3 và 4.

Những thứ tốt của R80 (chưa từng được commit vào code) được **áp lại** trên
nền an toàn: centralization đầy đủ trong `useTmcutPlayback.ts` +
`useTmcutProject.ts` (danh sách ở §148.3) và `maxFadeSec` Inspector.

### 150.3 Gate mới — `tests/unit/tmcut_time_domain.spec.ts` (6 checks)
Chính là lớp phòng vệ đã thiếu. Spec pin đơn vị của từng biên:
- field store + accessor vẫn là **giây** (assert `< 1000` — chính là chữ ký
  của một lần flip nửa vời);
- accessor khớp công thức inline cũ trên nhiều bộ (in/out/offset/speed);
- `clipMediaTimeSec` ở miền giây (playback seek bằng giây), reverse chạy
  ngược từ nguồn;
- `toRenderClip` giữ **giây** → export không bao giờ nhận ticks;
- `v1ClipToV3` sinh ticks, `v3ClipToV1` trả đúng giây gốc (round-trip —
  nếu lệch, `syncV3Result` sẽ ghi đè mọi clip mỗi lần mở file);
- `ticksToSec ∘ secToTicks` là nghịch ảnh đúng tại các mốc giây.

Đã chứng minh gate bắt được lỗi thật: tạm khôi `clipTime.ts` của R83 →
spec fail ngay (`actual 0.00001666, expected 2`); restore → 6/6 xanh.

### 150.4 Kết luận cho C16-R3 (round sau)
Flip sang ticks là một **thay đổi nguyên tử**, không chia được thành
"read trước, write sau". Thứ tự tối thiểu trong MỘT round:
schema (`schemaVersion` bump + migration không heuristic) → `clipTime`
(truth = ticks) → `toRenderClip` (decode ra giây) → `v1compat` boundary →
mọi caller UI. Gate: `tmcut_time_domain.spec.ts` phải được cập nhật cùng
lúc, và bắt buộc chạy `vue-tsc` + 3 spec render/time-domain, không chỉ
`tsc`.

### 150.5 Kiểm tra
`vue-tsc` 0 · ESLint 0 · render suite 12/12 · smoke FFmpeg 3/3 ·
time-domain 6/6 · ai-script 3/3 · autocut-v2 pass · i18n 2795/2795.

## §151 — Round 87 (R87): Gate typecheck THẬT + tầng test hành vi store

### 151.1 Phát hiện: `typecheck` những round trước là GATE GIẢ
Cấy một lỗi cố ý (`const x: number = 'str'`) vào `useTmcutPlayback.ts`
rồi chạy từng lệnh:

| Lệnh | Kết quả | Kết luận |
|---|---|---|
| `tsc --noEmit -p tsconfig.json` | exit **0** (lỗi lọt) | Gate sai từ trước tới giờ |
| `vue-tsc --noEmit -p tsconfig.json` | exit **0** (lỗi lọt) | Cũng gate giả |
| `vue-tsc --noEmit -p .nuxt/tsconfig.app.json` | exit 0 kèm warning `vue-router/volar/sfc-route-blocks` | plugin path không resolve được dưới pnpm isolation (`@vue/language-core` không thấy `vue-router`) — không đáng tin |
| **`nuxt typecheck`** | exit **2 — bắt đúng lỗi line 473** | **Gate thật** |

Vì sao lọt: `tsconfig.json` gốc là **solution-style** (`"files": []` +
4 project references). `tsc`/`vue-tsc` chạy `-p` trên nó **không compile
file nào** — exit 0 vô điều kiện. Mọi con số "typecheck 0" từ R72→R86
thực chất kiểm tra… rỗng. (`.nuxt` regenerated bởi `nuxt prepare` cũng
không đủ nếu vẫn `-p tsconfig.json`.)

→ **Gate chuẩn mới**: `pnpm typecheck` (= `nuxt typecheck`), sau khi sửa
error thật phải `nuxt prepare` để types kịp cập nhật. Checklist §7 đã
được cập nhật tương ứng ở R86 vẫn còn đúng tinh thần nhưng câu lệnh phải
là `nuxt typecheck`, không phải `tsc -p`.

### 151.2 18 lỗi type TỒN ĐỌNG bị gate giả che — đã sửa hết
`nuxt typecheck` sau khi có gate thật báo 18 lỗi; lần lượt sửa gốc:

- **Core thiếu re-export type** (7 lỗi lan across Inspector/PreviewPlayer/
  useTmcutProject): `TmcutTextAnimationType`, `TmcutStabilizeLevel`,
  `TmcutStabilizeStatus` được import từ `@tmcut-core` nhưng `index.d.ts`
  không re-export từ `types/dsl.ts` → thêm vào cả `import type` lẫn
  `export type {}` block.
- **`FrameRate`** dùng trong `useTmcutProject.ts` và `canvas.ts` nhưng
  không import → import từ `~/types/tmcut` / `@tmcut-core`.
- **`canvasFpsValue`** dùng trong `TmcutExportModal.vue` không import →
  thêm import.
- **`Pick<TmcutTimelineItem, 'a', 'b'>`** trong `clipTime.ts` — cú pháp
  sai (Pick nhận 2 type args, union bằng `|`): 4 chỗ → `Pick<…, 'a' | 'b'>`.
- **`canvas.fps` rational vs number** (`editor.vue` 749/792): menu đọc
  `canvas.fps` (FrameRate) gán vào chỗ cần number → dùng
  `canvasFpsValue()` đã có sẵn import ở file.
- **Template engine type-vs-runtime**: `createTemplateFromTimeline` khai
  báo nhận `TmcutTimeline` (v3 ticks) nhưng body runtime đọc
  `item.in/out/offset` (v1 seconds — app-hosted). Khai báo ĐÚNG SAI về
  mặt bản chất là host-agnostic → core d.ts thêm `TmcutTemplateTrack`
  (items: `unknown[]`) + `TmcutTemplateSourceTimeline`, hàm nhận source
  loose; app cast `tracks` về `TmcutTrack[]` tại boundary kèm comment
  giải thích `validateTemplate` là gate thật.
- **`backgroundStreamLabel: string | null`** trong `render/index.ts` gán
  vào ctx `bgBase?: string` → đổi khai báo sang `string | undefined`
  (đúng semantic optional, không đổi hành vi).
- 1 lỗi `TS1128` syntax do chính mình để lại khi dọn probe → xóa.

### 151.3 Tầng test còn thiếu: hành vi STORE (Node import composable)
`useTmcutProject.ts` là module ESM thuần logic, chỉ đụng
`localStorage`/`window` sau guard → import được trong Node với đúng 2
shim (Vue globals cho auto-import + `localStorage` Map). Harness:
`tests/unit/helpers/tmcut_store_env.ts` (`freshStore()`, `videoClip()`,
`TICKS`). Spec: `tests/unit/tmcut_store_behaviour.spec.ts` (`pnpm test:store`) —
13 checks **bằng chứng hành vi thật**, pin theo ĐƠN VỊ
STORE (giây hôm nay, ticks sau C16-R3 — helper chuyển raw→ticks để spec
sống xuyên flip):
- addClip auto-offset + floor 5s ruler; split bảo toàn nguồn (in/out
  không rò), split theo speed, split gần biên từ chối no-op;
- trim một edge giữ edge kia; updateClip chỉ patch field yêu cầu;
- undo/redo split = 1 entry; ripple delete trượt clip sau; closeGaps;
  duplicate không dời bản gốc; transition chỉ nhận clip kề + lưu ticks;
  fade toggle lưu/clear ticks envelope; **save/load round-trip không
  re-scale** (chính là chữ ký double-conversion của R82–R85).
- Đã chứng minh đặc tính bắt lỗi của spec: khôi phục bản
  `useTmcutProject.ts` của R85 → spec fail ngay
  (`ReferenceError: outPoint is not defined` — phát hiện THÊM lỗi thứ 7
  của R82–R85: `addClipToTrack` tham chiếu biến không tồn tại, nghĩa là
  thêm clip nào cũng crash — chưa round nào test tới).

### 151.4 Kết quả gate (lần này là gate THẬT)
`nuxt typecheck` **0** (sau khi hết 18 lỗi) · core `tsc` 0 · core tests
**20/20 pass** · core lint 0 · check-boundaries PASS · ESLint app 0 ·
time-domain 6/6 · store-behaviour 13/13 · render graph 12/12 ·
FFmpeg smoke 3/3 · ai-script 3/3 · i18n 2795/2795.

### 151.5 Bài học quy trình (đã ghi vào checklist §7)
1. Gate phải được **chứng minh là bắt được lỗi** (cấy lỗi, thấy fail)
   trước khi tin là xanh. "exit 0" của một lệnh không kiểm tra gì cả
   cũng là 0.
2. `Pick<T, 'a', 'b'>` compile fail ngay cả trong file `.ts` thuần — vậy
   mà tồn tại nhiều ngày → xác nhận gate cũ chưa từng chạy trên `app/`.
3. Test composable trong Node dễ hơn tưởng (2 shim); ưu tiên test hành
   vi ở tầng store vì đó là nơi unit-flip (C16-R3) lộ lỗi đầu tiên.

# 152. R88 — C16-R3: the store flip, seconds to ticks (atomic round)

The store flipped: `TmcutTimelineItem.in/out/offset` are INTEGER TICKS (TICKS_PER_SECOND=120000) from this round on. One atomic change per §150.4 — schema bump + migration + truth change + encode/decode seams + spec gate updates landed together, no intermediate commit.

## 152.1 Where the unit lives now

- `clipTime.ts` is the single unit oracle. Ticks helpers (`clipStartTicks`, `clipDurationTicks`, `clipEndTicks`, `clipSourceRangeTicks`) for store-space math; the R2 seconds API (`clipStartSec`, `clipDurationSec`, `clipEndSec`, `clipMediaTimeSec`) is kept byte-compatible so playback, panels and every accessor-based consumer did not change at all.
- `toRenderClip` (render/clip.ts) is the ONLY decode point into the FFmpeg world: `inSec/outSec/offsetSec` via `ticksToSec`, plus a new exact `durationTicks` field. FFmpeg strings compile identical — the R9 render graph spec and the R77/R79 real-FFmpeg smoke prove it (all expected strings unchanged).
- Core v1compat split into two flavors over one structural core: SECONDS (`v1TracksToV3`/`syncV3Result`… FILE MIGRATION ONLY) and TICKS (`ticksTracksToV3`/`syncTicksResult`/`ticksClipToV3`/`v3ClipToTicks`/`ticksMatchesV3` — the live per-edit bridge, an exact identity on time fields). `v1compat.test.mjs` pins the two apart so a swap cannot pass silently.
- `volumeExpr`/`gainAt` legacy flat branch (flat in/out read as SECONDS) must never see a store item: all callers (render fadeFilter, preview gainAt) now pass the v3 shape `{ fade, volume, timeline: { duration } }` with the exact `clipDurationTicks`. `CoreFadeClip` accepts the shortcut shape in d.ts.
- UI seconds seams: Inspector number inputs (decode display, encode on change), drag/trim px math (px → ticks via zoom, snap boundary keeps the seconds API of `snapTimeSec`), filmstrip args, SRT cues, minimap. Store-facing add sites convert once (`secToTicks`): addClipToTrack callers (media, autocut passes ticks through directly, AI script, captions, SRT import, text presets).
- `applyClipTransition`/`removeClipTransition` keep a SECONDS duration argument (UI contract) — converted internally; `transitionIn.duration` stays ticks as always, and video.ts dropped its `>1000` magnitude guess for a plain `ticksToSec`.
- `closeProjectGaps` returns TICKS (core reports seconds; converted at the store boundary).

## 152.2 Migration (schema 3) — version stamp, never magnitude

`TMCUT_PROJECT_SCHEMA_VERSION = 3`. `applyProjectMigration` scales in/out/offset by 120000 exactly once when the file stamp is <3, then re-stamps. No heuristic anywhere (the R82 defect class stays closed): an old file with a 0.4s fade reads as seconds because the STAMP says so. Every entry point already routed through the migration (disk, localStorage mirror, recovery force/apply). Recovery and history snapshots are unit-agnostic JSON; seconds-era recovery files migrate on apply.

User templates persist flat items too: the localStorage key is the version stamp (`tmcut_user_templates_v2`), with a one-time migrate-from-v1 that scales item geometry and removes the old key.

BUILTIN templates (core) carry ticks flat items now; `createTemplateFromTimeline` derives `durationTicks` from tick geometry (was seconds math). `animInDuration`/`animOutDuration` remain SECONDS — they are animation timing, consumed by render/text-builder + preview, deliberately outside the store flip.

## 152.3 Gate battery (all green, R88)

- `nuxt prepare` → `nuxt typecheck` EXIT=**0** (the real gate from R87; it flushed the two real errors this round surfaced in one pass)
- tmcut_time_domain 7 (rewritten for the ticks era: accessors decode, toRenderClip decodes, ticks bridge is an exact identity, seconds bridge stays migration-only) — same-round per §150.4
- tmcut_store_behaviour 14 (rewritten to ticks literals; NEW checks: legacy schema-2 file migrates once at open, reopening does NOT double-scale, closeGaps ticks floor)
- tmcut_render_graph 12, tmcut_render_smoke 3 (real FFmpeg), ai_script 3; core tests 20/20 files (v1compat 25, templates 8)
- eslint both roots 0; core tsc 0; check-boundaries PASS; i18n 2795/2795

The `Ticks` branded-type idea was deliberately dropped: with the seconds oracle specs plus the exact-identity bridge tests, a brand would add cast noise without catching a class of bug the specs do not already catch, and it would fight the plain-number contract the core keeps on purpose.

## 152.4 Consequences

- v1compat SECONDS flavor is now ONLY file-migration code (Roadmap C16 final state achieved for the store).
- Playback composable untouched end-to-end — proof the R2 accessor contract paid off exactly as designed.
- Autocut lost its ticksToSec detour; templates store/replay stays unit-agnostic.
- Follow-ups observed while flipping (non-blocking): preview ignores text-clip SPEED for the anim window (pre-existing); Inspector timing inputs step in seconds (correct by design).

# 153. R89 — Canvas background image UI (last Phase 4 gap)

Phase 4's only remaining "DSL has it, UI does not" item was the image canvas background (export side shipped with R76's `buildBackgroundSource`): the Canvas menu gains "Background image…" next to the color/transparent presets.

- `editor.vue` `handlePickBackgroundImage`: desktop picks via `pickFile` and stores the absolute path (media:// resolves at play/export, like clip srcs); web mode keeps a session `URL.createObjectURL` blob — the same trade web-imported assets already accept (`isDesktop`-gated).
- Preview monitor paints the image `cover`-centered behind the clip layers, through `resolveMediaSrc` (absolute → media://, blob passes through), matching the export composite order (background under clips).
- i18n +2 pairs → 2797/2797.

Preview PAN (F2) stays deliberately undone: the roadmap's own R55 conclusion — fixed preview, per-clip move/scale covers framing; recorded as the standing exception on the Phase 4 tick. Phase 4 ✅ (R89), Phase 6 was already true on content (R9 = R70) → ticked. Gates: typecheck 0 · lint 0 · render 12/12 · store 14/14 · i18n 2797/2797.

# 154. R90 — Preview engine seam (Phase 5 boundary)

Phase 5's real content was already true (F-4: the preview never calls FFmpeg — HTMLVideoElement + `media://`/blob on both runtimes). What was missing was the *boundary itself*: the player reached into `isDesktop`/`resolveMediaSrc` directly at five places, so a future engine had no seam to implement. This round draws it.

## 154.1 The contract

New `composables/useTmcutPreviewEngine.ts` picks one engine per session (the `tmcutIpc()` bridge cannot appear/disappear mid-session, so the object is stable):

- `kind: 'electron' | 'web'`
- `capabilities { proxyPreview, stabilize }` — desktop-only media pipelines, feature questions not environment guesses;
- `resolveSrc(src)` — stored clip src → playable URL. Electron keeps the proxy-aware `resolveMediaSrc`; web resolves through `toURL` (blob:/data:/https: pass through — an absolute path could never load in a tab anyway, identical to prior behaviour).

`TmcutPreviewPlayer.vue` now reads ONLY the seam: both media-surface computeds, the canvas-background style, and the proxy toggle button (`v-if="previewEngine.capabilities.proxyPreview"` instead of `isDesktop`). The doc-era `WebPreviewEngine` (WebCodecs canvas compositor) remains a named follow-up that implements this same interface — Phase 5 ticked with that scope note.

Gate battery: nuxt prepare+typecheck 0 · eslint 0 · store 14/14 · time-domain 7/7 · render graph 12/12 (behaviour unchanged by construction — same URLs on both runtimes, asserted by reading the old and new resolution paths).

# 155. R91 — Templates spec exposes the reactive-ref defect (QA round)

Roadmap content is backend-blocked, so the chain turned to QA-hardening: fill the last untested seam the flip left behind. `useTmcutTemplates` (save/instantiate/delete + the R88 `_v1`→`_v2` migration) had no test at all — the exact R82 defect family (a repeated or partial re-scale silently corrupting every user template).

## 155.1 The new spec

`tests/unit/tmcut_templates.spec.ts` (4 checks, `pnpm test:templates`, also added: `test:smoke`):

- legacy seconds templates scale to ticks EXACTLY once at import (module-level auto-load), persist under `_v2`, legacy key removed;
- store (ticks) → `saveCurrentProjectAsTemplate` keeps integer tick geometry and derives `durationTicks` from it;
- `createProjectFromTemplate` lands ticks back into a fresh project with correct `durationMs`;
- `deleteUserTemplate` persists.

## 155.2 The real defect it caught on first run

`createProjectFromTemplate` wrote `proj.canvas/.timeline` on the RAW object `createProject()` returned. Raw field writes bypass Vue's dependency tracking, so `totalDuration` kept its empty-project cached value (5s floor) and `saveProject()` stamped a wrong `durationMs` (5000 instead of 6000) into the freshly instantiated project — every template-created project would have persisted a wrong duration until the first edit. Fix: write through `currentProject.value` (the proxy write-throughs to the same raw target, so the returned `proj` stays live). The same raw-write pattern audited app-wide: no other offender (other `createProject` callers only push-route or use store actions).

## 155.3 Sweep results (no defect)

Post-flip epsilon audit: all 6 small-constant comparisons (`0.001/0.005/0.05/1e-9`) sit on already-decoded SECONDS values — correct by construction. Raw `(out-in)/speed` grep outside the oracle + render pipeline: only legitimate tick-math sites (trim drag math, store internals, decoded views). `tsconfig.test.json` is a tsx runtime config, never tsc'd (pre-existing, out of scope).

Gates: templates 4/4 NEW · store 14/14 · time-domain 7/7 · autocut_v2 4/4 · render 12/12 · nuxt typecheck 0 · eslint 0.

# 156. R92 — Quick-preset canvas lost: create-then-patch was a write race

Follow-up defect from the R91 raw-write audit, now fully diagnosed: `/tmcut` home's quick presets and template-preset strip created a project, then patched `.canvas` on the RAW object `createProject()` returned. Nothing re-saved, and the editor's `loadProject()` on mount reads disk/storage FIRST — it found the default-canvas mirror written by the create-save and showed every preset project as 1920x1080 regardless of the chosen ratio (vertical presets opened horizontal).

- `createProject(name, canvas?)` now takes the canvas AT creation so the first `saveProject()` already carries it; `applyQuickPreset`/`applyTemplatePreset` pass `{ width, height, fps }` and no longer touch the raw object (store spec check #15 pins the mirror contents, rational fps included).
- Remaining `createProject` callers audited: templates.vue (push-route), AI-script + autocut (`switchCanvas`, proxy path — reactive, saves) — safe.
- Note: the R91 §155.2 audit MISSED these two sites — its grep looked for `.timeline =`/`.durationMs =` mutations, preset pages patch `.canvas`. The correction to the §155.2 claim ("no other offender") is this section: the offenders were exactly the create → patch-raw → push-route flows, where the patch never persisted and no save ever followed. Rule of thumb recorded: anything that mutates a project after `createProject()` must go through a STORE ACTION, or pass data into creation.

Gates: store 15/15 · typecheck 0 · eslint 0.

# 157. R93 — Production build gate + tmcut partition lint-clean

Two gates that had never actually been enforced post-R88, both run for the first time in this round:

## 157.1 `nuxt build` (EXIT 0)

Typecheck proves types; only the bundler proves the whole graph resolves — path aliases, `#imports`, the `@tmcut-core` symlink through Vite, worker entries. After the biggest refactor of the project (R88 ticks flip) the production build had never been run. Result: clean, 32.5 MB output (12.3 MB gzip), no warnings touching tmcut. The Electron packaging path (`build:electron` = esbuild main + nuxt build + electron-builder) inherits this guarantee for its middle step.

## 157.2 Lint partition reality + tmcut cleanup

Full-repo `eslint .` has a PRE-EXISTING baseline of ~4.1 k problems (tools/admin/inbox pages etc.) — out of scope, but the tmcut partition (components/composables/pages/utils/tests) is now the standard: 82 problems found, ALL in `TmcutAiScriptModal.vue`, all pure template formatting (`max-attributes-per-line`, `html-indent`, closing-bracket rules) — the file predates lint awareness. `--fix` reformatted it (verified: attribute re-wrapping only, zero semantic change); tmcut partition is now **0 errors / 0 warnings**. Rule going forward: new tmcut code lints clean per-file (full-repo lint stays red-baselined; do not chase it).

Gates: nuxt build 0 · tmcut-partition eslint 0 · typecheck 0 · all 6 specs green (4/15/7/12/4/3).

# 158. R94 — History spec exposes the cross-project undo leak

Continuing the QA chain: the undo/redo stack (roadmap B8 coalescing, the app-JSON twin of core C15) had never been behaviour-tested — every earlier spec tested ops, none tested Ctrl+Z. `tests/unit/tmcut_history.spec.ts` (7 checks, `pnpm test:history`) now pins:

- undo restores the pre-mutation state, redo re-applies, neither switches project;
- B8 same-key burst (Inspector slider: coalesced push + N× `updateClip`, which never pushes itself) is ONE undo entry — one Ctrl+Z reverts the whole drag;
- a different key (same clip, next field) starts a NEW entry;
- `restoreHistorySnapshot` clearing `lastCoalesce` really breaks the burst (post-undo push is fresh even for the same key in the same millisecond);
- a fresh edit invalidates redo.

## 158.1 The real defect: history is module-level, projects are not

`undoStack`/`redoStack` are module state and snapshots carry only `{timeline, canvas}` — no project id. Nothing reset them on a project switch, so: edit project A, open/create/duplicate-to project B, press Ctrl+Z → A's timeline and canvas were transplanted into B (and auto-saved into B's file). The editor UI made this near-invisible (the clip count changed without any visible edit). Fix: `resetHistory()` (clears both stacks + `lastCoalesce`) called in every current-project swap — `loadProject`, `createProject`, `duplicateAsProject`. `applyRecovery`/`restoreSnapshot` deliberately keep the stack: same project id, same undoable stream (the load that opened the project already reset it).

Gates: history 7/7 NEW · store 15/15 · time-domain 7/7 · render 12/12 · templates 4/4 · typecheck 0 · lint 0.

# 159. R95 — Save lifecycle: pending writes followed the wrong project

Third QA round in the chain, same seam as R94: the 2 s-debounced disk save (`scheduleDiskSave` → `persistProjectToDisk`) captures NOTHING about the project it was scheduled for — it serializes `currentProject` at FIRE time. Web builds only lean on the localStorage mirror (written synchronously), but every project switch in Electron had a 2-second window where the pending write silently changed target.

`tests/unit/tmcut_save_lifecycle.spec.ts` (5 checks, `pnpm test:save`) pins the lifecycle with a raw-timer spy (only the store's fixed 2000 ms delay is tracked; handles keyed by their real objects, so flush/cancel are asserted deterministically, no sleeping): mirror written synchronously; outgoing project's pending edit survives a switch; delete cancels the pending save; deleting another project touches nothing.

## 159.1 What the spec forced into the open

Three switches simply DROPPED the pending edit of the outgoing project (the old file kept up-to-2 s of lost work), and `deleteProject` of the CURRENT project left its debounce timer armed — the late fire then re-created the project files the user had just deleted (disk resurrection; the mirror delete alone was not enough).

Fixes in the store:
- `loadProject` and `createProject` `flushDiskSave()` BEFORE replacing `currentProject` (fire-while-loading is harmless: the write goes to the outgoing id from its own payload);
- `duplicateAsProject` flushes the SOURCE project first (it swaps `currentProject` too);
- `deleteProject` of the current project clears `diskSaveTimer` and resets `saveStatus` to `idle` — no timer survives its project.

Gates: save 5/5 NEW · history 7/7 · store 15/15 · templates 4/4 · time-domain 7/7 · typecheck 0 · lint 0.

# 160. R96 — Ripple-mode insert behaviour pinned (and no defects found)

After save/history/history leaks were hunted and fixed, the next UI seam is the ripple-insert path: the store toggles `rippleMode` for drag/drops, and when the target offset collides, the drop must route through `insertClipRipple` from core (C2) so later clips on the same track slide right without gaps. Until now the behaviour lived only in the UI and in the core tests (`editing.test.mjs`) — no store-layer test guaranteed the `rippleMode` flag actually gates the bridge, nor that the fallback for locked tracks / empty gaps is correct.

## 160.1 The spec

`tests/unit/tmcut_ripple.spec.ts` (5 checks, `pnpm test:ripple`):

- plain (ripple OFF) → strict overlay, no shifts, no side-effects;
- ripple ON + collision → the newly dropped clip is created via the core `insertClipRipple` bridge (`applyV3Edit(v3 => insertClipRipple(...))`) and later clips on the same track are shifted right by exactly the inserted duration;
- ripple ON + empty gap → plain overlay fallback (no unnecessary shift);
- locked target track → core bridge refuses; store falls back to plain overlay so the drop never silently disappears (the fallback is already encoded in `addClipToTrack`, now proven by test);
- ripple is track-scoped: video ripple never touches audio items.

## 160.2 Finding

No defect. The existing `addClipToTrack` implementation already performs the collision check, calls `insertClipRipple` with `skipHistory:true` (history was already pushed for the mutation), and falls back to a plain `items.push` when the core op is rejected (locked track). The spec now pins the five corner cases that make the UI feel like CapCut.

Gates: ripple 5/5 NEW · save 5/5 · history 7/7 · store 15/15 · templates 4/4 · time-domain 7/7 · render 12/12 · typecheck 0 · lint 0.

# 161. R97 — Markers + snap pinned (roadmap B5)

The ruler marker + snap seam had never been behaviour-tested in the store layer. The UI exposed add/rename/delete markers and the playhead snap, but the only guarantees came from core unit tests — which run in a vacuum without the store’s `markerShim`, `ensureMarkers` live reference, the `secToTicks` ↔ `ticksToSec` boundaries, or the undo integration.

## 161.1 The spec

`tests/unit/tmcut_markers.spec.ts` (7 checks, `pnpm test:markers`):

- `addMarkerAt` creates a marker, persists to the mirror, and is undo/redo-able;
- `updateMarker` (label/colour) is a single undo entry;
- `removeMarkerById` deletes and is undoable;
- `snapTimeSec` correctly snaps to clip starts/ends, zero, and playhead;
- markers are first-class snap candidates — `snapTimeSec` sees them even when no clips exist, and when a marker sits closer than a clip edge it wins;
- snap threshold and ignore-ids are honoured (no cross-track leakage);
- markers round-trip via the localStorage mirror and survive `loadProject`.

## 161.2 Finding

No defect. The store’s shim `markerShim()` returns a `TmcutTimeline` whose `markers` array is **the same object** as `currentProject.value.timeline.markers`, so core `addMarker`/`removeMarker` mutations are immediately visible in the UI. `snapTimeSec` decodes tracks to v3, installs that same marker array, and forwards ticks/options. All boundaries stay in ticks — seconds only appear at the UI edge (`secToTicks` / `ticksToSec`).

Gates: markers 7/7 NEW · ripple 5/5 · save 5/5 · history 7/7 · store 15/15 · templates 4/4 · time-domain 7/7 · render 12/12 · typecheck 0 · lint 0.

# 162. R98 — Transitions pinned (roadmap B3/C5)

The last major UI seam in the core-ticks land is the transition DSL (roadmap B3 / core C5): applying a cross dissolve, wipe etc. shifts the clip left so its head overlaps the neighbour’s tail, and clearing restores the original cut. The store already routes through core (`applyTransition` / `clearTransition` / `canApplyTransition`) and validates *before* pushing history — but this contract had never been pinned in the store test suite.

## 162.1 The spec

`tests/unit/tmcut_transitions.spec.ts` (5 checks, `pnpm test:transitions`):

- `checkClipTransition` returns `ok=false` for a clip with no neighbour and leaves no history entry;
- `applyClipTransition` succeeds only for an adjacent neighbour, stores `transitionIn.duration` in TICKS, shifts the clip’s `offset` left by the duration, and is undoable/restorable via the history stack;
- `clearClipTransition` removes the transition and restores the original cut position (no stray undo when the probe fails);
- too-long duration (greater than the overlap the two clips can provide) is refused;
- `timelineTransitionCount` reflects the live number of clips carrying a non-zero `transitionIn.duration`.

## 162.2 Finding

No defect. The store already validates first (`checkClipTransition` → `canApplyTransition`), then pushes via `applyV3Edit`. The bridge preserves the duration field unchanged through the v1compat identity path. The spec now locks the five corner cases that make the UI/export badge trustworthy.

Gates: transitions 5/5 NEW · markers 7/7 · ripple 5/5 · save 5/5 · history 7/7 · store 15/15 · templates 4/4 · time-domain 7/7 · render 12/12 · typecheck 0 · lint 0.

# 163. R99 — Split / trim / close-gaps pinned (roadmap B2/B7/B9, core C1/C2)

The editing seam that touches every timeline operation is split/trim/gap-close: `splitClip`, `trimSelectedEdgeAt`, and `closeProjectGaps`. After the ticks flip these three were refactored but never behaviour-tested in the store layer. The spec pins the contracts that keep the timeline sane.

## 163.1 The spec

`tests/unit/tmcut_split_trim.spec.ts` (6 checks, `pnpm test:split-trim`):

- `splitClip` respects the 0.1 s margin, creates two pieces with correct `in/out/offset`, drops `transitionIn` on the tail, and refuses edge splits;
- margin enforcement is exact — splits within 0.1 s of either edge are rejected, no degenerate slivers;
- `trimSelectedEdgeAt` trims the selected clip edge with a margin guard, keeps duration > 0, and routes through core `trimClip` via `applyV3Edit`;
- `closeProjectGaps` pre-scans for gaps to avoid a no-op history push, then routes to core `closeGaps` and returns the number of TICKS closed;
- no-op case is a true no-op (items stay put, history not polluted);
- a combined split + trim + closeGaps flow keeps all fields integer TICKS and never produces negative durations.

## 163.2 Finding

No defect. The store already:
- converts UI seconds → ticks at the boundary;
- guards both split and trim with the 0.1 s margin;
- deletes `transitionIn` on the second piece after a split (core semantics);
- uses a pre-scan before pushing history for `closeProjectGaps`.

The spec now locks the six corner cases that make the editing feel solid.

Gates: split-trim 6/6 NEW · transitions 5/5 · markers 7/7 · ripple 5/5 · save 5/5 · history 7/7 · store 15/15 · templates 4/4 · time-domain 7/7 · render 12/12 · typecheck 0 · lint 0.

# 164. R100 — Consolidation: one runner, and the runner caught a rotted spec

Nine QA rounds later, the suite had grown to 13 specs plus two older ones — and the gate ritual was a hand-typed loop, which is exactly how rot hides. R100 adds `tests/unit/run-all.mts` (`pnpm test:tmcut`, `--smoke` opts into the real-FFmpeg renders): one process per spec (each installs global shims and the store is a module singleton, so isolation is a feature, not overhead), first-non-zero-exit propagation.

Its very first run caught a spec that had been BROKEN SINCE R88 AND NOBODY KNEW: `tmcut_phase2.spec.ts` still asserted `canvas.fps === 30`, but C16 made `normalizeCanvas` produce a rational `FrameRate` everywhere. The file was never wired into any script — outside the ritual, outside the sweep, red for ~12 rounds. Fix: assert `{ numerator: 30, denominator: 1 }` (the actual contract; the legacy-number input is still accepted and migrated). Lesson recorded: a spec nobody runs is a spec that lies — the runner is now the ritual.

Full-suite state (R100): `pnpm test:tmcut` → 14/14 green (ai-script 3 · autocut 4 · history 7 · markers 7 · phase15 14 · phase2 16 · render-graph 12 · ripple 5 · save 5 · split-trim 6 · store 15 · templates 4 · time-domain 7 · transitions 5). FFmpeg smoke 3/3 · core `node --test` 210/210 · core tsc 0 · core eslint 0 · boundaries PASS · i18n parity 2797/2797.

# 165. R101 — Groups & linked pairs pinned (roadmap B4 / core C9)

The last untested store seam: groups and linked pairs. The app selection is deliberately single-clip; the store expands it through core `expandRelated` so relatives always travel together — a design decision (CapCut parity) whose guarantees lived only in core unit tests. `tests/unit/tmcut_groups.spec.ts` (6 checks, `pnpm test:groups`) now pins the store layer:

- `toggleLinkSelection` links the selected clip with EVERY unlocked clip overlapping it in time, on any other track (shared `linkId`); non-overlapping and locked-track clips are excluded; no selection → `'none'`;
- a second toggle unlinks the whole pair (shared-linkId detection, not a fresh link);
- `groupSelection` groups the EXPANDED selection — a lone clip honestly fails (no relations), a linked pair reaches the 2-target minimum and shares one `groupId`;
- `ungroupSelection` dissolves the group the selection expands to; second call is a no-op (UI toast stays honest);
- `relatedOffsetsFor` returns the relatives' positions in STORE TICKS, excludes the dragged clip itself, integer everywhere — the drag handler's cross-track payload.

No defect found; the B4 wiring (expanded selection in every core call, locked-track exclusion done TWICE — once in the store guard, once in core) behaves exactly as designed.

Gates: groups 6/6 NEW · runner `pnpm test:tmcut` 15/15 · typecheck 0 · lint 0.
