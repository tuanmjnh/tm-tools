# TM Tools — Document Studio Documentation Hub (v5)

Tài liệu chính thức và đầy đủ nhất của phân hệ **Document Studio** trên `tm-tools`, được chuẩn hóa theo kiến trúc v5.

---

## 1. Mục lục tài liệu chuẩn hóa v5

Bộ tài liệu v5 là nguồn sự thật (Single Source of Truth) quy định kiến trúc, tiêu chuẩn kỹ thuật, định dạng file, mô hình AI và kế hoạch migration:

| Tài liệu | Mô tả chi tiết |
| :--- | :--- |
| [**`DOCUMENT-STUDIO-STANDARDIZATION-SPEC-v5.md`**](./DOCUMENT-STUDIO-STANDARDIZATION-SPEC-v5.md) | **Tài liệu đặc tả kiến trúc gốc**: Tầm nhìn phân hệ, tái cấu trúc trang, chuẩn hóa 2 root thư viện (`input` / `output`), Format / Operation / Conversion / Executor Registries, Storage & Runtime Matrix, bảo mật và Definition of Done. |
| [**`DOCUMENT-STUDIO-FORMAT-AND-EXTRACTION-CONTRACT-v5.md`**](./DOCUMENT-STUDIO-FORMAT-AND-EXTRACTION-CONTRACT-v5.md) | **Hợp đồng kỹ thuật định dạng & trích xuất**: Ma trận chuyển đổi 13 định dạng (PDF, DOCX, XLSX, Markdown, v.v.), cơ chế chọn AI Model (`gemini-2.5-flash`, `gemini-2.5-pro`), bộ Prompt Presets chuẩn hóa, cấu hình định dạng xuất, Checkpoint & Resumability, và quy trình xử lý Artifacts trong Activity. |
| [**`DOCUMENT-STUDIO-LEGACY-MIGRATION-PLAN-v5.md`**](./DOCUMENT-STUDIO-LEGACY-MIGRATION-PLAN-v5.md) | **Kế hoạch chuyển đổi dữ liệu và mã nguồn legacy**: Lộ trình 7 giai đoạn (P0 → P6), ma trận ánh xạ thư mục cũ (`sources/`, `split/`, `ocr/`, v.v. sang `input/` & `output/`), cơ chế Dry-run / Copy / Checksum / Rollback, nâng cấp Activity Log và các Test Gates kiểm soát chất lượng. |

---

## 2. Điểm cốt lõi của Kiến trúc v5

### 2.1 Cấu trúc thư viện chuẩn hóa (Two Library Roots)
Document Studio v5 xóa bỏ hoàn toàn sự phân mảnh của các thư mục legacy (`sources/`, `split/`, `merge/`, `ocr/`, `markdown/`, `compress/`, `convert/`, `protect/`, `watermark/`, `compare/`, `validate/`). Toàn bộ file và thư mục quản lý qua 2 root duy nhất:

```text
/document-studio/
├── input/       ← Toàn bộ tài liệu đầu vào (upload, scan, nhập liệu thô, v.v.)
└── output/      ← Toàn bộ kết quả đầu ra (trích xuất AI, tách/ghép, chuyển đổi, v.v.)
```

### 2.2 Độc lập định dạng (Format Registry & Conversion Matrix)
- Document Studio v5 mở rộng xử lý đa định dạng: `pdf`, `docx`, `xlsx`, `pptx`, `csv`, `json`, `yaml`, `xml`, `txt`, `md`, `html`, `png`, `jpeg`, v.v.
- Các thao tác chuyển đổi định dạng và executor được đăng ký qua registry tập trung, có fallback an toàn giữa môi trường Local Node.js / Electron và Cloud / Vercel Serverless.

### 2.3 Phân hệ Trích xuất AI (AI Extraction)
- Cho phép người dùng tùy chọn mô hình AI theo nhu cầu (Flash cho tốc độ / Pro cho độ chính xác cao).
- Tích hợp cấu hình Prompt Presets chuyên sâu, tùy chọn định dạng xuất ra (`Markdown`, `JSON`, `CSV`, `TXT`) và cơ chế checkpoint chống mất mát tiến trình khi trích xuất tài liệu nhiều trang.

### 2.4 Trải nghiệm Activity & Artifact Viewer
- Activity log theo dõi mọi tác vụ tài liệu cùng danh sách artifacts được sinh ra.
- Tích hợp viewer cho phép xem trực tiếp nội dung artifact trong modal / cửa sổ trình duyệt (inline preview) mà không ép người dùng phải download về máy.

---

## 3. Kho lưu trữ tài liệu lịch sử (Archives)

Các tài liệu thuộc các phiên bản kiến trúc trước (v1, v3, v4) đã được chuyển vào thư mục lưu trữ nhằm bảo toàn lịch sử phát triển, audit log và bằng chứng kiểm thử của từng giai đoạn:

- **v4 Documentation**: [`docs/archive/2026-11-08-document-studio-v4/`](../archive/2026-11-08-document-studio-v4/)
  - Chứa: `ARCHITECTURE-v4.md`, `API-CONTRACTS.md`, `OPERATIONS-CATALOG.md`, `MIGRATION-PLAN.md`, `CLOUD-ARCHITECTURE.md`, `PHASE-STATUS.md`, `REBUILD-AUDIT.md`, `RETENTION-CLEANUP.md`, `STORAGE-RUNTIME-MATRIX.md`, `TEST-VERIFICATION.md`, `VERCEL-DEPLOYMENT.md`, `LEGACY-RETIREMENT.md`.
- **v4 Phase 5 snapshot**: [`docs/archive/2026-11-06-document-studio-v4-phase5/`](../archive/2026-11-06-document-studio-v4-phase5/)
- **v3 Draft Rebuild Spec**: [`docs/archive/2026-11-05-rebuild-spec-v3-draft/`](../archive/2026-11-05-rebuild-spec-v3-draft/)
- **Workspace Spec v1**: [`docs/archive/2026-11-05-workspace-spec-v1/`](../archive/2026-11-05-workspace-spec-v1/)
- **Pre-tmcut Extraction v1**: [`docs/archive/2026-10-31-v1-pre-tmcut-extraction/`](../archive/2026-10-31-v1-pre-tmcut-extraction/)

---

## 4. Hướng dẫn cho Nhà phát triển & AI Coding Agents

1. **Quy chuẩn đọc tài liệu**:
   - Khi phát triển tính năng mới hoặc chỉnh sửa Document Studio, **bắt buộc** bám sát 3 tài liệu v5 tại mục 1.
   - **Tuyệt đối không** sử dụng các quy chuẩn cũ từ `docs/archive/` (như các thư mục con phân mảnh `split/`, `sources/` hay giả định chỉ hỗ trợ duy nhất PDF).
2. **Quy trình kiểm tra (Testing & Quality Gate)**:
   - Chạy test unit: `pnpm test:unit` (đảm bảo 100% test cases passed).
   - Kiểm tra mã nguồn vệ sinh: `pnpm check:hygiene`.
   - Kiểm tra kiểu dữ liệu: `pnpm typecheck`.
   - Kiểm tra build hệ thống: `pnpm build`.
