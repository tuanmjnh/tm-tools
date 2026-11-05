export const PAGE_SIZE = {
  admin: 50,
  lookup: 100,
  default: 30,
  compact: 20,
  sessions: 12,
  mediaLibrary: 32,
  users: 10,
  exportPreview: 10
} as const

export const POLLING = {
  uiResetMs: 1500,
  oauth: {
    intervalMs: 1500,
    maxAttempts: 120
  },
  debounceMs: {
    search: 500,
    path: 800,
    url: 300,
    link: 200
  }
} as const

export const UPLOAD_CONCURRENCY = 3

export const FILE_EXTENSIONS: Record<'image' | 'video' | 'videoExtended' | 'audio' | 'subtitle', string[]> = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'bmp'],
  video: ['mp4', 'mkv', 'webm', 'avi', 'mov'],
  videoExtended: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'ts'],
  audio: ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'],
  subtitle: ['srt', 'vtt', 'ass', 'ssa']
}

export const VIDEO_ASPECT_SIZES: Record<number, { w: number, h: number }> = {
  0: { w: 1080, h: 1920 },
  1: { w: 1920, h: 1080 },
  2: { w: 1080, h: 1920 },
  3: { w: 1080, h: 1080 },
  4: { w: 1440, h: 1080 }
}

export const VIDEO_DEFAULT_SIZE = {
  w: 1080,
  h: 1920
}

export const TOOL_DEFAULTS = {
  download: {
    outputPattern: '%(title)s.%(ext)s',
    threads: 4,
    maxThreads: 8,
    encoding: 'utf-8'
  },
  encodings: ['utf-8', 'ascii', 'latin-1']
}

export const PROFILE_DEFAULTS = {
  proxyPort: 8080,
  startUrl: 'https://whoer.net'
} as const

export const FALLBACK_AVATAR = 'https://api.dicebear.com/7.x/bottts/svg'

export const STORAGE_KEYS = {
  downloadSettings: 'tools:download:settings',
  videoThreads: 'tools:video:threads',
  iconFavorites: 'tm-tools:icon-favorites',
  aiLocalHealth: 'tm_tools_ai_local_health'
} as const
