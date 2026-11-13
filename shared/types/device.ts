/**
 * Client-side mirror of the Hub device identity contract (v2).
 *
 * These fields are the request payload for `POST /api/v1/auth/login` and the
 * others that create a session. They are metadata only — never a credential.
 */
export type HubDeviceIdentityKind = 'electron-machine' | 'electron-installation' | 'browser-profile'

export type HubDeviceType = 'web' | 'mobile' | 'tablet' | 'desktop' | 'tv' | 'wearable' | 'cli' | 'other'

export type HubDevicePlatform = 'web' | 'desktop' | 'mobile'

export interface HubDeviceInfo {
  deviceId: string
  identityKind: HubDeviceIdentityKind
  deviceType: HubDeviceType
  platform: HubDevicePlatform
  deviceName?: string
  osPlatform?: string
  arch?: string
  appVersion?: string
}

/** Credential metadata the renderer may see. The secret never crosses IPC. */
export interface HubDeviceCredentialMeta {
  deviceId: string
  expiresAt: string
  scopes: string[]
}

export type HubDeviceStatus = 'active' | 'pending' | 'blocked' | 'revoked'

/** One row of the user's device registry (`/api/v1/auth/user-devices`). */
export interface HubDeviceView {
  id: string
  deviceId: string
  identityKind: HubDeviceIdentityKind
  deviceType: HubDeviceType
  platform: string
  deviceName: string | null
  osPlatform: string | null
  arch: string | null
  appVersion: string | null
  status: HubDeviceStatus
  firstSeenAt: string
  lastSeenAt: string
  lastIp: string | null
  isCurrent?: boolean
}

/** How a device-auth IPC call ends. `rejected` carries the Hub status message. */
export type HubAuthFailureCode = 'notConfigured' | 'unreachable' | 'rejected' | 'invalidRequest' | 'untrusted'
