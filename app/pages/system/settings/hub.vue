<script setup lang="ts">
import type { DeviceEnrollProgress, DeviceStatus } from '#shared/types/electron'

interface ConnectionStatus {
  runtime: string
  authProvider: string
  hubUrl: string
  appId: string
  sharedSecretConfigured: boolean
  publicKeysConfigured: number
  refreshSecretConfigured: boolean
  appSecretConfigured: boolean
  deviceEnrolled: boolean
  deviceId: string
  deviceUserId: string
  deviceExpiresAt: string
  deviceScopes: string[]
}

const MASK = '********'

const { t, locale } = useI18n()
const notify = useNotify()
const runtimeConfig = useRuntimeConfig()
const auth = useAuth()

const desktop = computed(() => Boolean(window.electronAPI?.isElectron))
const status = ref<ConnectionStatus | null>(null)
const loading = ref(true)
const saving = ref(false)
const loadFailed = ref(false)

const hubUrl = ref('')
const appId = ref('')
const sharedSecret = ref('')
const appSecret = ref('')
const clearSharedSecret = ref(false)
const clearAppSecret = ref(false)

/** P4 enrollment: the credential itself never reaches this page. */
const device = ref<DeviceStatus | null>(null)
const enrolling = ref(false)
const pendingCode = ref('')
const pendingUri = ref('')
const forgetting = ref(false)
const forgetOpen = ref(false)

const ready = computed(() => Boolean(
  status.value?.sharedSecretConfigured
  || (status.value?.publicKeysConfigured ?? 0) > 0
  || status.value?.deviceEnrolled
))
const enrolled = computed(() => Boolean(device.value?.enrolled || status.value?.deviceEnrolled))
const deviceId = computed(() => device.value?.deviceId || status.value?.deviceId || '')
const deviceScopes = computed(() => device.value?.scopes ?? status.value?.deviceScopes ?? [])
const deviceExpiresAt = computed(() => device.value?.expiresAt || status.value?.deviceExpiresAt || '')

async function loadStatus() {
  loading.value = true
  loadFailed.value = false
  try {
    const res = await $fetch<{ success: boolean, data: ConnectionStatus }>('/api/system/connection')
    status.value = res.data
    hubUrl.value = res.data.hubUrl
    appId.value = res.data.appId
  } catch {
    status.value = null
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

async function loadVault() {
  if (!desktop.value) return
  try {
    const conf = await window.electronAPI!.getConfig()
    if (conf.NUXT_PUBLIC_HUB_URL) hubUrl.value = conf.NUXT_PUBLIC_HUB_URL
    if (conf.NUXT_PUBLIC_HUB_APP_ID) appId.value = conf.NUXT_PUBLIC_HUB_APP_ID
    sharedSecret.value = conf.AUTH_JWT_SECRET ? MASK : ''
    appSecret.value = conf.NUXT_HUB_APP_SECRET ? MASK : ''
  } catch {
    notify.error(t('settings.hub.vaultUnavailable'), '')
  }
}

async function loadDevice() {
  if (!desktop.value || !window.electronAPI?.device) return
  try {
    device.value = await window.electronAPI.device.status()
  } catch {
    device.value = null
  }
}

function formatExpiry(iso: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(String(locale.value), { year: 'numeric', month: 'short', day: 'numeric' })
}

function handleProgress(progress: DeviceEnrollProgress) {
  if (progress.phase === 'pending') {
    pendingCode.value = progress.userCode || ''
    pendingUri.value = progress.verificationUri || ''
    return
  }
  if (progress.phase !== 'authorizing') {
    pendingCode.value = ''
    pendingUri.value = ''
  }
}

let stopProgress: (() => void) | null = null

onMounted(async () => {
  stopProgress = window.electronAPI?.device?.onProgress(handleProgress) ?? null
  await loadStatus()
  await loadVault()
  await loadDevice()
})

onUnmounted(() => {
  stopProgress?.()
})

/** Enrolls this device: Hub shows the approval page, a root confirms there. */
async function enrollDevice() {
  if (!window.electronAPI?.device || enrolling.value) return
  enrolling.value = true
  pendingCode.value = ''
  pendingUri.value = ''
  try {
    const result = await window.electronAPI.device.enroll(currentAccessToken())
    if (result.success) {
      notify.success(t('settings.hub.deviceEnrolled'), result.deviceId)
      await Promise.all([loadDevice(), loadStatus()])
      return
    }
    const reasons: Record<string, string> = {
      notRoot: t('settings.hub.deviceNotRoot'),
      notConfigured: t('settings.hub.deviceNotConfigured'),
      unreachable: t('settings.hub.deviceUnreachable'),
      rejected: t('settings.hub.deviceRejected'),
      denied: t('settings.hub.deviceDenied'),
      expired: t('settings.hub.deviceExpired'),
      busy: t('settings.hub.deviceBusy')
    }
    notify.error(t('settings.hub.deviceEnrollFailed'), reasons[result.code] || '')
  } catch (error) {
    notify.error(t('settings.hub.deviceEnrollFailed'), error instanceof Error ? error.message : '')
  } finally {
    enrolling.value = false
    pendingCode.value = ''
    pendingUri.value = ''
  }
}

function openApproval() {
  if (pendingUri.value) window.electronAPI?.openExternal(pendingUri.value)
}

async function forgetDevice() {
  if (!window.electronAPI?.device || forgetting.value) return
  forgetting.value = true
  try {
    const result = await window.electronAPI.device.forget(currentAccessToken())
    if (!result.success) {
      notify.error(t('settings.hub.deviceNotRoot'), '')
      return
    }
    forgetOpen.value = false
    await Promise.all([loadDevice(), loadStatus()])
    notify.success(t('settings.hub.deviceForgotten'), '')
  } catch (error) {
    notify.error(t('settings.hub.deviceForgetFailed'), error instanceof Error ? error.message : '')
  } finally {
    forgetting.value = false
  }
}

// The renderer reads hubUrl/appId from the runtime config it was STARTED with,
// so the comparison has to be against those values, not against the live server
// env (which already reflects the save).
const bakedHubUrl = String(runtimeConfig.public.hubUrl || '')
const bakedAppId = String(runtimeConfig.public.hubAppId || '')

const publicChangesPending = computed(() => {
  if (!desktop.value) return false
  return hubUrl.value.trim() !== bakedHubUrl || appId.value.trim() !== bakedAppId
})

/** The renderer's own Hub session; main verifies it before writing when the device is already configured. */
function currentAccessToken(): string {
  return auth.accessToken.value || String(useCookie('accessToken').value || '')
}

async function save() {
  if (!desktop.value) return
  saving.value = true
  try {
    const values: Record<string, string> = {
      NUXT_PUBLIC_HUB_URL: hubUrl.value.trim(),
      NUXT_PUBLIC_HUB_APP_ID: appId.value.trim()
    }
    if (clearSharedSecret.value) values.AUTH_JWT_SECRET = ''
    else if (sharedSecret.value.trim() && sharedSecret.value !== MASK) values.AUTH_JWT_SECRET = sharedSecret.value.trim()
    if (clearAppSecret.value) values.NUXT_HUB_APP_SECRET = ''
    else if (appSecret.value.trim() && appSecret.value !== MASK) values.NUXT_HUB_APP_SECRET = appSecret.value.trim()

    const result = await window.electronAPI!.setConfig(values, currentAccessToken())
    if (!result?.success) {
      if (result?.code === 'notRoot') {
        notify.error(t('settings.hub.notRoot'), '')
        return
      }
      throw new Error('set-config failed')
    }

    clearSharedSecret.value = false
    clearAppSecret.value = false
    await loadStatus()
    await loadVault()
    notify.success(t('settings.hub.saved'), result.path || '')
  } catch (error) {
    notify.error(t('settings.hub.saveFailed'), error instanceof Error ? error.message : '')
  } finally {
    saving.value = false
  }
}

function clearSecret(field: 'shared' | 'app') {
  if (field === 'shared') {
    clearSharedSecret.value = true
    sharedSecret.value = ''
  } else {
    clearAppSecret.value = true
    appSecret.value = ''
  }
}

useHead({ title: computed(() => t('settings.hub.title')) })
</script>

<template>
  <div class="space-y-4">
    <UCard>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <span class="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary/10 p-2.5 text-primary">
            <UIcon name="i-lucide-plug-zap" class="size-5" />
          </span>
          <div class="min-w-0">
            <h2 class="text-sm font-semibold text-highlighted">
              {{ t('settings.hub.title') }}
            </h2>
            <p class="text-xs text-muted">
              {{ t('settings.hub.description') }}
            </p>
          </div>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-refresh-cw"
          square
          :loading="loading"
          :aria-label="t('common.refresh')"
          @click="loadStatus"
        />
      </div>

      <USkeleton v-if="loading && !status" class="mt-4 h-24 w-full" />

      <template v-else-if="status">
        <UAlert
          class="mt-4"
          :color="ready ? 'success' : 'warning'"
          variant="subtle"
          :icon="ready ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'"
          :title="ready ? (enrolled ? t('settings.hub.statusDevice') : t('settings.hub.statusConfigured')) : t('settings.hub.statusMissing')"
          :description="ready ? (enrolled ? t('settings.hub.statusDeviceDesc') : t('settings.hub.statusConfiguredDesc')) : t('settings.hub.statusMissingDesc')"
        />

        <dl class="mt-4 grid gap-3 sm:grid-cols-3">
          <div class="panel-flat rounded-lg p-3">
            <dt class="text-xs text-muted">
              {{ t('settings.hub.runtime') }}
            </dt>
            <dd class="mt-1 truncate text-sm font-semibold text-highlighted">
              {{ status.runtime }}
            </dd>
          </div>
          <div class="panel-flat rounded-lg p-3">
            <dt class="text-xs text-muted">
              {{ t('settings.hub.appId') }}
            </dt>
            <dd class="mt-1 truncate font-mono text-sm font-semibold text-highlighted">
              {{ status.appId || '—' }}
            </dd>
          </div>
          <div class="panel-flat rounded-lg p-3">
            <dt class="text-xs text-muted">
              {{ t('settings.hub.appSecret') }}
            </dt>
            <dd
              class="mt-1 text-sm font-semibold"
              :class="status.appSecretConfigured ? 'text-success' : 'text-muted'"
            >
              {{ status.appSecretConfigured ? t('settings.configured') : t('settings.notConfigured') }}
            </dd>
          </div>
        </dl>
      </template>

      <UAlert
        v-else
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        :title="t('settings.hub.loadFailed')"
        :description="t('settings.hub.loadFailedDesc')"
      />
    </UCard>

    <UCard v-if="desktop">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-laptop-minimal-check" class="size-4 text-primary" />
          <h3 class="text-sm font-semibold">
            {{ t('settings.hub.deviceTitle') }}
          </h3>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-xs text-muted">
          {{ t('settings.hub.deviceDesc') }}
        </p>

        <template v-if="enrolled">
          <dl class="grid gap-3 sm:grid-cols-3">
            <div class="panel-flat rounded-lg p-3">
              <dt class="text-xs text-muted">
                {{ t('settings.hub.deviceId') }}
              </dt>
              <dd class="mt-1 truncate font-mono text-xs text-highlighted" :title="deviceId">
                {{ deviceId || '—' }}
              </dd>
            </div>
            <div class="panel-flat rounded-lg p-3">
              <dt class="text-xs text-muted">
                {{ t('settings.hub.deviceScopes') }}
              </dt>
              <dd class="mt-1 truncate text-sm font-semibold text-highlighted">
                {{ deviceScopes.join(', ') || '—' }}
              </dd>
            </div>
            <div class="panel-flat rounded-lg p-3">
              <dt class="text-xs text-muted">
                {{ t('settings.hub.deviceExpires') }}
              </dt>
              <dd class="mt-1 text-sm font-semibold text-highlighted">
                {{ formatExpiry(deviceExpiresAt) }}
              </dd>
            </div>
          </dl>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-xs text-muted">
              {{ t('settings.hub.deviceRootHint') }}
            </p>
            <div class="flex items-center gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-refresh-cw"
                :label="t('settings.hub.deviceReenroll')"
                :loading="enrolling"
                @click="enrollDevice"
              />
              <UButton
                color="error"
                variant="soft"
                icon="i-lucide-unplug"
                :label="t('settings.hub.deviceForget')"
                @click="forgetOpen = true"
              />
            </div>
          </div>
        </template>

        <template v-else>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-xs text-muted">
              {{ t('settings.hub.deviceNotEnrolled') }}
            </p>
            <UButton
              color="primary"
              variant="soft"
              icon="i-lucide-laptop-minimal-check"
              :label="t('settings.hub.deviceEnroll')"
              :loading="enrolling"
              @click="enrollDevice"
            />
          </div>

          <div v-if="pendingCode" class="rounded-lg border border-default p-4 text-center">
            <p class="text-xs text-muted">
              {{ t('settings.hub.deviceUserCode') }}
            </p>
            <p class="mt-1 font-mono text-2xl font-semibold tracking-widest text-highlighted">
              {{ pendingCode }}
            </p>
            <p class="mt-2 text-xs text-muted">
              {{ t('settings.hub.deviceWaiting') }}
            </p>
            <UButton
              v-if="pendingUri"
              class="mt-3"
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-external-link"
              :label="t('settings.hub.deviceOpenApproval')"
              @click="openApproval"
            />
          </div>
          <UAlert
            v-else-if="enrolling"
            color="info"
            variant="subtle"
            icon="i-lucide-loader-circle"
            :title="t('settings.hub.deviceAuthorizing')"
          />
        </template>
      </div>
    </UCard>

    <UCard v-if="desktop">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-key-round" class="size-4 text-primary" />
          <h3 class="text-sm font-semibold">
            {{ t('settings.hub.credentials') }}
          </h3>
        </div>
      </template>

      <div class="space-y-5">
        <p class="text-xs text-muted">
          {{ t('settings.hub.vaultHint') }}
        </p>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField name="hubUrl" :label="t('settings.hub.hubUrl')" :description="t('settings.hub.hubUrlDesc')">
            <UInput
              v-model="hubUrl"
              size="lg"
              class="w-full"
              placeholder="http://localhost:4000"
            />
          </UFormField>
          <UFormField name="appId" :label="t('settings.hub.appId')" :description="t('settings.hub.appIdDesc')">
            <UInput
              v-model="appId"
              size="lg"
              class="w-full"
              :placeholder="String(runtimeConfig.public.hubAppId || '')"
            />
          </UFormField>
        </div>

        <UFormField
          name="sharedSecret"
          :label="t('settings.hub.sharedSecret')"
          :description="t('settings.hub.sharedSecretDesc')"
        >
          <div class="flex items-center gap-2">
            <BasePasswordInput
              v-model="sharedSecret"
              size="lg"
              class="w-full"
              :placeholder="t('settings.hub.secretPlaceholder')"
              :disabled="clearSharedSecret"
            />
            <UButton
              v-if="status?.sharedSecretConfigured && !clearSharedSecret"
              color="neutral"
              variant="ghost"
              size="lg"
              icon="i-lucide-eraser"
              square
              :aria-label="t('settings.hub.clearSecret')"
              @click="clearSecret('shared')"
            />
          </div>
        </UFormField>

        <UFormField
          name="appSecret"
          :label="t('settings.hub.appSecret')"
          :description="t('settings.hub.appSecretDesc')"
        >
          <div class="flex items-center gap-2">
            <BasePasswordInput
              v-model="appSecret"
              size="lg"
              class="w-full"
              :placeholder="t('settings.hub.secretPlaceholder')"
              :disabled="clearAppSecret"
            />
            <UButton
              v-if="status?.appSecretConfigured && !clearAppSecret"
              color="neutral"
              variant="ghost"
              size="lg"
              icon="i-lucide-eraser"
              square
              :aria-label="t('settings.hub.clearSecret')"
              @click="clearSecret('app')"
            />
          </div>
        </UFormField>

        <UAlert
          v-if="publicChangesPending"
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          :title="t('settings.hub.restartRequired')"
          :description="t('settings.hub.restartRequiredDesc')"
        />

        <UAlert
          v-if="clearSharedSecret || clearAppSecret"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('settings.hub.clearPending')"
          :description="t('settings.hub.clearPendingDesc')"
        />
      </div>

      <template #footer>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-muted">
            {{ t('settings.hub.secretsApplyImmediately') }}
          </p>
          <UButton
            color="primary"
            variant="soft"
            icon="i-lucide-save"
            :label="t('settings.hub.save')"
            :loading="saving"
            @click="save"
          />
        </div>
      </template>
    </UCard>

    <UCard v-else>
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-server" class="mt-0.5 size-5 shrink-0 text-primary" />
        <div class="space-y-1">
          <h3 class="text-sm font-semibold text-highlighted">
            {{ t('settings.hub.webTitle') }}
          </h3>
          <p class="text-xs text-muted">
            {{ t('settings.hub.webDesc') }}
          </p>
          <p class="font-mono text-xs text-muted">
            AUTH_JWT_SECRET · NUXT_HUB_APP_SECRET · NUXT_PUBLIC_HUB_URL · NUXT_PUBLIC_HUB_APP_ID
          </p>
        </div>
      </div>
    </UCard>

    <BaseConfirmModal
      v-model:open="forgetOpen"
      :title="t('settings.hub.deviceForgetTitle')"
      :description="t('settings.hub.deviceForgetDesc')"
      color="error"
      icon="i-lucide-unplug"
      :confirm-label="t('settings.hub.deviceForget')"
      :loading="forgetting"
      @confirm="forgetDevice"
    />
  </div>
</template>
