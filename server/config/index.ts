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
      accessTokenSecret: readEnv('AUTH_JWT_SECRET', 'dbe14a60ba70621b213b2cf535aaa712e2b9c0c9a1b1e471add395f715450fb3'),
      refreshTokenSecret: readEnv('AUTH_REFRESH_TOKEN_SECRET', '60780ac5cd7b755ae1cce5322ac9874763f48a410f4657ee9a74e0019edbda89'),
      accessTokenExpiry: parseInt(readEnv('AUTH_ACCESS_TOKEN_EXPIRY', '900')),
      refreshTokenExpiry: parseInt(readEnv('AUTH_REFRESH_TOKEN_EXPIRY', '604800'))
    },
    hub: {
      url: readEnv('NUXT_PUBLIC_HUB_URL', 'http://localhost:4000'),
      appId: readEnv('NUXT_PUBLIC_HUB_APP_ID', 'tm-tools'),
      appSecret: readEnv('NUXT_HUB_APP_SECRET', '')
    },
    mongodb: {
      uri: readEnv('MONGODB_URI', 'mongodb://localhost:27017'),
      dbName: readEnv('MONGODB_DB_NAME', 'tm-tools')
    },
    supabase: {
      url: readEnv('SUPABASE_URL', 'https://zldjdwcrejpputsgxedi.supabase.co'),
      publishableKey: readEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_iWGWp0Rk4teLNr67WPApqg_ZxakiLuL'),
      serviceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGpkd2NyZWpwcHV0c2d4ZWRpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTM4NzgyMCwiZXhwIjoyMTAwOTYzODIwfQ.D4s74_NQcwkOOJk0byIWCO3b4E9CODGVxQ0mn1-s8PQ')
    },
    cloudinary: {
      cloudName: readEnv('CLOUDINARY_CLOUD_NAME', 'dvkmve9tn'),
      apiKey: readEnv('CLOUDINARY_API_KEY', '518485535157415'),
      apiSecret: readEnv('CLOUDINARY_API_SECRET', 'g2wrwD4_Kg1Mt_wtiBdL4vROMsE')
    },
    firebase: {
      projectId: readEnv('FIREBASE_PROJECT_ID', 'tm-browsers'),
      clientEmail: readEnv('FIREBASE_CLIENT_EMAIL', 'firebase-adminsdk-fbsvc@tm-browsers.iam.gserviceaccount.com'),
      privateKey: readEnv('FIREBASE_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC5qbA1gX1eIL21\nH9BLK7dL3awjbWymSEwnIShqFlmkJ0PNAOT841ruBgiRg/6PTBYyjw7llD9qA9x4\nl+bpETCkXkF2ItHu9Mv+4EUR60ZgrQS9eWoBiTmMYK4XvV4zBx2VgsTDfhsN7rdi\nY4qCGrugcaCFSmAUv6LGv0dE8gyUN5dCntIdhb7H43I+O3W2nUVXSpXEXWNDCKZU\nsNhYJPIegL4MMFePdhM9PiA3ybwptxgGevY3jbLdfR30xNB3CQdA0NIJZSNJhriu\nRNMUcEdrLR332KiwXFP3cXFRMlncMgI8fC2Ok3kbkzpn1Rqw+FS6/s33k6DimVdb\nVOR+6pbJAgMBAAECggEAW4xQHnoM0uqrEJIw17glKEwUct2kivOwVUUU1AbUScyw\nsnfj8cy7zA1+kR44WflnIqQG8O5iPIjN4Erqqfb3eL0fYzy1LrJXmoSEmlrcd5Qo\n97LUMhCzp0QO5BbUya2TCWOTWWAnv/17QJEbvZ6n8OvGfqMXcHO0NHMiFd2SlUxi\nJ7XVW/YaXRtBXiaztqeEPtg1HDRHAaLxmFyAsrUiMzjc47HEeOak6PE9vJ6XMwCu\nxXyW5l5DTCA4p58cdQS8ry/JjEt3mn6zJaJzze8GDgoJzAjnWSO3FKdyfcxyXeuG\ntVGNi58C1CEbLGMoqCEV6QC5epwPsvYBL5nQrRwpJwKBgQDvDSRogyMjXW3ysApw\nYy8cuLnQd+pwxx2XnT4mEdzcRoWLpWwvRxTsg2BalDs2LAUfUWR3Epz+n7K1+YhK\nOySjjeiDDWmvCohj87ThX6lvBylJZnwplA0+/KoBiBPS++w6nbismjb/nj9Fdjsr\nBbXw19i/UYMSKCkQcp4KuXDtjwKBgQDG04cqjOT9sXdH6KiyrIeuCoJ20CrREfea\nm18/ZsRDAvH0gdiTIMHY8LVYXYlWA+gqv6cfpnAsiUY3GsNyC0ISeezs1dibQftJ\nr9voXwD34zxj17bNl6sMqJ/z6bfkuEqnmN4jYjm/1LcDhSTbsQ9pmCWlOrkBmn7y\negWIXtw6JwKBgQDKb9u0MdFw4m74hQHiGOxNq1WX5+T+KnCx8zQtMxVQ6Nuw3Z6X\nDt/2Rm8zZbIa9v5Dfj7Q409WBVFm73DuQ9WMN+F+Eb68v/OuiTRVYxht8KeTBBoD\nb+Ajxf4GHAGFu1dacDRy3onSwGUeYrhKf6SK148yvUl898uGpTmXJWEvmwKBgEx5\n4GvFde7+69qE6x6OrkGLWVNKDq4MMykMyj4g0SzVXSunJh6xYt6G97ndgI3NQufu\nf+H0qwD2bEOVz8d1/RwOOct/FaniXz2gnv1qTX0LspbUykOaKvjbg2rWYx1epZiB\nfDAv//aBY0O/WsYF/N+o3hIH3FF5k4rA1I/3rM3RAoGBAKivq/ODa9Nt8p5l3uu/\nBV2Tr1ZnOeR9w2iIGgWgMQ5eLRtdlGJwQOpnMz51kjS0iAWKQHFy/VdbfDEPTbAI\n4th68zmSeEomazqjxzMwL+BN8eanU9XFinqItUrnVlrv5qFes+86HBm0cW4Ag219\nwwY2YxHjhCZm0yLjqY+sWtER\n-----END PRIVATE KEY-----\n'),
      storageBucket: readEnv('FIREBASE_STORAGE_BUCKET', 'tm-browsers.appspot.com')
    },
    webPush: {
      publicKey: readEnv('WEB_PUSH_PUBLIC_KEY', 'BJCUmDcZCmiAvk89Pb8lBB_TOYtT0wBMvOA8e-rc9nRIZk__-NuRHDZKedwuOecx30SbzqEso1Ovo_8ZbZgC8Fw'),
      privateKey: readEnv('WEB_PUSH_PRIVATE_KEY', '2VztAFydbex4A3TzyFgA_BL1L16n_xQZKJoWaAlZvAU'),
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
