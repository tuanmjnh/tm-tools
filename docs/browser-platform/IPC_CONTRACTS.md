# BROWSER PROFILE MANAGEMENT PLATFORM — IPC CONTRACTS SPECIFICATION

> **Phiên bản:** 1.0.0  
> **Nguyên tắc cốt lõi:** Domain-Driven IPC, Zero-Trust Input Validation (Zod), Typed Request/Response, Real-Time Event Bus.  
> **Vị trí lưu trữ hợp đồng:** `shared/contracts/` (Dùng chung cho cả Electron Main Process và Nuxt 4 Renderer).

---

## 1. NGUYÊN TẮC THIẾT KẾ IPC & BẢO MẬT GIAO TIẾP

1. **Chuẩn hóa phản hồi (`ApiResponse<T>`)**: Mọi IPC Invoke Channel đều trả về một phong bì chuẩn hóa:
   ```typescript
   export interface ApiResponse<T = unknown> {
     success: boolean;
     data?: T;
     error?: {
       code: string;
       message: string;
       details?: unknown;
     };
   }
   ```
2. **Zero-Trust Validation (Bắt buộc Zod)**: Tất cả payload gửi từ Renderer đều bị coi là không an toàn. Main Process phải `schema.parse(payload)` trước khi chuyển giao cho Use Case hoặc Manager. Nếu parse thất bại, ném lỗi `VALIDATION_ERROR` ngay tại cửa khẩu IPC.
3. **Phân tách kênh theo Domain**: Đặt tên channel theo quy ước `domain:action` (ví dụ: `profile:create`, `browser:detect`, `proxy:check`).
4. **Hai luồng giao tiếp độc lập**:
   - **Invoke / Handle (Two-way)**: Renderer gửi yêu cầu và nhận kết quả bất đồng bộ (Request - Response).
   - **Send / On (One-way Event Bus)**: Main Process chủ động phát tín hiệu biến cố thời gian thực sang Renderer qua `eventBus:emit` hoặc `domain:event`.

---

## 2. DANH MỤC CÁC HỢP ĐỒNG IPC THEO DOMAIN

### 2.1. System IPC Contract (`shared/contracts/system.ipc.ts`)
Quản lý trạng thái ứng dụng, thông tin hệ điều hành và dung lượng đĩa:

```typescript
import { z } from 'zod';

export const SystemInfoResponseSchema = z.object({
  version: z.string(),
  electronVersion: z.string(),
  nodeVersion: z.string(),
  platform: z.string(),
  arch: z.string(),
  userDataPath: z.string(),
  storageUsage: z.object({
    databaseBytes: z.number(),
    profilesBytes: z.number(),
    logsBytes: z.number(),
    screenshotsBytes: z.number(),
  }),
});
export type SystemInfoResponse = z.infer<typeof SystemInfoResponseSchema>;

export const OpenDirectoryInputSchema = z.object({
  pathType: z.enum(['userData', 'profiles', 'logs', 'screenshots', 'backups']),
  subPath: z.string().optional(),
});
export type OpenDirectoryInput = z.infer<typeof OpenDirectoryInputSchema>;

export interface SystemIpcContract {
  'system:getInfo': () => Promise<SystemInfoResponse>;
  'system:openDirectory': (input: OpenDirectoryInput) => Promise<void>;
  'system:getStorageUsage': () => Promise<SystemInfoResponse['storageUsage']>;
}
```

---

### 2.2. Browser IPC Contract (`shared/contracts/browser.ipc.ts`)
Quản lý nhân trình duyệt, tự động dò tìm và đăng ký browser tùy chỉnh:

```typescript
import { z } from 'zod';

export const BrowserEngineSchema = z.enum(['chromium', 'firefox', 'custom']);

export const BrowserItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  engine: BrowserEngineSchema,
  executablePath: z.string().min(1),
  version: z.string(),
  isDefault: z.boolean(),
  isCustom: z.boolean(),
  status: z.enum(['available', 'missing']),
});
export type BrowserItem = z.infer<typeof BrowserItemSchema>;

export const AddCustomBrowserInputSchema = z.object({
  name: z.string().min(1),
  engine: BrowserEngineSchema,
  executablePath: z.string().min(1),
});
export type AddCustomBrowserInput = z.infer<typeof AddCustomBrowserInputSchema>;

export const TestExecutableInputSchema = z.object({
  executablePath: z.string().min(1),
});

export interface BrowserIpcContract {
  'browser:list': () => Promise<BrowserItem[]>;
  'browser:detect': () => Promise<BrowserItem[]>;
  'browser:addCustom': (input: AddCustomBrowserInput) => Promise<BrowserItem>;
  'browser:remove': (id: string) => Promise<void>;
  'browser:testExecutable': (input: { executablePath: string }) => Promise<{ valid: boolean; version?: string; error?: string }>;
}
```

---

### 2.3. Profile IPC Contract (`shared/contracts/profile.ipc.ts`)
Toàn bộ thao tác vòng đời của hồ sơ trình duyệt:

```typescript
import { z } from 'zod';

export const ProfileStatusSchema = z.enum(['idle', 'launching', 'running', 'stopping', 'error']);

export const CreateProfileInputSchema = z.object({
  name: z.string().min(1).max(100),
  browserId: z.string().uuid(),
  groupId: z.string().uuid().nullable().optional(),
  proxyId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  os: z.enum(['windows', 'macos', 'linux']).default('windows'),
  userAgent: z.string().optional(),
  viewportWidth: z.number().int().min(320).max(3840).default(1280),
  viewportHeight: z.number().int().min(240).max(2160).default(720),
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
  locale: z.string().default('vi-VN'),
  webrtcMode: z.enum(['default', 'disabled', 'proxy_only']).default('default'),
  canvasMode: z.enum(['default', 'noise', 'off']).default('default'),
  audioMode: z.enum(['default', 'noise', 'off']).default('default'),
  webglMode: z.enum(['default', 'noise', 'off']).default('default'),
  customFlags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export type CreateProfileInput = z.infer<typeof CreateProfileInputSchema>;

export const UpdateProfileInputSchema = CreateProfileInputSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

export const ProfileFilterSchema = z.object({
  search: z.string().optional(),
  groupId: z.string().uuid().nullable().optional(),
  tagId: z.string().uuid().optional(),
  browserId: z.string().uuid().optional(),
  status: ProfileStatusSchema.optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});
export type ProfileFilter = z.infer<typeof ProfileFilterSchema>;

export const BatchActionInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(['launch', 'stop', 'delete', 'setGroup', 'setProxy']),
  targetId: z.string().uuid().optional(), // Dùng khi gán group hoặc proxy
});
export type BatchActionInput = z.infer<typeof BatchActionInputSchema>;

export interface ProfileIpcContract {
  'profile:list': (filter?: ProfileFilter) => Promise<{ items: any[]; total: number }>;
  'profile:getById': (id: string) => Promise<any>;
  'profile:create': (input: CreateProfileInput) => Promise<any>;
  'profile:update': (input: UpdateProfileInput) => Promise<any>;
  'profile:delete': (input: { id: string; deleteStorage?: boolean }) => Promise<void>;
  'profile:launch': (id: string) => Promise<{ pid: number; cdpPort?: number }>;
  'profile:stop': (id: string) => Promise<void>;
  'profile:restart': (id: string) => Promise<{ pid: number }>;
  'profile:getStatus': (id: string) => Promise<{ status: z.infer<typeof ProfileStatusSchema>; pid?: number }>;
  'profile:batch': (input: BatchActionInput) => Promise<{ successIds: string[]; failedIds: string[] }>;
}
```

---

### 2.4. Proxy IPC Contract (`shared/contracts/proxy.ipc.ts`)
Quản lý proxy và bảo mật mật khẩu:

```typescript
import { z } from 'zod';

export const ProxyProtocolSchema = z.enum(['http', 'https', 'socks4', 'socks5']);

export const CreateProxyInputSchema = z.object({
  name: z.string().min(1),
  protocol: ProxyProtocolSchema.default('http'),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(), // Sẽ được mã hóa bằng safeStorage ở Main Process
  changeIpUrl: z.string().url().optional().or(z.literal('')),
});
export type CreateProxyInput = z.infer<typeof CreateProxyInputSchema>;

export const ImportProxiesInputSchema = z.object({
  rawText: z.string().min(1), // Parse nhiều dòng dạng host:port:user:pass
  defaultProtocol: ProxyProtocolSchema.default('http'),
});

export const CheckProxyResponseSchema = z.object({
  alive: z.boolean(),
  latency: z.number().optional(),
  ip: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  isp: z.string().optional(),
  error: z.string().optional(),
});
export type CheckProxyResponse = z.infer<typeof CheckProxyResponseSchema>;

export interface ProxyIpcContract {
  'proxy:list': () => Promise<any[]>;
  'proxy:create': (input: CreateProxyInput) => Promise<any>;
  'proxy:update': (input: Partial<CreateProxyInput> & { id: string }) => Promise<any>;
  'proxy:delete': (id: string) => Promise<void>;
  'proxy:check': (id: string) => Promise<CheckProxyResponse>;
  'proxy:rotate': (id: string) => Promise<{ success: boolean; newIp?: string }>;
  'proxy:import': (input: z.infer<typeof ImportProxiesInputSchema>) => Promise<{ importedCount: number; errors: string[] }>;
}
```

---

### 2.5. Automation & Task IPC Contracts (`shared/contracts/task.ipc.ts` & `automation.ipc.ts`)
Điều khiển tác vụ Playwright và hàng đợi:

```typescript
import { z } from 'zod';

export const TaskTypeSchema = z.enum(['workflow', 'script', 'url_check']);

export const CreateTaskInputSchema = z.object({
  profileId: z.string().uuid().optional(),
  workflowId: z.string().uuid().optional(),
  name: z.string().min(1),
  type: TaskTypeSchema.default('workflow'),
  payload: z.record(z.unknown()).optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export interface TaskIpcContract {
  'task:list': (filter?: { status?: string; profileId?: string }) => Promise<any[]>;
  'task:create': (input: CreateTaskInput) => Promise<any>;
  'task:cancel': (id: string) => Promise<void>;
  'task:retry': (id: string) => Promise<void>;
}

export const NavigateInputSchema = z.object({
  profileId: z.string().uuid(),
  url: z.string().url(),
});

export const ScreenshotInputSchema = z.object({
  profileId: z.string().uuid(),
  fullPage: z.boolean().default(false),
});

export interface AutomationIpcContract {
  'automation:connect': (profileId: string) => Promise<{ connected: boolean }>;
  'automation:disconnect': (profileId: string) => Promise<void>;
  'automation:navigate': (input: z.infer<typeof NavigateInputSchema>) => Promise<void>;
  'automation:screenshot': (input: z.infer<typeof ScreenshotInputSchema>) => Promise<{ screenshotPath: string }>;
}
```

---

### 2.6. Settings & Backup IPC Contracts (`shared/contracts/settings.ipc.ts`)
```typescript
import { z } from 'zod';

export interface SettingsIpcContract {
  'settings:getAll': () => Promise<Record<string, unknown>>;
  'settings:set': (input: { key: string; value: unknown }) => Promise<void>;
  'backup:create': (input: { full: boolean }) => Promise<{ backupPath: string; sizeBytes: number }>;
  'backup:list': () => Promise<Array<{ filename: string; sizeBytes: number; createdAt: number }>>;
  'backup:restore': (input: { backupPath: string }) => Promise<{ restored: boolean }>;
}
```

---

## 3. EVENTBUS CHUẨN HÓA (SERVER TO RENDERER BROADCASTS)

Main Process phát các sự kiện thời gian thực thông qua `webContents.send('eventbus:event', payload)`. Các payload được định nghĩa kiểu chặt chẽ:

```typescript
export interface EventBusContracts {
  // Sự kiện vòng đời Profile
  'profile:started': {
    profileId: string;
    pid: number;
    startedAt: number;
  };
  'profile:stopped': {
    profileId: string;
    exitCode: number | null;
  };
  'profile:crashed': {
    profileId: string;
    error: string;
  };

  // Sự kiện vòng đời Browser Runtime
  'browser:started': {
    browserId: string;
    pid: number;
  };
  'browser:closed': {
    browserId: string;
    pid: number;
  };

  // Sự kiện vòng đời Task & Workflow Automation
  'task:started': {
    taskId: string;
    profileId?: string;
    startedAt: number;
  };
  'task:progress': {
    taskId: string;
    progress: number; // 0 - 100
    stepName: string;
  };
  'task:completed': {
    taskId: string;
    result?: unknown;
    finishedAt: number;
  };
  'task:failed': {
    taskId: string;
    error: string;
    finishedAt: number;
  };
}
```

---

## 4. PRELOAD CONTEXTBRIDGE INTERFACE (`types/electron.d.ts`)

Định nghĩa interface an toàn cho đối tượng `window.electronAPI` trong Nuxt 4:

```typescript
import type { ApiResponse } from '@/shared/contracts/common';
import type { SystemInfoResponse, OpenDirectoryInput } from '@/shared/contracts/system.ipc';
import type { BrowserItem, AddCustomBrowserInput } from '@/shared/contracts/browser.ipc';
import type { CreateProfileInput, UpdateProfileInput, ProfileFilter, BatchActionInput } from '@/shared/contracts/profile.ipc';
import type { CreateProxyInput, CheckProxyResponse } from '@/shared/contracts/proxy.ipc';
import type { CreateTaskInput } from '@/shared/contracts/task.ipc';
import type { EventBusContracts } from '@/shared/contracts/events';

export interface IElectronAPI {
  system: {
    getInfo: () => Promise<ApiResponse<SystemInfoResponse>>;
    openDirectory: (input: OpenDirectoryInput) => Promise<ApiResponse<void>>;
    getStorageUsage: () => Promise<ApiResponse<SystemInfoResponse['storageUsage']>>;
  };
  browser: {
    list: () => Promise<ApiResponse<BrowserItem[]>>;
    detect: () => Promise<ApiResponse<BrowserItem[]>>;
    addCustom: (input: AddCustomBrowserInput) => Promise<ApiResponse<BrowserItem>>;
    remove: (id: string) => Promise<ApiResponse<void>>;
    testExecutable: (input: { executablePath: string }) => Promise<ApiResponse<{ valid: boolean; version?: string }>>;
  };
  profile: {
    list: (filter?: ProfileFilter) => Promise<ApiResponse<{ items: any[]; total: number }>>;
    getById: (id: string) => Promise<ApiResponse<any>>;
    create: (input: CreateProfileInput) => Promise<ApiResponse<any>>;
    update: (input: UpdateProfileInput) => Promise<ApiResponse<any>>;
    delete: (input: { id: string; deleteStorage?: boolean }) => Promise<ApiResponse<void>>;
    launch: (id: string) => Promise<ApiResponse<{ pid: number; cdpPort?: number }>>;
    stop: (id: string) => Promise<ApiResponse<void>>;
    restart: (id: string) => Promise<ApiResponse<{ pid: number }>>;
    getStatus: (id: string) => Promise<ApiResponse<{ status: string; pid?: number }>>;
    batch: (input: BatchActionInput) => Promise<ApiResponse<{ successIds: string[]; failedIds: string[] }>>;
  };
  proxy: {
    list: () => Promise<ApiResponse<any[]>>;
    create: (input: CreateProxyInput) => Promise<ApiResponse<any>>;
    update: (input: Partial<CreateProxyInput> & { id: string }) => Promise<ApiResponse<any>>;
    delete: (id: string) => Promise<ApiResponse<void>>;
    check: (id: string) => Promise<ApiResponse<CheckProxyResponse>>;
    rotate: (id: string) => Promise<ApiResponse<{ success: boolean; newIp?: string }>>;
    import: (rawText: string) => Promise<ApiResponse<{ importedCount: number; errors: string[] }>>;
  };
  task: {
    list: (filter?: { status?: string; profileId?: string }) => Promise<ApiResponse<any[]>>;
    create: (input: CreateTaskInput) => Promise<ApiResponse<any>>;
    cancel: (id: string) => Promise<ApiResponse<void>>;
    retry: (id: string) => Promise<ApiResponse<void>>;
  };
  automation: {
    connect: (profileId: string) => Promise<ApiResponse<{ connected: boolean }>>;
    disconnect: (profileId: string) => Promise<ApiResponse<void>>;
    navigate: (input: { profileId: string; url: string }) => Promise<ApiResponse<void>>;
    screenshot: (input: { profileId: string; fullPage?: boolean }) => Promise<ApiResponse<{ screenshotPath: string }>>;
  };
  events: {
    on: <K extends keyof EventBusContracts>(
      event: K,
      callback: (payload: EventBusContracts[K]) => void
    ) => () => void; // Trả về hàm hủy đăng ký (unsubscribe)
  };
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
```
