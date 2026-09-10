Bạn là Senior Electron Architect + Senior TypeScript Engineer + Desktop Application Engineer.

Hãy xây dựng một ứng dụng desktop quản lý browser profiles bằng:

* Electron
* Nuxt 4
* Vue 3
* TypeScript
* Pinia
* Nuxt UI
* SQLite
* Drizzle ORM
* Zod
* Playwright
* Node.js child_process
* electron-builder

Ứng dụng chạy local-first trên Windows và được thiết kế để có thể mở rộng sang macOS/Linux trong tương lai.

==================================================

1. MỤC TIÊU SẢN PHẨM
   ==================================================

Xây dựng một Browser Profile Manager có khả năng:

1. Quản lý nhiều browser runtime.
2. Quản lý nhiều browser profile.
3. Mỗi profile có thư mục dữ liệu browser riêng biệt.
4. Hỗ trợ browser cài sẵn trên máy.
5. Hỗ trợ browser executable tùy chỉnh.
6. Hỗ trợ nhiều Chromium-based browser.
7. Hỗ trợ Firefox-based browser.
8. Cho phép đăng ký browser bên ngoài thông qua Custom Browser Adapter.
9. Quản lý proxy.
10. Quản lý group/tag.
11. Launch / Stop / Restart profile.
12. Theo dõi browser process.
13. Hỗ trợ automation thông qua Playwright khi browser runtime hỗ trợ.
14. Hỗ trợ CDP khi browser runtime hỗ trợ.
15. Có Task Manager.
16. Có Automation Workflow.
17. Có log và monitoring.
18. Có import/export.
19. Có backup/restore database.
20. Có hệ thống adapter để mở rộng browser mà không sửa BrowserManager core.

Ứng dụng phải được thiết kế theo hướng:

Browser Runtime != Browser Profile != Browser Process != Automation Session

Không được trộn 4 khái niệm này thành một class/service duy nhất.

==================================================
2. KIẾN TRÚC TỔNG THỂ
=====================

Sử dụng kiến trúc:

Presentation
↓
Application
↓
Domain
↓
Infrastructure

Electron Renderer:
Nuxt 4 + Vue 3 + Pinia

Electron Main:
Application Services + Domain + Infrastructure

Renderer KHÔNG được:

* truy cập SQLite trực tiếp
* truy cập filesystem Node trực tiếp
* spawn process trực tiếp
* truy cập child_process
* truy cập Playwright trực tiếp
* truy cập Node APIs trực tiếp

Renderer chỉ được giao tiếp với Electron Main thông qua preload + typed IPC.

Kiến trúc:

Electron
├── Renderer
│   └── Nuxt 4
│       ├── Pages
│       ├── Components
│       ├── Composables
│       └── Pinia
│
├── Preload
│   └── Typed IPC API
│
└── Main
├── Application
├── Domain
└── Infrastructure
├── SQLite
├── Browser Process
├── Filesystem
├── Playwright
└── Logging

==================================================
3. CẤU TRÚC SOURCE
==================

Thiết kế source theo cấu trúc tương tự:

src/
├── app/
│
├── electron/
│   ├── main/
│   │   ├── index.ts
│   │   │
│   │   ├── core/
│   │   │   ├── event-bus/
│   │   │   ├── logger/
│   │   │   ├── errors/
│   │   │   └── lifecycle/
│   │   │
│   │   ├── domain/
│   │   │   ├── profile/
│   │   │   ├── browser/
│   │   │   ├── proxy/
│   │   │   ├── group/
│   │   │   ├── tag/
│   │   │   ├── automation/
│   │   │   └── task/
│   │   │
│   │   ├── application/
│   │   │   ├── profile/
│   │   │   ├── browser/
│   │   │   ├── proxy/
│   │   │   ├── automation/
│   │   │   └── task/
│   │   │
│   │   └── infrastructure/
│   │       ├── database/
│   │       ├── browser/
│   │       ├── automation/
│   │       ├── filesystem/
│   │       ├── process/
│   │       └── crypto/
│   │
│   └── preload/
│       └── index.ts
│
├── shared/
│   ├── types/
│   ├── constants/
│   ├── errors/
│   └── ipc/
│
├── database/
│   ├── schema/
│   ├── migrations/
│   └── seed/
│
├── tests/
│
└── docs/

==================================================
4. SQLITE VÀ LOCALSTORAGE
=========================

SQLite là nguồn dữ liệu chính của application.

Sử dụng:

SQLite + Drizzle ORM

SQLite lưu:

* browsers
* profiles
* proxies
* groups
* tags
* profile_tags
* tasks
* workflows
* workflow_runs
* app_settings
* browser_sessions
* automation_sessions
* logs metadata
* import/export metadata

LocalStorage CHỈ dùng cho UI preferences.

Ví dụ:

* theme
* sidebar collapsed
* table/grid mode
* page size
* sort order
* UI filters
* last route
* temporary UI preferences

Không lưu:

* proxy password
* authentication token
* sensitive credentials
* browser session secret
* encryption key

vào LocalStorage.

Pinia chỉ là runtime state/cache.

Không sử dụng Pinia làm database.

Flow:

Vue
↓
Pinia
↓
Typed IPC
↓
Application Service
↓
Repository
↓
SQLite

==================================================
5. BROWSER ADAPTER ARCHITECTURE
===============================

Đây là phần quan trọng nhất.

Không được hard-code BrowserManager:

if chrome ...
else if firefox ...
else if camoufox ...

Thay vào đó xây dựng:

BrowserAdapterRegistry

BrowserManager
↓
BrowserAdapterRegistry
↓
BrowserAdapter

Thiết kế:

interface BrowserRuntimeAdapter {
id: string
name: string

```
engine:
    | 'chromium'
    | 'firefox'
    | 'custom'

detect(): Promise<BrowserDetectionResult>

getVersion(
    executablePath: string
): Promise<string>

launch(
    options: BrowserLaunchOptions
): Promise<BrowserProcess>

stop(
    process: BrowserProcess
): Promise<void>

restart(
    process: BrowserProcess
): Promise<BrowserProcess>

getCapabilities():
    BrowserCapabilities
```

}

BrowserManager không được biết implementation cụ thể.

Ví dụ:

ChromeAdapter
FirefoxAdapter
ChromiumAdapter
CustomExecutableAdapter
ExternalBrowserAdapter

==================================================
6. BROWSER CAPABILITIES
=======================

Không giả định browser nào cũng có cùng tính năng.

Định nghĩa:

interface BrowserCapabilities {

```
launch: boolean

processManagement: boolean

isolatedProfile: boolean

playwright: boolean

cdp: boolean

remoteDebugging: boolean

embedding: boolean

extensions: boolean

customArguments: boolean
```

}

BrowserManager phải kiểm tra capabilities trước khi thực hiện feature.

Ví dụ:

if (!adapter.getCapabilities().playwright) {
throw new UnsupportedCapabilityError(...)
}

==================================================
7. CUSTOM BROWSER ADAPTER
=========================

Người dùng phải có khả năng thêm browser executable bên ngoài.

Ví dụ:

D:/Browsers/MyBrowser/browser.exe

Database:

browsers

fields:

id
name
type
engine
executable_path
version
enabled
auto_detect
created_at
updated_at

type:

'builtin'
'external'
'custom'

Ví dụ:

{
id: 'custom-browser-01',
name: 'My Browser',
type: 'custom',
engine: 'chromium',
executablePath: 'D:/Browsers/MyBrowser/browser.exe'
}

UI:

Settings
→ Browsers
→ Add Browser

Form:

Name
Executable Path
Engine
Arguments
Enabled

Có nút:

Detect

Sau khi Detect:

* executable tồn tại?
* process có thể launch?
* version?
* engine?
* capabilities?

Sau đó hiển thị kết quả.

==================================================
8. EXTERNAL BROWSER ADAPTER
===========================

Không phải browser nào cũng đơn giản là executable + arguments.

Một số browser có:

* API riêng
* profile manager riêng
* remote debugging API
* local service
* CDP
* Playwright integration
* protocol riêng

Vì vậy xây dựng thêm:

interface BrowserIntegrationAdapter {

```
id: string

detect(): Promise<boolean>

connect?(
    options: IntegrationConnectOptions
): Promise<BrowserConnection>

createProfile?(
    options: ExternalProfileOptions
): Promise<ExternalProfile>

deleteProfile?(
    profileId: string
): Promise<void>

listProfiles?():
    Promise<ExternalProfile[]>
```

}

Không ép mọi browser phải implement toàn bộ interface.

Sử dụng capability-based design.

==================================================
9. AUTOMATION ARCHITECTURE
==========================

Automation phải tách khỏi Browser Runtime.

Không làm:

ChromeAdapter.launchPlaywright()

Thay vào đó:

Browser Runtime
+
Automation Adapter

Automation:

interface AutomationAdapter {

```
id: string

connect(
    options: AutomationConnectOptions
): Promise<AutomationSession>

disconnect(
    sessionId: string
): Promise<void>

goto(...)

click(...)

fill(...)

screenshot(...)
```

}

Implement:

PlaywrightAutomationAdapter

CDPAutomationAdapter

Playwright chỉ được sử dụng khi runtime hỗ trợ.

CDP chỉ sử dụng khi browser cung cấp CDP.

==================================================
10. BROWSER PROFILE
===================

Profile không được chứa browser-specific implementation.

Interface:

interface BrowserProfile {

```
id: string

name: string

browserId: string

storagePath: string

proxyId?: string

groupId?: string

tags: string[]

window: {

    width: number

    height: number

    x?: number

    y?: number

}

automationEnabled: boolean

createdAt: string

updatedAt: string
```

}

Profile chỉ tham chiếu:

browserId

BrowserManager chịu trách nhiệm tìm adapter.

==================================================
11. PROFILE STORAGE
===================

Sử dụng:

app.getPath('userData')

Ví dụ:

userData/
├── database/
│   └── app.db
│
├── profiles/
│   ├── profile-001/
│   │   └── browser-data/
│   │
│   ├── profile-002/
│   │   └── browser-data/
│   │
│   └── profile-003/
│
├── downloads/
├── screenshots/
├── logs/
├── backups/
└── temp/

Mỗi profile phải có storage path riêng.

Không cho phép hai profile dùng chung browser user-data directory nếu điều đó gây xung đột dữ liệu.

==================================================
12. BROWSER PROCESS MANAGER
===========================

Tạo:

BrowserProcessManager

Responsibilities:

* spawn
* start
* stop
* restart
* kill
* monitor
* detect exit
* detect crash
* track PID
* track startup
* track runtime
* cleanup

Status:

starting
running
stopping
stopped
crashed

Process record:

interface BrowserProcess {

```
id: string

profileId: string

browserId: string

pid?: number

status: BrowserProcessStatus

startedAt?: number

stoppedAt?: number

exitCode?: number
```

}

Không được giữ process state chỉ trong frontend.

==================================================
13. EVENT BUS
=============

Tạo EventBus dùng trong Electron Main.

Events:

profile:created
profile:updated
profile:deleted

profile:starting
profile:started
profile:stopping
profile:stopped
profile:crashed

browser:detected
browser:started
browser:stopped

automation:started
automation:completed
automation:failed

task:created
task:started
task:progress
task:completed
task:failed

Renderer nhận event thông qua typed IPC.

==================================================
14. IPC
=======

Tạo typed IPC contracts.

Ví dụ:

profile:list
profile:get
profile:create
profile:update
profile:delete
profile:launch
profile:stop
profile:restart

browser:list
browser:get
browser:add
browser:update
browser:remove
browser:detect
browser:test

proxy:list
proxy:create
proxy:update
proxy:delete
proxy:test

automation:start
automation:stop
automation:execute

task:list
task:create
task:cancel
task:retry

Mọi input IPC phải validate bằng Zod.

==================================================
15. SECURITY
============

Electron:

contextIsolation = true

nodeIntegration = false

sandbox = true nếu tương thích kiến trúc.

Preload chỉ expose API cần thiết.

Không expose:

process
fs
child_process
electron
Playwright

trực tiếp cho renderer.

Không cho renderer truyền arbitrary shell command.

Executable path và arguments phải được validate.

Không thực thi arbitrary code từ database.

Không sử dụng eval.

Không sử dụng new Function.

Không lưu secret vào LocalStorage.

==================================================
16. PROXY MANAGER
=================

Proxy entity:

id
name
type
host
port
username
password
enabled
created_at
updated_at

Hỗ trợ architecture:

HTTP
HTTPS
SOCKS

Password phải được bảo vệ bằng cơ chế secure storage phù hợp của Electron, ví dụ safeStorage, thay vì plaintext nếu có thể.

==================================================
17. GROUP + TAG
===============

Hỗ trợ:

Groups

Tags

Profile → nhiều tags.

Database:

groups
tags
profile_tags

UI:

Search
Filter
Sort
Bulk Select
Bulk Launch
Bulk Stop
Bulk Delete
Bulk Tag
Bulk Move Group

==================================================
18. TASK MANAGER
================

Tạo:

TaskManager

Task:

id
type
profileId
status
priority
payload
progress
error
createdAt
startedAt
completedAt

Status:

pending
running
completed
failed
cancelled

Không block Electron Main thread.

Có queue và concurrency control.

==================================================
19. WORKFLOW ENGINE
===================

Tạo Workflow Engine đơn giản.

Workflow:

{
id,
name,
steps: [...]
}

Step examples:

launchProfile
goto
wait
click
fill
screenshot
closeProfile

Mỗi step có:

id
type
config
timeout
retry

Không triển khai các tính năng nhằm né tránh anti-bot, CAPTCHA, anti-fraud, identity verification hoặc cơ chế phát hiện automation.

Automation chỉ phục vụ các use case hợp pháp như:

* testing
* QA
* regression testing
* internal tools
* website testing
* repetitive local workflows

==================================================
20. LOGGING
===========

Sử dụng structured logging.

Ví dụ:

logger.info({
profileId,
browserId,
pid
}, 'Browser started')

Log levels:

debug
info
warn
error

Log file:

userData/logs/

Không log:

password
proxy credentials
authentication tokens
cookies
sensitive session data

==================================================
21. DATABASE DESIGN
===================

Tạo Drizzle schema cho:

browsers
profiles
groups
tags
profile_tags
proxies
tasks
workflows
workflow_steps
workflow_runs
browser_sessions
automation_sessions
app_settings

Sử dụng UUID hoặc nanoid ổn định.

Có migration system.

Không sửa schema trực tiếp mà không migration.

==================================================
22. BROWSER REGISTRY
====================

Tạo:

BrowserAdapterRegistry

API:

register(adapter)

unregister(id)

get(id)

has(id)

list()

detectAll()

Khi app khởi động:

BrowserAdapterRegistry.register(
ChromeAdapter
)

BrowserAdapterRegistry.register(
ChromiumAdapter
)

BrowserAdapterRegistry.register(
FirefoxAdapter
)

BrowserAdapterRegistry.register(
CustomExecutableAdapter
)

Sau này có thể thêm:

ExternalBrowserAdapter

mà không sửa BrowserManager.

==================================================
23. PLUGIN-READY DESIGN
=======================

Thiết kế hệ thống sao cho tương lai có thể hỗ trợ plugin.

Không cần xây plugin marketplace ở phiên bản đầu tiên.

Nhưng API phải có khả năng mở rộng:

BrowserPlugin

AutomationPlugin

IntegrationPlugin

Ví dụ:

interface BrowserPlugin {

```
id: string

name: string

version: string

register(
    registry: BrowserAdapterRegistry
): void
```

}

Không cho plugin có quyền tùy ý truy cập filesystem hoặc Electron internals nếu không cần thiết.

==================================================
24. UI
======

Xây UI theo hướng Browser Profile Manager chuyên nghiệp.

Main navigation:

Dashboard

Profiles

Browsers

Proxies

Groups

Tags

Automation

Tasks

Logs

Settings

Profiles page:

* table/grid
* search
* filters
* sorting
* bulk actions
* status
* browser
* proxy
* group
* tags
* launch/stop button

Browser page:

* installed browsers
* custom browsers
* detected browsers
* version
* executable path
* capabilities
* status

Profile create:

Name
Browser
Storage
Proxy
Group
Tags
Window size
Automation

==================================================
25. LOCAL-FIRST
===============

Ứng dụng phải hoạt động hoàn toàn offline.

Không phụ thuộc server backend.

SQLite là source of truth.

Nếu sau này cần cloud sync thì xây thêm:

SyncAdapter

nhưng KHÔNG đưa cloud dependency vào core.

==================================================
26. BACKUP / RESTORE
====================

Hỗ trợ:

Export database

Import database

Backup database

Restore database

Có validation schema trước khi import.

Không ghi đè dữ liệu hiện tại nếu chưa xác nhận hoặc tạo backup.

==================================================
27. ERROR HANDLING
==================

Tạo domain errors:

BrowserNotFoundError
BrowserLaunchError
BrowserAlreadyRunningError
ProfileNotFoundError
ProfileAlreadyRunningError
UnsupportedCapabilityError
AutomationConnectionError
DatabaseError
ValidationError

Renderer nhận structured error:

{
code,
message,
details?
}

Không gửi stack trace nội bộ cho production renderer.

==================================================
28. TESTING
===========

Viết tests cho:

BrowserAdapterRegistry

BrowserManager

ProfileManager

BrowserProcessManager

Repository

IPC validation

Zod schemas

TaskManager

Workflow Engine

Đặc biệt test:

* browser không tồn tại
* executable path sai
* browser crash
* process exit bất thường
* profile storage không tồn tại
* profile đang chạy
* launch trùng
* stop process
* restart process
* adapter không hỗ trợ capability

==================================================
29. DOCUMENTATION
=================

Trước khi implementation lớn, tạo:

docs/
├── ARCHITECTURE.md
├── DEVELOPMENT_PLAN.md
├── DATABASE_SCHEMA.md
├── IPC_CONTRACTS.md
├── BROWSER_ADAPTER.md
├── AUTOMATION.md
├── SECURITY.md
└── TESTING.md

BROWSER_ADAPTER.md phải giải thích rõ:

Browser Runtime
Browser Profile
Browser Process
Automation Session
Browser Adapter
Automation Adapter
Integration Adapter
Capability

==================================================
30. DEVELOPMENT PHASES
======================

Không xây toàn bộ application trong một lần.

PHASE 1

Foundation:

* Electron
* Nuxt 4
* TypeScript
* IPC
* preload
* SQLite
* Drizzle
* migration
* folder architecture
* logger
* error system

PHASE 2

Browser Adapter System:

* BrowserRuntimeAdapter
* BrowserCapabilities
* BrowserAdapterRegistry
* ChromeAdapter
* ChromiumAdapter
* FirefoxAdapter
* CustomExecutableAdapter

PHASE 3

Browser Process:

* BrowserProcessManager
* launch
* stop
* restart
* monitor
* crash handling

PHASE 4

Profile:

* Profile entity
* CRUD
* isolated storage
* launch profile
* stop profile

PHASE 5

Groups + Tags + Search + Bulk Actions

PHASE 6

Proxy Manager

PHASE 7

Automation:

* PlaywrightAdapter
* CDPAdapter
* AutomationSession

PHASE 8

Task Manager + Workflow Engine

PHASE 9

Dashboard + Logs + Monitoring

PHASE 10

Import / Export / Backup / Restore

PHASE 11

Testing + Performance + Production Build

==================================================
31. AI CODING RULES
===================

Bạn KHÔNG được tự ý:

* thay đổi kiến trúc lớn
* thêm dependency không cần thiết
* tạo global singleton không kiểm soát
* đưa Node API vào renderer
* truy cập SQLite từ renderer
* hard-code browser-specific logic vào BrowserManager
* lưu secret trong LocalStorage
* bỏ qua migration
* bỏ qua validation
* bỏ qua error handling

Mỗi phase phải:

1. Inspect project hiện tại.
2. Xác định những gì đã tồn tại.
3. Không rewrite code không cần thiết.
4. Implement đúng scope.
5. Chạy typecheck.
6. Chạy lint.
7. Chạy tests.
8. Kiểm tra build.
9. Báo cáo file đã thay đổi.
10. Báo cáo vấn đề còn tồn tại.

Nếu project chưa có source code, hãy scaffold architecture trước.

Nếu phát hiện architecture hiện tại mâu thuẫn với yêu cầu này, hãy:

* giải thích vấn đề
* đề xuất migration path
* không tự ý rewrite toàn bộ project.

==================================================
32. QUY TẮC BROWSER ADAPTER
===========================

Đây là nguyên tắc bắt buộc:

BrowserManager KHÔNG được biết:

Chrome
Firefox
Camoufox
Donut
BrowserOxide
hoặc browser cụ thể khác.

BrowserManager chỉ biết:

BrowserRuntimeAdapter

Mỗi browser-specific implementation phải nằm trong adapter riêng.

Ví dụ:

ChromeAdapter
FirefoxAdapter
CustomExecutableAdapter

Các browser/runtime bên ngoài có protocol/API riêng phải sử dụng:

ExternalBrowserAdapter

hoặc:

IntegrationAdapter

Không ép browser khác Chromium/Firefox phải hỗ trợ CDP.

Không giả định Playwright hoạt động với mọi browser.

==================================================
33. EXPERIMENTAL BROWSERS
=========================

Các browser/runtime bên ngoài có thể được đánh dấu:

stable
experimental
unsupported

Database:

support_level

UI hiển thị:

Stable
Experimental
Unsupported

Một adapter lỗi không được làm crash toàn bộ Browser Manager.

==================================================
34. FUTURE EXTENSION
====================

Thiết kế để tương lai có thể thêm:

* browser download manager
* extension manager
* cloud sync
* remote browser
* browser health check
* profile templates
* profile cloning
* scheduler
* workflow editor
* screenshot manager
* network monitor
* DevTools integration
* multi-window management

Nhưng KHÔNG implement các tính năng trên trong phase đầu nếu chưa có yêu cầu.

==================================================
35. SAFETY BOUNDARY
===================

Automation chỉ phục vụ:

* QA
* testing
* regression testing
* internal automation
* local workflows

Không implement hoặc tối ưu:

* CAPTCHA bypass
* anti-bot bypass
* anti-fraud bypass
* identity verification bypass
* stealth automation nhằm né hệ thống phát hiện
* giả mạo danh tính
* vượt giới hạn bảo mật của website

==================================================
36. OUTPUT FORMAT MỖI PHASE
===========================

Sau mỗi phase, trả về:

## Summary

## Architecture Changes

## Files Created

## Files Modified

## Database Changes

## IPC Changes

## Tests

## Typecheck

## Lint

## Build

## Known Issues

## Next Phase

Không chuyển sang phase tiếp theo nếu phase hiện tại chưa đạt trạng thái ổn định, trừ khi có lý do kỹ thuật rõ ràng.

==================================================
37. BƯỚC ĐẦU TIÊN
=================

KHÔNG viết code ngay.

Đầu tiên:

1. Inspect repository.
2. Phân tích cấu trúc hiện tại.
3. Kiểm tra package.json.
4. Kiểm tra Electron/Nuxt configuration.
5. Kiểm tra TypeScript.
6. Kiểm tra build system.
7. Kiểm tra renderer/main/preload.
8. Kiểm tra database hiện tại nếu có.
9. Kiểm tra IPC hiện tại nếu có.
10. Xác định những phần có thể tái sử dụng.

Sau đó tạo:

docs/browser-platform/ARCHITECTURE.md
docs/browser-platform/DEVELOPMENT_PLAN.md
docs/browser-platform/DATABASE_SCHEMA.md
docs/browser-platform/IPC_CONTRACTS.md
docs/browser-platform/BROWSER_ADAPTER.md
docs/browser-platform/SECURITY.md

Tiếp theo trình bày:

* Current Architecture
* Problems
* Proposed Architecture
* Migration Plan
* Phase 1 implementation plan

Chỉ sau khi hoàn thành phân tích và kế hoạch mới bắt đầu implement Phase 1.

Ưu tiên:

Correctness
Security
Maintainability
Extensibility
Testability
Performance

Không ưu tiên tốc độ viết code hơn kiến trúc.
