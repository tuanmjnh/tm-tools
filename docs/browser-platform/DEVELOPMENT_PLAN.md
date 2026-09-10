# BROWSER PROFILE MANAGEMENT PLATFORM — DEVELOPMENT PLAN

> **Phiên bản:** 1.0.0  
> **Nguyên tắc phát triển:** Chia chặng kiểm soát rủi ro (Milestone-based Delivery), Zero Regression, Strict Typing, TDD/Unit Test Focused.  
> **Độ ưu tiên chất lượng:** Correctness > Architecture > Maintainability > Security > Performance > UI Polish.

---

## 1. TỔNG QUAN TIẾN TRÌNH 10 MILESTONES

Quy trình phát triển toàn bộ hệ thống Browser Profile Platform được chia nhỏ thành 10 giai đoạn tuần tự. Mỗi giai đoạn đều có ranh giới phạm vi (scope), tiêu chí hoàn thành (definition of done), kiểm tra hồi quy và cam kết không phá vỡ kiến trúc.

```
Milestone 1  ──► Milestone 2  ──► Milestone 3  ──► Milestone 4  ──► Milestone 5
[Architecture]   [Runtime Detect] [Profile Core]   [Org & Bulk]    [Proxy Mgr]
      │
      ▼
Milestone 6  ──► Milestone 7  ──► Milestone 8  ──► Milestone 9  ──► Milestone 10
[Playwright]     [Task/Workflow]  [Dashboard/Logs] [Backup/Restore] [Hardening/Build]
```

### Quy tắc bất di bất dịch cho mỗi Milestone (Standard Delivery Checklist)
Mỗi milestone khi thực hiện BẮT BUỘC tuân thủ 11 bước sau:
1. **Kiểm tra kiến trúc hiện tại**: Đảm bảo không vi phạm ranh giới 4 tầng (Presentation -> Application -> Domain -> Infrastructure).
2. **Chỉ implement phạm vi milestone**: Không viết trước code cho milestone tương lai; không làm phình to PR/commit.
3. **Không phá vỡ API/Module cũ**: Tương thích ngược với các tính năng hiện có của dự án mẹ (YouTube, Media Tools, RBAC).
4. **Viết TypeScript type rõ ràng**: Không dùng `any`, có generic và return types minh bạch.
5. **Viết migration khi schema thay đổi**: Sử dụng Drizzle Kit generate migration SQL độc lập, có rollback an toàn.
6. **Viết test cho business logic quan trọng**: Đạt kiểm thử đơn vị (Unit Test) cho domain services, repositories, managers.
7. **Chạy typecheck**: `pnpm typecheck` (vue-tsc & tsc) đạt 0 errors.
8. **Chạy lint**: `pnpm lint` không có cảnh báo/lỗi lint trên các file tạo mới hoặc sửa đổi.
9. **Chạy test**: `pnpm test` (nếu cấu hình) pass 100%.
10. **Báo cáo file đã tạo/thay đổi**: Liệt kê chi tiết cây thư mục và danh sách file can thiệp.
11. **Báo cáo các vấn đề còn tồn tại (Known Issues)**: Ghi chú nợ kỹ thuật hoặc tính năng chờ giai đoạn sau.

---

## 2. CHI TIẾT CÁC MILESTONES

### Milestone 1: Nền tảng Kiến trúc, Database Drizzle SQLite & Typed IPC Core
*Mục tiêu*: Thiết lập hạ tầng cốt lõi của Electron Main Process theo kiến trúc 4 tầng, cấu hình Drizzle ORM với SQLite, hệ thống migration tự động, EventBus và cầu nối Preload IPC có Zod validation.

- **Phạm vi triển khai (Scope)**:
  - Cài đặt / Cấu hình thư viện: `drizzle-orm`, `drizzle-kit`, `better-sqlite3`, `zod`.
  - Cấu trúc thư mục mới: `electron/src/` (core, modules, infrastructure) và `shared/contracts/`.
  - Thiết lập `StorageManager`: Khởi tạo và quản lý hệ thống cây thư mục tại `app.getPath('userData')`:
    - `database/`, `profiles/`, `downloads/`, `screenshots/`, `logs/`, `backups/`, `temp/`.
  - Thiết lập Database Connection: SQLite tại `userData/database/app.sqlite` thông qua Drizzle ORM.
  - Thiết lập Migrations Engine: Tự động chạy migrations khi ứng dụng Electron khởi động.
  - Thiết lập `EventBus`: Triển khai typed EventEmitter cho main process và cầu nối phát event sang renderer qua `webContents.send`.
  - Thiết lập `Logger`: Ghi log có cấu trúc (file rotating + IPC broadcast).
  - Thiết lập IPC Infrastructure: Bộ điều hướng IPC tự động map Zod schema, bọc try/catch chuẩn hóa `ApiResponse<T>`.
  - Bridge Preload: Expose namespace `window.electronAPI` có type an toàn qua `contextBridge`.
  - Pinia Store Foundation: Cấu hình store pinia cơ sở cho renderer.
- **Deliverables**:
  - `electron/src/infrastructure/storage/StorageManager.ts`
  - `electron/src/infrastructure/database/connection.ts`
  - `electron/src/infrastructure/database/schema/` (các schema ban đầu)
  - `electron/src/infrastructure/database/migrator.ts`
  - `electron/src/core/EventBus.ts`
  - `electron/src/core/Logger.ts`
  - `shared/contracts/system.ipc.ts`
  - `electron/src/presentation/ipc/system.ipc.ts`
- **Tiêu chí nghiệm thu (Definition of Done)**:
  - Khởi động Electron: thư mục `userData/` tự tạo đầy đủ các sub-folder.
  - Database `app.sqlite` được khởi tạo và chạy migration ban đầu thành công.
  - UI gọi `window.electronAPI.system.getInfo()` qua IPC thành công, nhận data được validate bởi Zod.
  - `pnpm typecheck` và `pnpm lint` sạch lỗi.

---

### Milestone 2: Browser Runtime Detection, BrowserAdapter & BrowserProcessManager
*Mục tiêu*: Xây dựng khả năng tự động nhận diện các trình duyệt đã cài đặt trên máy người dùng (Chrome, Chromium, Firefox, Edge, Brave) và cho phép đăng ký Custom Executable; quản lý vòng đời tiến trình (PID, spawn, kill, crash detection).

- **Phạm vi triển khai (Scope)**:
  - Thiết kế trừu tượng `BrowserAdapter` (Interface + Base class).
  - Triển khai cụ thể các Adapter:
    - `ChromiumBrowserAdapter` (hỗ trợ Chrome, Chromium, Edge, Brave).
    - `FirefoxBrowserAdapter` (hỗ trợ Firefox, Developer Edition, Nightly).
    - `CustomBrowserAdapter` (cho phép người dùng trỏ đường dẫn file exe tùy ý).
  - Triển khai `BrowserManager`:
    - Scan Registry (Windows) / Program Files / Path để tự động phát hiện trình duyệt khả dụng.
    - Lấy phiên bản (version detection) và capabilities (`supports()`).
    - Lưu danh sách vào bảng `browsers` trong SQLite thông qua `BrowserRepository`.
  - Triển khai `BrowserProcessManager`:
    - Quản lý Map tiến trình đang chạy theo PID và profileId: `Map<string, { pid: number; process: ChildProcess; startedAt: Date }>`.
    - Lắng nghe sự kiện `exit`, `error`, phát ra EventBus (`browser:started`, `browser:closed`, `profile:crashed`).
    - Xử lý tắt tiến trình sạch sẽ (Graceful SIGTERM) và cưỡng chế (Windows `taskkill /pid ... /f /t`).
  - IPC: `browser.ipc.ts` (list, detect, addCustom, testExecutable).
- **Deliverables**:
  - `electron/src/domain/browser/BrowserAdapter.ts`
  - `electron/src/domain/browser/BrowserProcess.ts`
  - `electron/src/infrastructure/adapters/browser/ChromiumAdapter.ts`
  - `electron/src/infrastructure/adapters/browser/FirefoxAdapter.ts`
  - `electron/src/infrastructure/adapters/browser/CustomAdapter.ts`
  - `electron/src/modules/browser/BrowserManager.ts`
  - `electron/src/modules/browser/BrowserProcessManager.ts`
  - `electron/src/modules/browser/BrowserRepository.ts`
  - `shared/contracts/browser.ipc.ts`
  - `electron/src/presentation/ipc/browser.ipc.ts`
- **Tiêu chí nghiệm thu**:
  - Nhận diện chính xác ít nhất 1 trình duyệt đang cài trên máy chủ (ví dụ Chrome/Edge) kèm version.
  - Khởi động một tiến trình test qua Adapter, ghi nhận PID, đóng tiến trình thành công và EventBus kích hoạt đúng sự kiện.
  - Không còn zombie process chạy ngầm khi đóng ứng dụng.

---

### Milestone 3: Profile CRUD, Isolated Storage & Launch/Stop/Restart
*Mục tiêu*: Quản lý toàn diện hồ sơ trình duyệt (Profile), đảm bảo mỗi profile có một thư mục `userDataDir` hoàn toàn độc lập, cấu hình khởi chạy (cờ flags, viewport, window position), quản lý trạng thái Launch / Stop / Restart.

- **Phạm vi triển khai (Scope)**:
  - Entity `Profile` và Drizzle Schema bảng `profiles`.
  - `ProfileRepository`: CRUD queries, pagination, sorting.
  - `ProfileManager`:
    - Tạo hồ sơ: cấp phát UUID, tạo thư mục cô lập `userData/profiles/{profileId}`.
    - Chuẩn bị tham số khởi chạy (Command-line arguments): `--user-data-dir`, `--window-size`, `--window-position`, `--no-first-run`, `--no-default-browser-check`.
    - Phối hợp với `BrowserProcessManager` để khởi chạy profile với `browserId` tương ứng.
    - Quản lý trạng thái profile (`idle`, `launching`, `running`, `stopping`, `error`).
    - Khởi động lại (Restart): Stop an toàn -> Đợi process exit -> Launch lại.
    - Xóa profile: Xóa an toàn bản ghi trong DB và tùy chọn xóa sạch hoặc lưu trữ thư mục `userDataDir`.
  - IPC: `profile.ipc.ts` (list, getById, create, update, delete, launch, stop, restart, getStatus).
  - Pinia Store: `useProfileStore` trên Renderer cập nhật real-time trạng thái chạy/dừng thông qua lắng nghe EventBus IPC.
  - Giao diện UI: Danh sách profile (GridList), Form tạo/sửa modal, nút Launch/Stop/Restart với animation trạng thái.
- **Deliverables**:
  - `electron/src/domain/profile/Profile.ts`
  - `electron/src/modules/profile/ProfileManager.ts`
  - `electron/src/modules/profile/ProfileRepository.ts`
  - `shared/contracts/profile.ipc.ts`
  - `electron/src/presentation/ipc/profile.ipc.ts`
  - `app/stores/profile.ts`
  - `app/pages/profiles/index.vue` (refactor kết nối IPC typed)
- **Tiêu chí nghiệm thu**:
  - Tạo 2 profile khác nhau, khởi chạy đồng thời: Mỗi profile mở một cửa sổ trình duyệt riêng, lưu cookies và session độc lập 100% (đăng nhập 2 tài khoản khác nhau trên cùng 1 web không bị xung đột).
  - Khi tắt cửa sổ trình duyệt vật lý, UI tự động cập nhật trạng thái về `idle`.
  - Bấm Stop từ UI tắt ngay lập tức cửa sổ trình duyệt tương ứng.

---

### Milestone 4: Quản lý Groups, Tags, Search, Bộ Lọc Nâng Cao & Thao Tác Hàng Loạt (Bulk Actions)
*Mục tiêu*: Cung cấp khả năng tổ chức hàng trăm profile chuyên nghiệp thông qua thư mục/nhóm (Groups), gắn thẻ đa chiều (Tags), bộ lọc kết hợp, và thực hiện các tác vụ hàng loạt (Launch All, Stop All, Move Group, Batch Delete).

- **Phạm vi triển khai (Scope)**:
  - Database Schema: Bảng `profile_groups`, `tags`, `profile_tags` (quan hệ nhiều-nhiều).
  - Repositories: `GroupRepository`, `TagRepository`.
  - Nghiệp vụ:
    - CRUD Groups (màu sắc, icon, phân cấp/thứ tự).
    - CRUD Tags (quản lý nhãn, màu sắc).
    - Gán/hủy tags hàng loạt cho danh sách profile.
    - Batch Operations trong `ProfileManager`:
      - Batch Launch (khởi chạy tuần tự có giãn cách thời gian để tránh nghẽn CPU/RAM).
      - Batch Stop (tắt toàn bộ các profile đang chạy).
      - Batch Delete (xóa nhiều profile kèm hộp thoại xác nhận an toàn `LazyBaseConfirmModal`).
      - Batch Change Group / Proxy.
  - Renderer:
    - Sidebar filter theo Group và Tag.
    - Tìm kiếm đa tiêu chí (tên, email, proxy, tag, trạng thái chạy).
    - Thanh điều khiển tác vụ hàng loạt khi người dùng chọn nhiều dòng (checkbox).
- **Deliverables**:
  - `electron/src/infrastructure/database/schema/groups.ts`
  - `electron/src/infrastructure/database/schema/tags.ts`
  - `electron/src/modules/group/GroupRepository.ts`
  - `electron/src/modules/tag/TagRepository.ts`
  - `shared/contracts/group.ipc.ts`, `shared/contracts/tag.ipc.ts`
  - `app/components/profiles/BatchActionBar.vue`
- **Tiêu chí nghiệm thu**:
  - Tạo 10 profile mẫu, gán vào 2 nhóm khác nhau và gắn nhiều nhãn.
  - Lọc theo tag và group cho kết quả chính xác tức thì.
  - Thao tác "Batch Launch 3 profiles" mở 3 cửa sổ trình duyệt tuần tự, không gây treo giao diện.
  - Thao tác "Batch Delete" xóa đúng các bản ghi được chọn trong SQLite.

---

### Milestone 5: Quản lý Proxy & Bảo Mật Secrets với Electron safeStorage
*Mục tiêu*: Xây dựng hệ thống quản lý Proxy toàn diện (HTTP, HTTPS, SOCKS4, SOCKS5), kiểm tra độ trễ (latency/ping), lấy thông tin IP/quốc gia, mã hóa an toàn mật khẩu proxy bằng Electron `safeStorage`, và gán proxy động vào từng Profile khi khởi chạy.

- **Phạm vi triển khai (Scope)**:
  - Database Schema: Bảng `proxies` (id, name, protocol, host, port, username, encryptedPassword, changeIpUrl, latency, country, status).
  - Bảo mật Secrets:
    - Sử dụng `electron.safeStorage.encryptString()` để mã hóa password trước khi lưu vào SQLite.
    - Giải mã an toàn trong bộ nhớ `electron.safeStorage.decryptString()` chỉ khi khởi chạy trình duyệt.
    - Tuyệt đối không gửi decrypted password về phía Renderer qua IPC.
  - `ProxyManager`:
    - CRUD Proxy.
    - Check Proxy: Kiểm tra kết nối, tính toán latency (ms), truy vấn IP info (quốc gia, ISP) qua endpoint an toàn.
    - Xoay IP (IP Rotation): Hỗ trợ gọi URL trigger đổi IP (nếu là rotating proxy).
    - Import Proxy hàng loạt từ file txt hoặc paste clipboard (format: `host:port:user:pass`, `protocol://user:pass@host:port`).
  - Gắn Proxy vào Browser:
    - Với Chromium: Tự động truyền tham số `--proxy-server="protocol://host:port"` hoặc cài đặt extension xác thực proxy động (đối với proxy có user/pass).
    - Với Firefox: Ghi cấu hình `prefs.js` trong thư mục profile của Firefox.
  - Giao diện UI: Trang quản lý Proxy, modal import hàng loạt, hiển thị cờ quốc gia và badge ping xanh/vàng/đỏ.
- **Deliverables**:
  - `electron/src/modules/proxy/ProxyManager.ts`
  - `electron/src/modules/proxy/ProxyRepository.ts`
  - `electron/src/infrastructure/security/EncryptionService.ts`
  - `shared/contracts/proxy.ipc.ts`
  - `electron/src/presentation/ipc/proxy.ipc.ts`
  - `app/pages/proxies/index.vue`
- **Tiêu chí nghiệm thu**:
  - Password proxy được lưu dưới dạng binary/hex mã hóa trong SQLite, không thể đọc dạng plain text khi mở file database trực tiếp.
  - Khởi chạy Profile gắn proxy: Khi truy cập `https://api.ipify.org` trong trình duyệt, hiển thị chính xác IP của Proxy thay vì IP máy thật.
  - Tính năng "Check Proxy" đo lường đúng độ trễ mạng và trạng thái alive/dead.

---

### Milestone 6: Playwright Automation Adapter & CDP Connection Engine
*Mục tiêu*: Triển khai tầng trừu tượng `AutomationAdapter`, tích hợp Playwright để kết nối và điều khiển tự động các profile đang chạy thông qua Remote Debugging Port / Chrome DevTools Protocol (CDP), đảm bảo cách ly và phục vụ automation hợp pháp.

- **Phạm vi triển khai (Scope)**:
  - Interface `IAutomationAdapter`:
    - `connect(target: { cdpEndpoint?: string; wsEndpoint?: string }): Promise<AutomationSession>`
    - `executeScript(script: string, context: Record<string, any>): Promise<any>`
    - `navigate(url: string): Promise<void>`
    - `captureScreenshot(): Promise<Buffer>`
    - `disconnect(): Promise<void>`
  - Triển khai `PlaywrightAutomationAdapter`:
    - Khởi chạy profile với cờ `--remote-debugging-port=0` (dynamic port) để lấy WebSocket debugger URL.
    - Kết nối an toàn bằng `chromium.connectOverCDP()`.
    - Trừu tượng hóa đối tượng Page và Context, quản lý session ID độc lập.
  - `AutomationManager`:
    - Quản lý các phiên automation đang hoạt động gắn liền với từng `profileId`.
    - Điều phối thực thi các lệnh cơ bản: Mở tab, điều hướng URL, chụp ảnh màn hình lưu vào `userData/screenshots/`, trích xuất HTML/Text.
    - Xử lý timeout và ngắt kết nối an toàn khi trình duyệt bị người dùng đóng đột ngột.
  - IPC: `automation.ipc.ts` (connect, disconnect, navigate, screenshot, evaluate).
- **Deliverables**:
  - `electron/src/domain/automation/AutomationAdapter.ts`
  - `electron/src/infrastructure/adapters/automation/PlaywrightAdapter.ts`
  - `electron/src/modules/automation/AutomationManager.ts`
  - `shared/contracts/automation.ipc.ts`
  - `electron/src/presentation/ipc/automation.ipc.ts`
- **Tiêu chí nghiệm thu**:
  - Launch một Profile -> Kích hoạt Automation connect qua CDP thành công.
  - Gọi lệnh `navigate('https://example.com')` làm trình duyệt mở trang web ngay lập tức.
  - Gọi lệnh chụp screenshot: Lưu ảnh `.png` thành công vào thư mục `userData/screenshots/` và hiển thị preview trên UI.

---

### Milestone 7: Task Queue & Workflow Automation Engine
*Mục tiêu*: Xây dựng động cơ quản lý quy trình công việc (Workflow) và hàng đợi tác vụ (Task Queue), hỗ trợ lập lịch, chạy song song có kiểm soát giới hạn luồng (concurrency control), giám sát tiến độ và xử lý retry khi gặp lỗi.

- **Phạm vi triển khai (Scope)**:
  - Database Schema: Bảng `tasks` và `workflows`.
  - `WorkflowManager`:
    - Định nghĩa cấu trúc Workflow dạng JSON: Danh sách các bước (steps) tuần tự hoặc phân nhánh (Open URL, Wait Element, Fill, Click, Scroll, Extract, Export).
    - Thư viện workflow mẫu hợp pháp (QA Smoke Test, Daily Health Check, Content Archiving).
  - `TaskManager`:
    - Hàng đợi tác vụ (Task Queue) hỗ trợ FIFO, ưu tiên (Priority), giới hạn số tác vụ chạy đồng thời (Max Concurrent Tasks).
    - Quản lý trạng thái: `pending`, `running`, `completed`, `failed`, `cancelled`.
    - Retry logic: Tự động thử lại với số lần cấu hình khi gặp lỗi mạng tạm thời.
    - Báo cáo tiến độ thời gian thực qua EventBus: `task:started`, `task:progress`, `task:completed`, `task:failed`.
  - UI Task Manager:
    - Bảng điều khiển tiến độ trực quan với thanh Progress bar.
    - Trình thiết kế / quản lý kịch bản Workflow trực quan.
    - Xem lịch sử thực thi và thông điệp lỗi chi tiết.
- **Deliverables**:
  - `electron/src/infrastructure/database/schema/tasks.ts`
  - `electron/src/infrastructure/database/schema/workflows.ts`
  - `electron/src/modules/task/TaskManager.ts`
  - `electron/src/modules/task/TaskQueue.ts`
  - `electron/src/modules/workflow/WorkflowEngine.ts`
  - `shared/contracts/task.ipc.ts`
  - `app/pages/tasks/index.vue`
- **Tiêu chí nghiệm thu**:
  - Đưa 5 tác vụ vào hàng đợi với cấu hình `maxConcurrency = 2`: Hệ thống chạy chính xác 2 tác vụ cùng lúc, khi 1 tác vụ hoàn thành mới nạp tác vụ tiếp theo.
  - UI cập nhật % tiến độ mượt mà không cần reload trang.
  - Khi một tác vụ gặp lỗi, trạng thái chuyển thành `failed` kèm thông báo lỗi rõ ràng, các tác vụ khác trong hàng đợi vẫn hoạt động bình thường.

---

### Milestone 8: Dashboard Tổng Quan, Giám Sát Tài Nguyên & Logging Nâng Cao
*Mục tiêu*: Xây dựng bảng điều khiển trung tâm (Modern Dashboard) hiển thị các chỉ số hoạt động của toàn bộ nền tảng; thống kê phân bổ tài nguyên, trạng thái profile/proxy/task, biểu đồ trực quan (Unovis) và trình duyệt Log chi tiết.

- **Phạm vi triển khai (Scope)**:
  - Database Schema: Bảng `audit_logs` (lưu trữ lịch sử thao tác hệ thống).
  - Backend Logger & Metrics:
    - Ghi nhận sự kiện hệ thống theo cấp độ: `DEBUG`, `INFO`, `WARN`, `ERROR`.
    - Thu thập số liệu thống kê: Tổng số profile, số lượng đang chạy, tỉ lệ sống của proxy, số tác vụ thành công/thất bại trong ngày.
    - Giám sát tiến trình: Theo dõi tổng lượng RAM/CPU mà các trình duyệt con đang chiếm dụng.
  - Frontend Dashboard (`app/pages/index.vue`):
    - Thẻ thống kê KPI (Stat Cards) thiết kế hiện đại, responsive.
    - Biểu đồ Unovis: Phân bổ profile theo Browser Runtime, Lịch sử tác vụ trong 7 ngày.
    - Widget "Running Profiles": Hiển thị nhanh các profile đang mở kèm nút tắt nhanh.
    - Widget "System Logs Viewer": Trình xem log thời gian thực có bộ lọc cấp độ và thanh tìm kiếm từ khóa.
- **Deliverables**:
  - `electron/src/modules/analytics/DashboardService.ts`
  - `electron/src/infrastructure/logging/AuditLogger.ts`
  - `app/pages/index.vue`
  - `app/components/dashboard/StatCards.vue`
  - `app/components/dashboard/RunningProfilesList.vue`
  - `app/components/dashboard/LogsDrawer.vue`
- **Tiêu chí nghiệm thu**:
  - Dashboard load tức thì dữ liệu tổng hợp chỉ với 1 IPC request duy nhất.
  - Khi khởi chạy hoặc tắt profile, số liệu trên Dashboard tự động nhảy số theo thời gian thực nhờ EventBus.
  - Xem và lọc log mượt mà, hỗ trợ xuất file log text hoặc sao chép clipboard.

---

### Milestone 9: Sao Lưu, Phục Hồi Dữ Liệu & Import/Export Metadata
*Mục tiêu*: Đảm bảo an toàn dữ liệu tuyệt đối thông qua cơ chế sao lưu (Backup) toàn bộ hoặc cục bộ; khôi phục (Restore) khi gặp sự cố; và hỗ trợ Import/Export metadata profile dạng file JSON/ZIP chuẩn hóa.

- **Phạm vi triển khai (Scope)**:
  - `StorageManager` Backup Subsystem:
    - Sao lưu toàn diện (Full Backup): Đóng gói file SQLite và nén toàn bộ thư mục `userData/profiles/` thành file lưu trữ `.zip` vào `userData/backups/`.
    - Sao lưu nhẹ (Metadata Only): Xuất thông tin cấu hình profile, proxy, group, tag dưới dạng file `.json`.
    - Khôi phục an toàn (Restore Engine):
      - Kiểm tra tính toàn vẹn của file backup (checksum / schema validation).
      - Ngắt toàn bộ tiến trình trình duyệt đang chạy trước khi ghi đè dữ liệu.
      - Rollback tự động nếu quá trình khôi phục gặp lỗi giữa chừng.
  - Import / Export Profiles:
    - Hỗ trợ xuất danh sách profile chọn lọc sang file `.json` hoặc `.csv`.
    - Hỗ trợ nhập danh sách profile từ file cấu hình ngoài (tự động validate bằng Zod Schema).
  - Giao diện UI:
    - Trang Cài đặt / Sao lưu & Phục hồi (`app/pages/settings/backup.vue`).
    - Nút tạo bản sao lưu 1-click, danh sách lịch sử các bản sao lưu kèm dung lượng và ngày tạo.
- **Deliverables**:
  - `electron/src/infrastructure/storage/BackupService.ts`
  - `electron/src/modules/profile/ProfileTransferService.ts`
  - `shared/contracts/backup.ipc.ts`
  - `app/pages/settings/backup.vue`
- **Tiêu chí nghiệm thu**:
  - Tạo một bản backup full, xóa thử 1 profile, sau đó restore: Profile bị xóa được khôi phục nguyên vẹn cả dữ liệu cookies và session.
  - Export metadata ra JSON và import lại trên một máy khác: Các profile được tái tạo chính xác thuộc tính.

---

### Milestone 10: Kiểm Thử Toàn Diện, Tối Ưu Hiệu Năng & Đóng Gói Ứng Dụng (Production Build)
*Mục tiêu*: Kiểm thử tích hợp (End-to-End Test), tối ưu kích thước bundle và bộ nhớ, dọn dẹp các tiến trình zombie, kiểm toán bảo mật và xuất bản file cài đặt desktop production (Electron Builder cho Windows x64).

- **Phạm vi triển khai (Scope)**:
  - Kiểm thử & Tối ưu:
    - Viết bộ Unit Tests cho các Manager cốt lõi: `ProfileManager.spec.ts`, `BrowserAdapter.spec.ts`, `ProxyManager.spec.ts`.
    - Kiểm tra rò rỉ bộ nhớ (Memory Leak Analysis) khi mở và đóng 20 profile liên tục.
    - Đảm bảo cơ chế ngắt tiến trình sạch sẽ (Clean Exit) khi người dùng thoát ứng dụng Electron (`app.on('before-quit')`).
  - Kiểm toán Bảo mật (Security Audit):
    - Xác minh `contextIsolation = true`, `nodeIntegration = false`.
    - Xác minh IPC channels không để lộ lỗ hổng Remote Code Execution (RCE) hay Path Traversal.
    - Kiểm tra an toàn cho Electron `safeStorage`.
  - Đóng gói ứng dụng (Packaging):
    - Cấu hình `electron-builder` tối ưu: gom tài nguyên, xử lý các native node modules (`better-sqlite3`).
    - Chạy script `pnpm build:electron` đóng gói bản cài đặt Windows (`.exe` / NSIS installer và portable).
- **Deliverables**:
  - `tests/unit/ProfileManager.spec.ts`
  - `tests/unit/BrowserProcessManager.spec.ts`
  - `electron-builder.json5` hoặc cấu hình trong `package.json`
  - Bản đóng gói hoàn chỉnh tại thư mục `dist/`
- **Tiêu chí nghiệm thu**:
  - `pnpm typecheck` đạt 0 lỗi.
  - `pnpm lint` đạt 0 lỗi.
  - Toàn bộ unit tests pass 100%.
  - Chạy file cài đặt đã đóng gói: Khởi động mượt mà, lưu trữ dữ liệu chính xác tại AppData, mở đóng trình duyệt hoàn hảo không cần cài thêm môi trường dev.

---

## 3. MA TRẬN PHÂN CHIA VÀ PHỤ THUỘC (DEPENDENCY MATRIX)

| Milestone | Tên Milestone | Phụ thuộc vào | Rủi ro chính | Giải pháp phòng ngừa |
|---|---|---|---|---|
| **M1** | Architecture & Drizzle SQLite | *Không* | Xung đột `better-sqlite3` native build | Sử dụng prebuilt binaries tương thích Electron ABI |
| **M2** | Runtime Detection & Process Mgr | M1 | Đa dạng đường dẫn cài đặt trên các OS | Quét cả Registry, Program Files và biến môi trường PATH |
| **M3** | Profile CRUD & Isolated Storage | M1, M2 | Xung đột file lock trong userDataDir | Mỗi profile bắt buộc dùng UUID folder riêng biệt |
| **M4** | Groups, Tags & Bulk Actions | M3 | Nghẽn tài nguyên khi mở hàng loạt | Giới hạn concurrency & tạo delay 500ms giữa các lần launch |
| **M5** | Proxy Manager & SafeStorage | M3 | Proxy authentication trong Chromium | Sử dụng extension tự động inject credentials nếu cần |
| **M6** | Playwright Automation Adapter | M2, M3 | Xung đột cổng kết nối CDP | Cấp phát cổng ngẫu nhiên `--remote-debugging-port=0` |
| **M7** | Task Queue & Workflow | M6 | Task bị treo vô tận (Hang) | Đặt hard timeout cho từng bước trong workflow |
| **M8** | Dashboard & Logs | M4, M5, M7 | Giảm hiệu năng UI do stream log quá nhanh | Gom nhóm log (Throttle/Debounce) trước khi gửi IPC |
| **M9** | Backup & Restore | M1, M3 | File zip bị khóa bởi tiến trình đang mở | Kiểm tra và chặn restore nếu còn profile đang `running` |
| **M10**| Testing, Hardening & Build | M1 -> M9 | Lỗi thiếu file native khi đóng gói | Cấu hình asarUnpack cho `better-sqlite3` |
