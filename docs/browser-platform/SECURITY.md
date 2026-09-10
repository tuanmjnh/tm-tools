# SECURITY SPECIFICATION & HARDENING GUIDE

Tài liệu quy chuẩn bảo mật cho ứng dụng desktop **Browser Profile Management Platform**, đáp ứng các tiêu chuẩn tại Mục 15 và Mục 35 trong [new.md](file:///d:/Applications/tm-tools/docs/browser-platform/new.md).

---

## 1. Electron Process Security Model

Ứng dụng tuân thủ mô hình bảo mật đa tiến trình nghiêm ngặt của Electron:

| Cơ chế | Trạng thái | Mục đích |
| :--- | :---: | :--- |
| **`contextIsolation`** | **`true`** | Ngăn chặn mã script trong Renderer truy cập trực tiếp vào ngữ cảnh JavaScript của Electron/Node.js. |
| **`nodeIntegration`** | **`false`** | Tuyệt đối vô hiệu hóa Node APIs trong giao diện Vue/Nuxt. |
| **`sandbox`** | **`true`** (renderer) | Giới hạn quyền hạn hệ điều hành của Renderer process. |
| **`webSecurity`** | **`true`** | Áp dụng đầy đủ Same-Origin Policy (SOP). |

### Ranh giới Preload Bridge:
Mọi giao tiếp giữa Renderer và Main process phải thông qua `contextBridge.exposeInMainWorld('electronAPI', ...)`.
**Không bao giờ expose:**
- `process`
- `fs`
- `child_process`
- `electron` internals
- `playwright` directly

---

## 2. Command Injection & Arbitrary Code Execution Prevention

### Nguyên tắc thực thi Executable:
1. **Không cho phép arbitrary shell string execution**:
   - Sử dụng `spawn(executablePath, argsArray, { shell: false })` thay vì `exec(commandString)`.
   - Các tham số dòng lệnh (`args`) luôn được truyền dưới dạng mảng `string[]`, ngăn ngừa tấn công Escape argument (`&`, `|`, `;`, `powershell`, `cmd.exe`).
2. **Xác thực đường dẫn Executable (Executable Path Validation)**:
   - Mọi đường dẫn executable từ phía người dùng nhập hoặc truyền qua IPC đều phải kiểm tra tồn tại vật lý (`fs.existsSync`).
   - Trên Windows, xác thực định dạng file mở rộng (`.exe`, `.cmd`, `.bat`) và kiểm tra chữ ký hoặc Metadata qua PowerShell `Get-Item VersionInfo` trước khi chạy.
3. **Tuyệt đối không dùng Dynamic Evaluation**:
   - Cấm `eval()`.
   - Cấm `new Function()`.
   - Không thực thi mã code lấy từ database hoặc tệp cấu hình không tin cậy.

---

## 3. Data Storage & Credential Protection

### Nguyên tắc lưu trữ:
1. **SQLite là Local-First Source of Truth**:
   - Dữ liệu lưu tại `app.getPath('userData')/database/app.db`.
   - Truy cập thông qua Drizzle ORM với Parameterized Queries, chống SQL Injection 100%.
2. **Không lưu trữ bí mật (Secrets) trong LocalStorage**:
   - `LocalStorage` của Renderer chỉ dùng cho các thiết lập UI vô hại:
     - Theme (Dark/Light mode)
     - Sidebar collapsed/expanded
     - Table page size, sort order, UI filters
   - **Tuyệt đối không lưu**:
     - Mật khẩu proxy / tài khoản
     - Token xác thực JWT / session cookies
     - Encryption keys
3. **Mã hóa nhạy cảm (Proxy & Account Credentials)**:
   - Các thông tin mật khẩu proxy và tài khoản liên kết phải được bảo vệ bằng cơ chế `safeStorage` của Electron (sử dụng DPAPI trên Windows, Keychain trên macOS, Secret Service trên Linux) khi lưu trữ vĩnh viễn.

---

## 4. Ranh giới Đạo đức & An toàn (Ethical & Safety Boundary)

Theo quy định tại Mục 19 và 35 của [new.md](file:///d:/Applications/tm-tools/docs/browser-platform/new.md):

```
+-------------------------------------------------------------------------------+
| PHẠM VI HỢP LỆ (IN-SCOPE)                                                    |
| - Môi trường cô lập độc lập cho QA, kiểm thử hồi quy (Regression Testing).    |
| - Quản lý nhiều phiên làm việc (Multi-profile Session Isolation).             |
| - Tự động hóa tác vụ kiểm thử giao diện & API nội bộ (Local Workflows).      |
| - Kiểm soát User-Agent, Window Size, WebRTC Leak Protection cho mục đích thử nghiệm.|
+-------------------------------------------------------------------------------+
| RANH GIỚI BỊ CẤM (OUT-OF-SCOPE / PROHIBITED)                                  |
| - Vượt cơ chế CAPTCHA (reCAPTCHA, hCaptcha, Cloudflare Turnstile).             |
| - Vượt hệ thống phát hiện gian lận (Anti-fraud / Bot detection bypass).       |
| - Vượt cơ chế xác minh danh tính (Identity verification bypass).              |
| - Tấn công từ chối dịch vụ hoặc spam tự động hóa bất hợp pháp.                |
+-------------------------------------------------------------------------------+
```

---

## 5. Network & Proxy Isolation

1. **Chống rò rỉ WebRTC (WebRTC Leak Prevention)**:
   - Hỗ trợ cờ `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` trên Chromium để ngăn chặn rò rỉ địa chỉ IP thật của máy chủ qua giao thức WebRTC STUN/TURN.
   - Trên Firefox/Camoufox, cấu hình qua `user.js`: `media.peerconnection.enabled = false`.
2. **Tách biệt dữ liệu phiên (Profile Data Isolation)**:
   - Mỗi profile sở hữu thư mục lưu trữ độc lập tuyệt đối (`userData/browser_profiles/<profileId>`).
   - Cookies, Cache, LocalStorage, IndexedDB và HSTS cache không bao giờ dùng chung giữa các profile.
