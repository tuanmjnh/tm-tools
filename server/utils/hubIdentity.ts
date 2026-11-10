import type { H3Event } from 'h3'
import { config } from '#server/config'

/**
 * Which identity this server presents to TM Hub.
 *
 * An enrolled device (P4) wins over the legacy App Secret: the credential is
 * scoped to one app and one user, expiring and revocable, and it is the only
 * identity a public build can hold. App Secret stays supported for
 * server-to-server deployments that enroll nothing.
 */
export interface HubCaller {
  kind: 'device' | 'app'
  appId: string
  userId: string | null
  headers: Record<string, string>
}

interface HubRuntimeConfig {
  public?: { hubUrl?: string, hubAppId?: string }
  hubAppSecret?: string
}

/**
 * Deployment values with the runtime-config fallback the relay and gateway
 * always had. `config.hub` reads process.env per call, so a credential saved
 * from the desktop settings applies without a restart; the runtime snapshot
 * only covers values the process started with.
 */
function hubSettings(event?: H3Event): { url: string, appId: string, appSecret: string } {
  let runtime: HubRuntimeConfig = {}
  try {
    runtime = useRuntimeConfig(event) as unknown as HubRuntimeConfig
  } catch {
    // No Nuxt runtime context (unit tests, plain Node): fall back to config.
  }
  return {
    url: String(config.hub.url || runtime.public?.hubUrl || '').trim().replace(/\/+$/, ''),
    appId: String(config.hub.appId || runtime.public?.hubAppId || '').trim(),
    appSecret: String(config.hub.appSecret || runtime.hubAppSecret || '').trim()
  }
}

export function hubBaseUrl(event?: H3Event): string {
  return hubSettings(event).url
}

export function resolveHubCaller(event?: H3Event): HubCaller | null {
  const settings = hubSettings(event)
  if (!settings.url) return null

  const deviceId = config.hub.deviceId.trim()
  const deviceSecret = config.hub.deviceSecret.trim()
  if (deviceId && deviceSecret) {
    // The credential is bound to the app that was enrolled; a later App ID
    // edit must not silently point it at a different satellite.
    const appId = (config.hub.deviceAppId || settings.appId).trim()
    if (!appId) return null
    return {
      kind: 'device',
      appId,
      userId: config.hub.deviceUserId || null,
      headers: { 'X-Device-Id': deviceId, 'X-Device-Secret': deviceSecret }
    }
  }

  if (!settings.appId || !settings.appSecret) return null
  return {
    kind: 'app',
    appId: settings.appId,
    userId: null,
    headers: { 'X-App-Id': settings.appId, 'X-App-Secret': settings.appSecret }
  }
}

/**
 * A device credential may only touch its enrolling user's namespace (Hub
 * enforces this too); the app identity keeps whatever the deployment chose.
 */
export function hubStorageNamespace(fallback: string, event?: H3Event): string {
  const caller = resolveHubCaller(event)
  return caller?.kind === 'device' && caller.userId ? `users/${caller.userId}` : fallback
}
