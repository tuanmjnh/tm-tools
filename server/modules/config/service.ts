import { config } from '../../config/index'
import { getDatabase } from '../database/index'

export const CONFIG_KEYS = [
  'MONGODB_URI',
  'MONGODB_DB_NAME',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_STORAGE_BUCKET',
  'WEB_PUSH_PUBLIC_KEY',
  'WEB_PUSH_PRIVATE_KEY',
  'WEB_PUSH_SUBJECT',
  'APP_NAME',
  'APP_URL',
  'APP_PORT',
  'TOOLS_YTDLP_PATH',
  'TOOLS_FFMPEG_PATH',
  'TOOLS_FFPROBE_PATH',
  'AI_PROVIDER',
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_MODEL'
] as const

export type ConfigKey = typeof CONFIG_KEYS[number]

const KEY_MAP: Record<ConfigKey, string[]> = {
  MONGODB_URI: ['mongodb', 'uri'],
  MONGODB_DB_NAME: ['mongodb', 'dbName'],
  SUPABASE_URL: ['supabase', 'url'],
  SUPABASE_PUBLISHABLE_KEY: ['supabase', 'publishableKey'],
  SUPABASE_SERVICE_ROLE_KEY: ['supabase', 'serviceRoleKey'],
  CLOUDINARY_CLOUD_NAME: ['cloudinary', 'cloudName'],
  CLOUDINARY_API_KEY: ['cloudinary', 'apiKey'],
  CLOUDINARY_API_SECRET: ['cloudinary', 'apiSecret'],
  FIREBASE_PROJECT_ID: ['firebase', 'projectId'],
  FIREBASE_CLIENT_EMAIL: ['firebase', 'clientEmail'],
  FIREBASE_PRIVATE_KEY: ['firebase', 'privateKey'],
  FIREBASE_STORAGE_BUCKET: ['firebase', 'storageBucket'],
  WEB_PUSH_PUBLIC_KEY: ['webPush', 'publicKey'],
  WEB_PUSH_PRIVATE_KEY: ['webPush', 'privateKey'],
  WEB_PUSH_SUBJECT: ['webPush', 'subject'],
  APP_NAME: ['app', 'name'],
  APP_URL: ['app', 'url'],
  APP_PORT: ['app', 'port'],
  TOOLS_YTDLP_PATH: ['tools', 'ytDlpPath'],
  TOOLS_FFMPEG_PATH: ['tools', 'ffmpegPath'],
  TOOLS_FFPROBE_PATH: ['tools', 'ffprobePath'],
  AI_PROVIDER: ['ai', 'provider'],
  AI_API_KEY: ['ai', 'apiKey'],
  AI_BASE_URL: ['ai', 'baseUrl'],
  AI_MODEL: ['ai', 'model']
}

export async function loadConfigValues(): Promise<Record<string, string>> {
  try {
    const adapter = await getDatabase()
    return await adapter.getSystemConfig()
  } catch {
    return {}
  }
}

export async function saveConfigValues(values: Record<string, string>): Promise<void> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (CONFIG_KEYS.includes(key as ConfigKey) && typeof value === 'string') {
      sanitized[key] = value
    }
  }
  const adapter = await getDatabase()
  await adapter.saveSystemConfig(sanitized)
}

export function applyConfigValues(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (!CONFIG_KEYS.includes(key as ConfigKey)) continue
    process.env[key] = value

    const path = KEY_MAP[key as ConfigKey]
    let target: Record<string, unknown> = config as unknown as Record<string, unknown>
    for (let i = 0; i < path.length - 1; i++) {
      const next = target[path[i]!]
      target = (next as Record<string, unknown> | undefined) ?? {}
    }
    const leaf = path[path.length - 1]!
    target[leaf] = leaf === 'port' ? (parseInt(value, 10) || (target[leaf] as number)) : value
  }
}

export function flattenConfig(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of CONFIG_KEYS) {
    const path = KEY_MAP[key]
    let value: unknown = config
    for (const segment of path) {
      value = (value as Record<string, unknown> | undefined)?.[segment]
    }
    if (value !== undefined && value !== null) result[key] = String(value)
  }
  return result
}

export async function applyPersistedConfig(): Promise<{ applied: boolean, count: number }> {
  const values = await loadConfigValues()
  if (!values || Object.keys(values).length === 0) return { applied: false, count: 0 }
  applyConfigValues(values)
  return { applied: true, count: Object.keys(values).length }
}
