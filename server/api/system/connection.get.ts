import { config } from '#server/config'
import { requireRootAuth } from '#server/utils/authz'
import { getHubPublicKeys } from '#server/utils/jwt'
import { detectRuntime } from '#server/modules/document/runtime'

/**
 * Full connection diagnostics. Root only: these are the device's
 * administrative settings, and the UI that renders them is itself root-only.
 * Public callers get `/api/system/connection/status`, which answers with
 * runtime and a single configured boolean — never an identifier, never a
 * credential.
 */
export default defineEventHandler((event) => {
  requireRootAuth(event)

  const runtime = useRuntimeConfig(event)
  return {
    success: true,
    data: {
      runtime: detectRuntime(),
      authProvider: config.auth.provider,
      hubUrl: config.hub.url || String(runtime.public.hubUrl || ''),
      appId: config.hub.appId || String(runtime.public.hubAppId || ''),
      sharedSecretConfigured: Boolean(config.auth.accessTokenSecret),
      publicKeysConfigured: getHubPublicKeys().length,
      refreshSecretConfigured: Boolean(config.auth.refreshTokenSecret),
      appSecretConfigured: Boolean(config.hub.appSecret),
      // P4: device identity is metadata only; the secret itself never leaves
      // the main-process vault or the local server's process.env.
      deviceEnrolled: Boolean(config.hub.deviceId && config.hub.deviceSecret),
      deviceId: config.hub.deviceId,
      deviceUserId: config.hub.deviceUserId,
      deviceExpiresAt: config.hub.deviceExpiresAt,
      deviceScopes: config.hub.deviceScopes
    }
  }
})
