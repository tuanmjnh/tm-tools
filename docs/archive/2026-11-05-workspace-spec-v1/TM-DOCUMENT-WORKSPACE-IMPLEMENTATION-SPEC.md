# TM Tools – Managed Document Workspace & Universal Explorer

> **Tài liệu giao cho AI Coding Agent triển khai trực tiếp trên codebase hiện tại.**
>
> Phạm vi: chuẩn hóa cách quản lý file, cây thư mục và giao diện 2 side trong Electron/TM Tools; áp dụng trước cho PDF Studio và có khả năng mở rộng cho Word, Excel, hình ảnh, OCR, AI Extraction, chuyển đổi và xuất dữ liệu.
>
> **Yêu cầu quan trọng:** dự án hiện đã có UI, component và chức năng PDF đang hoạt động. AI phải audit code hiện tại trước, tái sử dụng tối đa component/logic sẵn có, chỉ tạo component mới khi thực sự thiếu. Không được tự ý viết lại module hoặc thay đổi kiến trúc hiện tại chỉ vì muốn làm sạch code.

---

## 0. Chỉ dẫn bắt buộc cho AI Coding Agent

### 0.1. Làm việc trên codebase hiện tại

Trước khi chỉnh sửa:

1. Đọc cấu trúc repository, `package.json`, cấu hình Electron, preload, IPC, router, state management, UI framework và quy ước đặt tên hiện tại.
2. Kiểm tra các trang PDF Studio đang tồn tại, đặc biệt các trang tương ứng với giao diện trong ảnh người dùng cung cấp:
   - Thư viện PDF.
   - Tách & Ghép.
   - Ảnh trang.
   - Xuất PDF.
   - Nhập PDF.
   - Bóc tách bảng giá bằng AI.
3. **Bắt buộc kiểm kê toàn bộ component hiện có trong `root/app/components/pdf`.** Đọc source của các component liên quan, xác định props, emits/events, slots, composables, store và dependency đang dùng.
4. Tìm các component dùng chung ở ngoài `root/app/components/pdf` (layout, sidebar, card, table, dropdown, dialog, tooltip, toast, file icon, viewer, upload, progress, empty state...) để tránh tạo bản sao.
5. Kiểm tra cách ứng dụng hiện đọc thư mục/file trên máy, lưu cấu hình workspace, tạo output, mở cửa sổ preview và phục hồi job.
6. Chạy các lệnh kiểm tra/build/test sẵn có để ghi nhận baseline trước khi sửa.

### 0.2. Tạo báo cáo audit trước khi code

Tạo tài liệu ngắn, ví dụ `docs/pdf-studio/workspace-audit.md`, ghi rõ:

- Cấu trúc trang và component hiện có.
- Bảng component: tên, đường dẫn, nhiệm vụ, nơi đang sử dụng, có thể tái sử dụng ở đâu.
- API/IPC/filesystem service hiện có.
- Cấu trúc thư mục thực tế hiện tại và dữ liệu người dùng đang có.
- Các điểm đang hoạt động cần bảo toàn.
- Khoảng trống cần bổ sung.
- Kế hoạch thay đổi và file dự kiến chỉnh sửa.

Không dừng lại ở báo cáo. Sau khi audit, tiếp tục triển khai theo tài liệu này, không yêu cầu người dùng xác nhận các quyết định đã được mô tả ở đây. Nếu có điểm chưa rõ trong codebase, chọn phương án ít phá vỡ nhất và ghi lại assumption trong audit.

### 0.3. Quy tắc tái sử dụng component

- Ưu tiên component hiện có trong `root/app/components/pdf`.
- Nếu component hiện có đáp ứng khoảng 70–80% yêu cầu, hãy mở rộng theo hướng backward-compatible thay vì tạo component mới tương tự.
- Nếu component có nhiều trách nhiệm không phù hợp, tách nhỏ có kiểm soát và giữ component cũ làm wrapper nếu cần tương thích.
- Component dùng chung cho nhiều nhóm tài liệu có thể đặt tại khu vực shared/common theo convention của dự án; không ép component PDF-specific thành global component.
- Component mới liên quan PDF/Document Workspace nên đặt trong `root/app/components/pdf` và tuân theo cấu trúc/thói quen đặt tên hiện tại.
- Không tạo thêm thư viện UI hoặc design system mới. Tận dụng UI framework và primitive đang cài trong dự án.
- Không tạo component chỉ để bọc một component hiện có mà không mang thêm logic/layout có ý nghĩa.
- Không hard-code dữ liệu file, thư mục, số lượng, trạng thái hoặc đường dẫn chỉ để dựng giao diện.
- Không thay thế toàn bộ giao diện bằng mockup/demo tĩnh. Mọi control hiển thị phải có hành vi thực tế hoặc trạng thái disabled kèm lý do.

---

## 1. Mục tiêu sản phẩm

Xây dựng **Managed Document Workspace** – không gian lưu trữ tài liệu do ứng dụng quản lý, dùng chung cho toàn bộ PDF Studio và các công cụ tài liệu mở rộng.

Nguyên tắc sản phẩm:

1. Một workspace gốc được cấu hình cho ứng dụng.
2. Một cây thư mục thống nhất dùng chung giữa các trang chức năng.
3. Các thư mục hệ thống được tạo và quản lý bởi ứng dụng; người dùng không được đổi tên, di chuyển hoặc xóa chúng.
4. Người dùng thao tác với file bên trong theo quyền được cấp: xem, đọc, thêm, ghi output, đổi tên/xóa file ở những khu vực được cho phép.
5. Mỗi công cụ có thư mục output mặc định riêng; người dùng không phải tự chọn lại đường dẫn cho từng lần chạy.
6. Tài liệu nguồn không bị sửa trực tiếp bởi các thao tác xử lý. Mọi kết quả là artifact/file đầu ra riêng.
7. Các trang giữ mô hình **2 side**: Explorer bên trái, File/Task Workspace bên phải.
8. Các trang có thể có cấu hình tác vụ, tiến trình hoặc kết quả riêng nhưng dùng chung Document Service, Folder Registry, File Metadata và Job System hiện có.
9. Preview Window hiện tại phải được giữ và phát triển thành Universal Document Viewer, không viết một cơ chế xem file độc lập khác.
10. Triển khai theo từng phase, có kiểm thử và không làm mất dữ liệu/thay đổi hành vi đang hoạt động.

### Không nằm trong phạm vi tự ý thay đổi

- Không đổi framework frontend hoặc Electron architecture nếu audit không chứng minh cần thiết.
- Không thay toàn bộ router, state management, database hoặc UI library.
- Không viết lại PDF extraction/AI relay hiện có; chỉ tích hợp nó vào workspace thống nhất.
- Không xóa cây thư mục hiện tại trước khi có migration và kiểm chứng dữ liệu.
- Không đưa nghiệp vụ xử lý PDF vào TM Hub. TM Tools tiếp tục dùng các dịch vụ của TM Hub qua cơ chế kết nối hiện tại.

---

## 2. Mô hình giao diện tổng thể

### 2.1. Giữ mô hình 2 side hiện tại

Giữ nguyên bố cục người dùng đang quen thuộc:

- **Left side – Universal Document Explorer:** cây thư mục, tìm kiếm thư mục, bộ lọc chế độ hiển thị, trạng thái chọn.
- **Right side – File Explorer / Tool Workspace:** breadcrumb, toolbar, danh sách file, actions và khu vực cấu hình/tiến trình theo công cụ hiện tại.

Không biến trang thành một dashboard nhiều card rời rạc hoặc bắt người dùng đi qua nhiều bước upload không cần thiết.

### 2.2. Khung layout chuẩn

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ App navigation / sidebar hiện tại                                           │
├────────────────────────────────────────────────────────────────────────────┤
│ Page header: Icon + Tên công cụ + mô tả ngắn + actions cấp trang            │
├────────────────────────┬───────────────────────────────────────────────────┤
│ UNIVERSAL EXPLORER     │ RIGHT WORKSPACE                                    │
│                        │                                                   │
│ Search folders         │ Breadcrumb / current folder                       │
│ All / Contextual       │ Toolbar: Search, Filter, Sort, View, Refresh       │
│                        │                                                   │
│ Folder tree            │ Selection summary / Bulk actions                  │
│                        │                                                   │
│                        │ File list / Grid / Details                         │
│                        │                                                   │
│                        │ Contextual operation panel (tùy công cụ)           │
│                        │ Progress / Job result (khi có tác vụ)               │
└────────────────────────┴───────────────────────────────────────────────────┘
```

Navigation chính của TM Tools và sidebar ứng dụng hiện tại phải được giữ. Universal Explorer là side thứ nhất bên trong nội dung trang, không thay thế app navigation.

### 2.3. Kích thước và hành vi 2 side

- Explorer mặc định khoảng **280–320px** trên màn hình desktop thông thường.
- Có splitter để kéo thay đổi chiều rộng; đặt min/max hợp lý (tham khảo min 220px, max 420px, điều chỉnh theo kích thước cửa sổ).
- Có nút collapse/expand Explorer.
- Lưu kích thước và trạng thái đóng/mở trong preference của ứng dụng.
- Right side phải co giãn chiếm toàn bộ không gian còn lại (`min-width: 0`, không gây tràn ngang).
- Khi cửa sổ hẹp, cho phép chuyển Explorer thành drawer/collapsible panel; không ép hai side gây vỡ layout.
- Không để nested scroll khó sử dụng. Explorer có scroll riêng; nội dung phải có cách phân vùng scroll rõ ràng.
- Các thao tác quan trọng không được nằm ngoài viewport mà không có cách truy cập; với trang tác vụ dài, dùng panel có thể cuộn và toolbar/action có vị trí hợp lý.

### 2.4. Giữ design system hiện tại

- Giữ dark theme, màu sắc, typography, border, radius, spacing, icon style và trạng thái hover/focus của TM Tools.
- Không tự đổi theme hoặc tạo style lệch khỏi các trang hiện có.
- Ưu tiên token CSS/theme hiện tại thay vì hard-code màu mới.
- Giữ mật độ thông tin phù hợp desktop: đủ gọn để xem nhiều file nhưng tên, metadata và action vẫn dễ đọc.
- Dùng icon từ bộ icon đang có; không đưa emoji vào UI sản phẩm.
- Tất cả action cần có tooltip/title khi icon-only.
- Có trạng thái focus bàn phím, disabled, loading, error, empty và selected rõ ràng.

---

## 3. Universal Document Explorer – cây thư mục dùng chung

### 3.1. Vai trò

Universal Explorer là một component/hệ thống dùng chung trên tất cả trang thuộc PDF Studio/Document Studio. Nó đọc cây thư mục thực tế từ Managed Workspace, không phải cây menu tĩnh được viết cứng trong từng trang.

### 3.2. Ba chế độ hiển thị

1. **All folders:** hiển thị toàn bộ cây thư mục nghiệp vụ mà người dùng được phép nhìn thấy.
2. **Contextual:** vẫn dùng cùng cây thư mục nhưng ưu tiên/mở sẵn các nhóm liên quan đến công cụ hiện tại. Không tạo cây dữ liệu khác.
3. **Recent / Favorites:** truy cập nhanh các thư mục gần đây hoặc được đánh dấu yêu thích. Có thể triển khai dạng tab/filter, không cần nhân bản cây thư mục.

Mặc định:
- Các trang quản lý tổng quan và thư viện: All folders hoặc trạng thái lần trước.
- Trang Split/Merge: Contextual, mở/nhấn mạnh Sources và PDF Processing.
- Trang Images: Contextual, mở/nhấn mạnh Sources và Images Processing.
- Trang Conversion: Contextual, mở/nhấn mạnh Sources và Document Conversion.
- Trang OCR/AI Extraction: Contextual, mở/nhấn mạnh Sources, OCR & Extraction và Exports.

Người dùng luôn có thể chuyển sang All folders.

### 3.3. Header Explorer

Header nên có:
- Tiêu đề ngắn: `Thư mục` hoặc `Explorer`.
- Nút tạo thư mục con nếu vùng hiện tại cho phép.
- Nút refresh/reload metadata.
- Tùy chọn All / Contextual / Recent / Favorites nếu phù hợp.
- Search folder.
- Nút collapse Explorer.

Không hiển thị các nút tạo/đổi tên/xóa đối với system folder nếu operation không được cho phép.

### 3.4. Folder row

Mỗi node cần hỗ trợ:
- Expand/collapse bằng chevron riêng.
- Icon loại folder.
- Tên hiển thị.
- Checkbox chọn folder (nếu trang hỗ trợ chọn folder).
- Badge/count file hoặc số lượng item con khi API cung cấp.
- Indicator system-managed/user-managed.
- Trạng thái đang tải/lỗi nếu lazy-load.
- Context menu chỉ hiển thị actions được cấp phép.

Quy tắc tương tác:
- Click tên folder: chọn và mở folder ở Right side.
- Click chevron: chỉ expand/collapse, không đổi folder đang xem.
- Click checkbox: chỉ thay đổi selection, không tự expand/collapse.
- Click context menu: mở actions phù hợp.
- Selection folder và navigation folder phải là hai state riêng biệt.

### 3.5. Chọn nhiều thư mục

- Hỗ trợ checkbox chọn một hoặc nhiều folder nếu nghiệp vụ hiện tại cần batch theo folder.
- Có thể hỗ trợ Ctrl/Shift trên desktop, nhưng không được làm selection khó hiểu.
- Chọn folder cha không mặc định đồng nghĩa đã chọn toàn bộ file con nếu UI chưa nói rõ. Cần có action rõ ràng như `Chọn toàn bộ file trong thư mục`.
- Khi folder cha có folder con được chọn, thể hiện trạng thái checkbox indeterminate nếu phù hợp.
- Không cho phép chọn vùng system/cache nội bộ cho tác vụ thông thường.

### 3.6. Lazy loading và hiệu năng

- Không tải toàn bộ metadata của tất cả file trong tất cả thư mục khi mở app.
- Lần đầu tải root và các node cấp đầu; chỉ tải con khi expand.
- Cache tree metadata có TTL/invalidation rõ ràng.
- Refresh một nhánh không buộc reload toàn bộ workspace.
- Với cây lớn, dùng virtual scrolling nếu cần.
- Search folder có debounce và tìm trên metadata; không quét nội dung toàn bộ file mỗi lần gõ.
- Xử lý folder bị xóa/mất ngoài ứng dụng: hiện trạng thái missing/unavailable và cho phép rescan/reconcile, không crash.

---

## 4. File Explorer – danh sách file bên phải

### 4.1. Header và breadcrumb

Khi chọn folder, Right side phải thể hiện:
- Breadcrumb đầy đủ từ workspace tới folder hiện tại.
- Tên folder hiện tại và mô tả ngắn nếu có.
- Số lượng file/thư mục nếu đã biết.
- Nút refresh.
- Nút import/upload/copy vào workspace nếu vùng đó cho phép.
- Nút mở folder vật lý trong File Explorer của Windows nếu policy cho phép; chỉ thực hiện thông qua Main Process và đường dẫn đã resolve an toàn.

### 4.2. Toolbar

- Search file trong folder hiện tại.
- Filter theo file type, ngày tạo/sửa, dung lượng, processing status.
- Sort: tên, mới nhất/cũ nhất, dung lượng, loại file.
- View mode: List, Compact List, Grid, Details.
- Refresh.
- Import/Add files nếu được phép.
- Không nhồi nhiều action vào toolbar; action hiếm dùng đặt trong menu More.

### 4.3. Các kiểu hiển thị

**List (mặc định):** phù hợp kho tài liệu và thao tác hàng ngày. Hiển thị icon/thumbnail, tên file, dung lượng, modified date, status, action.

**Compact List:** hiển thị gọn khi danh sách dài.

**Grid:** thumbnail/cover lớn hơn, phù hợp ảnh và tài liệu cần nhận diện trực quan.

**Details:** bảng có cột metadata; hỗ trợ sort và chọn cột nếu component/table hiện tại đáp ứng.

Lưu view mode theo trang hoặc theo người dùng; không làm thay đổi dữ liệu.

### 4.4. File row/card

Thông tin cơ bản:
- File icon/thumbnail theo MIME type.
- File name.
- Extension/type.
- File size.
- Thời gian cập nhật.
- Trạng thái processing nếu file được liên kết với job.
- Badge nguồn/đầu ra nếu cần phân biệt.
- Action menu theo quyền và ngữ cảnh.

Quy tắc:
- Double click hoặc action Preview: mở Universal Document Viewer hiện có.
- Single click: chọn file.
- Checkbox: multi-select độc lập với mở preview.
- Context menu: chỉ action hợp lệ với MIME type, quyền và trạng thái file.
- Không render action không dùng được rồi để lỗi khi bấm.

### 4.5. Selection và Bulk Actions

Khi chọn một hoặc nhiều file, hiển thị selection toolbar ở phía trên danh sách:
- Số file đã chọn.
- Clear selection.
- Preview/Open (chỉ khi phù hợp).
- Thao tác nghiệp vụ (Split, Merge, Convert, OCR, AI Extraction...) theo công cụ hiện tại.
- Copy/Move/Delete chỉ khi policy cho phép.
- Export khi dữ liệu đã có kết quả hợp lệ.

Không đặt quá nhiều nút trực tiếp trên mỗi row. Row chỉ nên có action chính và menu More.

### 4.6. Empty/loading/error states

- Folder rỗng: giải thích folder dùng cho mục đích gì và đưa action phù hợp (ví dụ Import PDF, chưa có output).
- Loading: skeleton ổn định, không nhảy layout.
- Error: thông báo dễ hiểu, có Retry; log kỹ thuật ở backend.
- File type không hỗ trợ preview: thông báo và cung cấp Open externally nếu an toàn.
- Folder không tồn tại: báo dữ liệu đã thay đổi ngoài ứng dụng, có action rescan.

---

## 5. Cấu trúc Managed Workspace

### 5.1. Nguyên tắc

- Một `workspaceRoot` được cấu hình/đăng ký cho ứng dụng.
- Tên folder vật lý dùng slug/ID ổn định, không dùng tên tiếng Việt có thể thay đổi theo ngôn ngữ UI.
- Tên hiển thị được quản lý trong Folder Registry/config.
- Các folder hệ thống được tạo idempotently khi khởi tạo workspace hoặc chạy integrity check.
- Không tự tạo toàn bộ thư mục con không cần thiết nếu chưa có nhu cầu; có thể tạo khi setup hoặc lần đầu dùng tính năng.
- Không tự ý di chuyển file người dùng đang có trong quá trình khởi tạo.

### 5.2. Cấu trúc logic đề xuất

```text
TM-Document-Workspace/
│
├── 01-sources/                         # Nguồn gốc, không chỉnh sửa trực tiếp
│   ├── pdf/
│   ├── word/
│   ├── excel/
│   ├── images/
│   └── other/
│
├── 02-pdf-processing/                 # Artifact từ công cụ PDF
│   ├── split/
│   ├── merge/
│   ├── compress/
│   ├── rotate/
│   ├── organize/
│   └── protected/
│
├── 03-images-processing/
│   ├── from-pdf/
│   ├── converted/
│   └── edited/
│
├── 04-document-conversion/
│   ├── pdf-to-word/
│   ├── word-to-pdf/
│   ├── pdf-to-excel/
│   ├── excel-to-pdf/
│   └── pdf-to-text/
│
├── 05-extractions/
│   ├── ocr/
│   ├── tables/
│   ├── ai/
│   └── structured-data/
│
├── 06-exports/
│   ├── csv/
│   ├── xlsx/
│   ├── docx/
│   ├── json/
│   └── xml/
│
└── 99-system/                          # Không hiển thị mặc định cho user
    ├── cache/
    ├── temp/
    ├── recovery/
    └── logs/
```

Đây là cấu trúc mục tiêu. AI phải đối chiếu cấu trúc hiện tại trước khi áp dụng và lập migration phù hợp. Không được xóa hoặc đổi tên folder đang sử dụng trực tiếp nếu chưa chuyển file, cập nhật registry/job references và kiểm chứng.

### 5.3. Tổ chức theo dự án/collection

Cần hỗ trợ phân nhóm theo dự án nghiệp vụ như `hoa-phat`, `company-documents`, `contracts`, `invoices` mà không làm cây thư mục hệ thống mất ổn định.

Đề xuất:
- Folder hệ thống vẫn cố định.
- Collection/project là metadata hoặc folder con ở các vùng được cho phép.
- File nguồn có thể được phân nhóm theo project/collection.
- Khi tạo output, hệ thống có thể tự tạo subfolder theo project/collection trong output area nếu có quan hệ nguồn rõ ràng.
- Không tự lấy tên file làm project name một cách cứng nhắc.
- Nếu tài liệu không thuộc project, lưu vào vùng mặc định tương ứng.

Ví dụ đường dẫn logic:

```text
01-sources/pdf/hoa-phat/...
02-pdf-processing/split/hoa-phat/...
05-extractions/ai/hoa-phat/...
06-exports/csv/hoa-phat/...
```

Không bắt buộc tạo toàn bộ project subfolder cùng lúc. Dùng folder registry để quản lý các nhánh được tạo.

### 5.4. Mapping giữa công cụ và output folder

Mỗi tool phải khai báo output mapping tập trung, không tự ghép đường dẫn ở từng page.

Ví dụ:

| Tool / operation | Input zone | Output zone |
|---|---|---|
| Import PDF | Người dùng chọn file ngoài workspace | `01-sources/pdf/` |
| Split PDF | `01-sources/pdf/` hoặc PDF hợp lệ khác | `02-pdf-processing/split/` |
| Merge PDF | PDF được chọn | `02-pdf-processing/merge/` |
| Compress PDF | PDF được chọn | `02-pdf-processing/compress/` |
| Rotate / Organize | PDF được chọn | `02-pdf-processing/organize/` |
| PDF to Images | PDF được chọn | `03-images-processing/from-pdf/` |
| OCR | PDF/image được chọn | `05-extractions/ocr/` |
| Table Extraction | PDF/Word/Excel tùy pipeline | `05-extractions/tables/` |
| AI Extraction | Tài liệu được chọn | `05-extractions/ai/` |
| PDF to Word | PDF được chọn | `04-document-conversion/pdf-to-word/` |
| Word to PDF | Word được chọn | `04-document-conversion/word-to-pdf/` |
| CSV export | Kết quả đã review/validate | `06-exports/csv/` |
| XLSX export | Kết quả đã review/validate | `06-exports/xlsx/` |
| JSON export | Kết quả đã review/validate | `06-exports/json/` |

Output mapping phải nằm trong config/registry/service dùng chung. Không để mỗi page tự định nghĩa output path riêng rẽ.

### 5.5. Output naming và ghi file an toàn

- Mặc định giữ tên gốc kèm hậu tố phù hợp, ví dụ `bang-gia-split`, `bang-gia-compressed`.
- Nếu trùng tên, không âm thầm ghi đè. Dùng collision strategy: suffix số/version hoặc hỏi người dùng trong UI tùy operation.
- Checkbox `Ghi đè` hiện tại chỉ có hiệu lực nếu user có quyền và đã xác định đúng target; không được mặc định cho phép ghi đè file nguồn.
- Ghi output theo kiểu atomic write: ghi vào temp file trong workspace, kiểm tra hoàn tất, sau đó rename vào đích.
- Nếu job thất bại, giữ file nguồn; temp file được dọn theo policy hoặc đưa vào recovery.
- Lưu liên kết input/output trong metadata/job record.

---

## 6. Permission Policy – khóa cấu trúc nhưng cho phép thao tác dữ liệu

### 6.1. Nguyên tắc phân quyền

Không chỉ ẩn nút trên UI. Quyền phải được xác thực trong Document Service/Main Process cho mọi IPC operation.

System folder không thể:
- Rename.
- Move.
- Delete.
- Thay đổi system ID hoặc đường dẫn gốc.

Người dùng vẫn có thể đọc/ghi file bên trong theo policy của folder.

### 6.2. Permission matrix đề xuất

| Loại vùng | List/Read | Add/Write file | Rename file | Delete file | Rename/Move/Delete folder |
|---|---:|---:|---:|---:|---:|
| Workspace root | Có | Theo folder con | Không áp dụng | Không áp dụng | Không |
| System source folders | Có | Có qua Import | Theo policy | Mặc định hạn chế | Không |
| Original source files | Có | Không sửa tại chỗ | Có thể cho phép tên hiển thị/metadata, không đổi nội dung | Mặc định không; cần xác nhận/chính sách | Không |
| Processing output folders | Có | Có | Có | Có sau xác nhận, nếu không bị job sử dụng | Không |
| Extraction/export folders | Có | Có | Có | Có sau xác nhận, nếu không bị job sử dụng | Không |
| User-created folders trong vùng được phép | Có | Có | Theo policy | Theo policy | Có thể cho phép trong phạm vi cha được cấp quyền |
| Temp/cache/recovery/logs | System only hoặc read-only diagnostics | System only | Không | System cleanup only | Không |

Có thể điều chỉnh chi tiết theo hệ thống quyền hiện tại, nhưng không được phá vỡ yêu cầu: **các folder hệ thống đã định nghĩa là bất biến đối với người dùng**.

### 6.3. File nguồn bất biến

- File nguồn được import vào workspace phải được xem là bản gốc.
- Các thao tác xử lý tạo output mới; không sửa binary của source.
- Nếu có tính năng chỉnh sửa trực tiếp, phải tạo bản copy/version mới hoặc yêu cầu lưu thành file mới.
- Nếu người dùng muốn xóa source, phải có policy riêng, cảnh báo tác động tới job/result liên quan và xác nhận rõ ràng.

### 6.4. User subfolder

Nếu cần cho phép người dùng tạo folder con để sắp xếp dữ liệu:
- Chỉ bật ở folder có `allowUserSubfolders = true`.
- Folder con phải đăng ký trong Folder Registry và có parentId.
- Không cho tạo folder con trong `99-system`.
- Quyền rename/delete folder con chỉ áp dụng cho folder do user tạo và vẫn nằm trong vùng được phép.
- Không cho user subfolder giả mạo system folder hoặc dùng reserved name/ID.

---

## 7. Electron Filesystem Architecture & Security

### 7.1. Luồng kiến trúc

```text
Renderer (Vue/Nuxt UI hiện tại)
        │
        │ Typed IPC API qua preload
        ▼
Preload (contextBridge, allowlisted methods)
        │
        ▼
Electron Main Process
        │
        ├── DocumentService
        ├── WorkspaceRegistry
        ├── FolderTreeService
        ├── FileMetadataService
        ├── PathResolver
        ├── PermissionPolicy
        ├── ImportExportService
        ├── PreviewService
        └── Job/Worker integration
                 │
                 ▼
         Managed Workspace Root
```

Sơ đồ định hướng; phải tích hợp vào cách tổ chức Electron hiện tại thay vì tạo process/service trùng lặp.

### 7.2. Quy tắc bắt buộc

- Renderer không gọi `fs` trực tiếp.
- Không bật Node integration trong Renderer nếu kiến trúc bảo mật hiện tại yêu cầu tắt.
- Dùng preload/contextBridge expose API allowlist.
- Không expose một API kiểu `readAnyPath(path)` hoặc `deleteAnyPath(path)` cho Renderer.
- Renderer chỉ truyền `folderId`, `fileId`, `jobId` và options đã validate; không được tự gửi arbitrary absolute path.
- PathResolver lấy physical path từ registry, resolve trong `workspaceRoot` và kiểm tra kết quả luôn nằm trong root.
- Chặn path traversal (`../`, encoded traversal, path separator bất thường).
- Kiểm tra symlink/reparse point để tránh đi ra ngoài workspace.
- Kiểm tra quyền trước cả thao tác đọc và ghi nhạy cảm.
- Không cho phép operation với system folder thông qua IPC trực tiếp dù UI đã ẩn action.
- Giới hạn file size/type khi import theo cấu hình hiện có; không tin MIME type do Renderer gửi.
- Không thực thi file người dùng hoặc nội dung tài liệu như code.
- Khi mở external application hoặc shell path, validate path đã resolve và dùng API Electron an toàn; không truyền string tùy ý vào shell.

### 7.3. Path và identity

Tách biệt:
- `folderId`: ID ổn định trong registry.
- `fileId`: ID ổn định của file record.
- `displayName`: tên người dùng nhìn thấy.
- `relativePath`: đường dẫn tương đối bên trong workspace, chỉ service quản lý.
- `absolutePath`: chỉ được tạo trong Main Process khi thực sự cần.

Không dùng displayName làm identity.

### 7.4. Integrity / reconciliation

Có service kiểm tra:
- System folder bị thiếu.
- Folder bị đổi tên/xóa bên ngoài ứng dụng.
- File record không còn file vật lý.
- File vật lý chưa có record.
- Output dang dở/temp còn sót sau crash.

Cơ chế xử lý:
- Không tự xóa dữ liệu không nhận diện.
- Có thể tái tạo system folder thiếu.
- Đánh dấu missing/orphaned để người dùng hoặc service xử lý.
- Ghi log reconciliation.
- Có chế độ dry-run cho thao tác reconcile/migration nếu ảnh hưởng dữ liệu lớn.

---

## 8. Data Model / Registry

AI phải dùng database/state persistence hiện có nếu đã có. Không tự thêm database mới nếu chưa audit và chứng minh cần thiết. Các entity dưới đây là logical model, có thể map vào schema hiện tại.

### 8.1. Workspace

```ts
interface WorkspaceRecord {
  id: string;
  name: string;
  rootPath: string;          // Chỉ Main Process được quản lý/đọc
  schemaVersion: number;
  status: 'ready' | 'missing' | 'needs_repair';
  createdAt: string;
  updatedAt: string;
}
```

Không expose rootPath đầy đủ cho UI nếu không cần thiết.

### 8.2. Folder Registry

```ts
interface FolderRecord {
  id: string;
  workspaceId: string;
  parentId: string | null;
  key: string;                // ID logic ổn định, ví dụ sources.pdf
  displayName: string;
  relativePath: string;       // Relative path, không phải arbitrary path từ Renderer
  folderType: 'system' | 'user' | 'project' | 'temporary';
  category: string;
  isSystem: boolean;
  isVisible: boolean;
  isReadOnly: boolean;
  allowUserSubfolders: boolean;
  permissions: string[];
  sortOrder: number;
  status: 'ready' | 'missing' | 'unavailable';
  createdAt: string;
  updatedAt: string;
}
```

`isSystem` và permission phải do Main Process/Registry quyết định, không tin giá trị Renderer gửi.

### 8.3. File Metadata

```ts
interface DocumentFileRecord {
  id: string;
  workspaceId: string;
  folderId: string;
  displayName: string;
  relativePath: string;
  extension: string;
  mimeType: string;
  size: number;
  checksum?: string;
  pageCount?: number;
  documentType?: string;
  origin: 'imported' | 'generated' | 'converted' | 'extracted' | 'external';
  isSource: boolean;
  status: 'available' | 'processing' | 'missing' | 'locked' | 'error';
  createdAt: string;
  updatedAt: string;
}
```

Không nhất thiết lưu đầy đủ `checksum` ngay khi import file lớn nếu gây chậm UI; có thể tính nền và hiển thị trạng thái checksum pending.

### 8.4. Liên kết Job / Artifact

Nếu Job System hiện tại đã có thì mở rộng nó, không tạo job engine thứ hai.

Một job nên lưu/đối chiếu được:
- Tool/operation.
- Input file IDs.
- Output folder ID.
- Output file IDs/artifacts.
- Config snapshot.
- Status/progress.
- Error/retry information.
- Created/started/finished timestamps.

Một file có thể là input của nhiều job. Một job có thể tạo nhiều output. Cần giữ lineage:

`Source Document → Processing Job → Output Artifact → Export/Review`

### 8.5. Version và migration

- Workspace registry có schema version.
- Migration phải idempotent và có log.
- Trước migration có backup/manifest dữ liệu registry quan trọng.
- Migration không được xóa source file.
- Nếu cần di chuyển physical file, dùng copy/verify/checksum rồi mới cập nhật registry; chỉ xóa bản cũ khi đã xác nhận migration hoàn tất và có policy rõ ràng.

---

## 9. API / IPC Contract

Tên API dưới đây là gợi ý logic. AI phải tuân theo convention hiện có và không tạo tên trùng nếu project đã có API tương đương.

### 9.1. Workspace

- `workspace:getInfo`
- `workspace:initialize`
- `workspace:verifyIntegrity`
- `workspace:repair`

### 9.2. Folder

- `documentFolders:getTree({ mode, context, parentId })`
- `documentFolders:listChildren({ folderId })`
- `documentFolders:createUserFolder({ parentId, name })`
- `documentFolders:renameUserFolder({ folderId, name })`
- `documentFolders:deleteUserFolder({ folderId })`
- `documentFolders:refresh({ folderId })`

Các thao tác mutation phải kiểm tra `isSystem` và permission tại Main Process.

### 9.3. Files

- `documents:listFiles({ folderId, page, pageSize, search, filters, sort })`
- `documents:getMetadata({ fileId })`
- `documents:importFiles({ targetFolderId, filePaths/options theo flow chọn file an toàn })`
- `documents:readPreview({ fileId, options })`
- `documents:copy({ fileIds, targetFolderId })`
- `documents:rename({ fileId, newName })`
- `documents:delete({ fileIds, confirmationToken/options })`
- `documents:revealInExplorer({ fileId/folderId })`

Không expose đường dẫn tùy ý trong API đọc/ghi. Với import từ ngoài workspace, để Main Process mở native file dialog hoặc xác thực selection token; không tin path tùy ý từ Renderer.

### 9.4. Tool operations

Các trang PDF hiện tại tiếp tục gọi service nghiệp vụ. Tool operation nhận `fileIds`/`folderIds`, config và output mapping; không tự build absolute path.

### 9.5. Validation IPC

Mọi request cần:
- Validate payload/schema.
- Kiểm tra record tồn tại.
- Kiểm tra workspace ownership.
- Kiểm tra folder/file relationship.
- Kiểm tra permission.
- Kiểm tra file state/lock nếu có.
- Trả error code ổn định và message an toàn cho UI.

---

## 10. Universal Document Viewer – giữ cửa sổ preview hiện có

Người dùng đã có tính năng mở window để xem file trực tiếp. Phải audit và giữ lại cơ chế này.

### 10.1. Mục tiêu

Phát triển cửa sổ preview thành Universal Document Viewer, dùng chung cho mọi module.

### 10.2. Định dạng

- PDF: page navigation, thumbnail, zoom, fit width/page, search text nếu có text layer, rotate view, fullscreen.
- Images: zoom, fit, rotate view, next/previous.
- DOCX: preview bằng cách hiện thực phù hợp với stack đang có; không giả định chuyển đổi hoàn hảo.
- XLSX: sheet navigation, grid preview, freeze/header nếu phù hợp.
- CSV: tabular preview, delimiter/encoding handling.
- JSON: syntax highlight, collapse/expand node, copy.
- TXT/Markdown/XML: text preview có encoding handling.
- File không hỗ trợ: thông báo và action Open externally an toàn.

### 10.3. Hành vi

- Preview chỉ đọc; không sửa file gốc.
- Không load file lớn toàn bộ vào Renderer nếu có streaming/chunk approach phù hợp.
- Có trạng thái loading/error/unsupported.
- Có thông tin file và đường dẫn breadcrumb logic (không cần lộ absolute path).
- Có thể điều hướng Previous/Next trong tập kết quả nếu được mở từ File Explorer.
- Cửa sổ preview dùng chung Document Service, không tự thao tác filesystem riêng.
- Đóng cửa sổ không làm hủy job đang xử lý.

---

## 11. Sắp xếp UI theo từng trang chức năng

Tất cả trang dùng cùng outer layout 2 side, nhưng phần Right Workspace thay đổi theo nhiệm vụ. Không ép mọi trang phải có cùng một bộ panel giống hệt nhau.

### 11.1. PDF Library / Thư viện PDF

Right side:
1. Header: tên folder hiện tại, số lượng file, breadcrumb.
2. Toolbar: search, filter, sort, view mode, refresh, import.
3. File list: PDF gốc/đầu ra tùy folder đang chọn.
4. Row actions: Preview, Split (nếu file hợp lệ), More.

Không cần nhồi cấu hình xử lý ở trang Library. Trang này chủ yếu để duyệt và quản lý file.

### 11.2. Split PDF / Tách trang

Right side:
1. Header và breadcrumb.
2. File list hoặc selected-input panel.
3. Chọn PDF đầu vào; cho phép multi-select chỉ khi flow hỗ trợ batch.
4. Operation config: tách toàn bộ, khoảng trang, trang cụ thể, odd/even hoặc rule đang có.
5. Output preview/name và folder đích hiển thị rõ ràng, mặc định lấy từ output mapping.
6. Action Start Split.
7. Progress/job result ở panel dưới hoặc job drawer.

Không yêu cầu user chọn folder đích mỗi lần. Có thể có `Change destination` chỉ khi policy cho phép chọn trong các output folders hợp lệ; không cho chọn `99-system` hay ngoài workspace.

### 11.3. Merge PDF / Ghép PDF

- File list cho phép chọn nhiều PDF.
- Khu vực Selected files thể hiện thứ tự ghép.
- Hỗ trợ reorder bằng drag-and-drop nếu component hiện có phù hợp.
- Cho remove từng file khỏi selection (không xóa file nguồn).
- Hiển thị tổng trang/dung lượng nếu metadata có.
- Đặt tên output và folder đích mặc định.
- Start Merge và progress.

### 11.4. Images / Ảnh trang

- Hiển thị PDF input và ảnh output theo folder.
- Cấu hình page range, định dạng ảnh (PNG/JPEG/WebP nếu engine hiện hỗ trợ), scale/DPI/quality.
- Preview một trang mẫu trước khi batch nếu phù hợp.
- Hiển thị output folder cố định.
- Hỗ trợ chọn nhiều PDF nếu engine đang hỗ trợ batch.

### 11.5. Conversion / Nhập PDF / Xuất PDF

- Tự lọc file theo format hỗ trợ ở operation hiện tại.
- Chọn source, định dạng đích, cấu hình format-specific.
- Hiện cảnh báo rõ nếu conversion có thể làm mất layout/font/image/table.
- Output folder mặc định được xác định bởi conversion mapping.
- Không hiển thị các option không được engine hỗ trợ.

### 11.6. AI Extraction / Bóc tách bằng AI

Giữ các tính năng hiện tại: chọn tài liệu, model, preset, định dạng export, overwrite option nếu có, tiến trình. Sắp xếp lại cho rõ thứ tự:

1. **Source files:** danh sách tài liệu/trang đã chọn từ Explorer.
2. **Model & Preset:** chọn connection/model và extraction preset.
3. **Output formats:** CSV, JSON, XLSX, DOCX, XML theo khả năng thực tế.
4. **Advanced options:** overwrite/collision strategy, batch/concurrency, page selection, checkpoint/resume (nếu backend hỗ trợ).
5. **Preview/Calibration:** chạy thử một số trang đại diện trước batch lớn.
6. **Start extraction:** action chính.
7. **Progress:** tổng task, completed, failed, waiting, progress từng file/trang; có thể mở log/detail.
8. **Results:** mở output trong Extraction Results/Exports và chuyển sang Review.

Yêu cầu:
- Output folder mặc định `05-extractions/ai/` và export formats vào `06-exports/<format>/` theo mapping thống nhất.
- Job lưu snapshot model, connection, preset/schema version và config.
- Không dùng checkpoint chỉ dựa vào tên file/page; cần fingerprint theo source identity/hash, page index, pipeline/schema/preset version.
- Không xuất dữ liệu có validation error nghiêm trọng mà không cảnh báo/cho phép policy phù hợp.
- Không gán category mặc định âm thầm khi AI không xác định được; gắn trạng thái needs_review theo logic extraction.

### 11.7. OCR / Table Extraction / Review

**OCR Studio:** preview nguồn bên trái trong vùng right workspace hoặc viewer; text/recognized output có thể chỉnh sửa ở panel nội dung. Lưu kết quả OCR vào vùng OCR Results.

**Table Extraction:** hiển thị source preview và extracted table; hỗ trợ chỉnh sửa ô, cấu trúc header, merged cells, source page/bounding boxes nếu engine cung cấp.

**Extraction Review:** danh sách dữ liệu bên phải, chọn record để xem nguồn trang/preview; hỗ trợ edit, validate, approve/reject và giữ history chỉnh sửa.

Không đưa tất cả tính năng này vào một trang AI Extraction khổng lồ. Chúng là các trang chuyên biệt sử dụng chung workspace và Document Service.

### 11.8. Queue / History / Failed jobs

- Dùng chung Job System hiện tại nếu đã có.
- Queue hiển thị queued/running/paused/retrying/completed/failed/cancelled.
- History lọc theo tool, file, thời gian, trạng thái.
- Failed jobs có error summary và retry action nếu retryable.
- Job detail cho biết input, output, model/preset nếu liên quan, log và thời gian.
- Không để progress panel ở mọi trang bị nhân bản logic; dùng component chung.

---

## 12. Component Strategy – tận dụng `root/app/components/pdf`

### 12.1. Audit component trước khi tạo mới

Tạo inventory table trong audit, ví dụ:

| Existing component | Current responsibility | Reuse target | Change needed |
|---|---|---|---|
| Component thực tế trong codebase | Mô tả sau khi đọc source | Explorer/File list/Viewer/Job panel... | Reuse / extend / split |

Không tự điền tên component giả định vào báo cáo. Tên phải lấy từ codebase.

### 12.2. Nhóm component cần có sau audit

Các tên dưới đây là **tên vai trò tham khảo**, không bắt buộc tạo đúng tên nếu project đã có component tương đương.

**A. Explorer**
- `DocumentExplorer` – wrapper cho side trái.
- `DocumentFolderTree` – cây folder.
- `DocumentFolderTreeNode` – một node.
- `DocumentFolderSearch` – tìm folder.
- `DocumentExplorerModeSwitch` – All/Contextual/Recent/Favorites.

**B. File list**
- `DocumentFileExplorer` – vùng right side.
- `DocumentFileToolbar` – search/filter/sort/view.
- `DocumentFileList` – danh sách.
- `DocumentFileRow` – một file.
- `DocumentFileGrid` – grid view.
- `DocumentSelectionToolbar` – bulk actions.
- `DocumentBreadcrumb` – breadcrumb.
- `DocumentFileMetadata` – metadata.

**C. Operation / Job**
- `DocumentOperationPanel` – slot/config panel theo tool.
- `DocumentOutputDestination` – hiển thị output folder và collision policy.
- `DocumentJobProgress` – progress.
- `DocumentJobSummary` – kết quả task.
- `DocumentEmptyState` / `DocumentErrorState` – trạng thái chung nếu chưa có.

**D. Viewer**
- Tái sử dụng viewer window hiện có.
- Chỉ tạo adapter/renderer cho MIME type mới khi viewer chưa hỗ trợ.

### 12.3. Nguyên tắc phân lớp component

- Presentation component: nhận props, emit event; không tự truy cập filesystem.
- Container/composable/store: quản lý state, gọi typed IPC/API.
- Main Process service: xử lý filesystem, policy, registry.
- Không nhồi tree loading, IPC, permission và file operation vào cùng một Vue component.
- Không để mỗi page tự duy trì một bản folder tree hoặc list file riêng.
- Component dùng chung phải có props/events rõ ràng và không phụ thuộc cứng vào một route.

### 12.4. State cần được quản lý có chủ đích

Các state có thể gồm:
- `activeFolderId` – folder đang mở.
- `expandedFolderIds` – các folder đang expand.
- `selectedFolderIds` – folder được chọn bằng checkbox.
- `selectedFileIds` – file được chọn.
- `explorerMode` – all/contextual/recent/favorites.
- `fileViewMode` – list/compact/grid/details.
- `searchQuery` và filters.
- `sortKey`/`sortDirection`.
- `isExplorerCollapsed`/`explorerWidth`.

Không để navigation selection và checkbox selection dùng chung một biến.

State ngắn hạn của page có thể ở page/store; preference dùng chung lưu theo cơ chế persistence hiện có. Tránh duplicate source of truth giữa local component state, Pinia/store và Main Process.

---

## 13. Document Service – service dùng chung

Các chức năng nghiệp vụ phải gọi một lớp dịch vụ thống nhất, tên thực tế theo convention codebase.

Trách nhiệm:
- Initialize/resolve workspace.
- Quản lý Folder Registry.
- Lấy cây folder và folder children.
- Liệt kê file theo folder/search/filter/sort/page.
- Lấy metadata.
- Import file vào đúng vùng.
- Preview/read an toàn.
- Ghi output vào output mapping.
- Copy/rename/delete file theo policy.
- Theo dõi external change/reconcile.
- Tạo và cập nhật artifact/job relationship.

Không để Split, Merge, OCR, AI Extraction tự `path.join(workspaceRoot, ...)` ở từng module. Tất cả phải dùng service/path resolver.

---

## 14. Hiệu năng và độ ổn định

- Không đọc binary file khi chỉ cần hiển thị danh sách.
- List file phải hỗ trợ pagination hoặc virtual scrolling nếu thư mục nhiều file.
- Thumbnail/preview được tạo/cache riêng, không render toàn bộ PDF khi chưa cần.
- Cache metadata có invalidation sau import, output, rename, delete và external change.
- Cân nhắc file watcher để cập nhật thay đổi ngoài app; debounce và tránh watch toàn bộ file tree một cách tốn tài nguyên.
- Job nặng không chạy trong Renderer/UI thread.
- Có concurrency limit ở worker/queue hiện có; không tự chạy vô hạn task song song.
- Cancel/retry/resume phải theo khả năng operation; không hiển thị nút Cancel nếu engine không thể cancel an toàn.
- Không làm mất tiến trình/job history khi app đóng bất thường.
- Dùng atomic write cho registry/output quan trọng.
- Xử lý file đang bị Windows lock; message phải cụ thể và cho retry.

---

## 15. Migration từ cấu trúc hiện tại

Cây thư mục hiện đang hiển thị các nhóm như:
- PDF gốc.
- Tệp đầu vào.
- Trang tách.
- Ảnh trang.
- PDF ghép.
- Dữ liệu trích xuất.

Đây là dữ liệu hiện có, phải được bảo toàn.

Migration steps:

1. Scan và ghi manifest cấu trúc hiện tại (không di chuyển/xóa).
2. Map folder cũ sang logical folder key mới.
3. Đối chiếu file và tạo metadata/registry.
4. Nếu cần đổi physical layout, copy sang destination mới, verify size/checksum khi có, cập nhật references.
5. Kiểm tra các job/result cũ vẫn mở được.
6. Chỉ đánh dấu folder cũ legacy khi mọi kiểm tra thành công.
7. Không xóa dữ liệu legacy tự động trong migration đầu tiên.
8. Nếu có folder trùng tên hoặc chưa map được, giữ nguyên và đưa vào `unmapped/needs_review`, không tự đoán.
9. Có backup/rollback plan cho registry và file operation trước migration.

Migration phải idempotent: chạy lại không tạo bản sao và không làm hỏng record.

---

## 16. Error handling và audit log

Chuẩn hóa error code theo convention hiện tại. Nếu chưa có, cân nhắc nhóm:
- `WORKSPACE_NOT_READY`
- `WORKSPACE_ROOT_MISSING`
- `FOLDER_NOT_FOUND`
- `FILE_NOT_FOUND`
- `PERMISSION_DENIED`
- `SYSTEM_FOLDER_IMMUTABLE`
- `PATH_OUTSIDE_WORKSPACE`
- `SYMLINK_NOT_ALLOWED`
- `FILE_LOCKED`
- `FILE_EXISTS`
- `UNSUPPORTED_FILE_TYPE`
- `INVALID_OPERATION`
- `MIGRATION_REQUIRED`
- `INTEGRITY_CHECK_FAILED`

Audit log cần ghi các thao tác quan trọng:
- Import.
- Ghi output/overwrite.
- Rename/delete file.
- Tạo/xóa user folder.
- Migration/repair.
- Thao tác bị từ chối do permission.

Không ghi API key, nội dung nhạy cảm hoặc toàn bộ binary vào log.

---

## 17. Kiểm thử bắt buộc

### 17.1. UI

- Explorer dùng chung trên tất cả trang đã chuyển đổi.
- Collapse/expand và resize 2 side hoạt động.
- Tên folder dài không phá layout.
- Click tên, chevron và checkbox hoạt động đúng semantics riêng.
- Multi-select và bulk action không chọn nhầm.
- List/Grid/Details không làm mất selection ngoài ý muốn.
- Contextual mode vẫn chuyển được All folders.
- Empty/loading/error states hiển thị đúng.
- Layout hoạt động với kích thước cửa sổ Electron mục tiêu.

### 17.2. Filesystem/security

- Không thể rename/delete/move system folders từ UI.
- Không thể rename/delete/move system folders khi gọi IPC trực tiếp.
- Chặn `../` và path traversal encoded.
- Chặn symlink/reparse point thoát workspace.
- Không thể truy cập file ngoài workspace qua fileId giả.
- Import file vào đúng folder.
- Output ghi đúng folder mapping.
- Source file không thay đổi sau Split/Merge/Convert/OCR/AI Extraction.
- File trùng tên có xử lý collision đúng.
- File đang được job dùng không bị xóa ngoài ý muốn.

### 17.3. Migration/recovery

- Migration chạy lần đầu.
- Migration chạy lần hai không tạo bản trùng.
- App crash giữa lúc ghi output: không có file hoàn chỉnh giả; temp/recovery được xử lý.
- Workspace root mất/đổi tên: UI báo trạng thái và có hướng repair.
- Folder/file bị thay đổi ngoài ứng dụng: reconciliation không crash và không tự xóa dữ liệu.

### 17.4. Regression

Kiểm tra lại các chức năng đang có:
- Import PDF.
- Thư viện PDF.
- Split/Merge.
- PDF → Images.
- Export/Import PDF.
- AI Extraction.
- Preset/model selector.
- Checkpoint/resume và kết quả cũ nếu có.
- Mở cửa sổ preview hiện tại.

Không tuyên bố hoàn tất nếu chỉ build thành công mà chưa smoke-test các flow chính.

---

## 18. Kế hoạch triển khai theo phase

### Phase 0 – Audit & Baseline

- Inventory component tại `root/app/components/pdf`.
- Audit trang, route, store, IPC, filesystem, preview window, job system.
- Ghi baseline build/test và regression list.
- Đề xuất mapping component cũ → kiến trúc mới.

**Exit criteria:** có audit report, không sửa chức năng trước khi hiểu dependency.

### Phase 1 – Workspace Registry & Safe Filesystem

- Định nghĩa workspace root/config theo cơ chế hiện có.
- Folder registry và stable IDs.
- Khởi tạo system folders idempotently.
- PathResolver + PermissionPolicy.
- Typed IPC/preload theo security convention hiện tại.
- Test system folder immutable và path traversal.

**Exit criteria:** folder system được tạo/đọc; IPC từ chối thao tác phá cấu trúc.

### Phase 2 – Universal Explorer UI

- Tái sử dụng component cũ.
- Xây dựng/chuẩn hóa Explorer dùng chung.
- Lazy tree, search, All/Contextual/Recent/Favorites.
- Folder selection/navigation state tách biệt.
- Resize/collapse và lưu preference.

**Exit criteria:** ít nhất Thư viện PDF và AI Extraction dùng chung một Explorer chạy với dữ liệu filesystem thật.

### Phase 3 – Universal File Explorer

- File list, toolbar, filter/sort, view modes.
- Multi-select và bulk actions.
- Contextual actions theo MIME/permission/tool.
- Pagination/virtualization khi cần.

**Exit criteria:** danh sách file chạy với metadata thật, không hard-code; selection và actions ổn định.

### Phase 4 – Output Mapping & Tool Integration

- Tạo mapping tập trung cho Split/Merge/Images/Conversion/OCR/AI/Exports.
- Các tool dùng Document Service, không tự build path.
- Atomic output, collision strategy và lineage.

**Exit criteria:** tool tạo output đúng folder, source không bị sửa, có liên kết job/input/output.

### Phase 5 – Universal Viewer Integration

- Audit/giữ preview window hiện tại.
- Chuyển viewer sang dùng Document Service/fileId an toàn.
- Bổ sung định dạng còn thiếu theo ưu tiên thực tế.

**Exit criteria:** PDF và các định dạng đang được hỗ trợ mở được từ mọi trang mà không duplicate filesystem logic.

### Phase 6 – Migration, Recovery & Full Regression

- Migration cây thư mục hiện tại.
- Integrity check/repair.
- Recovery và audit logs.
- Chạy toàn bộ regression tests.
- Cập nhật tài liệu sử dụng và architecture docs.

**Exit criteria:** dữ liệu cũ được bảo toàn; các flow PDF hiện tại hoạt động; cấu trúc folder và permission được kiểm thử.

---

## 19. Definition of Done

Chỉ coi công việc hoàn tất khi đạt tất cả điều kiện áp dụng:

- [ ] Đã audit và tái sử dụng component hiện có trong `root/app/components/pdf`.
- [ ] Không tạo component trùng với component có sẵn mà không có lý do.
- [ ] Các trang PDF Studio dùng cùng Universal Explorer.
- [ ] UI giữ bố cục 2 side và design system hiện tại.
- [ ] Có resize/collapse Explorer và preference persistence.
- [ ] Cây thư mục lấy từ registry/filesystem thật, có lazy loading.
- [ ] System folders không thể rename/move/delete từ UI lẫn IPC.
- [ ] File operations được kiểm soát bằng permission policy.
- [ ] Path traversal và symlink escape được ngăn chặn.
- [ ] Các tool dùng output mapping tập trung.
- [ ] Source files không bị ghi đè bởi xử lý thông thường.
- [ ] Có output collision handling và atomic write.
- [ ] Preview window hiện tại được giữ và tích hợp với Document Service.
- [ ] Migration bảo toàn cây thư mục/file cũ.
- [ ] Regression test các chức năng PDF hiện tại đạt.
- [ ] Build/lint/typecheck/test theo khả năng dự án đều đạt; lỗi còn lại được ghi rõ.
- [ ] Có tài liệu audit, migration, cấu trúc component và cách thêm tool mới.

---

## 20. Hướng dẫn AI khi triển khai từng phase

Khi bắt đầu mỗi phase:

1. Đọc lại yêu cầu phase và code hiện tại có liên quan.
2. Nêu ngắn gọn file/component/service sẽ tái sử dụng và file mới dự kiến tạo.
3. Thực hiện thay đổi nhỏ, theo từng nhóm chức năng; không refactor lan rộng.
4. Chạy typecheck/lint/test phù hợp ngay sau thay đổi.
5. Kiểm tra giao diện và hành vi thực tế bằng dữ liệu local, không chỉ dựa vào mock.
6. Cập nhật checklist/phase status và ghi rõ phần chưa hoàn thành.
7. Không tự ý bỏ qua test hoặc đổi yêu cầu để làm cho build xanh.

Nếu phát hiện component cũ không thể tái sử dụng an toàn:
- Nêu rõ vấn đề kỹ thuật trong audit.
- Giữ API cũ nếu có nơi đang dùng.
- Tạo component mới có trách nhiệm rõ ràng.
- Chuyển từng page sang component mới và kiểm thử regression.

**Ưu tiên cao nhất:** bảo toàn hoạt động hiện tại, tái sử dụng code tốt, chuẩn hóa một nguồn dữ liệu và một filesystem service dùng chung, sau đó mới mở rộng tính năng.

---

## 21. Prompt khởi động ngắn cho AI Coding Agent

Hãy đọc toàn bộ tài liệu `TM-DOCUMENT-WORKSPACE-IMPLEMENTATION-SPEC.md` và audit codebase hiện tại trước khi chỉnh sửa. Đặc biệt kiểm kê `root/app/components/pdf` cùng các component UI dùng chung khác. Tôi đã có sẵn các component và chức năng PDF đang hoạt động; hãy tận dụng tối đa, không tạo component trùng, không viết lại module tùy tiện.

Giữ giao diện 2 side hiện tại: Universal Document Explorer bên trái và File Explorer/Tool Workspace bên phải. Chuẩn hóa Managed Workspace với system folders cố định, người dùng không được rename/move/delete folder hệ thống nhưng được thao tác dữ liệu bên trong theo permission. Mọi filesystem operation phải qua service ở Electron Main Process/IPC allowlist, không để Renderer truy cập path tùy ý.

Triển khai theo thứ tự Phase 0 → Phase 6 trong tài liệu. Bắt đầu bằng audit report và baseline; sau đó tiếp tục code theo phase, kiểm thử từng phần và bảo toàn dữ liệu/thao tác hiện tại. Không dừng ở việc chỉ đưa ra kế hoạch.
