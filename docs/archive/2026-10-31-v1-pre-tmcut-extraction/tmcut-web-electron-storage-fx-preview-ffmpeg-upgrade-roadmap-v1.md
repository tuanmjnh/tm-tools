# TMCut Upgrade Roadmap v1

## Cross-platform Web + Electron, Server Uploads, AI Provider Gateway, FX Preview Parity & FFmpeg Export

- **Status:** Proposed implementation specification for AI coding agents
- **Project:** TMCut
- **Primary goal:** Make TMCut usable as a full web application and as an Electron desktop application while sharing the same editing domain, asset contracts, effect definitions, and provider abstraction.
- **Important implementation rule:** Audit the repository before modifying it. Do not assume paths, framework versions, existing APIs, or that a feature is absent until the code has been inspected.

---

## 1. Product goals and non-goals

### 1.1 Goals

1. Support both deployment targets:
   - **Electron desktop:** local files, dialogs, local asset store, native FFmpeg process, and desktop-only capabilities through a narrow IPC bridge.
   - **Web:** browser file selection and upload through authenticated HTTP APIs to a server-side storage adapter; AI/provider access through a backend gateway; render through a server worker or a deliberately supported browser render mode.
2. Keep editing logic independent from Electron, Nuxt, the browser, Node.js, and FFmpeg.
3. Let users connect AI providers/models in both Web and Electron without putting long-lived provider API keys in browser code.
4. Make `TmcutFxThumb` show a meaningful animated representation of an effect, transition, filter, or animation—not merely a generic decorative animation.
5. Use one versioned effect definition and one parameter schema for UI controls, preview, timeline serialization, and FFmpeg export mapping wherever technically possible.
6. Produce predictable FFmpeg filter graphs with named intermediate streams, deterministic time ranges, validated parameters, and tests for every supported effect definition.
7. Support import/upload of user media and template/asset resources. Web deployment can use a persistent server directory, object storage, or a storage adapter selected by deployment configuration.
8. Keep a project editable after it has been created. Store stable asset IDs and logical storage keys rather than relying exclusively on absolute machine-specific paths.
9. Make uploads, generation, render and provider calls observable: progress, cancellation where supported, retry policy, errors, logs and persisted job status.
10. Preserve existing TMCut behavior where it already works. Do not rewrite working subsystems only to conform to this document.

### 1.2 Non-goals for the first milestone

- Do not build a full payment system in the first cross-platform milestone.
- Do not execute arbitrary JavaScript or shell scripts contained inside imported Marketplace packs.
- Do not promise pixel-perfect parity between every browser preview and every FFmpeg filter. Define support levels and mark approximations explicitly.
- Do not run unrestricted FFmpeg arguments supplied by an LLM, UI, or downloaded asset.
- Do not force all Web deployments to use local disk. The local-disk implementation is specifically for self-hosted servers with a persistent volume.
- Do not expose a generic filesystem, process-execution, or unrestricted IPC API to renderer/UI code.

---

## 2. Architecture decision

### 2.1 Recommended layered architecture

```text
TMCut UI (shared Vue components)
  ├── Editor Studio
  ├── Asset / Marketplace Browser
  ├── AI Assistant & Voice Controls
  ├── Template Studio
  └── FX Inspector / TmcutFxThumb
          |
          v
Application Use Cases / Command Bus
  ├── Project commands
  ├── Media import & asset management
  ├── Effect / transition / filter commands
  ├── AI plan review & apply
  ├── Render job management
  └── Template / batch generation jobs
          |
          v
Framework-independent TMCut Core
  ├── Project & Timeline schema
  ├── Media / Asset references
  ├── Effect Registry and parameter schemas
  ├── Timeline validation and migrations
  ├── Render Plan / Filter Graph IR
  └── Capability and compatibility checks
          |
          v
Platform Ports / Interfaces
  ├── IFileDialog
  ├── IMediaStorage
  ├── IAssetCatalog
  ├── IProviderGateway
  ├── IRenderBackend
  ├── IJobQueue / IJobStatus
  ├── ISecretStore
  └── IProjectRepository
          |
          +---------------------------+
          |                           |
          v                           v
Electron Adapters                 Web Adapters
  ├── Main process IPC              ├── HTTP API client
  ├── Local filesystem              ├── Server upload API
  ├── Local FFmpeg                  ├── Persistent local-disk storage OR object storage
  ├── Local job worker              ├── Server FFmpeg worker
  └── OS secure storage             └── Server-side provider gateway/secrets
```

### 2.2 Core architectural rule

**UI and Core must not directly import Electron APIs, Node filesystem APIs, server-only modules, or raw FFmpeg command builders.** They call typed interfaces/use cases. Electron and Web provide implementations of those interfaces.

Use dependency inversion. The same operation, for example `importMedia`, should have identical domain meaning but different infrastructure implementations:

- Electron: `FileDialogAdapter` selects a local file, `DesktopMediaStorageAdapter` imports it into the local asset store, and the renderer receives an asset ID/metadata result over IPC.
- Web: browser `<input type="file">` or drag-and-drop obtains a `File`; `HttpMediaStorageAdapter` uploads it to the server or directly to a configured object store through a server-issued, short-lived upload grant; the UI receives an asset ID/metadata result.

Do not write code such as `if (isElectron) fs.copyFile(...)` inside Vue pages. Put platform branching in adapter registration and use-case composition.

### 2.3 Suggested package/folder structure

Adapt to the current repository; do not force a monorepo if it is not one already.

```text
packages/
  tmcut-core/
    project/
    timeline/
    media/
    effects/
    transitions/
    filters/
    animations/
    render-plan/
    commands/
    validation/
    migrations/
    ports/
  tmcut-ffmpeg/
    compiler/
    filters/
    graph-ir/
    capabilities/
    probes/
    fixtures/
  tmcut-provider-contracts/
    llm/
    image/
    video/
    speech/
    music/
  tmcut-shared-ui/                 # optional, only if current structure benefits
    components/

app/                               # existing Vue/Nuxt/Vite app
  components/
    effects/TmcutFxThumb.vue
    effects/FxInspector.vue
    media/MediaImportDialog.vue
    providers/ProviderSettings.vue
  composables/
  services/

platforms/
  electron/
    main/
    preload/
    adapters/
  web/
    adapters/

server/                            # Nuxt/Nitro or current backend equivalent
  api/v1/media/
  api/v1/providers/
  api/v1/render-jobs/
  api/v1/asset-catalog/
  services/storage/
  services/providers/
  services/jobs/
  workers/render/
```

If the codebase currently uses a different directory layout, keep it and create equivalent boundaries instead of making a disruptive file move.

---

## 3. Platform behavior: Electron versus Web

### 3.1 Capability matrix

| Capability | Electron desktop | Web app |
|---|---|---|
| Select local file | Native dialog via main-process IPC | Browser file picker/drag-drop |
| Import a file | Copy/reference file into local asset store according to policy | Upload using HTTP API or a server-issued direct-upload grant |
| Store user media | Local app-data directory; optionally cloud sync | Persistent server directory for self-hosted Node OR object storage |
| Run FFmpeg | Native/bundled FFmpeg process in main/utility/worker layer | Server-side FFmpeg worker recommended for full export; optional browser backend only where explicitly supported |
| Provider credentials | OS secure store or server-side account connection | Server-side secret store/encrypted credentials; never expose private keys to browser |
| AI requests | Prefer shared provider gateway; optional local providers through a dedicated adapter | Backend Provider Gateway; browser calls app API, not vendor secret keys |
| Preview | Browser-based preview engine inside renderer | Browser-based preview engine |
| Background jobs | Local persisted job runner | Server queue/worker with persisted job state |
| Offline media | Yes for locally present assets | Only for already downloaded/cached media and supported project data |
| Cloud library/Marketplace | API/catalog + downloaded local packs | API/catalog + streamed preview/direct or proxied downloads |

### 3.2 Electron IPC requirements

- Use Electron's `contextIsolation` and a narrow preload `contextBridge` API.
- Expose purpose-built methods such as `media.openDialog`, `media.import`, `render.start`, `render.cancel`, `render.getStatus`, `storage.getCapabilities`. Do not expose raw `ipcRenderer`, Node `fs`, arbitrary path access or arbitrary shell execution.
- Validate the calling window/webContents and every IPC payload on the main side.
- Validate paths and constrain writes to approved roots, except explicit user-selected export destinations.
- Return serializable DTOs, not Node streams, file handles, Electron objects or other non-serializable runtime values.
- For long-running work, return a `jobId` immediately and expose progress/status events or polling. Do not keep a single IPC call open for a multi-minute render.
- Main/utility process owns filesystem and FFmpeg execution. Renderer only receives status/metadata and invokes allowed commands.

Official reference: https://www.electronjs.org/docs/latest/tutorial/ipc

### 3.3 Web upload to an app-server directory

Yes, a Web version can upload files to a folder on the application server **if the application is deployed to a persistent Node server/container with a mounted persistent volume**.

Use a configurable storage driver:

```ts
type StorageDriverName = 'local-disk' | 'supabase-storage' | 's3-compatible';

interface StorageConfig {
  driver: StorageDriverName;
  localRoot?: string;       // server-only absolute path, not public/
  maxUploadBytes: number;
  allowedMimeTypes: string[];
}
```

For self-hosted local-disk deployments:

- Configure a path such as `/var/lib/tmcut/uploads` in production, or a local `.data/tmcut/uploads` path only for development.
- Store uploaded files outside the source tree and outside Nuxt/Vite static `public/` by default.
- Keep the path configurable using environment variables such as `TMCUT_DATA_DIR`; do not hardcode a developer-machine path.
- Use an internal generated storage key (`users/{userId}/projects/{projectId}/media/{assetId}/{safeName}`) rather than directly concatenating user-provided filenames.
- Upload to a temporary/staging path, validate and hash the file, then atomically move it into its final location.
- Persist metadata and upload status in the database.
- Back up both the database and mounted volume.

**Deployment warning:** serverless platforms and containers with ephemeral filesystems may delete local files on restart or redeploy; multiple server instances may also have different local disks. Do not treat a temporary runtime directory as durable storage. For those deployments, use Supabase Storage or S3-compatible object storage such as Cloudflare R2. The application can still present the same `IMediaStorage` interface.

Nuxt server routes can be implemented under `server/api/**`; keep filesystem and storage logic in server-only services. Reference: https://nuxt.org.cn/docs/4.x/directory-structure/server

### 3.4 Upload API contract

Example endpoints—adapt names to existing API conventions:

```text
POST   /api/v1/media/uploads                  Create upload session / reserve quota
PUT    /api/v1/media/uploads/:uploadId/content Upload bytes (small-file/local-disk path)
POST   /api/v1/media/uploads/:uploadId/complete Validate, hash and finalize upload
GET    /api/v1/media/:assetId                 Read metadata
GET    /api/v1/media/:assetId/content         Authorized preview/download or redirect
DELETE /api/v1/media/:assetId                 Delete only if authorized and unreferenced
GET    /api/v1/media/:assetId/status           Scan/probe/index status
```

For large files, use a resumable upload protocol or direct object-storage upload instead of forcing all bytes through a single ordinary request. Supabase documents TUS resumable uploads, especially for files above 6 MB or unreliable networks: https://supabase.com/docs/guides/storage/uploads/resumable-uploads

If using R2/S3-compatible storage, create short-lived signed upload/download URLs on the server. Treat signed URLs as bearer credentials and use suitable expiration. Reference: https://developers.cloudflare.com/r2/api/s3/presigned-urls/

### 3.5 Upload security and validation

- Authenticate every upload and enforce user/project quotas server-side.
- Allowlist types by feature (video/audio/image/font/project archive); do not trust extension or browser `Content-Type` alone.
- Inspect file signatures where possible, then probe media using a bounded FFprobe job.
- Apply size limits, request timeouts, rate limits, storage quotas and per-user concurrency limits.
- Normalize names for display but use generated IDs for storage keys. Prevent path traversal, overwrite collisions and symlink escapes.
- Do not store uploaded assets in a public static directory if they may be private.
- Do not render or execute uploaded HTML/JS/SVG content as trusted application UI.
- Never extract ZIP/archive paths without blocking absolute paths and `../` traversal. Limit archive entry count, expanded size and compression ratio.
- Consider malware scanning for public-facing uploads, especially if community packs are accepted.
- For private assets, enforce access on each download/preview request or use short-lived signed URLs.
- Provide user-visible limits and cleanup policies for abandoned incomplete uploads.

---

## 4. AI provider/model integration for Web and Electron

### 4.1 Provider Gateway

Build or reuse a server-side gateway. The UI should call an application endpoint; the endpoint resolves provider, model, capabilities, user/app grants, limits and credential source.

```text
Web/Electron UI
  -> IProviderGateway
    -> TMCut API / TM Hub connection grant
      -> Provider Adapter
        -> vendor API
      -> Persisted Job / Usage / Result
```

Keep these concepts separate:

- **Provider definition:** provider type, base URL, API capabilities, authentication mode, discovery support.
- **Connection:** configured provider endpoint/account, owning app/user scope, health state.
- **Credential:** encrypted server-side secret or OS secure-store reference. Never return secret values to browser UI.
- **Model catalogue:** provider model IDs, capabilities, limits, availability and last sync status.
- **Capability mapping:** text/LLM, vision, image generation, video generation, audio generation, speech-to-text, text-to-speech, embeddings.
- **Usage/Job record:** model, operation, input/output size, estimated and actual usage/cost if exposed by provider, status and error classification.

### 4.2 Required provider interfaces

```ts
interface ProviderAdapter {
  id: string;
  getCapabilities(connectionId: string): Promise<ProviderCapability[]>;
  listModels?(connectionId: string, cursor?: string): Promise<ModelPage>;
  healthCheck(connectionId: string): Promise<HealthResult>;
}

interface TextModelAdapter extends ProviderAdapter {
  generateText(input: TextGenerationRequest): Promise<TextGenerationResult>;
}
interface ImageGenerationAdapter extends ProviderAdapter {
  createImageJob(input: ImageGenerationRequest): Promise<ProviderJob>;
}
interface VideoGenerationAdapter extends ProviderAdapter {
  createVideoJob(input: VideoGenerationRequest): Promise<ProviderJob>;
  getJob(jobId: string): Promise<ProviderJobStatus>;
  fetchResult(jobId: string): Promise<ProviderOutput[]>;
}
interface SpeechAdapter extends ProviderAdapter {
  transcribe(input: SpeechToTextRequest): Promise<TranscriptResult>;
}
```

These are conceptual contracts. Fit them to the current TypeScript conventions and avoid creating duplicate interfaces if equivalent contracts exist.

### 4.3 Provider job lifecycle

Persist asynchronous job states such as:

`queued -> validating -> submitted -> running -> downloading_result -> succeeded | failed | canceled`

Also support `retry_wait` where relevant. Persist provider job ID, attempt count, timestamps, redacted diagnostics, and result asset IDs. Do not persist API keys or secrets in ordinary job logs.

- Implement bounded retries for transient failures (timeouts, 429, temporary provider errors), with backoff and jitter.
- Do not blindly retry non-idempotent generation requests unless the provider supports idempotency or the adapter can establish a safe strategy.
- Enforce concurrency and budget quotas before sending work to a provider.
- Handle provider-specific output download URLs as expiring; copy results promptly into TMCut-owned storage when permitted.
- For long tasks, use a durable server queue/worker rather than relying on the browser tab staying open.
- Use SSE/WebSocket or polling for status; persisted jobs remain recoverable after page refresh.

### 4.4 Secrets and BYOK

- Browser code must never contain platform-wide provider secrets.
- For BYOK, submit the key to a server-side secret endpoint over TLS, validate the provider connection, encrypt at rest or store in a managed secret vault, and return only masked metadata.
- On Electron-only local providers, use an OS secure storage adapter; still avoid writing credentials to the project JSON.
- Include connection-level and project-level permission checks; applications should be granted only capabilities they need.
- Add per-user, per-application and per-provider quotas.

---

## 5. Shared Effect / Transition / Filter / Animation model

### 5.1 Why a registry is required

`TmcutFxThumb`, the FX Inspector, Timeline Core, project serialization and FFmpeg export must not maintain separate definitions for the same effect. Use a versioned registry/manifest plus trusted runtime adapters.

A registry entry should define:

- stable `definitionId` and `definitionVersion`;
- `category`: `effect | transition | filter | animation`;
- display metadata, thumbnail/demo asset and searchable tags;
- applicability: clip, adjacent clips, text/shape overlay, audio clip, track or project;
- supported actions/directions, such as `in`, `out`, `loop`, `between`, `overlay`, `grade`;
- parameter schema, defaults, validation ranges and inspector grouping;
- preview strategy and preview capabilities;
- render adapter type and FFmpeg capability requirements;
- required assets/fonts/LUTs and dependency versions;
- compatibility and fallback policy;
- export support state (`supported`, `approximate`, `unsupported`), not an unverified promise.

Downloaded packs should be declarative data. Do not execute arbitrary JavaScript from a Marketplace pack. Runtime code that compiles an effect to a filter graph should be part of signed/trusted TMCut code, with pack manifests selecting known definition IDs and parameters.

### 5.2 Conceptual TypeScript contract

```ts
type FxCategory = 'effect' | 'transition' | 'filter' | 'animation';
type FxAction = 'in' | 'out' | 'loop' | 'between' | 'overlay' | 'grade';
type ExportSupport = 'supported' | 'approximate' | 'unsupported';

interface FxDefinition {
  definitionId: string;
  definitionVersion: number;
  category: FxCategory;
  title: string;
  description?: string;
  tags: string[];
  appliesTo: Array<'clip' | 'adjacent-clips' | 'text' | 'overlay' | 'audio' | 'track'>;
  allowedActions: FxAction[];
  defaultDurationMs?: number;
  parameterSchema: FxParameterSchema;
  preview: {
    strategy: 'css' | 'canvas' | 'webgl' | 'video-sample' | 'ffmpeg-proxy';
    sampleAssetId?: string;
    supportsReducedMotion?: boolean;
    fidelity: 'exact' | 'approximate' | 'illustrative';
  };
  render: {
    adapter: 'ffmpeg-filter' | 'ffmpeg-filtergraph' | 'overlay-asset' | 'generated-intermediate' | 'none';
    support: ExportSupport;
    requiredFilters?: string[];
    minFfmpegVersion?: string;
  };
  dependencies?: Array<{ assetId: string; required: boolean }>;
}

interface TimelineFxInstance {
  instanceId: string;
  definitionId: string;
  definitionVersion: number;
  category: FxCategory;
  targetIds: string[];
  action: FxAction;
  startMs: number;
  durationMs: number;
  params: Record<string, unknown>;
  keyframes?: FxKeyframe[];
  enabled: boolean;
  order: number;
}
```

Use a proper discriminated union and typed parameter schema where feasible. The generic example above illustrates required concepts and is not intended to replace a fully typed domain model.

### 5.3 Time and action semantics

- Store project/timeline time in integer ticks or integer milliseconds with a single documented conversion policy; export calculations must ultimately align with frame rate/time base.
- A clip `in` animation begins at its clip-local start; an `out` animation resolves relative to clip-local end; a `loop` repeats over an explicitly defined interval; a `between` transition uses two adjacent clips and has handles/overlap constraints; a `grade` affects visual color across its assigned interval.
- Clarify whether `startMs` is project time or clip-local time. Prefer explicit fields such as `timelineStart` and `clipLocalStart` rather than ambiguous values.
- Resolve keyframes against a normalized timeline clock before generating preview or FFmpeg output.
- Parameter values must be clamped/validated by the schema. A provider or LLM cannot insert arbitrary FFmpeg filter expressions.
- Sort multiple effects deterministically by timeline interval and defined stack order; specify whether compositing effects operate before/after color filters, transforms and overlays.

### 5.4 Effect categories and FFmpeg mapping

Use a render compiler that maps known definitions to typed filter-graph fragments; do not concatenate arbitrary strings from user data.

| Category | Example actions | Common FFmpeg strategy | Requirements |
|---|---|---|---|
| Color filter | grade | `eq`, `curves`, `hue`, `colorbalance`, `lut3d` where supported | Map normalized UI values to validated FFmpeg parameters and color-space assumptions |
| Blur/sharpen | loop or full clip | `gblur`, `unsharp` | Handle limits, order and preview performance |
| Vignette/grain/glow-style effect | full clip or animated | supported native filters, compositing overlays, or generated intermediates | Declare exact vs approximate parity and required assets |
| Crossfade/dissolve | `between` | `xfade` for video and `acrossfade` for audio where appropriate | Two inputs, compatible frame rate/size/time base, valid overlap and offsets |
| Wipe/slide/zoom transition | `between` | supported `xfade` transition modes or custom validated graph | Define direction, duration, offset and clip handles |
| Text/shape animation | `in`, `out`, `loop`, `overlay` | `drawtext`, `overlay`, alpha-enabled image/sequence, or generated intermediate | Font availability, escaping, alpha, motion/keyframe mapping |
| Transform/pan/zoom | `in`, `out`, `loop` | `scale`, `crop`, `zoompan`, `overlay` and timestamp expressions as appropriate | Coordinate system, output size, frame rate and timebase are explicit |
| Chroma key | full clip/overlay | `chromakey` or `colorkey` depending input/color needs | Parameter validation and alpha handling |
| Audio volume/fade | `in`, `out`, full audio clip | `volume`, `afade`, `acrossfade` | Gain units, clipping protection and duration boundaries |
| Unsupported custom shader | any | render adapter `none` or `generated-intermediate` if a valid asset pipeline exists | Never claim FFmpeg support without an implemented render path |

Reference FFmpeg filter documentation: https://www.ffmpeg.org/ffmpeg-filters.html

### 5.5 FFmpeg graph compiler design

Implement an intermediate representation (IR) and compiler stages:

1. **Input resolution:** resolve asset IDs to authorized filesystem paths or worker-local staged files; probe streams, dimensions, duration, frame rate, sample rate and pixel formats.
2. **Timeline normalization:** order clips, split intervals, compute trims, offsets, transitions, keyframes and output duration.
3. **Capability validation:** ensure required FFmpeg filters are actually present in the bundled/server FFmpeg build; fail early or choose a documented fallback.
4. **Graph construction:** create uniquely named labels (`[v0]`, `[v1]`, `[a0]`…), define every graph edge once, and enforce that labels are neither duplicated nor left unintentionally unconnected.
5. **Parameter serialization:** validate numeric bounds, quote/escape text for filtergraph syntax, handle paths safely, and keep file paths separate from shell interpolation.
6. **Output mapping:** explicitly map final video/audio labels; set codec, pixel format, frame rate, audio codec, output dimensions and other export settings via validated configuration.
7. **Execution:** spawn FFmpeg without shell interpolation where possible, capture stderr and progress output, store logs, support cancellation and clean temporary outputs.
8. **Verification:** probe output, verify stream presence/duration/dimensions, check exit code and output file integrity before marking success.

Do not force all edits into one gigantic fragile string. Build a typed graph/command representation and serialize it only at the final boundary. Prefer predictable render plans that can be saved in diagnostics for reproduction.

### 5.6 Preview/export capability matrix

Every effect must declare which mode is supported:

- `previewExact`: same underlying logic or a proven equivalent.
- `previewApproximate`: UI approximation with an explicit fidelity flag.
- `exportSupported`: compiler exists and is covered by render tests.
- `exportUnsupported`: UI should show a clear warning and should not silently drop the effect.

If browser preview and FFmpeg output cannot match exactly, expose the discrepancy in UI/metadata. Do not label an animation as supported merely because it moves in a thumbnail.

---

## 6. Requirements for `TmcutFxThumb`

### 6.1 Responsibilities

`TmcutFxThumb` should be a reusable preview renderer for the effect marketplace/panel. It should communicate the *actual behavior* of a registered effect, filter, transition or animation and make its action/direction recognizable.

It should not be a disconnected CSS animation that looks impressive but does not correspond to the effect selected for the timeline.

### 6.2 Recommended component contract

Adapt prop names to existing code, but preserve equivalent semantics:

```ts
interface TmcutFxThumbProps {
  definitionId: string;
  definitionVersion?: number;
  params?: Record<string, unknown>;
  action?: FxAction;
  previewState?: 'idle' | 'playing' | 'paused' | 'selected';
  size?: 'sm' | 'md' | 'lg';
  reducedMotion?: boolean;
  sourceAssetId?: string;
  showBadge?: boolean;
}
```

The component should resolve the effect definition from the registry and pass its current `action` and sanitized parameters into the registered preview adapter. Avoid a giant switch statement duplicating each effect's business logic inside the component.

### 6.3 Preview behavior by category

- **Effects:** render a stable visual sample (prefer a representative image/video frame) with the active visual effect. Animate only if the effect itself is time-varying.
- **Transitions:** show a pair of clips/frames or divided preview. Animate `progress` from 0 to 1 using the selected transition's direction and duration. `between` must be recognizably different from a full-clip filter.
- **Filters:** show before/after or a short loop of the same source image/video with the color/pixel transform applied. For static filters, the thumb may be static; do not create unrelated motion merely to make every thumbnail animate.
- **Animations:** demonstrate the target (text, shape, overlay or image) moving/scaling/fading according to the actual in/out/loop parameters and easing.
- **Audio effects:** use waveform/level visualization or a clear icon/visualizer; optionally play a short authorized preview only when the user explicitly triggers playback. A thumbnail must not unexpectedly autoplay sound.

### 6.4 Animation lifecycle and performance

- Pause or release animation work when outside the viewport, hidden, unmounted or not selected/hovered according to UX design.
- Respect `prefers-reduced-motion` and an explicit reduced-motion prop.
- Avoid each card continuously running expensive rendering loops. Use CSS for simple previews; Canvas/WebGL/video samples only where needed.
- Prevent layout shift; give the component a deterministic aspect ratio and poster/fallback.
- Avoid requiring all thumbnails to download high-resolution assets. Use small thumbnails or short preview proxies.
- Add accessible labels and do not use color alone to distinguish action or transition direction.
- Add an obvious loading/error state when a preview asset is missing, blocked or still being generated.
- Define whether animation starts on hover, focus, click-to-play or selection. Keep it consistent across the editor and asset browser.

### 6.5 Preview adapter contract

```ts
interface FxPreviewContext {
  definition: FxDefinition;
  params: Record<string, unknown>;
  action: FxAction;
  progress01: number; // normalized [0, 1]
  width: number;
  height: number;
  source?: PreviewSource;
}

interface FxPreviewAdapter {
  canPreview(definition: FxDefinition): boolean;
  renderPreview(context: FxPreviewContext): PreviewResult;
}
```

For a Vue-driven interactive component, use a reactive/controller equivalent rather than requiring this exact object shape. The design goal is that preview adapter consumes the same definition and validated params as the export compiler.

---

## 7. UI audit checklist: inspect current app before designing changes

Ask the coding agent to open the real codebase and map these areas rather than inventing replacement pages:

1. Current Editor Studio layout and responsive behavior.
2. Asset/FX panel navigation, category tabs, search, filters and empty/loading/error states.
3. `TmcutFxThumb` source and all call sites; determine where its action and params come from.
4. Effect/transition/filter/animation definition source and duplication across UI and export code.
5. Inspector controls and whether they edit the same parameter object shown in the thumbnail.
6. Timeline representation, clip boundaries, effect tracks, keyframe units, transition overlaps and serialization/migrations.
7. Preview engine path and its effects implementation.
8. FFmpeg export pipeline, filtergraph construction, output maps, log/progress parsing and cancel behavior.
9. Electron IPC/preload and file import flows.
10. Existing Web build/deployment mode and server API routes, if present.
11. Provider settings, secret management, model list and job records.
12. Existing tests, docs, TODOs and UI test findings.

Deliver an audit report first with file paths and code references; then implement the fixes in small, verifiable phases.

---

## 8. API shape proposal

Adapt to existing API naming/version conventions and avoid creating duplicate endpoints.

### 8.1 Media and asset APIs

```text
GET    /api/v1/assets?kind=&q=&cursor=
GET    /api/v1/assets/:assetId
POST   /api/v1/media/uploads
PUT    /api/v1/media/uploads/:uploadId/content
POST   /api/v1/media/uploads/:uploadId/complete
GET    /api/v1/media/:assetId/status
GET    /api/v1/media/:assetId/content
DELETE /api/v1/media/:assetId
```

Metadata example:

```json
{
  "assetId": "asset_01J...",
  "projectId": "project_01J...",
  "kind": "video",
  "originalName": "intro.mp4",
  "mimeType": "video/mp4",
  "sizeBytes": 12345678,
  "durationMs": 8400,
  "width": 1920,
  "height": 1080,
  "storageProvider": "local-disk",
  "storageKey": "users/u1/projects/p1/media/asset_01J/intro.mp4",
  "sha256": "...",
  "status": "ready"
}
```

Do not expose the server's absolute filesystem path in API responses. In Electron, local path resolution can remain local to the main process; project JSON should reference the stable `assetId` or a portable logical locator.

### 8.2 Effects registry APIs

Can be local registry imports if definitions are bundled, with APIs only needed for Marketplace definitions:

```text
GET    /api/v1/fx-definitions?category=&q=&cursor=
GET    /api/v1/fx-definitions/:definitionId
GET    /api/v1/fx-definitions/:definitionId/preview
```

Only publish definitions whose preview/export compatibility has been checked. Marketplace packs can supply metadata, parameters, presets and sample assets; trusted TMCut runtime code supplies executable preview/render adapters.

### 8.3 Render APIs for Web

```text
POST   /api/v1/render-jobs                Validate render plan and create job
GET    /api/v1/render-jobs/:jobId         Get state/progress
POST   /api/v1/render-jobs/:jobId/cancel  Request cancellation
GET    /api/v1/render-jobs/:jobId/output  Authorized output reference/download
```

`POST render-jobs` must validate the project/render plan again on the server. Never trust a client-provided raw FFmpeg command line.

### 8.4 Provider APIs

```text
GET    /api/v1/provider-connections
POST   /api/v1/provider-connections
POST   /api/v1/provider-connections/:id/test
GET    /api/v1/provider-connections/:id/models
POST   /api/v1/ai-jobs
GET    /api/v1/ai-jobs/:jobId
POST   /api/v1/ai-jobs/:jobId/cancel
```

Use the existing TM Hub connection/authorization model if available. Keep provider secrets server-side and return masked credential status only.

---

## 9. Project storage and migration rules

- Keep `projectId`, `assetId`, `effectInstanceId`, `definitionId` and version identifiers stable.
- New projects should serialize effect `definitionId`, `definitionVersion`, normalized parameters, action, target IDs, timeline intervals and keyframes.
- Do not store arbitrary provider API keys or private secret material in project JSON.
- Avoid relying on absolute paths. If compatibility requires old paths, add a project migration/resolver that maps legacy references to stable assets without breaking old projects.
- For projects transferred between Electron and Web, define an explicit “package/upload project media” flow that reports total bytes and asks permission before upload.
- If a project opens and an asset is missing, show a missing-media state and options to relink, re-download or render with a declared fallback; never silently substitute a random asset.
- Preserve old effect-definition versions when possible. If not compatible, run an explicit migration that preserves original params and records a migration diagnostic.
- Add schema migrations and round-trip serialization tests before changing project data structures.

---

## 10. Testing and acceptance criteria

### 10.1 Architecture and platform tests

- Shared Core tests run without Electron and without a browser DOM.
- The same project fixture is loaded in Electron and Web and resolves timeline/media/effects consistently.
- Electron uses only approved IPC channels; renderer cannot request arbitrary path access or shell commands.
- Web upload tests cover authentication, project ownership, quotas, invalid files, interrupted uploads, duplicate names and retry completion.
- Local-disk storage writes outside public/static directories and survives process restart when run with a persistent volume.
- Object-store driver passes the same storage contract tests as local disk.
- Provider secrets never appear in browser bundles, logs, project files or error messages.

### 10.2 `TmcutFxThumb` tests

For each registered definition/action combination:

- The thumbnail resolves by stable `definitionId` and version.
- The preview visibly responds to changed parameters.
- `in`, `out`, `loop`, `between`, `overlay` and `grade` (where permitted) produce intended semantics, not a generic shared animation.
- Missing preview assets show a graceful fallback.
- Reduced motion and offscreen pause behavior work.
- Static filters are allowed to remain static.
- Expensive preview assets are lazy-loaded and do not cause layout shift.

### 10.3 FFmpeg compile/render tests

For every `exportSupported` effect:

1. Unit test validates the generated graph IR and expected nodes/edges.
2. Integration test invokes the exact FFmpeg build intended for that platform or records capability differences.
3. Generate a short deterministic fixture clip containing a visible frame/time marker.
4. Apply each supported action and verify FFmpeg exits successfully, all streams are present, output duration and dimensions are within expected tolerance, and output can be decoded.
5. For transitions, test both inputs, direction, duration, transition offset, clip handles and audio behavior.
6. For keyframed animations, test start, middle and end frame behavior.
7. For text, test font availability, Unicode/Vietnamese, escaping and fallback.
8. Test chains of effects and graph label uniqueness.
9. Snapshot the final graph representation in tests; avoid brittle full-command string snapshots alone.
10. Unsupported effects must fail validation with a clear user-facing message, not silently disappear.

### 10.4 Minimum Definition of Done

- Web can import/upload an allowed media file and then see it in the asset browser after refresh.
- Electron can import a file through the native bridge and resolve it by the same domain asset interface.
- Web can start an authenticated AI/provider job without exposing provider secrets to the client.
- Web render jobs persist across page refresh and show progress/errors.
- The same versioned effect definition drives thumbnail preview metadata, inspector schema and FFmpeg compiler selection.
- All advertised supported effects have a passing render test.
- An FX thumbnail does not imply export support where none exists.
- Project references remain stable across restart and storage-driver change; missing assets are handled visibly.
- Upload, render and provider jobs have bounded resource use, cancellation semantics where feasible, and useful diagnostics.
- Existing core editing flows pass regression tests.

---

## 11. Implementation phases

### Phase 0 — Repository audit and baseline

- Inspect package manager, framework, Nuxt/Vite version, Electron configuration, directories, current render pipeline and existing API services.
- Find `TmcutFxThumb`, every call site, effect data models and actual FFmpeg export mappings.
- Map current gaps without changing code yet.
- Save audit findings into a project doc such as `docs/architecture/tmcut-cross-platform-fx-audit.md`.
- Record tests/build commands and establish a baseline.

**Exit criteria:** file-path-based system map, known regressions, current behavior screenshots or test fixtures, prioritized findings.

### Phase 1 — Core contracts and adapters

- Add or refactor `IMediaStorage`, `IRenderBackend`, `IProviderGateway`, `IProjectRepository` and job contracts.
- Keep use cases independent from Electron and web runtime.
- Add schema versions and migrations for asset/effect references.
- Add contract tests.

**Exit criteria:** Electron still passes existing workflows; Core unit tests run without Electron.

### Phase 2 — Electron adapter hardening

- Audit preload/IPC exposure.
- Consolidate filesystem operations under main-process services.
- Add path validation, progress messages, error codes and cancellation.
- Adapt local FFmpeg runner to shared render-job contract.

**Exit criteria:** no unrestricted IPC/fs exposure; import and export regression tests pass.

### Phase 3 — Web Media API and storage

- Implement browser file selection and upload UI.
- Add storage drivers: persistent `local-disk` first for self-hosted deployments, object storage driver for scalable/ephemeral deployments.
- Add upload session, progress, retry, hash verification, FFprobe metadata and DB records.
- Document `TMCUT_DATA_DIR`, persistent-volume mount and backup/restore.

**Exit criteria:** upload survives page refresh and server restart when backed by persistent disk; unauthorized users cannot access private media.

### Phase 4 — Server-side provider gateway and jobs

- Reuse the existing TM Hub connection model if present.
- Add model capability and connection health display.
- Persist provider jobs, enforce quota and redact logs.
- Add worker/status notifications.

**Exit criteria:** a web user can start and monitor one supported AI job without a provider key in the client bundle.

### Phase 5 — Effect Registry and FFmpeg compiler IR

- Create the registry format and parameter validation.
- Centralize render adapters and FFmpeg capability checks.
- Implement only a small verified subset first (for example: fade, dissolve/crossfade, basic color grade, blur, text fade/slide), selected after auditing existing code.
- Add graph compiler and deterministic tests.

**Exit criteria:** one effect definition maps consistently to inspector params, preview config and tested export graph.

### Phase 6 — `TmcutFxThumb` preview parity

- Replace generic/unrelated thumbnail animations with registry-driven preview adapters.
- Add type-aware preview for filter/effect/transition/animation/audio.
- Add action semantics, reduced motion, lazy-loading, offscreen pause and visible fidelity/export status.
- Test every published preview definition.

**Exit criteria:** thumbnails are recognizable representations of actual effect behavior; no claim of export support without a passing render path.

### Phase 7 — Web rendering and project portability

- Implement durable server render queue and worker.
- Add project media packaging/upload option between Electron and Web.
- Add authorized output download and cleanup lifecycle.
- Compare output profiles and FFmpeg build capabilities.

**Exit criteria:** web user can upload a project/media, render through the server worker and download output, with persisted job status.

### Phase 8 — UI polish and performance

- Review responsive layout, loading/error/empty states, large-library scrolling, thumbnail loading, keyboard accessibility and theme consistency.
- Add real feature-level UI tests rather than checking only that a page loads.
- Record before/after screenshots and known limitations.

**Exit criteria:** core workflows are usable on supported desktop/mobile browser breakpoints and regressions are documented.

---

## 12. AI coding agent execution policy

The coding agent must:

1. Read repository instructions (`AGENTS.md`, README, package scripts and relevant docs) before editing.
2. Inspect actual implementation and report exact paths/line references where possible.
3. Separate facts observed in code from assumptions/recommendations.
4. Avoid broad refactors before a minimal vertical slice proves the adapter pattern.
5. Preserve current package conventions, state management, tests and visual design language.
6. Implement the smallest end-to-end slice first: choose a file -> store it -> show asset metadata -> apply one effect -> compile FFmpeg graph -> export and verify.
7. Run relevant unit/type/lint/build/integration checks and report commands/results. Never claim tests passed if not run.
8. If a required tool/provider/API key is missing, implement interfaces/mocks where appropriate and clearly mark integration as unverified.
9. Never use placeholder buttons that imply real working operations without feedback or a defined disabled state.
10. Do not use guessed API routes or guessed FFmpeg filter availability; inspect configuration and probe the target FFmpeg build.
11. Keep a concise change log and update docs when behavior/configuration changes.
12. Work in phases and stop after each phase's acceptance criteria if failures are found; do not bury known failures with unrelated changes.

---

# Appendix A — Full prompt for an AI coding agent

Copy/paste this prompt into OpenCode, Antigravity, VS Code agent mode or another coding agent while the agent is opened at the TMCut repository root.

```text
Bạn đang làm việc trực tiếp trong repository TMCut. Nhiệm vụ của bạn là audit và nâng cấp kiến trúc TMCut để hỗ trợ cả Electron Desktop lẫn Web, đồng thời kiểm tra toàn bộ luồng FX preview và FFmpeg export, đặc biệt component `TmcutFxThumb`.

QUY TẮC BẮT BUỘC
1. Đọc AGENTS.md, README, package.json, docs và các hướng dẫn của repository trước khi sửa.
2. Audit mã nguồn thật trước. Không tự đoán file path, framework, phiên bản thư viện, cấu trúc project, API hoặc tính năng đã có.
3. Trước khi sửa code, báo cáo: kiến trúc hiện tại, danh sách file liên quan, luồng dữ liệu thực tế, vấn đề xác minh được, rủi ro và kế hoạch theo phase.
4. Tách rõ điều quan sát được trong code với đề xuất. Mọi finding quan trọng phải trỏ tới file và symbol/line reference khi có thể.
5. Không rewrite toàn bộ app. Bảo toàn chức năng đang chạy và chọn vertical slice nhỏ nhất để chứng minh kiến trúc.
6. Không tuyên bố test/build đã pass nếu chưa chạy thực tế. Báo rõ lệnh, kết quả và phần chưa thể kiểm tra.

MỤC TIÊU KIẾN TRÚC
A. Cùng một TMCut Core dùng cho Electron và Web. Core/domain không import Electron, Node fs, Nuxt server-only code, browser DOM hoặc gọi trực tiếp FFmpeg.
B. Electron dùng adapter qua preload/contextBridge + IPC hẹp; filesystem và FFmpeg do main/utility process quản lý. Không expose ipcRenderer/fs/shell tổng quát cho renderer.
C. Web dùng browser file picker/drag-drop, upload qua server API; có `local-disk` storage driver cho self-hosted server với persistent volume và driver object storage cho deployment ephemeral/serverless. Không lưu file người dùng trong public static folder nếu file cần bảo vệ. Cấu hình đường dẫn bằng env, không hardcode path máy dev.
D. Web AI provider calls đi qua backend Provider Gateway/TM Hub. Không đưa API keys vào browser bundle, localStorage hoặc project JSON. Có persisted job state, quota, timeout, progress, retries có kiểm soát, cancellation nếu provider/worker hỗ trợ, và logs đã redaction.
E. Render Web dùng server-side FFmpeg worker/job queue nếu cần export đầy đủ. Không giả định browser có thể chạy native FFmpeg. Tách render backend khỏi UI.
F. Project tham chiếu media/effects bằng IDs/version/logical storage keys, tránh phụ thuộc vào absolute path. Có migration và missing-asset UX.

PHẦN 1 — AUDIT GIAO DIỆN VÀ KIẾN TRÚC
- Tìm toàn bộ editor layout, asset panel, effects/transitions/filters/animations library, inspector, timeline, preview, render modal/job manager, upload/import UI, provider settings.
- Tìm định nghĩa `TmcutFxThumb` và mọi nơi sử dụng; ghi rõ props, event, data source, action semantics, params và loading/error states hiện tại.
- Tìm nơi tạo effects/transitions/filters/animations definitions; xem definitions có bị duplicate giữa thumbnail, inspector, preview và exporter không.
- Tìm timeline schema: clip timebase, keyframes, target IDs, effect order, transition overlap, serialization/migration.
- Truy luồng Export thực tế tới FFmpeg: command/graph builder, mapping audio/video outputs, timebase, escaping, process management, progress parsing, cancellation, error logs, path handling.
- Kiểm tra Electron main/preload/IPC security và cách import file.
- Kiểm tra Web/Nuxt server routes, deployment mode, storage implementation, auth/permissions, database schema và provider connection implementation nếu có.
- Xem responsive UI, empty/loading/error states, keyboard accessibility, thumbnail performance, state management và tests hiện có.
- Tạo audit report có bảng: finding, evidence (file/symbol/line), severity, effect, proposed fix, test needed.

PHẦN 2 — THIẾT KẾ ADAPTER CROSS-PLATFORM
- Đề xuất/tạo interfaces phù hợp với code hiện có: `IMediaStorage`, `IFileDialog`, `IRenderBackend`, `IProviderGateway`, `IProjectRepository`, `IJobStatus`.
- Tạo Electron adapters và Web HTTP adapters; không để Vue pages tự phân nhánh filesystem.
- Thiết kế API upload: create session, upload bytes hoặc signed upload, complete/finalize, get metadata/status, authorized download, delete khi đủ quyền và không còn reference.
- Upload phải có auth, quota, size limit, allowlisted MIME + signature checks, generated storage keys, path traversal protection, hash, staging/atomic finalize và cleanup upload dở dang.
- Nếu local-disk: ghi rõ persistence-volume requirement, backup/restore, path config env và tránh thư mục public.
- Nếu object storage: signed URL TTL ngắn, không lộ storage credentials và kiểm tra quyền trước khi cấp URL.
- Xác định cách di chuyển/mở cùng project giữa Web và Electron; không phá project cũ.

PHẦN 3 — PROVIDER GATEWAY
- Audit provider/model code đang có trước, tái sử dụng phần hợp lệ.
- Tách provider definition, connection, credentials, model catalogue, capabilities, usage, AI job và output assets.
- Hỗ trợ capability-specific adapters: text/LLM, image, video, speech-to-text, text-to-speech nếu có nhu cầu thực tế.
- Provider keys phải ở backend/secret store hoặc OS secure store theo adapter; không log key.
- Có health checks, model discovery nếu API hỗ trợ, manual model fallback, timeout, bounded retries/backoff, concurrency/quota, progress polling/webhook và persisted job state.
- Không chạy batch lớn khi chưa hiển thị estimated usage/cost hoặc chưa cấu hình quota/budget guard.

PHẦN 4 — EFFECT REGISTRY CHUNG
Hãy audit, rồi chuẩn hóa định nghĩa cho `effect`, `transition`, `filter`, `animation`. Mỗi definition phải chứa tối thiểu:
- stable definitionId + definitionVersion;
- category, title, tags, appliesTo, allowedActions;
- parameter schema/default/min/max/validation;
- preview strategy, source/demo asset, preview fidelity;
- render adapter type, export support status, required FFmpeg filters/version;
- dependencies (font/LUT/overlay/media assets) và compatibility.
Timeline instance phải lưu definitionId/version, target IDs, action, normalized time range, params, keyframes, enabled và deterministic order.

Định nghĩa rõ ngữ nghĩa actions: `in`, `out`, `loop`, `between`, `overlay`, `grade` hoặc tập action thực sự cần thiết. Xác định timebase thống nhất và conversion sang frame/timebase FFmpeg. Transition phải có hai đầu vào và handle/overlap hợp lệ; filter grade là biến đổi hình ảnh; text/overlay animation cần keyframes/timestamps; audio effect xử lý audio stream riêng.

Không cho AI hay pack truyền raw FFmpeg expression tùy ý. Pack Marketplace chỉ chứa declarative metadata/params/preset. Runtime compiler adapter là code đáng tin cậy có trong TMCut.

PHẦN 5 — RIÊNG CHO `TmcutFxThumb`
- Component phải resolve definition từ Effect Registry; không hardcode một animation chung hoặc viết lại business logic riêng cho từng card.
- Thumbnail phải nhận đúng definitionId/version, validated params, action/direction, preview state, dimensions và source asset khi cần.
- Effects: hiển thị kết quả effect trên sample media; chỉ animate nếu effect thực sự thay đổi theo thời gian.
- Transitions: preview từ clip A sang clip B; progress 0..1 phải phản ánh đúng transition và hướng.
- Filters: trước/sau hoặc sample loop với filter thực; static filter được phép là static.
- Animations: minh họa đối tượng thật (text/overlay/shape) bằng cùng keyframe/easing semantics.
- Audio: waveform/visualizer; không tự autoplay audio khi chỉ lướt qua thumbnail.
- Thiết kế hover/focus/click/selected behavior rõ ràng, nhất quán; reduced motion, pause offscreen, lazy-load, error fallback, tránh layout shift.
- Show fidelity/export status (exact/approximate/unsupported) khi hữu ích; không giả vờ rằng CSS preview chắc chắn giống FFmpeg output.
- Thay đổi params trong inspector phải cập nhật thumbnail và timeline preview từ một nguồn dữ liệu có kiểm soát.

PHẦN 6 — FFmpeg GRAPH COMPILER
- Đừng nối chuỗi filtergraph không kiểm soát từ UI. Tạo typed graph IR/compiler stages: resolve media -> normalize timeline -> validate params/capabilities -> build nodes/edges/labels -> serialize safely -> execute -> verify output.
- Dùng unique graph labels; validate mỗi label chỉ được tạo/sử dụng hợp lệ; map final audio/video streams rõ ràng.
- Map transition video tới `xfade` hoặc graph adapter đã kiểm chứng; audio crossfade tới `acrossfade` khi hợp lý. Map filters sang filter tương ứng như eq/curves/hue/colorbalance/lut3d, gblur/unsharp, scale/crop/overlay/drawtext/zoompan/chromakey tùy definition và FFmpeg build thực tế.
- Xác minh filter có trong FFmpeg build mục tiêu; không assume mọi binary bundled đều có cùng options/build flags.
- Escape text/paths cẩn thận; tuyệt đối không interpolated shell command với user strings. Ưu tiên spawn process với argv/execFile hoặc abstraction tương đương an toàn.
- Support progress, cancel, timeout, temp file cleanup, stderr diagnostics và final output probing.
- Mỗi effect `exportSupported` phải có unit test cho graph IR và integration test FFmpeg render fixture. Không hỗ trợ thì validation trả lỗi rõ ràng, không âm thầm bỏ qua effect.
- Test chain nhiều effect, keyframe đầu/giữa/cuối, transition giữa 2 clip, output audio/video, duration, resolution, FPS/timebase và Unicode text/Vietnamese.

PHẦN 7 — UI REVIEW VÀ CHỈNH SỬA
Sau audit, đề xuất changes dựa trên UI hiện tại, không tự thiết kế lại toàn bộ. Kiểm tra:
- bố cục responsive và khu vực timeline/preview/inspector;
- tab category, search/filter/sort và loading/empty/error states;
- thumbnail kích thước/ratio, nhất quán icon/status, preview on-hover hoặc click-to-play;
- selected/hover/focus/accessibility và reduced motion;
- action button hoạt động thật, progress/error/cancel rõ ràng;
- asset upload và download states;
- provider model selection, connection health và job status;
- UI test dựa trên hành vi thật, không chỉ page render.
Ghi trước các thay đổi dự kiến và lý do; thực hiện từng nhóm nhỏ.

PHẦN 8 — TEST VÀ DELIVERABLES
Deliverables phải gồm:
1. Audit report với file paths/symbol references.
2. Architecture decision record nêu Electron/Web/storage/provider/render boundaries.
3. FX registry schema + vài definitions đã triển khai end-to-end.
4. `TmcutFxThumb` đã tích hợp registry cho subset được hỗ trợ.
5. FFmpeg graph IR/compiler và tests cho subset đã khai báo export-supported.
6. Web upload flow có auth/validation/progress, với storage driver đã chạy test.
7. Provider gateway/job lifecycle được nối vào provider thật nếu có credentials; nếu không, mock rõ ràng và ghi integration chưa xác minh.
8. Unit/integration/UI tests, lệnh đã chạy, kết quả thật và known limitations.
9. Docs cập nhật về env vars, persistent data directory, backup, provider secrets, FFmpeg build capabilities và deployment.

LỘ TRÌNH THỰC HIỆN
- Phase 0: audit, baseline và report; chưa sửa code.
- Phase 1: Core contracts + tests.
- Phase 2: harden Electron IPC/local storage/render adapter.
- Phase 3: Web upload API/storage driver.
- Phase 4: provider gateway/jobs.
- Phase 5: FX registry + FFmpeg graph IR cho một subset nhỏ.
- Phase 6: TmcutFxThumb registry-driven preview + fidelity indicator.
- Phase 7: web render worker + project portability.
- Phase 8: UI polish, regression tests và docs.

BẮT ĐẦU NGAY BẰNG PHASE 0. Không hỏi lại thông tin có thể xác định từ repo. Sau audit, nếu phạm vi lớn hãy báo cáo theo phase và bắt đầu phase tiếp theo có rủi ro thấp; không tuyên bố hoàn tất một tích hợp mà chưa chạy được.
```

---

## Appendix B — Suggested smoke-test project

Create a small reproducible test project rather than using arbitrary user footage for every test:

- Two synthetic or appropriately licensed 2–4 second clips with visibly different colors/subjects.
- One Vietnamese text overlay using a bundled/licensed font.
- One music/audio sample with known duration and no licensing ambiguity.
- A small set of definitions: color grade, blur, fade in/out, dissolve, directional wipe/slide, text fade/slide, audio fade.
- Fixed output resolution and frame rate.
- Expected output duration, stream layout, approximate key-frame appearance and graph IR snapshots.

This fixture should validate the entire chain: definition -> thumbnail preview -> inspector params -> timeline instance -> render plan -> FFmpeg graph -> output verification.

---

## References

- Electron IPC: https://www.electronjs.org/docs/latest/tutorial/ipc
- Electron contextBridge: https://www.electronjs.org/docs/latest/api/context-bridge
- Nuxt 4 server directory and API routes: https://nuxt.org.cn/docs/4.x/directory-structure/server
- FFmpeg filters and filtergraph documentation: https://www.ffmpeg.org/ffmpeg-filters.html
- Supabase Storage resumable uploads: https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- Cloudflare R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
