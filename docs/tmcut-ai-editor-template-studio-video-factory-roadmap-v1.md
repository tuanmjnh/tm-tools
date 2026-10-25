# TMCut AI Editor + Template Studio + Video Factory — Roadmap v1

> Mục tiêu: tham khảo quy trình và UI ở OpenChatCut và Concat, bổ sung điều khiển app bằng AI/giọng nói, đồng thời xây dựng module tạo video hàng loạt từ thư viện template và prompt. Tài liệu này là định hướng kiến trúc cho AI coding agent, không khẳng định các chức năng đã được triển khai trong TMCut.

## 1. Quyết định kiến trúc

1. TMCut Core là nguồn sự thật duy nhất cho project, timeline, asset references, commands, undo/redo và render state.
2. UI thủ công, AI Agent tích hợp, lệnh giọng nói và MCP bên ngoài đều đi qua cùng một command/API layer; không cho agent sửa trực tiếp state tùy tiện.
3. Template Studio và Video Factory là module tạo nội dung, không thay thế Editor Studio hoặc Render Engine.
4. Tách generation jobs khỏi renderer. Provider video tạo clip/ảnh/voice; TMCut Assembly dùng các đầu ra đó để tạo project timeline có thể chỉnh sửa và xuất video.
5. Mọi job phải bền vững sau khi app khởi động lại: trạng thái, provider task ID, retry count, output asset, lỗi, chi phí ước tính/thực tế và lịch sử.
6. Tích hợp từng provider qua adapter; không để logic của một provider rò rỉ vào UI hoặc Template DSL.
7. API keys và provider credentials chỉ ở main process/server-side secret store; không đưa secret xuống renderer/browser hay lưu trong project file.
8. Số lượng lớn phải có ước tính chi phí, giới hạn batch, concurrency, retry policy, rate-limit, pause/resume/cancel và xác nhận trước khi chạy.

## 2. Nghiên cứu giao diện/luồng tham khảo

### OpenChatCut — tham khảo AI-native editing

Các pattern đáng học ở mức thiết kế:
- Chat/Agent panel đặt cạnh workspace thật, thay vì tạo một chatbot tách khỏi editor.
- AI đọc ngữ cảnh project/timeline, chuẩn bị một kế hoạch thay đổi có thể kiểm tra, sau đó áp dụng vào các track/clip thật.
- Timeline vẫn editable; có undo/redo, preview và lịch sử.
- Motion graphics, effects, transitions, transcripts/captions, generation và export nằm trong cùng workflow.
- Công cụ của built-in agent và MCP bên ngoài dùng chung editor commands.

Link: https://github.com/0xsline/OpenChatCut

### Concat — tham khảo thao tác kiểu CapCut

Các pattern đáng học ở mức thiết kế:
- Library/Media browser bên trái; các nhóm Media, Text, Transitions, Effects và Templates.
- Preview ở vùng trung tâm; timeline nhiều track bên dưới; menu ngữ cảnh cung cấp thao tác tại playhead/clip.
- Caption/transcription, text-to-speech, effects/title presets, keyframes và export được đặt gần quy trình chỉnh sửa.
- Mô hình local-first: tài nguyên/model đã tải có thể dùng offline; không cần upload footage gốc để thực hiện tác vụ local.
- Có interface điều khiển bằng API/MCP cho script/agent.

Link: https://github.com/jub0t/concat

### Lưu ý bản quyền

Hai repository công bố AGPL-3.0. Nên học hỏi mô hình UX và kiến trúc ở mức khái niệm. Trước khi sao chép hoặc sửa code, component hay assets, rà soát nghĩa vụ license với người có chuyên môn; không giả định code AGPL có thể nhúng tuỳ ý vào mọi sản phẩm thương mại.

## 3. IA / cấu trúc sản phẩm đề xuất

Giữ các khu vực dễ hiểu, không trộn mọi thứ vào một màn hình:

- **Editor Studio**: project, media, library, preview, timeline, inspector, render.
- **AI Assistant**: panel có thể mở/đóng trong Editor Studio; hỗ trợ chat và voice commands dựa trên project context.
- **AutoCut AI**: phân tích footage, transcript, cảnh/shot, đề xuất rough cut, tạo caption và soundtrack.
- **Asset Marketplace**: nhạc, SFX, text templates, transitions, effects, LUTs, motion graphics, video templates; preview trước, tải từng asset khi cần.
- **Template Studio**: tạo/sửa/nhân bản/version template và prompt; xem trước bằng input mẫu; quản lý variable, storyboard và provider profile.
- **Video Factory**: chạy production batch từ một template và nhiều record đầu vào; theo dõi generation jobs, duyệt kết quả, chọn output và tạo TMCut projects.
- **Provider Connections**: quản lý provider, model, secret, capabilities, giá/cost hints, rate limits, health và permissions qua TM Hub.
- **Generation History**: xem batch, từng job, đầu vào, prompt đã dùng, provider/model, output và lỗi.

Gợi ý UI Video Factory desktop:
1. Sidebar: Templates / Campaigns / Batch Queue / Results / History.
2. Main area: wizard theo bước hoặc tabs — Template, Input Data, Storyboard, Providers, Budget, Review & Run.
3. Job queue: status, provider, scene, progress, retries, cost, ETA nếu provider trả dữ liệu đủ tin cậy.
4. Results board: thumbnail, preview, approve/reject/regenerate, compare variants, open in Editor.

## 4. Whisper và điều khiển TMCut bằng lời nói

Whisper là speech-to-text, không phải agent ra quyết định và cũng không tự thực thi lệnh chỉnh sửa. Thiết kế flow:

`Microphone/Audio → STT (local Whisper hoặc cloud STT) → Transcript → Intent/LLM Planner → Validated Tool Call → TMCut Core Command → Result/Audit → User Feedback`

### Hai chế độ nhập
- Text command: nhập câu lệnh, đi vào cùng Intent/Planner.
- Voice command: STT biến lời nói thành văn bản, sau đó đi vào cùng Intent/Planner.

### Phân loại rủi ro
- Low-risk: đọc thông tin project, tìm asset, di chuyển playhead, preview; có thể thực hiện trực tiếp theo cài đặt người dùng.
- Reversible editing: thêm caption, thêm clip, thay đổi volume, split/trim; mặc định lập proposal/draft, xem trước và áp dụng như một undo group.
- Cost/destructive/external side-effects: tạo hàng trăm generation jobs, xóa file, xóa project, mua credit, publish video, ghi đè export; yêu cầu xác nhận rõ ràng.

### Công cụ cốt lõi cho agent/MCP
- `project.get_context`, `project.get_timeline`, `project.list_assets`
- `edit.create_proposal`, `edit.validate_proposal`, `edit.apply_proposal`, `edit.undo`, `edit.redo`
- `timeline.add_clip`, `timeline.move_clip`, `timeline.trim_clip`, `timeline.set_volume`, `timeline.add_caption`
- `asset.search`, `asset.preview`, `asset.download`, `asset.check_dependencies`
- `transcript.start`, `transcript.get_result`, `captions.create_from_transcript`
- `template.search`, `template.get`, `template.create_draft`, `template.validate`, `template.test_run`
- `factory.estimate_batch`, `factory.create_batch`, `factory.pause_batch`, `factory.resume_batch`, `factory.cancel_batch`, `factory.get_batch`
- `generation.get_job`, `generation.retry_job`, `generation.cancel_job`, `generation.approve_output`
- `assembly.create_project_from_outputs`, `render.start`, `render.get_status`

MCP phải gọi tool schemas được kiểm tra, không cấp quyền shell/FFmpeg tuỳ ý. Kết quả công cụ phải trả structured result, job ID, trạng thái và lỗi có thể xử lý.

## 5. Template Studio: Template/Prompt System

Template phải là cấu trúc dữ liệu có version, không phải một prompt dài bị hard-code trong UI.

### Thành phần template
- `templateId`, tên, mô tả, topic/category, tags, owner, visibility.
- `version`, trạng thái draft/published/archived, changelog và compatibility version.
- `inputSchema`: các trường user phải cung cấp, ví dụ product name, audience, offer, language, tone, duration, aspect ratio, CTA, references.
- `scriptBlueprint`: hook, intro, beats, CTA/outro, giới hạn từ/độ dài, yêu cầu kiểm chứng nội dung.
- `sceneBlueprints`: số cảnh, vai trò của cảnh, shot type, camera movement, visual intent, duration target, narration, on-screen text.
- `promptBlocks`: system rules, style bible, shot prompt template, negative constraints nếu provider hỗ trợ, localization rules.
- `assetPolicy`: dùng Asset Marketplace, asset do user tải lên hay cần generate mới; license restrictions.
- `providerPolicy`: capabilities tối thiểu, provider/model được phép, fallback order, provider-specific prompt mapping.
- `assemblyProfile`: track mapping, caption style, music policy, transition profile, audio ducking, output profile.
- `qualityGates`: yêu cầu số cảnh, duration, aspect ratio, subtitle presence, moderation/status checks, validation rules.

### Các topic nên hỗ trợ ban đầu
- Product/e-commerce showcase.
- Social short/Reels/Shorts.
- Educational explainer/tutorial.
- Travel/food/lifestyle.
- Storytelling/documentary.
- News/recap (cần nguồn rõ ràng và kiểm tra tính chính xác; không tự bịa sự kiện).
- Podcast/interview highlight.
- Product UGC/ad-style video (tuân thủ quyền sử dụng hình ảnh, giọng nói và tài sản thương hiệu).

### Chỉnh sửa template
- Duplicate thành draft; không sửa đè version đã dùng cho batch cũ.
- Editor cho phép sửa input variables, script structure, scene count, prompt blocks, style, subtitles, audio policy, provider mapping và validation.
- Test run với 1 record trước khi publish.
- Publish tạo immutable version; batch lưu chính xác `templateId + templateVersion`.

## 6. Video Factory: production workflow

### Flow đề xuất
1. **Select template/version** — chọn template đã publish hoặc test một draft.
2. **Provide input data** — nhập form, CSV/JSON hoặc danh sách sản phẩm/chủ đề; validate từng dòng.
3. **Generate script** — tạo hook, outline, narration và CTA; lưu bản script đã duyệt.
4. **Build storyboard** — chia shot, chỉ định duration, aspect ratio, reference image, narration/text và provider capability.
5. **Plan & estimate** — tính số scene x variants, ước lượng số job/chi phí dự kiến dựa trên metadata pricing đã cấu hình; cảnh báo thiếu assets, unsupported capability, budget vượt ngưỡng.
6. **Confirm & queue** — người dùng xác nhận; tạo batch/job records và budget reservation.
7. **Generate assets** — fan-out scene jobs theo provider adapter và giới hạn concurrency/rate.
8. **Collect & validate** — nhận webhook hoặc poll task; kiểm tra trạng thái, tải output, checksum, duration, aspect ratio, file metadata.
9. **Review board** — preview mỗi scene/video, approve/reject/regenerate; lưu lý do và phiên bản prompt.
10. **Assemble project** — đưa output vào TMCut Asset Service, tạo timeline/project có thể chỉnh sửa; không flatten vĩnh viễn thành một video duy nhất.
11. **Render/export** — chọn preset, xuất, lưu export history; publish lên nền tảng khác phải là bước riêng có xác nhận.

### Kiểu batch
- **One prompt × N variants**: thử nhiều biến thể sáng tạo.
- **One template × N input records**: ví dụ danh sách 100 sản phẩm.
- **One campaign × multiple aspect ratios/languages**: nhân bản bản 9:16, 1:1, 16:9 hoặc đa ngôn ngữ khi template cho phép.
- **Storyboard batch**: mỗi video có nhiều shot; quản lý job cha/con.

Không nên coi một batch video là một API request khổng lồ. Tạo batch/job theo từng record và từng scene để retry và theo dõi chi phí độc lập.

## 7. Provider Hub / Adapter architecture

### Chuẩn hóa interface nội bộ

```ts
interface VideoProviderAdapter {
  getCapabilities(): Promise<ProviderCapabilities>;
  estimate(input: NormalizedVideoRequest): Promise<CostEstimate | null>;
  submit(input: NormalizedVideoRequest, idempotencyKey: string): Promise<ProviderTask>;
  getStatus(providerTaskId: string): Promise<ProviderTaskStatus>;
  cancel?(providerTaskId: string): Promise<void>;
  normalizeResult(raw: unknown): NormalizedGenerationResult;
}
```

Đây là interface gợi ý; implement cần theo TypeScript conventions/codebase hiện tại.

### Normalized request
- prompt, negative constraints khi provider hỗ trợ, seed khi được hỗ trợ.
- input image/video/audio references và storage URL hợp lệ.
- duration, aspect ratio, resolution, frame rate nếu khả dụng.
- audio generation mode, camera/motion instructions nếu provider có hỗ trợ.
- callback URL/task metadata nếu có.
- provider options chỉ ở một object extension có schema; tránh hard-code riêng trong template.

### Các provider cần khảo sát/tích hợp theo đợt
- Google Gemini video: kiểm tra model/API ổn định hiện hành; tài liệu ngày 23/10/2026 nêu Gemini Omni Flash là lựa chọn mặc định ở Gemini API, còn một số preview Veo 3.1 đã shutdown 22/10/2026. Luôn kiểm tra model version trước khi implement.
- Runway API: có endpoint cho text/image/video-to-video, audio, speech và quản lý task.
- Kling API: có API chính thức và các workflow text/video, multi-shot/reference tuỳ model.
- Luma API: API tạo ảnh/video; xác nhận các endpoint mới nhất và điều khoản trước khi tích hợp.
- Provider aggregator như fal.ai có thể là adapter bổ sung để tăng phạm vi model, nhưng không nên là lớp duy nhất hoặc giả định mọi model đều có cùng tính năng, SLA hay giá.

Không giả định API luôn free. Mỗi connector phải hiển thị credential status, supported capabilities, billing/usage, rate limits, max concurrent jobs, timeout, polling/webhook support và policy về lưu trữ đầu ra.

Không xây mới dựa vào Sora API cũ: OpenAI đã thông báo Sora app/web ngừng 26/04/2026 và Sora API ngừng 24/09/2026. Xác minh thông báo chính thức trước khi quyết định bất kỳ connector tương lai nào.

### Key/credential handling
- Credentials nằm trong TM Hub server-side secret store hoặc local keystore theo deployment mode.
- Renderer chỉ nhận connection ID, capabilities, masked status và usage summary.
- Hỗ trợ user-owned key (BYOK) nếu muốn; cần phân biệt key của người dùng và key dịch vụ chung.
- Không gửi API keys cho LLM/prompt, không lưu key trong project, prompt, logs hay exported template.

## 8. Batch orchestration và độ tin cậy

Dùng durable queue/job tables trước, chọn queue engine theo hạ tầng thực tế. Không cần triển khai distributed microservices quá sớm, nhưng code phải tách các trách nhiệm:
- Batch Planner: tạo job graph.
- Queue Scheduler: concurrency theo provider, priority, pause/resume.
- Provider Adapter Worker: submit/poll/callback.
- Result Collector: tải file, checksum, media probe.
- Budget Guard: reservation, spend threshold và hard stop.
- Assembly Worker: project timeline/asset references.

### Retry rules
- Retry network timeout/temporary 5xx/rate limit theo exponential backoff + jitter và `Retry-After` nếu có.
- Không retry mù các lỗi invalid prompt, permission/billing/auth hoặc request không hợp lệ.
- Dùng idempotency key nếu provider hỗ trợ; nếu không hỗ trợ, trước khi retry phải kiểm tra task trước đó nhằm tránh tạo trùng và phát sinh phí.
- Job statuses: `draft`, `queued`, `submitting`, `processing`, `completed`, `failed`, `canceled`, `needs_review`, `approved`, `assembled`.
- Mỗi status transition phải được kiểm tra; progress events được lưu để app khởi động lại vẫn đọc được.
- Hỗ trợ stop/cancel theo batch và từng job; cancel local queue không đồng nghĩa provider đã hủy nếu API không hỗ trợ.

### Budget guard
- Preview estimate: job count, scene count, variant count, provider/model, estimated cost range.
- User-defined batch max, spend cap, concurrency cap, max retry count.
- Require explicit confirmation when cost estimate exceeds threshold or launches a large number of jobs.
- Reconcile estimate with provider-reported actual usage; mark estimates as estimates, never promise exact final charges.

## 9. Data model đề xuất

### Core entities
- `video_templates`: stable ID, owner, title, topic, visibility, current published version.
- `video_template_versions`: immutable version, schema version, input schema, script/scene blueprint, prompt blocks, assembly profile, provider policy, validation rules.
- `template_test_runs`: draft version, sample inputs, output summary, failures, review status.
- `video_campaigns`: user intent, target channels/aspect ratios/languages, selected template version.
- `video_batches`: campaign/template version, input source, status, total/queued/running/completed/failed counts, estimated/actual cost, budget cap.
- `video_batch_items`: one input record and its validation/generation state.
- `generation_jobs`: type (script/image/video/voice/music), provider connection/model, normalized request snapshot, provider task ID, status, attempts, timestamps, error category, cost metadata.
- `generation_outputs`: output asset ID, provider metadata, checksum, duration, dimensions, moderation/review state.
- `provider_connections` / `provider_models`: use/reuse TM Hub's connection/provider catalogue; do not create a second credential system in TMCut.
- `asset_registry`: use TMCut Asset Service/Marketplace IDs for remote or installed files.
- `assembly_jobs`: outputs → project ID, timeline version, validation status.
- `usage_ledger`: reserved/estimated/actual usage, provider, model, batch, job and reason for adjustment.
- `audit_events`: user/agent action, operation, approval and side-effect record.

### Required referential rule
Project/template/batch should refer to stable `assetId`, `templateId + version`, `connectionId` and `providerTaskId`, not to temporary UI state or an absolute path from the generating machine.

## 10. Example API groups

Prefix is illustrative; align to current TMCut/TM Hub route conventions.

### Templates
- `GET /api/v1/video-templates`
- `POST /api/v1/video-templates`
- `POST /api/v1/video-templates/:id/versions`
- `POST /api/v1/video-templates/:id/validate`
- `POST /api/v1/video-templates/:id/test-runs`
- `POST /api/v1/video-templates/:id/publish`

### Factory
- `POST /api/v1/video-factory/estimate`
- `POST /api/v1/video-factory/batches`
- `GET /api/v1/video-factory/batches/:id`
- `POST /api/v1/video-factory/batches/:id/pause`
- `POST /api/v1/video-factory/batches/:id/resume`
- `POST /api/v1/video-factory/batches/:id/cancel`
- `POST /api/v1/video-factory/jobs/:id/retry`
- `POST /api/v1/video-factory/outputs/:id/approve`
- `POST /api/v1/video-factory/outputs/:id/reject`
- `POST /api/v1/video-factory/batches/:id/assemble`

### Provider callbacks
- `POST /api/v1/providers/:providerKey/webhook` (only where supported, with signature/auth validation)
- Polling worker where webhook unavailable.
- Never trust unverified callback payloads to authorize file access or mark paid usage without reconciliation.

## 11. Asset/storage integration

- Supabase Postgres stores metadata, template versions, queues and usage ledger.
- Cloudflare R2 or compatible object storage stores preview, generated raw outputs, reference assets where permitted and durable downloadable outputs.
- TMCut local Asset Store keeps downloads and generated assets selected for a project; cache is rebuildable.
- Generate into temporary object keys; validate media; then commit stable asset metadata atomically.
- Avoid making provider temporary URLs the only saved copy. Download/transfer output before provider expiry where terms allow.
- Apply license, retention and data deletion policies per provider; user-uploaded references should not be sent to third parties without clear user action/notice.

## 12. Phased roadmap

### P0 — Codebase audit and contracts
- Map the current Editor Core, timeline schema, TaskProcessManager, render pipeline, Asset Service/Pack Manager, and TM Hub connection client.
- Document one authoritative timeline command API.
- Establish the Template schema and Provider Adapter contract.
- Audit licenses of potential code inspirations.
- Acceptance: architecture map and stable API contracts approved; no new UI copied from repository source.

### P1 — AI Editor / MCP tool foundation
- Add context-reading tools and proposal-based validated edit operations.
- Connect local MCP server/Desktop Bridge to the exact same Core commands used by UI.
- Add undo grouping, tool results, error contracts and approvals.
- Acceptance: a test agent can read a project and apply one reversible edit through a draft/approval path; UI and MCP show identical project state.

### P2 — Speech command foundation
- Integrate local Whisper or pluggable STT engine; add Vietnamese/English transcript and editable confirmation.
- Add intent parser and mappings to known tools only.
- Add confirmation policies for destructive/cost-bearing actions.
- Acceptance: voice command can request captions or music search; speech recognition alone cannot invoke arbitrary shell commands.

### P3 — Template Studio MVP
- Template CRUD/draft/publish/version, variable schema, prompt blocks and one test run.
- Start with 2–3 templates such as product showcase, educational short and podcast highlight.
- Acceptance: same template version deterministically yields validated input/script/storyboard structures and can be duplicated without mutating previous versions.

### P4 — One end-to-end provider adapter
- Choose one official, currently supported provider after comparing account access, API region/availability, price, response time, limits and rights.
- Implement submit/status/cancel-if-supported/result download/errors/cost metadata.
- Acceptance: one generation task persists through app restart and ends in a playable local Asset Service item.

### P5 — Video Factory queue and one batch workflow
- Input table/CSV validation, batch estimate, hard caps, durable jobs, pause/resume/cancel, retry rules and review board.
- Acceptance: batch of sample inputs can run with bounded concurrency; failed items retry independently; budget cap blocks additional jobs.

### P6 — Project Assembly and render
- Translate approved outputs to timeline tracks, captions, music, basic transitions and metadata; call existing render pipeline.
- Acceptance: assembled output project opens in Editor Studio and each generated clip remains individually editable.

### P7 — More providers + Marketplace integration
- Add a second official provider, capability matrix, fallback policy, per-provider concurrency and normalized metadata.
- Use Asset Marketplace for licensed music/SFX/font/templates and retain license references in project/batch.
- Acceptance: one template can route supported shots to different providers without changing the template's logical schema.

### P8 — Scale & creator workflows
- Campaigns, reusable product records/CSV mapping, localization, aspect-ratio variants, result comparison, cost reports, saved provider profiles and scheduled batch execution.
- Acceptance: campaign execution is observable, resumable, auditable and respects user-defined limits.

## 13. Definition of Done

- AI, voice, MCP and UI all use the same Core commands.
- All generated outputs and batch jobs survive app restart.
- Template published versions never change underneath an existing run.
- Generation is asynchronous and bounded; no unbounded fan-out.
- Every batch shows its inputs, provider/model, status, failure cause, outputs and estimated/actual spend where available.
- Users can stop a batch; provider-side cancellation limitations are accurately shown.
- User confirms large-cost or destructive side effects.
- Credentials never reach renderer/chat logs/project JSON.
- Generated assets have stable Asset Service IDs and can be reused offline if retained locally.
- Output timeline remains editable and uses the existing renderer rather than a separate incompatible project format.
- Provider changes/deprecations can be handled by adapters without redesigning UI or template schema.

## 14. Research links (verify again before implementation)

- OpenChatCut repository: https://github.com/0xsline/OpenChatCut
- Concat repository: https://github.com/jub0t/concat
- OpenAI Whisper model/repository: https://github.com/openai/whisper
- Current OpenAI transcription guidance: https://developers.openai.com/api/docs/guides/transcription
- Google Gemini video API: https://ai.google.dev/gemini-api/docs/video
- Google Gemini Batch API: https://ai.google.dev/gemini-api/docs/batch-api
- Runway API: https://docs.dev.runwayml.com/api/
- Kling API: https://kling.ai/dev/api
- Luma API: https://docs.lumalabs.ai/docs/welcome
- Official notice about Sora discontinuation: https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation

Provider APIs, supported models, prices, quotas and regions change frequently. Re-verify at implementation time; do not hard-code current model names/prices into template schema.
