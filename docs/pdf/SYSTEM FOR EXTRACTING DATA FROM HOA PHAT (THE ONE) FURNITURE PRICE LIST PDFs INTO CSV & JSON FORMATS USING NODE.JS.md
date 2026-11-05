# TÀI LIỆU ĐẶC TẢ KỸ THUẬT (AI SPEC): HỆ THỐNG BÓC TÁCH BẢNG GIÁ PDF NỘI THẤT HÒA PHÁT (THE ONE) SANG CSV & JSON TRÊN NODE.JS

> **Hướng dẫn dành cho bạn:** Bạn có thể copy toàn bộ nội dung file `.md` này đưa cho AI Coding Assistant (như **Cursor**, **Windsurf**, **Claude Code**, **GitHub Copilot**) với câu lệnh: *"Hãy khởi tạo dự án Node.js và viết code hoàn chỉnh theo đúng tài liệu đặc tả kỹ thuật này"*. Ngoài ra, toàn bộ mã nguồn cốt lõi cũng đã được viết sẵn bên dưới để bạn có thể chạy ngay lập tức.

---

## 1. BỐI CẢNH & BÀI TOÁN (CONTEXT & PROBLEM STATEMENT)

Chúng ta cần xử lý hơn **100+ trang PDF** từ cuốn *"Bảng giá bán buôn Nội thất Hòa Phát / Nội thất The One"* (các file rời `page_0005.pdf`, `page_0006.pdf`... hoặc 1 file PDF tổng) để chuẩn hóa thành file dữ liệu **CSV (25 cột)** và **JSON** phục vụ import trực tiếp vào hệ thống E-commerce CMS.

### Tại sao không dùng thư viện đọc PDF thông thường (`pdf-parse`, `pdf2json`)?
Qua phân tích thực tế các trang bảng giá Hòa Phát, bố cục bảng có độ phức tạp rất cao:
1. **Đa dạng cấu trúc bảng trên cùng 1 trang:**
   - **Kiểu bảng 1 (Dòng TQ - Trang 5, 6, 7):** Cột `GIÁ BÁN` xếp chồng nhiều mức giá theo chiều dọc trong cùng 1 ô (ví dụ: dòng trên là giá Da thật `5.160.000`, dòng giữa là giá Da CN `4.180.000`, dòng dưới là giá PVC `4.050.000`), hoặc phân theo màu sắc (`Da màu đen`, `Da màu nâu`).
   - **Kiểu bảng 2 (Dòng SG - Cuối trang 7):** Cột `GIÁ BÁN` lại tách thành 3 cột dọc riêng biệt (`Da` | `Da CN` | `PVC`).
   - **Kiểu bảng Bàn / Tủ / Két bạc (Các trang sau):** Có thể chia biến thể theo **Kích thước** (`1200x600`, `1400x700`), **Loại gỗ** (`Veneer`, `Sơn PU`, `Melamine`), hoặc **Loại khóa** (`Khóa cơ`, `Khóa điện tử`).
2. **Gộp ô (Merged Cells) & Lẫn lộn tọa độ:** Một ô có thể chứa 2 mã sản phẩm (`TQ09` và `TQ10` nằm chung 1 hàng lớn), thông số kích thước `Rộng`, `Sâu`, `Cao` có chứa ký hiệu dải kích thước (`1155 ÷ 1210` hoặc `780 - 1140`).
3. **Lỗi ký tự OCR:** Bản gốc PDF có nhiều lỗi nhận diện chữ như `"Bản Newtrend"` (Bàn), `"Bàn Verneer"` (Veneer), `"Bàn tỉnh"` (Bàn tĩnh), `"gỗ"` bị đọc thành `"gõ"` hoặc `"gô"`.

### Giải pháp kiến trúc (mô hình đề xuất — không bắt buộc)
Kiến trúc dưới đây là **đề xuất tham khảo**, không phải ràng buộc kỹ thuật. Yêu cầu thực sự chỉ gồm hai điều: model phải là **multimodal** (đọc được nội dung trang bảng giá) và phải trả về **structured output** theo JSON Schema. Trong TM Tools, model được chọn trên giao diện cho từng lần chạy, nên có thể dùng **bất kỳ model nào thuộc các provider đã cấu hình và kết nối** trong hệ thống (Google AI, OpenAI, Anthropic, Groq, OpenRouter...).

- **Đề xuất mặc định:** Google Gemini `gemini-3.5-flash` — đọc trực tiếp thị giác trang PDF, không cần OCR trung gian. Đây chỉ là điểm khởi đầu tốt về giá/độ chính xác, **không phải yêu cầu bắt buộc**; đổi bằng biến `PDF_EXTRACT_MODEL` hoặc chọn model khác trong ô "Model bóc tách".
- **Ràng buộc kỹ thuật thật sự:** model phải nhận được nội dung trang (PDF inline hoặc ảnh raster) và tôn trọng schema đầu ra (`responseSchema` với Google, `response_format` với OpenAI-compatible, tool schema với Anthropic) để AI trả về JSON chuẩn 100%, tự động ánh xạ đúng danh mục (`categories`), tách biến thể (`variants`), chuẩn hóa kích thước và sửa lỗi chính tả tiếng Việt. Model nào không đáp ứng hai điều kiện trên thì không dùng được cho pipeline này, bất kể provider.
- Có cơ chế **Batch Processing (Xử lý hàng loạt)**, **Checkpoint/Resume (Lưu trạng thái chạy tiếp nếu đứt mạng)**, và **Rate-Limit Retry (Tự động thử lại)** — những phần này độc lập với việc chọn model/provider.

### Chọn model: dùng toàn bộ model của các provider đã kết nối
- Ô chọn model (`AiProvidersModelSelect`) liệt kê **mọi model của mọi AI connection đang bật và có key** mà app được cấp quyền, lấy từ AI relay của TM Hub (`GET /api/v1/apps/:id/ai/relay/catalog`) — **không có allowlist cứng** trong code.
- Model đã chọn được truyền theo từng lần chạy (`POST /api/v1/pdf/extract/start` → `connectionId` + `model`), và mỗi job lưu lại `connectionId`/`model` đã dùng để đối chiếu kết quả.
- **Đường đi của một trang:** mỗi trang PDF được render thành PNG (`pdf-to-img`, scale = `PDF_IMAGE_SCALE`) rồi gửi kèm prompt qua AI relay của TM Hub (`POST /api/v1/apps/:id/ai/relay/chat`, message có `attachments: [{ mimeType, data }]`). Hub map phần đính kèm sang đúng định dạng của từng adapter: `inlineData` (Google), `document`/`image` (Anthropic), `file`/`image_url` (OpenAI-compatible). Provider tự nhận ảnh nên **cùng một pipeline chạy được với mọi provider đã kết nối**.
- Vì relay chỉ truyền text, schema JSON không gửi qua `responseSchema` mà được **render từ `schema.ts` vào system prompt**, kèm ràng buộc "mọi khóa đều bắt buộc, thiếu dữ liệu thì trả chuỗi rỗng" để model không bỏ trống trường.
- Thiếu "API key" **không** còn là khái niệm của riêng Gemini: nếu ô chọn rỗng thì nghĩa là app chưa có connection AI nào dùng được, cần cấu hình trong TM Hub → AI Key Vault. Không cần `PDF_EXTRACT_API_KEY` trong `.env` của app.
- Model không trả được text (TTS, ảnh, video, embedding, AQA, live/audio) bị lọc khỏi danh sách vì không dùng được cho bóc tách; mọi model còn lại của connection đều chọn được.

### Mẫu bóc tách (preset): mô tả + ví dụ do người dùng nhập

Pipeline không bị khoá vào một loại bảng giá. Mỗi lần chạy có thể mang thêm một **preset** gồm hai phần:

- **description — mô tả/hướng dẫn cho model:** đây là tài liệu gì, từng cột nghĩa là gì, quy tắc riêng (ví dụ đường dẫn danh mục chuẩn, cách đặt tiêu đề, cách gộp biến thể).
- **sample — mẫu tham khảo:** vài dòng kết quả đúng (JSON hoặc CSV) để model bắt chước văn phong, cách chia biến thể và cách viết mô tả; mẫu **không** được chép giá trị.

Cách hoạt động:

- Preset được lưu trong `.data/pdf/presets.json` (tối đa 40 mẫu) và quản lý qua `GET/POST /api/v1/pdf/extract/presets` + `DELETE /api/v1/pdf/extract/presets/:id`.
- Khi bắt đầu, `POST /api/v1/pdf/extract/start` nhận thêm `preset: { preset, description, sample }`; nội dung được chụp lại vào job (job lưu `preset` để đối chiếu) nên sửa preset về sau không làm thay đổi lịch sử.
- `buildSystemPrompt()` ghép theo thứ tự: quy tắc cố định → cấu trúc JSON → **hướng dẫn của người dùng** (ưu tiên cao nhất khi mâu thuẫn) → **mẫu tham khảo**.
- Nhờ vậy có thể thêm loại tài liệu mới (bảng giá khác, phụ kiện, bảng quy cách...) chỉ bằng cách tạo preset mới, không sửa code và không sửa prompt mặc định.

---

## 1b. XỬ LÝ WORD (.DOCX) VÀ FILE OFFICE

Bảng giá không phải lúc nào cũng là PDF. Module nhận thêm Word và xuất được Word/Excel, dùng cùng một kho dữ liệu:

| Chức năng | Đường đi | Ghi chú |
|---|---|---|
| Tải Word | `POST /api/v1/pdf/word/upload` | Chỉ `.docx` (Word 2007+). `.doc` cũ trả `PDF_WORD_LEGACY` vì mammoth không đọc được định dạng nhị phân đó. |
| Word → PDF | `POST /api/v1/pdf/word/:name/pdf` | Đọc `.docx` bằng mammoth → chuẩn hoá thành block (heading/paragraph/list/table) → dựng PDF bằng `pdf-lib`. Giữ nguyên tên gốc nên PDF mới dùng được ngay cho tách trang, xuất ảnh và bóc tách. |
| PDF → Word | `POST /api/v1/pdf/sources/:name/docx` | `pdfjs-dist` lấy text theo dòng (gom theo baseline, chèn tab khi khoảng trắng lớn) → `docx`. Chỉ giữ chữ và thứ tự dòng; mất font, màu, ảnh, ô gộp. |
| Bóc tách Word | `POST /api/v1/pdf/extract/start` với `source: "*.docx"` | Không render ảnh: bảng Word được làm phẳng thành `ô | ô | ô`, chia đoạn ~12.000 ký tự rồi gọi model **text-only**. Rẻ hơn vision rất nhiều và đọc đúng số liệu vì Word có text thật. |
| Xuất kết quả | `GET /api/v1/pdf/products/:name?format=xlsx|docx` | Mỗi lần bóc tách xong ghi 4 định dạng: CSV, JSON, XLSX (header đóng băng, autofilter, 25 cột) và DOCX (A4 ngang, bảng 25 cột). |

**Font tiếng Việt:** PDF do `pdf-lib` tạo cần font TrueType thật, vì 4 font dựng sẵn của pdf-lib là WinAnsi và không có dấu. Module tự dò font của hệ điều hành (Segoe UI/Arial trên Windows, DejaVu/Liberation trên Linux, Arial trên macOS), hoặc dùng `PDF_FONT_PATH`. Không tìm được font thì trả `PDF_FONT_MISSING` (503) thay vì in ra ô vuông.

**Giới hạn đã biết:**
- Word → PDF bỏ qua ảnh, cột báo, chú thích chân trang và định dạng nâng cao; bảng nhiều cột được co theo bề rộng trang.
- PDF → Word không dựng lại bảng: các dòng có khoảng trắng lớn thành tab để người dùng tự chuyển thành bảng.
- PDF có font mã hoá cũ (TCVN3/VNI, không có ToUnicode) sẽ ra ký tự lệch khi đọc text — trường hợp đó phải dùng vision hoặc OCR.

## 2. CẤU TRÚC THƯ MỤC DỰ ÁN (PROJECT STRUCTURE)

AI Agent cần khởi tạo dự án Node.js theo cấu trúc sau:

```text
hoa-phat-pdf-extractor/
├── data/
│   └── categories.json          # File danh mục 73 ngành hàng chuẩn (để AI tự động map slug)
├── input_pdfs/                  # Thư mục chứa 100+ file PDF (page_0005.pdf, page_0006.pdf...)
├── output/
│   ├── checkpoints/             # Lưu JSON kết quả từng trang PDF đã xử lý xong (tránh chạy lại)
│   ├── products_import.csv      # File CSV 25 cột chuẩn UTF-8 BOM để import lên web
│   └── products_import.json     # File JSON tổng hợp toàn bộ sản phẩm
├── src/
│   ├── config.js                # Cấu hình API Key, tốc độ xử lý, đường dẫn
│   ├── schema.js                # Định nghĩa JSON Schema (Structured Outputs) dùng chung mọi model
│   ├── geminiExtractor.js       # Adapter mẫu gọi model (Google) đọc PDF và trả về JSON
│   ├── csvNormalizer.js         # Module chuyển đổi JSON sang cấu trúc 25 cột Simple/Variable
│   └── index.js                 # Script chính: Quét thư mục PDF -> Bóc tách -> Lưu Checkpoint -> Xuất CSV
├── .env                         # Chứa GEMINI_API_KEY
└── package.json
```

---

## 3. ĐẶC TẢ DỮ LIỆU ĐẦU RA (25 CỘT CSV TEMPLATE)

File CSV xuất ra bắt buộc phải có **đúng 25 cột** theo thứ tự sau (có ký tự BOM `\uFEFF` ở đầu file để mở bằng Excel không lỗi font tiếng Việt):

| STT | Tên cột | Quy tắc điền dữ liệu |
| :--- | :--- | :--- |
| 1 | `no` | Số thứ tự tăng dần theo từng dòng CSV (`1`, `2`, `3`...). |
| 2 | `sku` | Mã sản phẩm gốc viết hoa (VD: `TQ01`, `TQ05`, `SG350B`). Các biến thể của cùng 1 SP phải có chung `sku` này. |
| 3 | `title` | Tên đầy đủ của sản phẩm (VD: `Ghế lãnh đạo cao cấp TQ01`, `Bàn làm việc Royal HR120SC7`). |
| 4 | `barcode` | Để trống `""`. |
| 5 | `basePrice` | Giá gốc của sản phẩm cha (Nếu SP có nhiều biến thể, lấy **giá thấp nhất** trong các biến thể, chỉ giữ chữ số, VD: `4050000`). |
| 6 | `salePrice` | Giá bán của sản phẩm cha (Đặt bằng `basePrice`, VD: `4050000`). |
| 7 | `prices` | Để trống `""`. |
| 8 | `stock` | Mặc định `"0"`. |
| 9 | `manageStock` | Mặc định `"1"`. |
| 10 | `categories` | Danh sách `slug` danh mục phân tách bằng dấu phẩy, đi từ cấp cha đến cấp con (VD: `noi-that-the-one,noi-that-van-phong,ghe-van-phong,ghe-lanh-dao-cao-cap`). |
| 11 | `tags` | Các tag không dấu ngăn cách bởi dấu phẩy (VD: `noi-that-van-phong,ghe-van-phong,hoa-phat,the-one`). Nếu có ghi chú `(sản phẩm mới)` thì thêm `,san-pham-moi`. |
| 12 | `keywords` | Gồm `tags` cộng thêm mã `sku` viết thường (VD: `...,tq01`). |
| 13 | `status` | Mặc định `"published"`. |
| 14 | `description` | Mô tả chi tiết sản phẩm (đã sửa lỗi chính tả OCR) kèm thông số kích thước ở cuối câu. |
| 15 | `shortDesc` | Tóm tắt ngắn gọn 1 câu về tên sản phẩm, chất liệu và đặc điểm nổi bật. |
| 16 | `attributes` | Chuỗi thông số kích thước chuẩn: `Rộng: {w}mm | Sâu: {d}mm | Cao: {h}mm`. |
| 17 | `opt1_name` | Tên thuộc tính biến thể 1 (VD: `Chất liệu`, `Màu sắc`, `Kích thước`). **Để trống `""` nếu là sản phẩm đơn (Simple).** |
| 18 | `opt1_val` | Giá trị biến thể 1 (VD: `Da thật`, `Da công nghiệp`, `PVC`, `Da màu đen`). **Để trống `""` nếu là sản phẩm đơn.** |
| 19 | `opt2_name` | Tên thuộc tính biến thể 2 (nếu có cả Chất liệu & Kích thước). Thường để trống `""`. |
| 20 | `opt2_val` | Giá trị biến thể 2 (nếu có). Thường để trống `""`. |
| 21 | `v_sku` | SKU riêng của biến thể theo quy tắc `{sku_thuong}-{slug_opt1_val}` (VD: `tq01-da-that`, `tq01-da-cn`, `tq01-pvc`). **Để trống `""` nếu là sản phẩm đơn.** |
| 22 | `v_barcode` | Để trống `""`. |
| 23 | `v_basePrice` | Giá bán cụ thể của biến thể đó (VD: `5160000`). **Để trống `""` nếu là sản phẩm đơn.** |
| 24 | `v_salePrice` | Để trống `""`. |
| 25 | `v_stock` | Điền `"0"` nếu là biến thể, **để trống `""` nếu là sản phẩm đơn.** |

---

## 4. DANH MỤC SLUG CHUẨN ĐỂ ĐỐI CHIẾU (`data/categories.json`)

Khi AI đọc tiêu đề trang PDF (ví dụ: `I. GHẾ LÃNH ĐẠO CAO CẤP`, `2. BÀN VĂN PHÒNG - Bàn Royal`), AI phải tự động ánh xạ vào chuỗi `categories` hợp lệ dựa trên cây danh mục 73 mục dưới đây:

- **Gốc:** `noi-that-the-one`
- **I. Nội thất văn phòng (`noi-that-van-phong`):**
  - Ghế văn phòng (`ghe-van-phong`): `ghe-lanh-dao-cao-cap`, `ghe-lanh-dao`, `ghe-nhan-vien`, `ghe-phong-hop`, `ghe-luoi-cao-cap`, `ghe-xoay-tre-em`
  - Bàn văn phòng (`ban-van-phong`): `ban-veneer`, `ban-son-pu`, `ban-royal`, `ban-newtrend`, `ban-athena`, `ban-sv`, `ban-hp`, `ban-chan-sat`
  - Khác: `ban-may-tinh`, `ban-hop`, `hoc-va-tu-phu` (`hoc-ban`, `tu-phu`), `vach-ngan-van-phong`, `tu-van-phong` (`tu-go-van-phong`, `tu-sat-van-phong-gia-sach-mcf`), `sofa-van-phong` (`ghe-sofa`, `ban-sofa`)
- **II. Nội thất gia dụng (`noi-that-gia-dung`):**
  - Ống thép, inox (`noi-that-gia-dung-lam-tu-ong-thep-inox`): `ghe-gap-ghe-tinh-khung-thep-inox`, `ban-gap-ban-tinh-khung-thep-inox`, `ghe-don-khung-thep-inox`, `cau-la-mac-ao-xich-du-thang-gap-khung-thep-inox`
  - Gỗ (`noi-that-gia-dung-lam-tu-go-tu-nhien-go-cong-nghiep`)
  - Két bạc (`ket-bac`): `ket-cao-cap-legend-pioneer`, `ket-chong-chay-ks`, `ket-tai-loc-kt`, `ket-an-toan-ka`, `ket-khach-san-kks`, `ket-nhap-khau-kdh`
- **III. Nội thất công trình (`noi-that-cong-trinh`):**
  - Ghế hội trường (`ghe-hoi-truong`): `ghe-hoi-truong-tc-mc`, `ghe-hoi-truong-go-tu-nhien`
  - Bàn hội trường - Lễ tân (`ban-hoi-truong-ban-quay-le-tan`): `ban-hoi-truong-go-tu-nhien-veneer-son-pu`, `ban-hoi-truong-go-cong-nghiep-sv-hp`, `ban-hoi-truong-khung-thep-eb`, `ban-quay-le-tan`, `ban-gap-khung-thep`
  - Khác: `ghe-phong-cho-gpc-pc`, `ghe-san-van-dong`, `buc-phat-bieu-buc-tuong-bac`, `ban-ghe-an-khu-cong-nghiep`, `gia-sieu-thi`, `ghe-quay-bar`, `ban-ghe-cafe-khach-san-quan-an-nhanh`
- **IV. Nội thất trường học:** `noi-that-truong-hoc`
- **V. Nội thất y tế:** `noi-that-y-te`
- **VI. Nội thất gia đình (`noi-that-gia-dinh`):**
  - Gia đình Hòa Phát (`noi-that-gia-dinh-hoa-phat`): `noi-that-phong-khach`, `noi-that-phong-an`, `noi-that-phong-ngu`, `tu-giay`, `ban-lam-viec`
  - Nhập khẩu (`noi-that-gia-dinh-nhap-khau`): `noi-that-theo-phong-cach-hien-dai`, `noi-that-theo-phong-cach-tan-co-dien`

---

## 5. MÃ NGUỒN TRIỂN KHAI ĐẦY ĐỦ (IMPLEMENTATION CODE)

### Bước 1: File `package.json` & Cài đặt

```json
{
  "name": "hoa-phat-pdf-extractor",
  "version": "1.0.0",
  "description": "Tool tự động bóc tách 100+ trang PDF bảng giá Hòa Phát sang CSV/JSON bằng Node.js và structured output của model tự chọn",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js"
  },
  "dependencies": {
    "@google/genai": "^0.1.2",
    "csv-writer": "^1.6.0",
    "dotenv": "^16.4.5",
    "pdf-lib": "^1.17.1"
  }
}
```

> **Lưu ý hữu ích:** Thư viện `pdf-lib` được tích hợp sẵn để trong trường hợp bạn có **1 file PDF tổng dài 180 trang**, script có thể tự động cắt thành từng trang lẻ rồi gửi cho AI xử lý từng trang một cách chính xác tuyệt đối.

---

### Bước 2: Định nghĩa Schema ép kiểu AI (`src/schema.js`)

```javascript
const { Type } = require('@google/genai');

const productExtractionSchema = {
  type: Type.OBJECT,
  properties: {
    pageCategorySlugs: {
      type: Type.STRING,
      description:
        'Chuỗi slug danh mục phân cấp từ gốc đến con, ngăn cách bởi dấu phẩy. Ví dụ: "noi-that-the-one,noi-that-van-phong,ghe-van-phong,ghe-lanh-dao-cao-cap"',
    },
    products: {
      type: Type.ARRAY,
      description: 'Danh sách toàn bộ các mã sản phẩm có trong trang PDF này.',
      items: {
        type: Type.OBJECT,
        properties: {
          sku: {
            type: Type.STRING,
            description: 'Mã sản phẩm in hoa (VD: TQ01, SG350B, HR120SC7). Không kèm chữ "(sản phẩm mới)".',
          },
          title: {
            type: Type.STRING,
            description: 'Tên đầy đủ của sản phẩm kết hợp tên danh mục và mã SKU (VD: "Ghế lãnh đạo cao cấp TQ01").',
          },
          isNewProduct: {
            type: Type.BOOLEAN,
            description: 'True nếu bên dưới mã sản phẩm có ghi chú "(sản phẩm mới)".',
          },
          width: {
            type: Type.STRING,
            description: 'Kích thước Rộng (mm), chỉ lấy số hoặc khoảng số (VD: "700").',
          },
          depth: {
            type: Type.STRING,
            description: 'Kích thước Sâu (mm), nếu có khoảng ngả thì ghi dạng "780-1140".',
          },
          height: {
            type: Type.STRING,
            description: 'Kích thước Cao (mm), nếu có tăng chỉnh độ cao thì ghi dạng "1155-1210".',
          },
          description: {
            type: Type.STRING,
            description:
              'Mô tả chi tiết sản phẩm đã được sửa sạch lỗi chính tả OCR (như Verneer -> Veneer, gõ -> gỗ) và nối thêm câu kích thước Rộng x Sâu x Cao ở cuối.',
          },
          shortDesc: {
            type: Type.STRING,
            description: 'Mô tả ngắn gọn 1 câu nêu tên sản phẩm, chất liệu và tính năng chính.',
          },
          opt1Name: {
            type: Type.STRING,
            description:
              'Tên thuộc tính biến thể nếu sản phẩm có từ 2 mức giá trở lên (VD: "Chất liệu", "Màu sắc", "Kích thước"). Nếu chỉ có 1 mức giá duy nhất thì trả về chuỗi rỗng "".',
          },
          variants: {
            type: Type.ARRAY,
            description:
              'Danh sách các mức giá/biến thể của sản phẩm. Nếu là sản phẩm đơn (1 giá), mảng này vẫn có 1 phần tử với opt1Val="" và price là giá bán.',
            items: {
              type: Type.OBJECT,
              properties: {
                opt1Val: {
                  type: Type.STRING,
                  description:
                    'Giá trị của biến thể (VD: "Da thật", "Da công nghiệp", "PVC", "Da màu đen", "Da màu nâu"). Để rỗng "" nếu sản phẩm chỉ có 1 mức giá.',
                },
                price: {
                  type: Type.STRING,
                  description: 'Giá bán bằng số nguyên, bỏ hết dấu chấm phân cách hàng nghìn (VD: "5160000").',
                },
              },
              required: ['opt1Val', 'price'],
            },
          },
        },
        required: [
          'sku',
          'title',
          'isNewProduct',
          'width',
          'depth',
          'height',
          'description',
          'shortDesc',
          'opt1Name',
          'variants',
        ],
      },
    },
  },
  required: ['pageCategorySlugs', 'products'],
};

module.exports = { productExtractionSchema };
```

---

### Bước 3: Module gọi model đọc PDF (ví dụ adapter Google — `src/geminiExtractor.js`)

> Đoạn code dưới đây là **một adapter mẫu** cho provider Google, dùng để chạy thử độc lập. Trong TM Tools, lời gọi đi qua AI relay của hub và `model` chỉ là tham số của job, nên cùng một pipeline có thể chạy bằng model của provider khác mà không sửa code.

```javascript
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');
const { productExtractionSchema } = require('./schema');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `
Bạn là chuyên gia bóc tách và chuẩn hóa dữ liệu Bảng giá bán buôn Nội thất Hòa Phát (Nội thất The One).
Nhiệm vụ của bạn là đọc trang PDF bảng giá được cung cấp và trích xuất CHÍNH XÁC 100% tất cả sản phẩm có trên trang.

QUY TẮC BẮT BUỘC:
1. KHÔNG BỎ SÓT SẢN PHẨM: Chú ý các hàng bị gộp ô (ví dụ TT 5 và 6 là TQ09 và TQ10 nằm chung 1 khung, hoặc TQ16 và TQ17 nằm chung 1 khung). Phải tách riêng từng mã SKU.
2. XỬ LÝ GIÁ & BIẾN THỂ (RẤT QUAN TRỌNG):
   - Trường hợp 1: Một mã SKU có nhiều dòng giá xếp dọc ứng với các dòng mô tả "Đệm tựa bọc da thật...", "Đệm tựa ghế bọc da CN", "Đệm tựa ghế bọc PVC" -> Đặt opt1Name = "Chất liệu", tạo 3 variants với opt1Val lần lượt là "Da thật", "Da công nghiệp", "PVC".
   - Trường hợp 2: Bảng có các cột giá riêng biệt như "Da | Da CN | PVC" (như dòng SG350, SG608) -> Đặt opt1Name = "Chất liệu", chỉ tạo variant cho những cột có giá (nếu cột Da CN để trống thì chỉ tạo 2 variants là "Da thật" và "PVC").
   - Trường hợp 3: Giá chia theo màu sắc ("- Da màu đen", "- Da màu nâu" như TQ22, TQ23) -> Đặt opt1Name = "Màu sắc", opt1Val là "Da màu đen", "Da màu nâu".
   - Trường hợp 4: Sản phẩm chỉ có đúng 1 mức giá duy nhất (như TQ05, TQ07, TQ08, TQ20, TQ21, TQ24, TQ25, TQ26, TQ27) -> Đây là sản phẩm đơn (Simple). Đặt opt1Name = "" và mảng variants có 1 phần tử với opt1Val = "".
3. XỬ LÝ KÍCH THƯỚC (mm):
   - Chú ý đọc đúng cột Rộng, Sâu, Cao.
   - Nếu Sâu hoặc Cao có 2 con số kèm dấu "+", "÷", "-" (biểu thị độ sâu khi ngả ghế hoặc chiều cao khi nâng hạ piston, ví dụ Cao 1155 ÷ 1210, Sâu 780 ÷ 1140) -> Hãy ghép thành khoảng "1155-1210" hoặc "780-1140".
4. SỬA LỖI CHÍNH TẢ OCR:
   - Sửa các từ lỗi trong PDF gốc: "Bản" -> "Bàn", "Verneer" -> "Veneer", "Bàn tỉnh" -> "Bàn tĩnh", "ngà" -> "ngả", "$g\\tilde{o}$" hoặc "gõ" -> "gỗ", "đêm tựa" -> "đệm tựa".
5. DANH MỤC (pageCategorySlugs):
   - Luôn bắt đầu bằng "noi-that-the-one,".
   - Ánh xạ đúng vào cây danh mục chuẩn dựa trên tiêu đề đầu trang PDF.
`;

async function extractPageWithRetry(pdfBuffer, fileName, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfBuffer.toString('base64'),
            },
          },
          `Hãy trích xuất toàn bộ sản phẩm từ trang bảng giá PDF (${fileName}) này theo đúng cấu trúc JSON Schema.`,
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: productExtractionSchema,
          temperature: 0.1, // Giữ temperature thấp để đảm bảo tính chính xác số liệu
        },
      });

      return JSON.parse(response.text);
    } catch (error) {
      console.error(`[Lỗi lần ${attempt}/${maxRetries}] tại file ${fileName}:`, error.message);
      if (attempt === maxRetries) throw error;
      // Chờ exponential backoff (3s, 6s, 9s...) nếu gặp Rate Limit
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
}

module.exports = { extractPageWithRetry };
```

---

### Bước 4: Module chuẩn hóa sang 25 cột CSV (`src/csvNormalizer.js`)

```javascript
// Hàm chuyển chuỗi tiếng Việt sang slug không dấu, viết tắt chuẩn cho v_sku
function makeVariantSuffix(optVal) {
  if (!optVal) return '';
  const lower = optVal.toLowerCase().trim();
  if (lower === 'da công nghiệp' || lower === 'da cn') return 'da-cn';
  if (lower === 'da thật' || lower === 'da') return 'da-that';
  if (lower === 'pvc') return 'pvc';

  return lower
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

function normalizeTo25Columns(extractedPages) {
  const allRows = [];
  let rowNo = 1;

  for (const pageData of extractedPages) {
    const categories =
      pageData.pageCategorySlugs ||
      'noi-that-the-one,noi-that-van-phong,ghe-van-phong,ghe-lanh-dao-cao-cap';

    // Tạo tags tự động từ chuỗi categories
    const catParts = categories.split(',').filter((c) => c !== 'noi-that-the-one');
    const baseTags = [...catParts, 'hoa-phat', 'the-one'].join(',');

    for (const prod of pageData.products || []) {
      const cleanPrices = prod.variants
        .map((v) => parseInt(String(v.price).replace(/\D/g, ''), 10))
        .filter((n) => !isNaN(n) && n > 0);

      const minPrice = cleanPrices.length > 0 ? String(Math.min(...cleanPrices)) : '0';

      let tags = baseTags;
      if (prod.isNewProduct) tags += ',san-pham-moi';

      const keywords = `${tags},${prod.sku.toLowerCase()}`;
      const attributes = `Rộng: ${prod.width}mm | Sâu: ${prod.depth}mm | Cao: ${prod.height}mm`;

      const isVariable = Boolean(prod.opt1Name && prod.variants.length > 1);

      for (const variant of prod.variants) {
        const cleanVariantPrice = String(variant.price).replace(/\D/g, '');
        const suffix = makeVariantSuffix(variant.opt1Val);

        allRows.push({
          no: String(rowNo++),
          sku: prod.sku.trim(),
          title: prod.title.trim(),
          barcode: '',
          basePrice: minPrice,
          salePrice: minPrice,
          prices: '',
          stock: '0',
          manageStock: '1',
          categories: categories,
          tags: tags,
          keywords: keywords,
          status: 'published',
          description: prod.description.trim(),
          shortDesc: prod.shortDesc.trim(),
          attributes: attributes,
          opt1_name: isVariable ? prod.opt1Name : '',
          opt1_val: isVariable ? variant.opt1Val : '',
          opt2_name: '',
          opt2_val: '',
          v_sku: isVariable ? `${prod.sku.toLowerCase()}-${suffix}` : '',
          v_barcode: '',
          v_basePrice: isVariable ? cleanVariantPrice : '',
          v_salePrice: '',
          v_stock: isVariable ? '0' : '',
        });
      }
    }
  }

  return allRows;
}

module.exports = { normalizeTo25Columns };
```

---

### Bước 5: Script điều phối chính có Checkpoint & Tách trang PDF (`src/index.js`)

```javascript
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { extractPageWithRetry } = require('./geminiExtractor');
const { normalizeTo25Columns } = require('./csvNormalizer');

const INPUT_DIR = path.join(__dirname, '../input_pdfs');
const CHECKPOINT_DIR = path.join(__dirname, '../output/checkpoints');
const OUTPUT_CSV = path.join(__dirname, '../output/products_import.csv');
const OUTPUT_JSON = path.join(__dirname, '../output/products_import.json');

// Đảm bảo các thư mục tồn tại
[INPUT_DIR, CHECKPOINT_DIR, path.dirname(OUTPUT_CSV)].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Hàm tách 1 file PDF nhiều trang thành mảng các Buffer 1 trang
async function splitPdfToSinglePages(pdfPath) {
  const existingPdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pageCount = pdfDoc.getPageCount();
  const baseName = path.basename(pdfPath, '.pdf');

  const singlePageBuffers = [];
  for (let i = 0; i < pageCount; i++) {
    const subDoc = await PDFDocument.create();
    const [copiedPage] = await subDoc.copyPages(pdfDoc, [i]);
    subDoc.addPage(copiedPage);
    const pdfBytes = await subDoc.save();
    const pageId = pageCount === 1 ? baseName : `${baseName}_p${String(i + 1).padStart(3, '0')}`;
    singlePageBuffers.push({ pageId, buffer: Buffer.from(pdfBytes) });
  }
  return singlePageBuffers;
}

async function exportResults(rows) {
  const headers = [
    'no', 'sku', 'title', 'barcode', 'basePrice', 'salePrice', 'prices',
    'stock', 'manageStock', 'categories', 'tags', 'keywords', 'status',
    'description', 'shortDesc', 'attributes', 'opt1_name', 'opt1_val',
    'opt2_name', 'opt2_val', 'v_sku', 'v_barcode', 'v_basePrice',
    'v_salePrice', 'v_stock'
  ];

  const csvWriter = createCsvWriter({
    path: OUTPUT_CSV,
    header: headers.map((col) => ({ id: col, title: col })),
    encoding: 'utf8',
  });

  await csvWriter.writeRecords(rows);

  // Gắn BOM UTF-8 để mở trên Excel hiển thị tiếng Việt hoàn hảo
  const rawCsv = fs.readFileSync(OUTPUT_CSV, 'utf8');
  fs.writeFileSync(OUTPUT_CSV, '\uFEFF' + rawCsv, 'utf8');

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(rows, null, 2), 'utf8');
}

async function main() {
  const pdfFiles = fs
    .readdirSync(INPUT_DIR)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort();

  if (pdfFiles.length === 0) {
    console.log(`Vui lòng copy các file PDF vào thư mục: ${INPUT_DIR}`);
    return;
  }

  console.log(`Tìm thấy ${pdfFiles.length} file PDF. Bắt đầu xử lý...`);
  const allExtractedPages = [];

  for (const file of pdfFiles) {
    const fullPath = path.join(INPUT_DIR, file);
    const pages = await splitPdfToSinglePages(fullPath);

    for (const { pageId, buffer } of pages) {
      const checkpointFile = path.join(CHECKPOINT_DIR, `${pageId}.json`);

      // Nếu trang này đã từng chạy xong trước đó -> Đọc từ Checkpoint (Tiết kiệm API & Thời gian)
      if (fs.existsSync(checkpointFile)) {
        console.log(`[SKIP - Đã có Checkpoint] ${pageId}`);
        const cachedData = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
        allExtractedPages.push(cachedData);
        continue;
      }

      console.log(`[ĐANG BÓC TÁCH] ${pageId}...`);
      const extractedData = await extractPageWithRetry(buffer, pageId);

      // Lưu checkpoint ngay lập tức
      fs.writeFileSync(checkpointFile, JSON.stringify(extractedData, null, 2), 'utf8');
      allExtractedPages.push(extractedData);

      console.log(
        `  -> Hoàn tất ${pageId}: Trích xuất được ${extractedData.products?.length || 0} mã sản phẩm.`
      );

      // Nghỉ 1.5 giây giữa các trang để tránh chạm ngưỡng Rate Limit
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // Chuẩn hóa toàn bộ dữ liệu sang 25 cột và xuất file
  const finalRows = normalizeTo25Columns(allExtractedPages);
  await exportResults(finalRows);

  console.log('====================================');
  console.log(`HOÀN TẤT! Tổng cộng: ${finalRows.length} dòng dữ liệu (Simple & Variable).`);
  console.log(`- File CSV:  ${OUTPUT_CSV}`);
  console.log(`- File JSON: ${OUTPUT_JSON}`);
}

main().catch((err) => console.error('Lỗi hệ thống:', err));
```

---

## 6. HƯỚNG DẪN CHẠY THỰC TẾ CHO HƠN 100 TRANG PDF

1. **Chuẩn bị model (chọn 1 trong 2 cách):**
   - **Cách khuyến nghị — dùng AI connection đã kết nối:** cấu hình provider trong TM Hub → AI Key Vault, bật model mong muốn, rồi chọn model đó ngay trong ô "Model bóc tách" của app. Không cần đặt key nào trong project, và đổi model không cần sửa code hay khởi động lại.
   - **Cách chạy thử độc lập (script trong tài liệu này):** tạo một `GEMINI_API_KEY` ở Google AI Studio (`https://aistudio.google.com/`) và khai báo trong `.env` ở thư mục gốc project:
     ```env
     GEMINI_API_KEY="AIzaSyYourApiKeyHere..."
     ```
     Key này chỉ phục vụ adapter mẫu bên dưới; nếu đổi sang provider khác thì thay phần gọi API tương ứng, phần schema/checkpoint/normalizer giữ nguyên.
2. **Bỏ file PDF vào thư mục `input_pdfs/`:**
   - Bạn có thể bỏ **100+ file PDF tách lẻ** (`page_0005.pdf`, `page_0006.pdf`...) hoặc bỏ **nguyên 1 file PDF tổng 180 trang** (ví dụ `bang_gia_hoa_phat_full.pdf`, chỉ cần xóa các trang Mục lục ở đầu đi). Hàm `splitPdfToSinglePages` trong code sẽ tự động cắt từng trang để xử lý.
3. **Chạy lệnh:**
   ```bash
   npm install
   npm start
   ```
4. **Cơ chế an toàn khi chạy số lượng lớn:**
   - Mỗi trang PDF xử lý xong sẽ được lưu ngay thành 1 file JSON nhỏ trong `output/checkpoints/page_xxxx.json`.
   - Nếu đang chạy đến trang thứ 85 mà mất mạng hoặc bạn bấm `Ctrl + C` dừng lại, lần sau chạy `npm start` hệ thống sẽ **bỏ qua 85 trang đầu** và chạy tiếp từ trang 86.
   - Nếu bạn muốn chỉnh sửa tay 1 sản phẩm ở trang 12, chỉ cần mở `output/checkpoints/page_0012.json` sửa lại rồi chạy `npm start`, file `products_import.csv` tổng sẽ được cập nhật lại tức thì trong 1 giây mà không tốn thêm lượt gọi API nào.