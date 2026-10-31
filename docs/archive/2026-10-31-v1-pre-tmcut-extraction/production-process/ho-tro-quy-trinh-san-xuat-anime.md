# Đánh giá & định hướng: TMCut hỗ trợ quy trình sản xuất Anime AI (SOP chống trùng lặp)

Cập nhật: 2026-10-30 · Đầu vào: [quy-trinh-san-xuat-anime-ai-chong-trung-lap.md](quy-trinh-san-xuat-anime-ai-chong-trung-lap.md)
· **Đã triển khai (engine + lưu artefact ra file + demo S01E001):** [trien-khai-production-process-2026-10-30.md](trien-khai-production-process-2026-10-30.md)
· Phạm vi: đánh giá mức hỗ trợ hiện tại + kiến trúc “Production Process Engine” để
tự động hóa SOP này **và** mọi quy trình khác cùng cấu trúc (giai đoạn → artefact → cổng duyệt).

---

## A. Kết luận ngắn

SOP chia làm 12 giai đoạn (0–11). TMCut **đã có sẵn khoảng 55–60% hạ tầng kỹ thuật**
cần thiết, nhưng gần như **chưa có lớp “quy trình”**: không có thực thể Series/Episode,
không có Bible/Ledger, không có khái niệm giai đoạn – cổng duyệt – phiên bản canon.

| Nhóm việc | Trạng thái |
| --- | --- |
| Dựng video, xuất bản master, timeline, hiệu ứng, phụ đề | **Đã có, mạnh** |
| Tạo asset bằng AI (ảnh/video/giọng/nhạc), batch + ngân sách | **Đã có khung** (Video Factory, chạy dry-run) |
| Cổng duyệt trước khi áp thay đổi | **Đã có mô hình** (Agent proposal + apply 1 undo group) |
| Ghi nhận giấy phép / takedown asset | **Đã có** (Asset Center license gate) |
| Chống trùng lặp (novelty), continuity, canon, ledger | **Chưa có** |
| Kịch bản → shot list → timeline tự động | **Một phần** (template + assembly, chưa có shot-list schema) |
| Đóng gói xuất bản, analytics, canon lock | **Chưa có** |

Điểm mấu chốt: **không cần viết lại engine batch**. `useVideoFactory` đã là một job
state machine có ngân sách, retry, approve, assembly. Việc còn thiếu là một lớp
**quy trình có cấu hình** bọc quanh nó, cộng thêm 4 engine thuần (pure) cho
novelty / continuity / shot-list / QA.

---

## B. Đối chiếu từng giai đoạn SOP với code hiện tại

Mức: ✅ có thể dùng ngay · 🟡 có hạ tầng nhưng thiếu phần nghiệp vụ · ❌ chưa có

| # | Giai đoạn SOP | Trong app | Mức |
| --- | --- | --- | --- |
| 0 | Episode ID + khóa phạm vi | `useTmcutProject` (project id, canvas, lưu/khôi phục), `recovery.ts` snapshot | 🟡 có “project”, thiếu `episode_id` bất biến + ràng buộc phiên bản canon |
| 1 | Đọc lịch sử, continuity brief | Agent tools `project.get_context/get_timeline` chỉ đọc timeline; `TmcutAiEditor` đọc nội dung dự án | ❌ thiếu Bible/Ledger để đọc |
| 2 | Sinh nhiều ý tưởng | `useTmcutAi` + `aiTasks.ts` (prompt → JSON), `TmcutAiScriptModal` | 🟡 sinh được, thiếu schema ý tưởng + lưu vết |
| 3 | Kiểm tra trùng lặp, novelty report | **không có** | ❌ |
| 4 | Outline + duyệt | `TmcutAiScriptModal`, template studio | 🟡 thiếu cổng duyệt có ghi nhận reviewer |
| 5 | Kịch bản + continuity diff | AI script (một lần), không diff canon | ❌ (diff) |
| 6 | Shot list + asset | `videoTemplate` (scene), `videoFactory` plan, `useTmcutStock`, `TmcutAssetCenter` | 🟡 thiếu `shot-list.json` schema + prompt/seed/manifest |
| 7 | Chuyển động, thoại, âm thanh | `TmcutVoiceStudio` (TTS + clone), `AudioOrchestration`, effects, `stock` nhạc | ✅ về công cụ, 🟡 thiếu ràng buộc “giọng đã duyệt/không giả giọng người thật” |
| 8 | Dựng video | editor + `compiler.ts` + FFmpeg + export queue; chuẩn hoá fps/resolution có | ✅ |
| 9 | QA nội dung/kỹ thuật/chính sách | Asset Center license gate + takedown; **không có** QA report/checklist tự động | 🟡 |
| 10 | Đóng gói & xuất bản | `TmcutExportModal` (metadata cơ bản); **không có** publish-package, upload private, xác nhận cuối | ❌ |
| 11 | Cập nhật canon + analytics | **không có** | ❌ |

Điều đáng chú ý: SOP đặt **con người duyệt ở cổng** — điều này app đã “có triết lý”
sẵn trong `useTmcutAgentTools` (mọi mutation chỉ xếp vào proposal, `apply` mới chạm
timeline, một Ctrl+Z). Vì vậy phần lớn công việc là **tái dùng mô hình này cho artefact
cấp quy trình**, không phải phát minh cơ chế mới.

---

## C. Kiến trúc đề xuất: Production Process Engine (tổng quát, cấu hình được)

### C.1 Ý tưởng

Một **Process Definition** (JSON) mô tả: các giai đoạn, artefact vào/ra, validator tự
động, ai/cái gì được duyệt, và hook tự động hóa. Engine chạy definition đó cho một
**Run** (một tập phim, một chiến dịch, một video đơn…). Nhờ vậy SOP anime chỉ là
**một profile**; quy trình khác (ví dụ: “sản xuất video ngắn hàng loạt”, “làm phim
tài liệu”, “làm series TikTok”) chỉ cần một file JSON khác — đúng yêu cầu “hỗ trợ
tùy biến cho các quy trình khác theo cấu trúc”.

```text
docs/production-process/
├── quy-trinh-san-xuat-anime-ai-chong-trung-lap.md   (SOP gốc, giữ nguyên)
├── ho-tro-quy-trinh-san-xuat-anime.md               (tài liệu này)
└── processes/
    ├── anime-series.process.json                    (profile từ SOP này)
    ├── shorts-batch.process.json                    (ví dụ profile khác)
    └── schema.md                                    (mô tả field, versioning)
```

### C.2 Mô hình dữ liệu (đề xuất, đặt ở `app/types/productionProcess.ts`)

```ts
export type StageKind = 'ai_task' | 'manual' | 'external' | 'render' | 'review' | 'compute'
export type GateKind = 'human' | 'auto' | 'both'
export type RunStatus =
  | 'NEW' | 'RUNNING' | 'WAITING_GATE' | 'NEEDS_REVISION'
  | 'BLOCKED' | 'REJECTED' | 'DONE'

export interface ProcessStageDef {
  id: string                      // 'novelty_review'
  titleKey: string                // i18n key — không hardcode tiếng Việt/Anh
  kind: StageKind
  /** Artefact BẮT BUỘC phải tồn tại & validate trước khi vào stage. */
  requires: string[]              // ['outline.md', 'continuity-brief.json']
  /** Artefact stage này tạo ra (một file hoặc một bản ghi JSON). */
  produces: string[]
  /** Validator chạy tự động; trả issue có mức CRITICAL/MAJOR/MINOR. */
  validators?: string[]           // ['novelty.threshold', 'continuity.noConflict', 'qa.tech']
  gate: GateKind                  // human = chặn tới khi người duyệt
  /** Tác vụ tự động chạy khi stage bắt đầu (không tự publish). */
  automation?: {
    task: 'ai.script' | 'ai.outline' | 'ai.ideas' | 'factory.plan' | 'render.export' | 'none'
    connectionId?: string
    promptTemplate?: string       // id trong prompt library, không nhúng text
  }
  /** Chạy lại khi artefact đầu vào đổi (SOP §6: “các cổng phải chạy lại”). */
  rerunOnChange?: string[]
  allowSkip?: boolean             // mặc định false
}

export interface ProcessDefinition {
  id: 'anime-series' | string
  version: string                 // '1.0.0' — Run ghim version này
  titleKey: string
  artifactRoot: string            // 'production/episodes/{{run_id}}'
  stages: ProcessStageDef[]
  /** Luật chung: bắt buộc canon approved, không auto-publish, … */
  policy: {
    requireCanonApproved: boolean
    forbidAutoPublish: true
    maxRetries: number
    blockOnCritical: boolean
  }
}

export interface ProcessRun {
  runId: string                   // 'S01E007' — bất biến, không đổi tên
  processId: string
  processVersion: string
  status: RunStatus
  /** Ảnh chụp canon đầu vào: bible/episode-ledger version + hash. */
  canonSnapshot: { bibleVersion: string, ledgerVersion: number, hash: string }
  currentStage: string
  gate?: { stage: string, requestedAt: string, reviewer?: string, decision?: 'approved' | 'revise' | 'rejected', reason?: string }
  artifacts: ArtifactRef[]
  history: StageEvent[]           // ai làm, thời gian, input/output version, lỗi, retry
  cost: { estimatedUsd: number, actualUsd: number }
}

export interface ArtifactRef {
  name: string                    // 'novelty-report.md'
  version: number                 // tăng mỗi lần ghi, không ghi đè
  hash: string
  createdAt: string
  producedBy: 'user' | 'agent' | 'tool'
  approvedAt?: string
  approvedBy?: string
}
```

Lưu trữ: **file thật trên đĩa** (đúng cấu trúc thư mục SOP yêu cầu) + một index JSON
(`runs.json`) để UI liệt kê nhanh. Desktop ghi qua IPC (`electron/tools/process-store.cjs`),
web ghi qua Nitro (`/api/v1/process/*`) hoặc giữ trong IndexedDB với export zip —
giống cách `useTmcutStock` đã tách hai đường IPC/proxy.

### C.3 Bốn engine thuần (pure, test được bằng spec — không cần DOM)

1. **`novelty.ts`** — chấm điểm khác biệt theo đúng bảng trọng số SOP:
   `Novelty = Σ(score/5 × weight)` với 7 tiêu chí (15/20/15/15/15/10/10).
   Đầu vào: idea/outline dạng cấu trúc + danh sách episode đã có (từ Ledger).
   Đầu ra: `{ score, perCriterion, nearestEpisodes, risks, verdict }` với verdict
   PASS/REVISE/REJECT/HUMAN_REVIEW theo ngưỡng 80/65. Embedding/LLM chỉ là
   **tín hiệu phụ**, đúng nguyên tắc SOP §1.7 — engine không bao giờ tự kết luận pháp lý.
2. **`continuity.ts`** — so bible/ledger với artefact mới: nhân vật biết điều chưa
   được tiết lộ, vật phẩm sai vị trí, timeline/trang phục/thương tích, quy luật thế
   giới bị phá, clue mở chưa đóng. Trả issue CRITICAL/MAJOR/MINOR kèm `source_id`.
3. **`shotList.ts`** — `shot-list.json` có schema cố định (shot_id, scene_id, cỡ cảnh,
   góc máy, chuyển động, nhân vật + biểu cảm, bối cảnh/ánh sáng, prompt, reference
   asset id, seed, model/version, thời lượng, tiêu chí chấp nhận) và **xuất ra timeline
   TMCut**: mỗi shot → clip, dùng lại `videoAssembly.ts` + `videoFactory` plan để không
   viết lại logic ghép.
4. **`qa.ts`** — kiểm tra kỹ thuật khách quan từ media thật (ffprobe): đúng fps/
   resolution/codec, loudness thoại vs nhạc (EBU R128), khoảng lặng dài, khung đen,
   phụ đề lệch, tên file/ID phiên bản. Phần “nội dung/chính sách” vẫn là checklist
   cho người duyệt, engine chỉ **chặn lỗi kỹ thuật rõ ràng** như SOP §9 yêu cầu.

### C.4 Tái dùng hạ tầng đã có (không viết trùng)

| Cần | Dùng lại |
| --- | --- |
| Job/batch, retry, pause/resume, ngân sách | `useVideoFactory` + `utils/tmcut/videoFactory.ts` (state machine đã có `needs_review→approved→assembled`) |
| Duyệt thay đổi có kiểm soát | `useTmcutAgentTools` (proposal + apply 1 undo group) — mở rộng thêm tool cấp quy trình |
| Quyền sử dụng asset | `useTmcutAssetCenter` (license gate + takedown audit), `stockProviders.isCommercialSafeLicense` |
| Sinh ý tưởng/kịch bản | `useTmcutAi` + `aiTasks.ts` + `TmcutAiModelPicker` (hub connection) |
| Giọng đọc | `TmcutVoiceStudio` + `tmcut-voice.cjs` |
| Dựng/xuất | `compiler.ts`, `ffmpegHelper`, `useTmcutExportQueue` |
| Nhật ký & khôi phục | `utils/tmcut/recovery.ts` pattern (versioned snapshot) |

### C.5 Bổ sung Agent tools (cùng phong cách khai báo, có approval)

```text
process.get_run            (read)      trạng thái run, canon snapshot, stage hiện tại
process.list_artifacts     (read)      danh sách artefact + version + approved
process.read_artifact      (read)      nội dung một artefact (giới hạn kích thước)
process.propose_stage      (reversible) đề xuất chuyển stage kèm artefact mới
gate.request_approval      (reversible) trình cổng duyệt + evidence
gate.record_decision       (human-only) CHỈ người bấm — agent không có quyền này
canon.propose_fact         (reversible) đề xuất sửa canon (không tự áp)
run.attach_export          (reversible) gắn file master vào run sau QA
```

`gate.record_decision` là **ngoại lệ duy nhất** không cho agent: đúng SOP §4 (“Agent
không được tự bỏ qua cổng”). Audit event ghi `{reviewer, at, evidenceHash}`.

---

## D. Ánh xạ SOP → engine (cái gì tự động, cái gì người duyệt)

| Giai đoạn | Tự động hóa | Cổng người |
| --- | --- | --- |
| 0 | tạo `runId`, thư mục, ghim version bible/ledger | duyệt `episode-brief` |
| 1 | `continuity.ts` sinh `continuity-brief.json` có `source_id` | duyệt điểm mơ hồ/mâu thuẫn |
| 2 | 5–10 idea card (schema cố định) qua `ai.ideas` | chọn ý tưởng |
| 3 | `novelty.ts` chấm 7 tiêu chí + so với N tập gần nhất | quyết định PASS/REVISE/REJECT |
| 4 | render `outline.md` từ idea đã chọn | duyệt outline + novelty |
| 5 | `ai.script` → `script.md`; `continuity.ts` diff | duyệt kịch bản |
| 6 | `shotList.ts` → auto tạo timeline; tạo job asset qua factory | duyệt shot list + asset tham chiếu |
| 7 | TTS/clone, nhạc stock có license, tạo lại **đúng shot** lỗi (retry theo shot) | duyệt giọng & quyền asset |
| 8 | render master qua export queue, chuẩn hoá fps/res | — |
| 9 | `qa.ts` chặn lỗi kỹ thuật; checklist chính sách | duyệt nội dung + Made for Kids + khai báo |
| 10 | sinh `publish-package.md` từ run (metadata, credits, license) | xác nhận cuối, upload private trước |
| 11 | ghi Ledger từ **bản đã duyệt**, snapshot analytics, `CANON_LOCKED` | duyệt thay đổi canon |

Nguyên tắc “nội dung đổi sau duyệt ⇒ cổng chạy lại” được cài bằng `rerunOnChange`
+ hash artefact: mỗi artefact có `hash`, nếu hash đầu vào khác lúc duyệt thì gate tự
mở lại và stage quay về `NEEDS_REVISION`.

---

## E. Tùy biến cho quy trình khác (đúng yêu cầu “theo cấu trúc”)

1. **Process templates**: `processes/*.process.json` — người dùng tạo quy trình mới
   bằng cách khai báo stage/artefact/gate, không cần sửa code. SOP anime là profile
   mặc định, khoá `version` để run cũ không bị ảnh hưởng khi sửa profile.
2. **Validator registry**: mỗi validator là hàm pure `(input) => Issue[]`, khai báo
   bằng tên trong JSON; bộ mặc định `novelty.threshold`, `continuity.noConflict`,
   `qa.tech`, `meta.requiredFields`, `license.allCleared`. Thêm validator mới = thêm
   một file + đăng ký, không đụng engine.
3. **Prompt library theo stage**: prompt nằm trong profile (id + biến), không nhúng
   vào code — đổi giọng văn/kịch bản không cần build lại.
4. **UI “Quy trình”**: trang `app/pages/tmcut/process.vue` với 3 cột — Run list (trạng
   thái + tiến độ), Stage board (kanban theo đúng thứ tự `NEW→…→CANON_LOCKED`, badge
   gate/validator), Artifact viewer (markdown/JSON + diff giữa version). Mọi hành động
   đi qua engine, không sửa file trực tiếp.
5. **Mapping artefact → TMCut project**: stage 6–8 trả ra một project id; editor mở
   đúng project đó (đã có `videoFactory.assemble` làm mẫu).

---

## F. Lộ trình (5 phase, ưu tiên theo giá trị/công sức)

| Phase | Nội dung | Tiêu chí hoàn thành |
| --- | --- | --- |
| P1 | Types + `process-store` (IPC + Nitro) + engine stage/gate + `process.vue` khung; profile `anime-series` | Tạo run `S01E007`, đi qua stage bằng tay, gate chặn đúng, artefact lưu thành file có version/hash; spec `tmcut_process.spec.ts` phủ state machine + policy |
| P2 | `continuity.ts` + Ledger/Bible editor (character-state, clue-ledger, timeline) | Diff continuity chạy trên dữ liệu thật; issue có `source_id`; CRITICAL chặn stage |
| P3 | `novelty.ts` + idea card schema + báo cáo | Chấm đúng trọng số SOP; verdict theo ngưỡng 80/65; so được với N tập trong ledger; xuất `novelty-report.md` |
| P4 | `shotList.ts` → timeline; nối `videoFactory` cho asset; `qa.ts` + publish-package | Từ outline duyệt xong tạo được timeline có clip thật; QA bắt được lỗi fps/loudness/black frame trên file mẫu; publish-package sinh tự động |
| P5 | Canon lock + analytics snapshot + profile thứ hai (ví dụ shorts-batch) để chứng minh tính tổng quát | Khoá canon chỉ từ artefact đã duyệt; tạo được quy trình mới **không sửa code**; bản ghi analytics 24h/72h/7d |

Ước lượng thô: P1 ~ 2–3 ngày, P2 ~ 3 ngày, P3 ~ 2 ngày, P4 ~ 4–5 ngày, P5 ~ 3 ngày
(một người, có spec đi kèm). P1 làm được ngay, không phụ thuộc provider AI nào.

---

## G. Ràng buộc an toàn (phải giữ, lấy từ SOP §1 và §4)

1. **Không tự publish**: engine chỉ tạo `publish-package` và trạng thái `PRIVATE_UPLOAD`;
   `FINAL_REVIEW → SCHEDULED/PUBLISHED` chỉ người bấm.
2. **Agent không được**: sửa canon, tự đánh dấu canon, bỏ qua lỗi CRITICAL, kết luận
   pháp lý, đổi Made for Kids.
3. **Canon chỉ từ bản đã duyệt**: Ledger cập nhật từ artefact `status=approved` + hash;
   không lấy bản nháp.
4. **Mọi dữ liệu phải dẫn nguồn**: issue/diff/báo cáo đều mang `source_id`; nếu thiếu
   hoặc mâu thuẫn → `BLOCKED` + câu hỏi cho người, không bịa canon.
5. **Lịch sử không ghi đè**: artefact tăng version; khi đổi nội dung đã duyệt, gate
   liên quan tự chạy lại.
6. **Không hứa “chắc chắn không vi phạm bản quyền”**: novelty score chỉ để ưu tiên
   review.

---

## H. Câu hỏi mở cần bạn quyết

1. **Nơi lưu artefact**: file trên đĩa (Git-friendly, đúng SOP) hay DB nội bộ? Đề xuất
   file + index JSON, vì SOP yêu cầu cấu trúc thư mục và diff được.
2. **Scope P1**: chỉ desktop trước (IPC) rồi mở web, hay làm song song cả hai như stock?
3. **Ledger seed**: bạn đã có tập nào đã sản xuất để nhập vào Ledger ban đầu chưa
   (cần cho novelty từ tập 2 trở đi)?
4. **Provider cho stage 2/5**: dùng hub connection hiện có hay cần thêm model riêng cho
   tiếng Anh tự nhiên (SOP ưu tiên tiếng Anh)?
