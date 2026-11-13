import type { H3Event } from 'h3'
import { config } from '#server/config'
import { credentialBelongsTo, normalizeOrigin } from '#shared/utils/deviceCredentialScope'

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

/**
 * Why the stored credential is not being used. `null` when it is.
 * A caller needs this to tell "re-enroll this device on this Hub" apart from
 * "this Hub refused a credential it issued", which is a different fix.
 */
export type HubCredentialIssue
  = | 'hub-mismatch'
    | 'app-mismatch'
    | 'legacy-no-origin'
    | 'incomplete-pair'
    | null

export interface HubCallerResolution {
  caller: HubCaller | null
  issue: HubCredentialIssue
  /** Origin the credential was issued by, for the re-enroll copy. */
  storedOrigin: string
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

/**
 * The full resolution, including why a stored credential was refused. The
 * credential is scoped to one Hub: sending a credential issued by another Hub
 * (a local database, then Production) can only produce 401, and that answer
 * would be misreported as an expired session.
 */
export function resolveHubCallerDetailed(event?: H3Event): HubCallerResolution {
  const settings = hubSettings(event)
  const empty: HubCallerResolution = { caller: null, issue: null, storedOrigin: '' }
  if (!settings.url) return empty

  const deviceId = config.hub.deviceId.trim()
  const deviceSecret = config.hub.deviceSecret.trim()

  // Half a credential is a broken state, not "no device": falling through to the
  // App Secret would silently downgrade a desktop out of its device identity.
  // Fail closed and say which half is missing.
  if (Boolean(deviceId) !== Boolean(deviceSecret)) {
    return { caller: null, issue: 'incomplete-pair', storedOrigin: '' }
  }

  if (deviceId && deviceSecret) {
    const storedOrigin = config.hub.deviceHubOrigin.trim()
    const storedAppId = (config.hub.deviceAppId || '').trim()
    const targetAppId = settings.appId || storedAppId

    if (!credentialBelongsTo(
      { deviceId, secret: deviceSecret, hubOrigin: storedOrigin, appId: storedAppId },
      { hubUrl: settings.url, appId: targetAppId }
    )) {
      const issue: HubCredentialIssue = !storedOrigin
        ? 'legacy-no-origin'
        : normalizeOrigin(storedOrigin) !== normalizeOrigin(settings.url)
          ? 'hub-mismatch'
          : 'app-mismatch'
      return { caller: null, issue, storedOrigin }
    }

    return {
      caller: {
        kind: 'device',
        appId: storedAppId,
        userId: config.hub.deviceUserId || null,
        headers: { 'X-Device-Id': deviceId, 'X-Device-Secret': deviceSecret }
      },
      issue: null,
      storedOrigin
    }
  }

  if (!settings.appId || !settings.appSecret) return empty
  return {
    caller: {
      kind: 'app',
      appId: settings.appId,
      userId: null,
      headers: { 'X-App-Id': settings.appId, 'X-App-Secret': settings.appSecret }
    },
    issue: null,
    storedOrigin: ''
  }
}

export function resolveHubCaller(event?: H3Event): HubCaller | null {
  return resolveHubCallerDetailed(event).caller
}

/**
 * A device credential may only touch its enrolling user's namespace (Hub
 * enforces this too); the app identity keeps whatever the deployment chose.
 */
export function hubStorageNamespace(fallback: string, event?: H3Event): string {
  const caller = resolveHubCaller(event)
  return caller?.kind === 'device' && caller.userId ? `users/${caller.userId}` : fallback
}
