export type { AuthUser, LoginRequest, RegisterRequest, AuthResponse, TokenPayload, LoginPlatform, AuthProvider } from './auth'
export type { Role, ModulePermission, UserRole, ModuleDefinition, PermissionCheck, PermissionAction, RBACConfig } from './rbac'
export type { ApiResponse, PaginationParams } from './api'
export type { ElectronAPI } from './electron'
export type {
  TaskStatus,
  ToolTaskMeta,
  ToolTask,
  YoutubeDownloadResponse,
  FfmpegRenderResponse,
  ExecutableCheck,
  ToolsNamespace,
  YoutubeFormat,
  YoutubeConfig,
  YoutubeHistory,
  PlaylistVideo,
  FfmpegConfig,
  FfmpegBatchConfig,
  FfmpegHistory,
  FfmpegVersions,
  FfmpegLabel,
  FfmpegSubFile,
  FileStat,
  FileNode,
  FileOptions,
  DialogFileFilter,
  DialogArgs,
  DialogNamespace,
  FileManagerNamespace,
  MediaProbeResult,
  JoinFolderItem,
  ToolUpdateInfo,
  ToolUpdateProgress
} from './electron'

export type UserStatus = 'subscribed' | 'unsubscribed' | 'bounced'
export type SaleStatus = 'paid' | 'failed' | 'refunded'

export interface User {
  id: number
  name: string
  email: string
  avatar?: { src?: string, [key: string]: unknown }
  status: UserStatus
  location: string
}

export interface Mail {
  id: number
  unread?: boolean
  from: User
  subject: string
  body: string
  date: string
}

export interface Member {
  name: string
  username: string
  role: 'member' | 'owner'
  avatar: { src?: string, [key: string]: unknown }
}

export interface Stat {
  title: string
  icon: string
  value: number | string
  variation: number
  formatter?: (value: number) => string
}

export interface Sale {
  id: string
  date: string
  status: SaleStatus
  email: string
  amount: number
}

export interface Notification {
  id: number
  unread?: boolean
  sender: User
  body: string
  date: string
}

export type Period = 'daily' | 'weekly' | 'monthly'

export interface Range {
  start: Date
  end: Date
}
