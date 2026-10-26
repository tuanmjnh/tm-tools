// =============================================================================
// Saved Provider Profiles (Roadmap v1 §8, P8)
// =============================================================================
// User-specific provider connection profiles: baseUrl, defaultModel, custom
// models, options — saved with a display name so they can be reused across
// sessions without re-entering credentials. Profiles are stored in
// localStorage (renderer) and synced to TM Hub when online.
// =============================================================================

import { ref, watch } from 'vue'
import type { ProviderConnection } from '~/types/providerAdapter'

const STORAGE_KEY = 'tmcut.providerProfiles'

export interface ProviderProfile {
  profileId: string
  displayName: string
  providerKey: string
  baseUrl: string
  defaultModel: string
  customModels?: string[]
  options?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

function generateId(): string {
  return `prof_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function loadProfiles(): ProviderProfile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveProfiles(profiles: ProviderProfile[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  } catch {
    // Quota exceeded or other error — silently fail.
  }
}

const profiles = ref<ProviderProfile[]>(loadProfiles())

watch(profiles, (value) => saveProfiles(value), { deep: true })

/** Create a new provider profile from a ProviderConnection-like input. */
export function createProviderProfile(input: {
  displayName: string
  providerKey: string
  baseUrl: string
  defaultModel: string
  customModels?: string[]
  options?: Record<string, unknown>
}): ProviderProfile {
  const now = new Date().toISOString()
  return {
    profileId: generateId(),
    displayName: input.displayName,
    providerKey: input.providerKey,
    baseUrl: input.baseUrl,
    defaultModel: input.defaultModel,
    customModels: input.customModels,
    options: input.options,
    createdAt: now,
    updatedAt: now
  }
}

/** Update an existing profile (partial). */
export function updateProviderProfile(
  profileId: string,
  patch: Partial<Omit<ProviderProfile, 'profileId' | 'createdAt'>>
): ProviderProfile | null {
  const idx = profiles.value.findIndex(p => p.profileId === profileId)
  if (idx === -1) return null
  const current = profiles.value[idx]!
  const updated: ProviderProfile = {
    profileId: current.profileId,
    createdAt: current.createdAt,
    displayName: patch.displayName ?? current.displayName,
    providerKey: patch.providerKey ?? current.providerKey,
    baseUrl: patch.baseUrl ?? current.baseUrl,
    defaultModel: patch.defaultModel ?? current.defaultModel,
    customModels: patch.customModels ?? current.customModels,
    options: patch.options ?? current.options,
    updatedAt: new Date().toISOString()
  }
  profiles.value[idx] = updated
  return updated
}

/** Delete a profile. */
export function deleteProviderProfile(profileId: string): boolean {
  const idx = profiles.value.findIndex(p => p.profileId === profileId)
  if (idx === -1) return false
  profiles.value.splice(idx, 1)
  return true
}

/** Get all profiles, optionally filtered by providerKey. */
export function getProviderProfiles(providerKey?: string): ProviderProfile[] {
  if (!providerKey) return profiles.value
  return profiles.value.filter(p => p.providerKey === providerKey)
}

/** Get a single profile by ID. */
export function getProviderProfile(profileId: string): ProviderProfile | undefined {
  return profiles.value.find(p => p.profileId === profileId)
}

/** Convert a ProviderProfile to a ProviderConnection for the main process. */
export function profileToConnection(profile: ProviderProfile, userId: string): ProviderConnection {
  return {
    connectionId: profile.profileId,
    userId,
    providerKey: profile.providerKey,
    displayName: profile.displayName,
    baseUrl: profile.baseUrl,
    encryptedApiKey: '',
    defaultModel: profile.defaultModel,
    customModels: profile.customModels,
    enabled: true,
    capabilities: {
      providerKey: profile.providerKey,
      displayName: profile.displayName,
      supportedTasks: ['video-gen'],
      supportedModels: [{ modelId: profile.defaultModel, displayName: profile.defaultModel, capabilities: ['video-gen'], maxResolution: { width: 1920, height: 1080 }, maxDurationSec: 10, costPerUnit: { type: 'per-second', amountUsd: 0.05, currency: 'USD' }, isDefault: true, isDeprecated: false }],
      maxConcurrency: 2,
      rateLimitPerMinute: 30,
      supportsWebhook: false,
      supportsCancel: true,
      supportsSeed: false,
      supportsNegativePrompt: false,
      supportedResolutions: [{ width: 1920, height: 1080, label: '1080p' }],
      supportedAspectRatios: ['9:16', '16:9', '1:1'],
      supportedDurations: { minSec: 1, maxSec: 10, stepSec: 1 },
      pricingModel: { type: 'pay-per-use', currency: 'USD', estimatedCostPerSecondUsd: 0.05 },
      regionAvailability: ['global'],
      termsOfServiceUrl: '',
      privacyPolicyUrl: ''
    },
    rateLimitRemaining: undefined,
    rateLimitResetAt: undefined,
    billingStatus: 'active',
    usageThisMonth: { costUsd: 0, requests: 0 },
    lastHealthCheck: undefined,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  }
}

export function useProviderProfiles() {
  return {
    profiles,
    createProviderProfile,
    updateProviderProfile,
    deleteProviderProfile,
    getProviderProfiles,
    getProviderProfile,
    profileToConnection
  }
}