export interface TaskStatus {
  total: number
  running: number
  done: number
  waiting: number
  isProcessing: boolean
  isPaused: boolean
  retryCount: Record<number, number>
  globalRetryCount: number
  globalRetryLimit: number
  maxRetry: number
  threads: (number | null)[]
  taskStatus: Record<number, string>
}

export interface ToolTaskMeta {
  taskId?: string
  taskKey?: number
  thread?: number
  input?: string
  inputs?: string[]
  output?: string
  outPath?: string
  fileName?: string
  duration?: number
  formatId?: string
  formatTitle?: string
  configId?: string
  configTitle?: string
  threads?: number
  startedAt?: string
  config?: unknown
  operation?: string
}

export interface FfmpegLabel {
  text: string
  size: number
  color: string
  x: number
  y: number
  w?: number
  h?: number
}

export interface ToolTask {
  command?: string
  args?: string[]
  options?: Record<string, unknown>
  meta?: ToolTaskMeta
  timeout?: number
}

export interface YoutubeDownloadResponse extends ToolTaskMeta {
  taskKey?: number
  thread?: number
  speed?: string
  percent?: number
  downloaded?: string
  done?: boolean
  message?: string
  code?: number | null
}

export interface FfmpegRenderResponse extends ToolTaskMeta {
  taskKey?: number
  thread?: number
  percent?: number
  speed?: string
  downloaded?: string
  done?: boolean
  message?: string
  code?: number | null
}

export interface ExecutableCheck {
  data: Record<string, { path: string, exists: boolean }> | string
  status: boolean
}

export interface YoutubeFormat {
  id: string
  title: string
  code: string
  opt: string[]
  w: number
  h: number
  sort: number
  flag: number
  created_at: string
  updated_at: string | null
}

export interface YoutubeConfig {
  id: string
  title: string
  format_id: string
  out_path: string
  file_name: string
  threads: number
  restrict: number
  overwrite: number
  encoding: string
  flag: number
  created_at: string
  updated_at: string | null
}

export interface YoutubeHistory {
  id: string
  url: string
  title: string | null
  format_id: string | null
  format_title: string | null
  out_path: string | null
  file_name: string | null
  file_size: number | null
  duration: number | null
  status: 'completed' | 'failed' | 'cancelled'
  error_message: string | null
  config_id: string | null
  config_title: string | null
  threads: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface FfmpegConfig {
  id: string
  user_id: string | null
  title: string
  aspect_ratio: number
  background_type: 'color' | 'boxblur' | 'file'
  background_color: string
  background_boxblur: number
  background_file: string | null
  center: number
  speed: number
  volume: number
  zoom_enable: number
  zoom_ratio: number
  zoom_time_start: number
  zoom_time_duration: number
  zoom_time_loop: number
  hflip_enable: number
  hflip_all: number
  hflip_time_start: number
  hflip_time_duration: number
  hflip_time_loop: number
  vflip_enable: number
  vflip_all: number
  vflip_time_start: number
  vflip_time_duration: number
  vflip_time_loop: number
  scale_x: number
  scale_y: number
  scale_w: number
  scale_h: number
  labels: string | FfmpegLabel[]
  files: string | string[]
  subtitle: string | null
  render_code: string | null
  flag: number
  created_at: string
  updated_at: string | null
}

export interface FfmpegBatchConfigItem {
  configId: string
  inputPattern: string
  outputPattern: string
  fileFilter?: {
    minDuration?: number
    maxDuration?: number
    minWidth?: number
    maxWidth?: number
  }
}

export interface FfmpegBatchConfig {
  id: string
  title: string
  items: string | FfmpegBatchConfigItem[]
  threads: number
  output_path: string
  flag: number
  created_at: string
  updated_at: string | null
}

export interface FfmpegHistory {
  id: string
  config_id: string | null
  config_title: string | null
  batch_config_id: string | null
  batch_config_title: string | null
  input_file: string | null
  input_files: string | unknown[] | null
  output_file: string | null
  output_path: string | null
  operation: 'render' | 'split' | 'join' | 'split_render' | 'join_render'
  duration: number | null
  file_size: number | null
  status: 'completed' | 'failed' | 'cancelled'
  error_message: string | null
  threads: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface PlaylistVideo {
  id: string
  title: string
  duration: number
  uploader: string
  viewCount: number
  uploadDate: string
  url: string
}

export interface FileStat {
  name: string
  fullPath: string
  isFile: boolean
  isDirectory: boolean
  size: number
  atime: Date
  mtime: Date
  ctime: Date
  birthtime: Date
}

export interface FileNode extends FileStat {
  type: 'file' | 'folder'
  children?: FileNode[]
}

export interface FileOptions {
  extensions?: string[]
  exclude?: string[]
  depth?: number
  isSlashPath?: boolean
}

export type DialogFileFilter = { name: string, extensions: string[] }

export interface DialogArgs {
  title?: string
  filters?: DialogFileFilter[]
  defaultPath?: string
  sync?: boolean
  multiSelections?: boolean
  showHiddenFiles?: boolean
  createDirectory?: boolean
  treatPackageAsDirectory?: boolean
  showOverwriteConfirmation?: boolean
  dontAddToRecent?: boolean
}

export interface DialogNamespace {
  openFile(args?: DialogArgs): Promise<string[] | null>
  openFolder(args?: DialogArgs): Promise<string[] | null>
  saveFile(args?: DialogArgs): Promise<string | null>
}

export interface FileManagerNamespace {
  read(filePath: string, encoding?: string): Promise<string>
  write(args: { filePath: string, data: string, encoding?: string }): Promise<void>
  append(args: { filePath: string, data: string, encoding?: string }): Promise<boolean>
  exists(filePath: string): Promise<boolean>
  delete(filePath: string): Promise<boolean>
  readJSON(filePath: string): Promise<unknown | null>
  writeJSON(args: { filePath: string, obj: unknown, space?: number }): Promise<boolean>
  createFolder(dirPath: string): Promise<boolean>
  rename(args: { oldPath: string, newPath: string }): Promise<boolean>
  copyFile(args: { src: string, dest: string }): Promise<boolean>
  copyFolder(args: { src: string, dest: string }): Promise<boolean>
  getTree(args: { dirPath: string, options?: FileOptions }): Promise<FileNode | null>
  listFlat(args: { dirPath: string, options?: FileOptions }): Promise<FileNode[]>
  listFiles(args: { dirPath: string, options?: FileOptions }): Promise<FileNode[]>
  listFolders(args: { dirPath: string, options?: FileOptions }): Promise<FileNode[]>
  listAll(args: { dirPath: string, options?: FileOptions }): Promise<FileNode[]>
  listFileNames(args: { dirPath: string, options?: FileOptions }): Promise<string[]>
  listFolderNames(args: { dirPath: string, options?: FileOptions }): Promise<string[]>
  listAllNames(args: { dirPath: string, options?: FileOptions }): Promise<string[]>
  readAsync(filePath: string, encoding?: string): Promise<string>
  writeAsync(args: { filePath: string, data: string, encoding?: string }): Promise<void>
  appendAsync(args: { filePath: string, data: string, encoding?: string }): Promise<boolean>
  existsAsync(filePath: string): Promise<boolean>
  deleteAsync(filePath: string): Promise<boolean>
  readJSONAsync(filePath: string): Promise<unknown | null>
  writeJSONAsync(args: { filePath: string, obj: unknown, space?: number }): Promise<boolean>
  createFolderAsync(dirPath: string): Promise<boolean>
  renameAsync(args: { oldPath: string, newPath: string }): Promise<boolean>
  copyFileAsync(args: { src: string, dest: string }): Promise<boolean>
  copyFolderAsync(args: { src: string, dest: string }): Promise<boolean>
  getTreeAsync(args: { dirPath: string, options?: FileOptions }): Promise<FileNode | null>
  listFlatAsync(args: { dirPath: string, options?: FileOptions }): Promise<FileNode[]>
  listFilesAsync(args: { dirPath: string, options?: FileOptions }): Promise<FileNode[]>
  listFoldersAsync(args: { dirPath: string, options?: FileOptions }): Promise<FileNode[]>
  listAllAsync(args: { dirPath: string, options?: FileOptions }): Promise<FileNode[]>
  listFileNamesAsync(args: { dirPath: string, options?: FileOptions }): Promise<string[]>
  listFolderNamesAsync(args: { dirPath: string, options?: FileOptions }): Promise<string[]>
  listAllNamesAsync(args: { dirPath: string, options?: FileOptions }): Promise<string[]>
  imageToDataUrl(imagePath: string): Promise<string | null>
}

type EventUnsubscriber = () => void

export interface ToolsNamespace {
  checkExecutable(): Promise<ExecutableCheck>
  getStatus(): Promise<TaskStatus>
  initTaskManager(args: { threads?: number, delay?: number, delayUI?: number, maxRetry?: number, timeout?: number }): Promise<void>
  setTasks(tasks: ToolTask[]): Promise<void>
  setGroupTasks?(groups: ToolTask[][]): Promise<void>
  startTasks(): Promise<void>
  pauseTasks(): Promise<TaskStatus>
  continueTasks(): Promise<TaskStatus>
  stopTask(idx: number): Promise<TaskStatus>
  stopTasks(): Promise<TaskStatus>
  getMediaInfo?(args: string[]): Promise<{ pid: number, code: number | null, signal: string | null, stdout: string, stderr: string }>
  crawlPlaylist(url: string): Promise<{ status: boolean, data?: PlaylistVideo[], message?: string }>
  getFormats(url: string): Promise<{ status: boolean, data?: { title: string, duration: number, formats: YoutubeFormat[] }, message?: string }>
  getVersion(): Promise<{ status: boolean, data?: string, message?: string }>
  listFormats(): Promise<YoutubeFormat[]>
  createFormat(data: Partial<YoutubeFormat>): Promise<{ status: boolean, data?: { id: string } }>
  updateFormat(data: { id: string, data: Partial<YoutubeFormat> }): Promise<{ status: boolean }>
  deleteFormat(id: string): Promise<{ status: boolean }>
  listConfigs(): Promise<YoutubeConfig[]>
  createConfig(data: Partial<YoutubeConfig>): Promise<{ status: boolean, data?: { id: string } }>
  updateConfig(data: { id: string, data: Partial<YoutubeConfig> }): Promise<{ status: boolean }>
  deleteConfig(id: string): Promise<{ status: boolean }>
  listHistory(limit?: number): Promise<YoutubeHistory[]>
  deleteHistory(): Promise<{ status: boolean }>

  // FFmpeg SQLite and helper operations
  listFfmpegConfigs(): Promise<FfmpegConfig[]>
  createFfmpegConfig(data: Partial<FfmpegConfig>): Promise<{ status: boolean, data?: { id: string } }>
  updateFfmpegConfig(data: { id: string, data: Partial<FfmpegConfig> }): Promise<{ status: boolean }>
  deleteFfmpegConfig(id: string): Promise<{ status: boolean }>
  listFfmpegBatchConfigs(): Promise<FfmpegBatchConfig[]>
  createFfmpegBatchConfig(data: Partial<FfmpegBatchConfig>): Promise<{ status: boolean, data?: { id: string } }>
  updateFfmpegBatchConfig(data: { id: string, data: Partial<FfmpegBatchConfig> }): Promise<{ status: boolean }>
  deleteFfmpegBatchConfig(id: string): Promise<{ status: boolean }>
  listFfmpegHistory(limit?: number): Promise<FfmpegHistory[]>
  deleteFfmpegHistory(id: string): Promise<{ status: boolean }>
  detectGpuSupport(): Promise<{ nvenc: boolean, amf: boolean, qsv: boolean }>
  globFiles(pattern: string): Promise<string[]>
  onBeforeRunTask(cb: (data: YoutubeDownloadResponse | FfmpegRenderResponse) => void): EventUnsubscriber
  onProgressTask(cb: (data: YoutubeDownloadResponse | FfmpegRenderResponse) => void): EventUnsubscriber
  onAllTasksDone(cb: (data: { total: number }) => void): EventUnsubscriber
  onErrorTask(cb: (data: YoutubeDownloadResponse | FfmpegRenderResponse) => void): EventUnsubscriber
  onStoppedTask(cb: (data: boolean) => void): EventUnsubscriber
  onStoppedTasks(cb: (data: boolean) => void): EventUnsubscriber
  onTaskRetry(cb: (data: { taskKey: number, retryCount: number }) => void): EventUnsubscriber
  onTaskTimeout(cb: (data: { taskKey: number }) => void): EventUnsubscriber
  onManagerInitialized(cb: (data: Record<string, unknown>) => void): EventUnsubscriber
}

export interface ElectronAPI {
  platform: string
  versions: {
    node: string
    chrome: string
    electron: string
  }
  isElectron: boolean
  getConfig(): Promise<Record<string, string>>
  setConfig(values: Record<string, string>): Promise<{ success: boolean, path: string }>
  openPath(fullPath: string): Promise<boolean>
  showItemInFolder(fullPath: string): Promise<boolean>
  send(channel: string, data?: unknown): void
  on(channel: string, callback: (...args: unknown[]) => void): void
  tools: {
    youtube: ToolsNamespace
    ffmpeg: ToolsNamespace
  }
  dialog: DialogNamespace
  fileManager: FileManagerNamespace
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
