# Triển khai Production Process Engine (2026-10-30)

Tài liệu này ghi lại **phần đã làm thật** của “Production Process Engine” — lớp quy trình
bọc quanh SOP [quy-trinh-san-xuat-anime-ai-chong-trung-lap.md](quy-trinh-san-xuat-anime-ai-chong-trung-lap.md).
Phần đánh giá/định hướng ban đầu nằm ở [ho-tro-quy-trinh-san-xuat-anime.md](ho-tro-quy-trinh-san-xuat-anime.md).

Ba yêu cầu của vòng này:

1. **Artefact lưu thành file thật trên đĩa** (không phải state trong RAM/localStorage).
2. **Chạy song song cả desktop (Electron) lẫn web (Nitro)** — cùng một bố cục thư mục.
3. **Có một tập demo** (vì chưa có tập nào) và **chọn được model bất kỳ** trong các provider
   đã kết nối.

---

## A. Bản đồ file

| Lớp | File | Vai trò |
| --- | --- | --- |
| Kiểu dữ liệu | `app/types/productionProcess.ts` | Definition / Run / Artifact / Gate / lỗi có mã |
| Profile SOP | `app/utils/process/definition.ts` | `ANIME_SERIES_PROCESS`: 12 giai đoạn, artefact vào/ra, cổng người duyệt |
| Engine thuần | `app/utils/process/stageMachine.ts` | `createRun / startStage / completeStage / recordGate / addArtifact` — không Vue, không đĩa, không AI |
| Prompt | `app/utils/process/prompts.ts` | Prompt dựng từ artefact ngữ cảnh; `extractJson` cho stage cần JSON |
| Demo | `app/utils/process/demoEpisode.ts` | Nội dung tập `S01E001` (nguyên bản) + danh sách cổng đã duyệt |
| Composable | `app/composables/useTmcutProcess.ts` | Adapter lưu trữ (IPC ↔ Nitro), gọi engine, một automation AI mỗi stage |
| UI | `app/pages/tmcut/process.vue` | Bảng 12 giai đoạn, cổng duyệt, xem/sửa artefact, chọn model |
| Guard dùng chung | `shared/utils/processStore.ts` | Luật đường dẫn cho bản web |
| Store desktop | `electron/tools/process-store.cjs` | Ghi/đọc file thật trong `userData` (bản CJS của guard ở trên) |
| Store web | `server/utils/processStore.ts` + `server/api/v1/process/**` | Ghi/đọc file thật trên server, 5 route |
| Spec | `tests/unit/tmcut_process.spec.ts` | 21 check: profile, state machine, parity guard, round-trip đĩa |

Đăng ký: `electron/main.cjs` → `registerProcessController()` (sau cổng `gateIpcMainHandle`),
`electron/preload.cjs` → namespace `process`, `shared/types/electron.ts` → `ProcessNamespace`.

---

## B. Artefact = file thật, có phiên bản

Bố cục giống hệt nhau ở hai runtime:

```text
<root>/runs/S01E001/run.json                          ← trạng thái run (atomic replace)
<root>/runs/S01E001/artifacts/v1/episode-brief.md     ← nội dung, mỗi version một thư mục
<root>/runs/S01E001/artifacts/v2/episode-brief.md
```

`<root>` là:

- **desktop**: `app.getPath('userData')/tmcut/process` (mở nhanh bằng nút “Mở thư mục”);
- **web**: `.data/process` trong project (đã gitignore), đổi bằng biến môi trường
  `TMCUT_PROCESS_DIR`.

Quy tắc lưu trữ (giống nhau ở cả hai phía):

| Quy tắc | Lý do |
| --- | --- |
| Append-only + đánh số `v1, v2…` | Mỗi lần sửa là một bản mới, không ghi đè lịch sử |
| `sha256` của nội dung ghi kèm run | Cổng duyệt ghim **đúng hash đã duyệt**, không chỉ tên file |
| Ghi `run.json` qua file tạm + rename | Crash giữa lúc ghi không để lại JSON hỏng |
| `runId` phẳng `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$` | Không `/`, không `..`, không dotfile |
| Tên artefact phẳng `^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$` | Không thể biến tên thành đường dẫn |
| Mọi path phải `startsWith(root + sep)` | Chặn traversal ở tầng thấp nhất |
| Trần 1 MiB/artefact, 512 KiB/run | Đây là Markdown/JSON, không phải media |

Hai bản guard (TS cho web, CJS cho Electron) **bị spec so khớp từng vector** — cùng cách đã
dùng cho `stockGuards`, vì main process sandbox không import được TypeScript.

---

## C. Hai runtime, một hợp đồng

| Việc | Desktop (IPC) | Web (Nitro) | Auth |
| --- | --- | --- | --- |
| Danh sách run | `process:list` | `GET /api/v1/process/runs` | có |
| Đọc run | `process:read` | `GET /api/v1/process/runs/:runId` | có |
| Ghi run | `process:save` | `PUT /api/v1/process/runs/:runId` | có |
| Ghi artefact | `process:writeArtifact` | `POST /api/v1/process/artifact` | có |
| Đọc artefact | `process:readArtifact` | `GET /api/v1/process/artifact?runId&name&version` | có |
| Mở thư mục | `process:openRoot` | — (không có đĩa ở client) | — |

Composable tự chọn đường: có `window.electronAPI.process` thì IPC, còn lại `$fetch`.
Cả hai trả cùng envelope `{ ok, data, error }` nên phần còn lại của app không cần biết
mình đang chạy ở đâu.

**Engine chạy ở client** (trình duyệt hoặc renderer), server/main chỉ là nơi giữ byte. Nhờ vậy
một lần đổi trạng thái = một vòng: tính state → ghi artefact → ghi `run.json`. Không có
“hai nguồn sự thật”.

---

## D. Luật của SOP được mã hoá, không phải dặn dò

| Luật SOP | Nơi thực thi | Hệ quả |
| --- | --- | --- |
| Không viết trước khi đọc lịch sử | `startStage` kiểm `requires` | Thiếu artefact → lỗi `missing-artifacts`, UI không cho bấm |
| Không qua cổng khi chưa có sản phẩm | `completeStage` kiểm `produces` | Stage “xong” mà không có file là không thể |
| Người duyệt ở cổng | `gate: 'human'` + `recordGate` | AI điền được nội dung, **không bao giờ** tự duyệt |
| Sửa nội dung sau khi duyệt ⇒ duyệt lại | `addArtifact` → `reopenStaleGates` | Ghi `v2` cho artefact đã duyệt sẽ mở lại stage đó + reset các stage sau |
| Không tự động xuất bản | `policy.forbidAutoPublish: true` | Stage `publish` luôn là việc của người |
| Bản duyệt cũ vẫn còn dấu | `approvedHash` giữ trên version cũ | `staleApprovals()` nuôi banner “vì sao cổng mở lại” |

Spec pin toàn bộ các nhánh này, gồm cả trường hợp khó: duyệt `brief` xong, ghi `v2` của
`episode-brief.md` thì run lùi về `brief`, `continuity` trở lại `pending`.

---

## E. Tập demo `S01E001`

Nút **Demo** trên trang Quy trình tạo (idempotent — đã có thì mở, không nhân bản):

- `S01E001 — “The Signal Beneath”`, series bible *Static Horizon* (nội dung nguyên bản, viết cho demo);
- 6 artefact: `series-bible.md`, `episode-brief.md`, `continuity-brief.json`, `ideas.md`,
  `novelty-report.md`, `outline.md`;
- 5 cổng đã duyệt (`brief → continuity → ideas → novelty → outline`) bởi `demo-seed`;
- Dừng đúng ở **`script`** — để bước AI đầu tiên là bước người dùng thật sự bấm, với model của họ.

Vì sao không seed hết 12 stage: nếu demo duyệt sẵn mọi thứ thì không kiểm chứng được
automation, cổng duyệt, và luật “sửa thì mở lại”. Dừng ở `script` giữ cả ba thứ đó trong
tầm một cú bấm.

Spec chứng minh phần seed chạy đúng bằng engine thật (không mock): seed → 5 cổng approved →
`currentStage === 'script'` → progress 41% → không có approval nào bị stale.

---

## F. Chọn model bất kỳ trong các provider đã kết nối

Trang Quy trình nhúng `TmcutAiModelPicker` với `task="plan"`. Nghĩa là:

- danh sách model **chỉ** gồm provider đã kết nối trên TM Hub (không có form nhập key thứ hai);
- chọn xong sẽ ghi routing của **surface** `plan`: desktop lưu slot `AI_*_PLAN` (key nằm trong
  gateway, renderer không thấy); web chỉ lưu quyết định `connectionId + provider + model`,
  credential do relay phía server giữ;
- nút Test chạy một completion thật (liệt kê model không chứng minh được gì);
- `useTmcutProcess.runAutomation(stage)` dùng chính routing đó: `buildStagePrompt` → model →
  `extractJson` (nếu stage cần JSON) → ghi file → `completeStage` → dừng ở cổng người duyệt.

Automation chỉ tồn tại ở các stage khai báo `automation` trong profile (hiện tại:
`continuity, ideas, novelty, outline, script, shots`). Stage `assets/edit/qa/publish/canon`
là việc của công cụ khác trong app (Video Factory, editor, export) và vẫn qua cổng người.

---

## G. Kiểm chứng đã chạy

| Check | Kết quả |
| --- | --- |
| `pnpm test:process` (21 check) | PASS — profile, state machine, parity guard web/desktop, round-trip file thật qua store Nitro (tmp dir) |
| `pnpm typecheck` (`nuxt typecheck`) | PASS |
| `eslint` trên toàn bộ file mới/đổi | PASS |
| `tmcut_i18n_keys.spec.ts` | PASS (khoá `tmcut.process.*` có đủ ở en + vi) |
| `tmcut_component_hygiene.spec.ts` | PASS (22 check) |
| `tmcut_ipc_policy.spec.ts` | PASS (9 check) |

Lỗi thật đã bắt được trong lúc làm (và đã sửa):

1. **Engine**: khi mở lại một stage đã duyệt, stage kế tiếp đang `ready` không bị hạ về
   `pending` → bảng hiển thị một stage “sẵn sàng” trong khi pipeline đã lùi. Spec bắt, đã sửa.
2. **Composable**: `runAutomation` từ chối mọi lần chạy lại khi stage đang `running` (di sản
   của một lần gọi AI thất bại), trong khi ý định là *tiếp tục*, không phải *khởi động lại*
   (khởi động lại sẽ tăng `attempts` vô nghĩa).
3. **Type**: `isSafeVersion` trả `boolean` nên `processStore.ts` không narrow được
   `input.version` → đổi thành type predicate `value is number`.
4. **Portability**: spec so sánh path tuyệt đối kiểu POSIX nên fail trên Windows → dựng
   expectation bằng `resolve()`.

**Chưa kiểm chứng**: chưa bấm thử UI trên Electron/web trong vòng này (chưa mở app, chưa
chạy `pnpm dev:electron`). Những gì đã chứng minh là engine + lưu trữ + route/IPC + i18n;
luồng click thật (chọn model, gọi AI, duyệt cổng) vẫn cần một vòng chạy tay.

---

## H. Việc tiếp theo (đề xuất, theo thứ tự giá trị)

1. **Chạy tay một vòng trên Electron**: Demo → chọn model `plan` → bấm AI ở `script` → đọc
   `script.md` → revise → approve. Đây là bài test duy nhất còn thiếu cho UI.
2. **Nối artefact với công cụ sản xuất**: `shot-list.json` (stage `shots`) → `videoFactory`
   plan; `asset-manifest.json` (stage `assets`) → Asset Center; `edit-notes.md` → mở editor.
   Hiện các stage này chỉ ghi file, chưa gọi công cụ.
3. **QA engine thuần**: đọc `qa-report.md` + manifest, chặn cổng khi có issue CRITICAL
   (`policy.blockOnCritical` đã có cờ, chưa có validator).
4. **Canon/ledger**: `episode-ledger.json` hiện là artefact thường; cần schema + khoá ghi
   để nó thật sự là “trí nhớ của series”.
5. **Profile JSON từ đĩa**: `definition.ts` đã tách khỏi engine; bước tiếp là đọc
   `docs/production-process/processes/*.process.json` để người dùng tự thêm quy trình.
