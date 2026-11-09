import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AuthConfig, AuthProvider } from '#shared/types/auth'
import type { ModuleDefinition } from '#shared/types/rbac'

export interface AppConfig {
  auth: AuthConfig
  hub: {
    url: string
    appId: string
    /** Server-only App Secret; must never be exposed through `runtimeConfig.public`. */
    appSecret: string
  }
  mongodb: {
    uri: string
    dbName: string
  }
  supabase: {
    url: string
    publishableKey: string
    serviceRoleKey: string
  }
  cloudinary: {
    cloudName: string
    apiKey: string
    apiSecret: string
  }
  firebase: {
    projectId: string
    clientEmail: string
    privateKey: string
    storageBucket: string
  }
  webPush: {
    publicKey: string
    privateKey: string
    subject: string
  }
  app: {
    name: string
    url: string
    port: number
  }
  tools: {
    ytDlpPath: string
    ffmpegPath: string
    ffprobePath: string
    ffplayPath: string
  }
  // Web-runtime media uploads (importWebFiles): files the browser picks up
  // are persisted here and streamed back under /uploads/*. .data/ is
  // already gitignored (same dir family as Nuxt's dev cache).
  uploads: {
    dir: string
    maxMb: number
  }
  ai: {
    provider: string
    apiKey: string
    baseUrl: string
    model: string
  }
  // PDF workspace: split/merge/rasterize/extract. Files live outside the app
  // bundle under .data/pdf so they survive rebuilds and are never served raw.
  pdf: {
    dir: string
    maxUploadMb: number
    maxPages: number
    imageScale: number
    pagePrefix: string
    padLength: number
    /** TrueType font used by Word→PDF; empty means auto-detect on the host. */
    fontPath: string
    extract: {
      /** Suggested model; the picker offers every model of every connection. */
      model: string
      temperature: number
      maxRetries: number
      retryDelayMs: number
      pageDelayMs: number
    }
  }
  // Document Studio v4 cloud runtime. Everything here is server-only: the
  // renderer never receives a connection string, bucket name or credential.
  document: {
    databaseUrl: string
    /**
     * Where document bytes live in a cloud runtime:
     * - `local`   — desktop only: the filesystem.
     * - `r2`      — this deployment owns the bucket (its own credentials).
     * - `hub`     — TM Hub owns the provider credentials; tm-tools only holds
     *               its own App Secret and asks Hub for short-lived grants.
     *               That is why no R2/S3/Supabase key appears below.
     * `auto` picks `r2` when the bucket below is complete, else `hub`.
     *
     * No driver means no store that a later request can read. A cloud runtime
     * then reports `ephemeral` and answers `/documents/run` only, returning the
     * result inline from `/tmp`; it does not pretend the bytes are durable.
     */
    storageDriver: 'auto' | 'local' | 'r2' | 'hub'
    hub: {
      /** Preferred Storage connection; Hub still authorizes every call. */
      connectionId: string
      namespace: string
      /** Raw bytes beyond this become a download grant instead of a base64 body. */
      maxInlineBytes: number
      timeoutMs: number
    }
    r2: {
      accountId: string
      endpoint: string
      region: string
      accessKeyId: string
      secretAccessKey: string
      bucket: string
    }
    presignUploadTtlSeconds: number
    presignDownloadTtlSeconds: number
    /** Shared secret for the retention cron route; empty disables the route. */
    cleanupToken: string
    maxUploadBytes: number
    maxTotalJobBytes: number
    maxScratchBytes: number
    inputRetentionHours: number
    outputRetentionHours: number
    jobHistoryDays: number
  }
  modules: ModuleDefinition[]
}

function readEnv(key: string, fallback = ''): string {
  return process.env[key] || fallback
}

/**
 * The packaged Electron runtime imports the Nitro output into its main process,
 * so `process.cwd()` is the install directory — read-only for normal users.
 * `TOOLS_DATA_DIR` is the userData path Electron exports for exactly this; dev
 * and web keep the gitignored `.data` folder.
 *
 * A serverless runtime has no writable project directory at all. There the data
 * root has to be `/tmp`, which is the only writable path Vercel guarantees —
 * per invocation, not across them.
 */
function resolveDataRoot(): string {
  const override = readEnv('TOOLS_DATA_DIR', '')
  if (override) return override
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return join(tmpdir(), 'tm-tools-data')
  }
  return join(process.cwd(), '.data')
}

/**
 * Resolves a bundled tool binary the SAME way the desktop app does
 * (electron/tools/paths.cjs → getResourcePath): the exes shipped next to the
 * Electron resources live in <projectRoot>/resources in dev and in
 * <resourcesPath>/resources when packaged. Nitro runs with cwd = project root,
 * so the ffmpeg the web export/proxy spawns is byte-identical to the one the
 * Electron renderer uses. Empty string = not bundled; callers fall back to
 * PATH (`ffmpeg`) or disable the feature.
 */
function resolveBundledTool(envKey: string, exeName: string): string {
  const override = readEnv(envKey, '')
  if (override) return override
  const bundled = join(process.cwd(), 'resources', exeName)
  return existsSync(bundled) ? bundled : ''
}

export function loadConfig(): AppConfig {
  return {
    auth: {
      provider: readEnv('AUTH_PROVIDER', 'hub') as AuthProvider,
      get accessTokenSecret() {
        return readEnv('AUTH_JWT_SECRET')
      },
      get refreshTokenSecret() {
        return readEnv('AUTH_REFRESH_TOKEN_SECRET')
      },
      accessTokenExpiry: parseInt(readEnv('AUTH_ACCESS_TOKEN_EXPIRY', '900')),
      refreshTokenExpiry: parseInt(readEnv('AUTH_REFRESH_TOKEN_EXPIRY', '604800'))
    },
    hub: {
      url: readEnv('NUXT_PUBLIC_HUB_URL', 'http://localhost:4000'),
      get appId() {
        return readEnv('NUXT_PUBLIC_HUB_APP_ID')
      },
      get appSecret() {
        return readEnv('NUXT_HUB_APP_SECRET')
      }
    },
    mongodb: {
      uri: readEnv('MONGODB_URI', 'mongodb://localhost:27017'),
      dbName: readEnv('MONGODB_DB_NAME', 'tm-tools')
    },
    supabase: {
      url: readEnv('SUPABASE_URL', 'https://zldjdwcrejpputsgxedi.supabase.co'),
      publishableKey: readEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_iWGWp0Rk4teLNr67WPApqg_ZxakiLuL'),
      get serviceRoleKey() {
        return readEnv('SUPABASE_SERVICE_ROLE_KEY')
      }
    },
    cloudinary: {
      cloudName: readEnv('CLOUDINARY_CLOUD_NAME', 'dvkmve9tn'),
      get apiKey() {
        return readEnv('CLOUDINARY_API_KEY')
      },
      get apiSecret() {
        return readEnv('CLOUDINARY_API_SECRET')
      }
    },
    firebase: {
      projectId: readEnv('FIREBASE_PROJECT_ID', 'tm-browsers'),
      clientEmail: readEnv('FIREBASE_CLIENT_EMAIL', 'firebase-adminsdk-fbsvc@tm-browsers.iam.gserviceaccount.com'),
      get privateKey() {
        return readEnv('FIREBASE_PRIVATE_KEY')
      },
      storageBucket: readEnv('FIREBASE_STORAGE_BUCKET', 'tm-browsers.appspot.com')
    },
    webPush: {
      publicKey: readEnv('WEB_PUSH_PUBLIC_KEY', 'BJCUmDcZCmiAvk89Pb8lBB_TOYtT0wBMvOA8e-rc9nRIZk__-NuRHDZKedwuOecx30SbzqEso1Ovo_8ZbZgC8Fw'),
      get privateKey() {
        return readEnv('WEB_PUSH_PRIVATE_KEY')
      },
      subject: readEnv('WEB_PUSH_SUBJECT', 'mailto:tuanmjnhdeveloper@gmail.com')
    },
    app: {
      name: readEnv('APP_NAME', 'TM Tools'),
      url: readEnv('APP_URL', 'http://127.0.0.1:3456'),
      port: parseInt(readEnv('APP_PORT', '3456'))
    },
    tools: {
      ytDlpPath: resolveBundledTool('TOOLS_YTDLP_PATH', 'yt-dlp.exe'),
      ffmpegPath: resolveBundledTool('TOOLS_FFMPEG_PATH', 'ffmpeg.exe'),
      ffprobePath: resolveBundledTool('TOOLS_FFPROBE_PATH', 'ffprobe.exe'),
      ffplayPath: resolveBundledTool('TOOLS_FFPLAY_PATH', 'ffplay.exe')
    },
    uploads: {
      dir: readEnv('TOOLS_UPLOADS_DIR', join(resolveDataRoot(), 'uploads')),
      maxMb: parseInt(readEnv('TOOLS_UPLOADS_MAX_MB', '512'))
    },
    ai: {
      provider: readEnv('AI_PROVIDER', 'gemini'),
      apiKey: readEnv('AI_API_KEY', ''),
      baseUrl: readEnv('AI_BASE_URL', ''),
      model: readEnv('AI_MODEL', '')
    },
    pdf: {
      dir: readEnv('PDF_DATA_DIR', join(resolveDataRoot(), 'pdf')),
      maxUploadMb: parseInt(readEnv('PDF_MAX_UPLOAD_MB', '200')),
      maxPages: parseInt(readEnv('PDF_MAX_PAGES', '400')),
      imageScale: parseFloat(readEnv('PDF_IMAGE_SCALE', '2')),
      pagePrefix: readEnv('PDF_PAGE_PREFIX', 'page_'),
      padLength: parseInt(readEnv('PDF_PAD_LENGTH', '4')),
      fontPath: readEnv('PDF_FONT_PATH', ''),
      extract: {
        // Only the starting suggestion: extraction always runs through the AI
        // connection + model chosen in the picker, not through a local key.
        model: readEnv('PDF_EXTRACT_MODEL', 'gemini-3.5-flash'),
        temperature: parseFloat(readEnv('PDF_EXTRACT_TEMPERATURE', '0.1')),
        maxRetries: parseInt(readEnv('PDF_EXTRACT_MAX_RETRIES', '3')),
        retryDelayMs: parseInt(readEnv('PDF_EXTRACT_RETRY_DELAY_MS', '3000')),
        pageDelayMs: parseInt(readEnv('PDF_EXTRACT_PAGE_DELAY_MS', '1500'))
      }
    },
    document: {
      // Neon/Postgres connection string (server only). Empty = cloud job
      // metadata is not configured and the API says so instead of guessing.
      databaseUrl: readEnv('DATABASE_URL', ''),
      storageDriver: (readEnv('DOCUMENT_STORAGE_DRIVER', 'auto') || 'auto') as AppConfig['document']['storageDriver'],
      hub: {
        // Same names the integration brief reserves for the Hub gateway.
        connectionId: readEnv('DOCUMENT_STORAGE_CONNECTION_ID', readEnv('PDF_STORAGE_CONNECTION_ID', '')),
        namespace: readEnv('DOCUMENT_STORAGE_NAMESPACE', readEnv('PDF_STORAGE_NAMESPACE', 'tm-tools/pdf')),
        maxInlineBytes: parseInt(
          readEnv('DOCUMENT_STORAGE_MAX_INLINE_BYTES', readEnv('PDF_STORAGE_MAX_INLINE_BYTES', '1000000'))
        ),
        timeoutMs: parseInt(readEnv('DOCUMENT_HUB_TIMEOUT_MS', '15000'))
      },
      r2: {
        accountId: readEnv('R2_ACCOUNT_ID', ''),
        endpoint: readEnv('R2_ENDPOINT', ''),
        region: readEnv('R2_REGION', 'auto'),
        accessKeyId: readEnv('R2_ACCESS_KEY_ID', ''),
        secretAccessKey: readEnv('R2_SECRET_ACCESS_KEY', ''),
        bucket: readEnv('R2_BUCKET_NAME', '')
      },
      presignUploadTtlSeconds: parseInt(readEnv('DOCUMENT_PRESIGN_UPLOAD_TTL_SECONDS', '600')),
      presignDownloadTtlSeconds: parseInt(readEnv('DOCUMENT_PRESIGN_DOWNLOAD_TTL_SECONDS', '300')),
      cleanupToken: readEnv('DOCUMENT_CLEANUP_TOKEN', ''),
      maxUploadBytes: parseInt(readEnv('DOCUMENT_MAX_UPLOAD_BYTES', String(100 * 1024 * 1024))),
      maxTotalJobBytes: parseInt(readEnv('DOCUMENT_MAX_TOTAL_JOB_BYTES', String(100 * 1024 * 1024))),
      maxScratchBytes: parseInt(readEnv('DOCUMENT_MAX_SCRATCH_BYTES', String(350 * 1024 * 1024))),
      inputRetentionHours: parseInt(readEnv('DOCUMENT_INPUT_RETENTION_HOURS', '24')),
      outputRetentionHours: parseInt(readEnv('DOCUMENT_OUTPUT_RETENTION_HOURS', '24')),
      jobHistoryDays: parseInt(readEnv('DOCUMENT_JOB_HISTORY_DAYS', '7'))
    },
    modules: [
      { key: 'dashboard', label: 'Dashboard', description: 'Dashboard module', icon: 'i-lucide-layout-dashboard' },
      { key: 'chat', label: 'AI Chat', description: 'AI chat module', icon: 'i-lucide-message-square' },
      { key: 'browser_hub', label: 'Browser Hub', description: 'Browser profiles & proxies management', icon: 'i-lucide-globe' },
      { key: 'pdf', label: 'PDF Studio', description: 'PDF split, merge, convert and price-list extraction', icon: 'i-lucide-file-text' },
      { key: 'settings', label: 'Settings', description: 'Settings module', icon: 'i-lucide-settings' },
      { key: 'users', label: 'Users', description: 'User management', icon: 'i-lucide-user-cog' },
      { key: 'rbac', label: 'RBAC', description: 'Role & permission management', icon: 'i-lucide-shield' }
    ]
  }
}

export const config = loadConfig()
