# BROWSER ADAPTER SPECIFICATION & ARCHITECTURE GUIDE

Tài liệu này chi tiết hóa thiết kế hệ thống **Browser Adapter** theo kiến trúc Clean Architecture, đáp ứng quy chuẩn trong [new.md](file:///d:/Applications/tm-tools/docs/browser-platform/new.md).

---

## 1. Bốn khái niệm tách biệt cốt lõi

Quy tắc bất di bất dịch của hệ thống là không bao giờ gộp 4 khái niệm sau vào một class hay service:

```
+-------------------------------------------------------------------------------+
| 1. BROWSER RUNTIME (Trình cài đặt/Engine binary - Chrome, Camoufox, Oxide...)  |
|                                     |                                         |
|                                     v                                         |
| 2. BROWSER PROFILE (Cấu hình độc lập, User Data Directory, Fingerprint, Proxy) |
|                                     |                                         |
|                                     v                                         |
| 3. BROWSER PROCESS (Tiến trình OS đang chạy, PID, Lifecycle, CDP Debug Port)   |
|                                     |                                         |
|                                     v                                         |
| 4. AUTOMATION SESSION (Phiên kết nối Playwright / CDP, Điều khiển tác vụ)     |
+-------------------------------------------------------------------------------+
```

- **Browser Runtime**: Khai báo tệp nhị phân thực thi (`executable_path`), loại nhân (`chromium`, `firefox`, `camoufox`, `donut`, `browser_oxide`, `custom`), phiên bản và năng lực (`capabilities`).
- **Browser Profile**: Thực thể dữ liệu mô tả môi trường độc lập, thư mục lưu trữ (`storagePath`), proxy, timezone, fingerprint và các tài khoản liên kết.
- **Browser Process**: Tiến trình hệ thống đang sống do `BrowserProcessManager` quản lý (PID, exit code, tín hiệu thoát, dọn dẹp cây tiến trình).
- **Automation Session**: Phiên làm việc mức cao kết nối qua DevTools Protocol (CDP) hoặc Playwright để thực thi các kịch bản QA/kiểm thử.

---

## 2. Capability-Based Adapter Design

Mọi adapter phải cài đặt interface [`IBrowserAdapter`](file:///d:/Applications/tm-tools/electron/src/domain/browser/BrowserAdapter.ts):

```typescript
export interface IBrowserAdapter {
  readonly id: string
  readonly name: string
  readonly engine: BrowserEngine

  detect(): Promise<DetectionResult[]>
  getVersion(executablePath: string): Promise<string>
  launch(options: LaunchOptions): Promise<BrowserProcess>
  close(pid: number): Promise<void>
  supports(): BrowserCapabilities
}
```

### Bảng Ma trận Năng lực (Capability Matrix):

| Engine / Adapter | CDP Protocol | Cài đặt Extension | Chạy Headless | Dòng lệnh Custom | Anti-Detect / Stealth |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Chromium** (Chrome, Edge, Brave) | ✅ | ✅ | ✅ | ✅ | Cần script/extension |
| **Firefox** (Mozilla Firefox) | ❌ | ✅ | ✅ | ✅ | `user.js` preferences |
| **Camoufox** (Firefox C++ Anti-detect)| ✅ | ✅ | ✅ | ✅ | Native C++ patches |
| **Donut Browser** (Chromium Concealed)| ✅ | ✅ | ✅ | ✅ | Tự động giấu automation |
| **Browser Oxide** (Rust Headless/CDP) | ✅ | ✅ | ✅ | ✅ | Memory-safe sandbox |
| **Custom Executable** | Tùy exe | ✅ | ✅ | ✅ | Tùy cấu hình người dùng |

---

## 3. Quản lý Registry & Khả năng mở rộng Plugin

- `BrowserManager` duy trì danh sách adapter qua Registry.
- Hỗ trợ tra cứu theo cả `engine` và `adapter.id`:
  - `getAdapter(engine: BrowserEngine)`
  - `getAdapterById(id: string)`
  - `hasAdapter(engine: BrowserEngine)`
- Khi bổ sung một engine mới (hoặc plugin từ bên ngoài), chỉ cần implement `IBrowserAdapter` và gọi `browserManager.registerAdapter(new MyPluginAdapter())`. Tuyệt đối không sửa code lõi hay dùng `if-else` lồng nhau.

---

## 4. An toàn & Bảo mật (Safety & Security Boundary)

- **Không vượt rào**: Hệ thống không tích hợp mã vượt CAPTCHA, qua mặt hệ thống chống gian lận (anti-fraud bypass) hay giả mạo danh tính trái phép.
- **Mục đích sử dụng**: Phục vụ QA, multi-account session management, testing và tự động hóa quy trình nghiệp vụ nội bộ cục bộ (local workflows).
