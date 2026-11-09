import { config } from '#server/config'
import { detectRuntime } from '#server/modules/document/runtime'

/**
 * Setup diagnostics for the desktop Hub-connection page. Public by necessity:
 * before the shared secret exists there is no session to authenticate with.
 * It answers with booleans and the two PUBLIC identifiers only — never a key,
 * a token or a connection string.
 */
export default defineEventHandler((event) => {
  const runtime = useRuntimeConfig(event)
  return {
    success: true,
    data: {
      runtime: detectRuntime(),
      authProvider: config.auth.provider,
      hubUrl: config.hub.url || String(runtime.public.hubUrl || ''),
      appId: config.hub.appId || String(runtime.public.hubAppId || ''),
      sharedSecretConfigured: Boolean(config.auth.accessTokenSecret),
      refreshSecretConfigured: Boolean(config.auth.refreshTokenSecret),
      appSecretConfigured: Boolean(config.hub.appSecret)
    }
  }
})
