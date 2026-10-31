# Hướng Dẫn Sử Dụng & Thao Tác TM Tools Dành Cho Người Dùng (User Guide)

Chào mừng bạn đến với **TM Tools** — Nền tảng máy tính để bàn (Desktop Studio) tích hợp chỉnh sửa video dòng thời gian chuyên nghiệp (**TMCut Video Studio**), quản lý hồ sơ trình duyệt chống phát hiện vân tay (**Browser Profiles & Proxies**), thư viện tài nguyên đa phương tiện và bộ công cụ tự động hóa.

Tài liệu này hướng dẫn chi tiết cách sử dụng các tính năng hàng ngày trên giao diện người dùng.

---

## 1. Bắt Đầu & Kết Nối Hệ Thống

### 1.1. Khởi động ứng dụng
TM Tools hoạt động ở 2 chế độ:
- **Chế độ Electron Desktop (Khuyên dùng)**: Cung cấp đầy đủ sức mạnh xử lý video cục bộ, kết nối phần cứng, quản lý trình duyệt chống phát hiện và tích hợp video AI Runway.
  ```bash
  pnpm dev:electron
  ```
- **Chế độ Web Browser**: Truy cập nhanh qua trình duyệt tại `http://localhost:4002`.
  ```bash
  pnpm dev
  ```

### 1.2. Đăng nhập & Xác thực qua TM Hub
TM Tools là ứng dụng vệ tinh kết nối trực tiếp với **TM Hub Control Plane**:
1. Màn hình đăng nhập xuất hiện khi mở ứng dụng.
2. Nhập email và mật khẩu tài khoản đã được cấp bởi quản trị viên TM Hub (hoặc tài khoản mặc định `admin@example.com`).
3. Nếu tài khoản đã kích hoạt bảo mật 2 lớp (2FA / Passkey), hãy quét mã TOTP hoặc chạm khóa bảo mật.
4. Sau khi đăng nhập thành công, toàn bộ thanh menu bên trái sẽ tự động tải danh mục chức năng theo phân quyền của bạn.

### 1.3. Tổng quan giao diện người dùng
- **Sidebar (Thanh điều hướng bên trái)**: Danh mục các phân hệ: TMCut, Profiles, Tools, Resources, Utilities, Settings.
- **Top Navbar**: Hiển thị tên trang, nút thu gọn thanh menu, thanh tìm kiếm nhanh, nút chuyển giao diện Sáng/Tối (Light/Dark) và menu thông tin cá nhân.
- **Unified Action Bar**: Nút chức năng chính (như *Tạo mới*, *Lưu*, *Xuất bản*) luôn được hiển thị nổi bật dạng pill soft-primary, các hành động phụ được gom gọn trong menu `⋯` (More actions).
- **Responsive Mobile Bottom Bar**: Khi sử dụng trên màn hình nhỏ hoặc thu nhỏ cửa sổ, thanh điều hướng đáy sẽ xuất hiện giúp bạn thao tác bằng một tay dễ dàng.

---

## 2. Phân Hệ TMCut Video Studio

TMCut là phòng dựng video chuyên nghiệp dạng dòng thời gian (Multi-track Timeline Editor) tối ưu cho việc sáng tạo nội dung mạng xã hội (YouTube, TikTok, Facebook Reels, Shorts).

### 2.1. Không gian làm việc Studio (`/tmcut/editor`)
Giao diện Studio được thiết kế dạng **Flush Layout** tràn viền 100% màn hình, gồm 4 khu vực chính:
1. **Media Pool / Asset Panel (Bên trái)**: Nơi chứa video, âm thanh, hình ảnh, văn bản mẫu, hiệu ứng chuyển cảnh và nhãn dán.
2. **Canvas / Preview Monitor (Chính giữa trên)**: Màn hình xem trước video thời gian thực, hỗ trợ phóng to/thu nhỏ, xem tỉ lệ khung hình và lưới căn chỉnh (Grid Guides).
3. **Inspector / Property Panel (Bên phải)**: Bảng thuộc tính chi tiết của clip đang chọn (Vị trí X/Y, Scale phóng to, Xoay, Độ mờ Opacity, Bộ lọc màu, Volume âm thanh, Tốc độ Speed).
4. **Timeline (Phía dưới)**: Không gian sắp xếp các track video, audio, text theo thời gian.

### 2.2. Các thao tác biên tập cơ bản trên Timeline
- **Thêm tư liệu vào Timeline**: Kéo video hoặc ảnh từ Media Pool thả trực tiếp vào track mong muốn.
- **Cắt / Chia clip (Split)**: Di chuyển đầu đọc (**Playhead**) đến vị trí cần cắt, sau đó bấm biểu tượng chiếc kéo hoặc phím tắt `Ctrl + B` (hoặc `Cmd + B` trên macOS).
- **Thu ngắn / Kéo dài (Trim)**: Di chuột vào mép đầu hoặc mép cuối clip, con trỏ chuột đổi thành mũi tên 2 chiều, bấm giữ và kéo để thay đổi thời lượng.
- **Xóa clip (Delete)**: Bấm chọn clip và nhấn phím `Delete` hoặc `Backspace`.
- **Hút dính (Snapping / Magnet)**: Bật biểu tượng nam châm trên thanh công cụ timeline để các clip tự động hút sát vào nhau, tránh để lại khe hở đen giữa các đoạn video.
- **Xem trước (Play / Pause)**: Bấm phím `Space` (Cách) để phát hoặc tạm dừng video.

### 2.3. Quản lý tỉ lệ khung hình (Aspect Ratio)
Trên góc trên của màn hình Preview, bạn có thể chọn nhanh:
- **16:9 (1920x1080)**: Dành cho video chuẩn YouTube, màn hình ngang máy tính.
- **9:16 (1080x1920)**: Dành cho video ngắn TikTok, YouTube Shorts, Reels, Story.
- **1:1 (1080x1080)**: Dành cho bài viết vuông Instagram, Facebook feed.
- **4:5**: Video dọc tối ưu cho bảng tin di động.

### 2.4. Mẫu video có sẵn (Templates Library - `/tmcut/templates`)
- Khám phá kho mẫu video đã được dựng sẵn intro, outro, hiệu ứng chữ chuyển động và âm nhạc.
- Nhấn **Sử dụng mẫu** để mở thẳng vào timeline và chỉ cần thay thế nội dung chữ hoặc hình ảnh của bạn.

### 2.5. Tự động cắt video hàng loạt (AutoCut Studio - `/tmcut/autocut`)
- Tải lên một video dài hoặc nhiều clip rời rạc.
- Cấu hình thông số chia nhỏ (cắt theo từng đoạn N giây, hoặc nhận diện điểm im lặng bằng AI).
- Bấm **Tiến hành xử lý**: Hệ thống sẽ tự động tách và xuất ra hàng loạt clip ngắn sẵn sàng đăng tải lên các nền tảng mạng xã hội.

### 2.6. Xuất video thành phẩm (Export)
1. Bấm nút **Xuất video (Export)** ở góc phải màn hình.
2. Chọn độ phân giải: `720p (HD)`, `1080p (Full HD)` hoặc `4K (Ultra HD)`.
3. Chọn tốc độ khung hình: `24 fps`, `30 fps`, hoặc `60 fps`.
4. Chọn thư mục lưu trên máy tính và bấm **Bắt đầu xuất**. Quá trình render video sẽ hiển thị thanh tiến trình trực quan.

---

## 3. Phân Hệ Quản Lý Hồ Sơ Trình Duyệt (Browser Profiles)

Phân hệ này cho phép tạo và quản lý hàng loạt môi trường trình duyệt độc lập với các thông số vân tay phần cứng khác nhau, phục vụ cho việc quản lý nhiều tài khoản mạng xã hội hoặc tự động hóa tác vụ mà không bị khóa liên đới.

### 3.1. Danh sách hồ sơ (`/profiles`)
- Xem danh sách toàn bộ các Profile trình duyệt đang có.
- Xem trạng thái: Đang chạy (Active), Dừng (Idle), hoặc Lỗi kết nối.
- Thao tác nhanh:
  - **Khởi chạy (Launch)**: Mở cửa sổ trình duyệt tương ứng.
  - **Tạm dừng (Stop)**: Đóng cửa sổ trình duyệt và lưu lại phiên làm việc (Cookies, Session).
  - **Sao chép (Clone)**: Tạo một bản sao cấu hình mới tương tự.

### 3.2. Tạo hồ sơ mới
Khi bấm **Thêm Profile**, bạn có thể thiết lập:
1. **Thông tin chung**: Tên profile, nhóm thẻ (Tags/Group), ghi chú.
2. **Cấu hình vân tay (Fingerprint)**:
   - Hệ điều hành giả lập: Windows, macOS, Linux, Android, iOS.
   - Trình duyệt lõi: Chrome, Edge, Brave.
   - Giả lập Canvas, AudioContext, WebGL Metadata, Font chữ máy tính.
3. **Cấu hình mạng (Proxy)**:
   - Chọn loại: `Direct (Không dùng proxy)`, `HTTP`, `HTTPS`, hoặc `SOCKS5`.
   - Nhập IP, Port, Tên đăng nhập và Mật khẩu proxy.
   - Bấm **Kiểm tra kết nối (Check Proxy)** để xác nhận IP và độ trễ Ping trước khi lưu.

### 3.3. Quản trị Proxy tập trung (`/profiles/proxies`)
- Quản lý danh sách proxy riêng biệt, gán nhãn quốc gia, kiểm tra tình trạng sống/chết (Live/Die) của proxy theo chu kỳ.
- Dễ dàng thay đổi proxy cho nhiều profile cùng lúc.

---

## 4. Tài Nguyên & Tiện Ích Mở Rộng

### 4.1. Thư viện tệp Media (`/media`)
- Nơi tập trung toàn bộ video, âm thanh, hình ảnh và tài liệu tải lên.
- Hỗ trợ xem trước trực tiếp video chất lượng cao, nghe thử audio và phóng to hình ảnh.
- Tìm kiếm nhanh bằng tên tệp hoặc lọc theo định dạng (`.mp4`, `.png`, `.jpg`, `.mp3`).

### 4.2. Kho tài nguyên Stock Assets miễn phí (Free-for-Commercial Stock Library)
TMCut tích hợp sẵn trung tâm tìm kiếm tư liệu ảnh, video và âm thanh bản quyền miễn phí phục vụ dựng video thương mại mà không lo vi phạm bản quyền:
1. **Openverse (Mặc định - Miễn phí 100%)**:
   - **Tài nguyên**: Hình ảnh (`image`), Âm thanh (`audio`).
   - **Giấy phép**: CC0, CC BY, CC BY-SA (được phép dùng thương mại và chỉnh sửa).
   - **Cấu hình**: **Không cần thiết lập gì**, có thể sử dụng ngay lập tức trong tab Stock của TMCut.
2. **Pexels (Ảnh & Video HD/4K chất lượng cao)**:
   - **Tài nguyên**: Hình ảnh (`image`), Video HD/4K (`video`).
   - **Giấy phép**: Giấy phép Pexels (miễn phí thương mại, không bắt buộc ghi công).
   - **Đăng ký API Key**: Truy cập [https://www.pexels.com/api/new/](https://www.pexels.com/api/new/) đăng ký tài khoản miễn phí để nhận API Key.
3. **Pixabay (Kho ảnh minh họa & Footage phong phú)**:
   - **Tài nguyên**: Hình ảnh (`image`), Video (`video`).
   - **Giấy phép**: Pixabay Content License (miễn phí thương mại).
   - **Đăng ký API Key**: Truy cập [https://pixabay.com/api/docs/](https://pixabay.com/api/docs/) đăng ký tài khoản và sao chép API Key ở mục *Parameters*.

#### Cấu hình nhanh API Key:
- **Cách 1 (Trực tiếp trong TMCut Studio)**: Trong TMCut > Chọn tab **Stock** bên trái > Chọn provider (Pexels / Pixabay) > Bấm biểu tượng chìa khóa > Dán API Key và nhấn **Lưu** (lưu an toàn tại LocalStorage).
- **Cách 2 (Quản trị tập trung qua module Connections)**: Vào menu **Resources > Connections** (`/resources/connections`) > Nhấn **Add Connection** > Chọn nhóm **Media / Storage / CDN** > Chọn **Pexels** hoặc **Pixabay** > Dán API Key > Bấm **Lưu & Kiểm tra kết nối**. Toàn bộ key được mã hóa AES-256-GCM tập trung trên TM Hub.

### 4.3. Hộp thư thông báo (`/inbox`)
- Nhận thông báo cập nhật hệ thống, cảnh báo hoàn tất render video hoặc tiến trình tải file tự động từ TM Hub.
- Đánh dấu đã đọc hoặc xóa các thông báo cũ.

### 4.4. Bộ công cụ tiện ích (Utilities)
- **Văn bản (`/utilities/text`)**: Đổi chữ hoa/chữ thường, loại bỏ dấu tiếng Việt, lọc trùng dòng, đếm ký tự/từ.
- **Biểu tượng (`/utilities/icons`)**: Tra cứu hàng nghìn icon thuộc bộ Lucide Icons, bấm sao chép tên icon hoặc mã SVG chỉ với 1 click.
- **Mã hóa & Giải mã (`/utilities/encode`)**: Hỗ trợ chuyển đổi qua lại giữa Base64, URL encode/decode, Hex, HTML Entities, đọc cấu trúc JWT token.
- **Ngẫu nhiên (`/utilities/random`)**: Sinh mật khẩu bảo mật cao, tạo chuỗi UUID ngẫu nhiên, tung xúc xắc hoặc bốc thăm số.
- **Soạn thảo (`/utilities/editor`)**: Trình soạn thảo văn bản giàu tính năng (Rich Text Tiptap) và trình soạn thảo Markdown với chế độ xem trước trực tiếp.

---

## 5. Cài Đặt Người Dùng & Cá Nhân Hóa (Settings)

Truy cập danh mục **Cài đặt (Settings)** trên menu:
1. **Giao diện & Chủ đề (`/settings/tools`)**:
   - Chọn chế độ hiển thị: Sáng (Light), Tối (Dark), hoặc Tự động theo hệ điều hành.
   - Đổi ngôn ngữ ứng dụng: Tiếng Việt hoặc English.
2. **Thư mục lưu trữ cục bộ**:
   - Chỉ định thư mục mặc định lưu video render và thư mục tải xuống.
3. **Thông báo đẩy (`/settings/notifications`)**:
   - Bật/tắt thông báo trên màn hình máy tính (Desktop Notification) khi tác vụ hoàn thành.
4. **Bảo mật (`/settings/security`)**:
   - Đổi mật khẩu tài khoản, xem các phiên đăng nhập đang hoạt động và quản lý xác thực 2 bước (2FA).

---

## 6. Những Câu Hỏi Thường Gặp (FAQ & Troubleshooting)

### Q1: Không thấy danh sách menu sau khi đăng nhập?
- **Nguyên nhân**: TM Hub chưa khởi chạy hoặc chưa hoàn tất đồng bộ phân quyền.
- **Cách khắc phục**: Kiểm tra lại trạng thái của TM Hub tại `https://tm-hub-app.vercel.app` và đảm bảo kết nối mạng nội bộ ổn định.

### Q2: Video xem trước trên Timeline bị giật hoặc đơ?
- **Cách khắc phục**:
  1. Giảm độ phân giải xem trước (Preview Quality) xuống `1/2` hoặc `1/4` trong phần cài đặt của Canvas.
  2. Bật tính năng tăng tốc phần cứng (Hardware Acceleration) trong cài đặt Electron.

### Q3: Tải file dung lượng lớn lên hệ thống báo lỗi?
- **Cách khắc phục**: Khi thao tác trên giao diện Web, một số trình duyệt có thể giới hạn dung lượng tải lên. Bạn nên sử dụng phiên bản **TM Tools Desktop (Electron)** để có thể xử lý các file video dung lượng lớn hàng chục GB trực tiếp từ ổ cứng.

---

## 7. Tài Liệu Hướng Dẫn Liên Quan

* ⚙️ **[Hướng Dẫn Cài Đặt & Cấu Hình Hệ Thống](./system-setup-and-configuration-guide.md)**: Khởi chạy Hub, gán port, seed database và kết nối satellite.
* 🚀 **[Hướng Dẫn Cấu Hình Hệ Thống Assets & RunwayML API](./assets-and-runwayml-setup-guide.md)**: Thiết lập bộ tạo video AI Runway Gen-3 và lưu trữ Asset.
* 🏪 **[Hướng Dẫn Cấu Hình & Đẩy Asset Lên Marketplace](./asset-marketplace-guide.md)**: Đóng gói và phát hành tài nguyên lên Marketplace.
