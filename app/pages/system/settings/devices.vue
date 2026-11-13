<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { HubDeviceView } from '#shared/types/device'
import { browserDeviceInfo } from '~/shared/utils/deviceIdentity'
import { getErrorMessage } from '~/shared/utils/errors'
import { formatDate } from '~/shared/utils/helper'

const { t } = useI18n()
const notify = useNotify()
const { hubFetch } = useHub()

const devices = ref<HubDeviceView[]>([])
const loading = ref(true)
const busyId = ref('')

const currentDeviceId = ref('')

// The current identity comes from the same source that authenticated this
// session: Main in Electron, localStorage UUID on the web.
async function resolveCurrentDeviceId(): Promise<string> {
  if (import.meta.client && window.electronAPI?.deviceAuth) {
    const info = await window.electronAPI.deviceAuth.info()
    return info?.deviceId || ''
  }
  return import.meta.client ? browserDeviceInfo().deviceId : ''
}

async function load() {
  loading.value = true
  try {
    currentDeviceId.value = await resolveCurrentDeviceId()
    const res = await hubFetch<{ success: boolean, data: HubDeviceView[] }>('/api/v1/auth/user-devices', {
      query: currentDeviceId.value ? { currentDeviceId: currentDeviceId.value } : undefined
    })
    devices.value = res.data || []
  } catch (err) {
    notify.error(getErrorMessage(err, key => t(key)))
  } finally {
    loading.value = false
  }
}

onMounted(load)

const isRenameOpen = ref(false)
const renameTarget = ref<HubDeviceView | null>(null)
const renameValue = ref('')
const renaming = ref(false)

function openRename(device: HubDeviceView) {
  renameTarget.value = device
  renameValue.value = device.deviceName || ''
  isRenameOpen.value = true
}

async function confirmRename() {
  if (!renameTarget.value) return
  const name = renameValue.value.trim()
  if (!name) return
  renaming.value = true
  try {
    await hubFetch(`/api/v1/auth/user-devices/${encodeURIComponent(renameTarget.value.deviceId)}`, {
      method: 'PATCH',
      body: { deviceName: name }
    })
    renameTarget.value.deviceName = name
    notify.success(t('devices.renamedToast'))
    isRenameOpen.value = false
  } catch (err) {
    notify.error(getErrorMessage(err, key => t(key)))
  } finally {
    renaming.value = false
  }
}

const isRevokeOpen = ref(false)
const revokeTarget = ref<HubDeviceView | null>(null)
const revoking = ref(false)

function openRevoke(device: HubDeviceView) {
  revokeTarget.value = device
  isRevokeOpen.value = true
}

async function confirmRevoke() {
  if (!revokeTarget.value) return
  const target = revokeTarget.value
  revoking.value = true
  try {
    await hubFetch(`/api/v1/auth/user-devices/${encodeURIComponent(target.deviceId)}`, {
      method: 'DELETE',
      // The Hub refuses a device revoking itself; naming the current device
      // keeps the guard server-side instead of trusting this UI.
      query: currentDeviceId.value ? { currentDeviceId: currentDeviceId.value } : undefined
    })
    devices.value = devices.value.filter(d => d.id !== target.id)
    isRevokeOpen.value = false
    notify.success(t('devices.revokedToast'))

    // Revoking this device kills its sessions too, so a current-device revoke
    // cannot leave a live UI behind.
    if (target.isCurrent) {
      const auth = useAuth()
      await auth.logout()
      await navigateTo('/login')
    }
  } catch (err) {
    notify.error(getErrorMessage(err, key => t(key)))
  } finally {
    revoking.value = false
  }
}

const statusColor = (status: HubDeviceView['status']) => {
  if (status === 'active') return 'success' as const
  if (status === 'pending') return 'warning' as const
  if (status === 'blocked') return 'error' as const
  return 'neutral' as const
}

/**
 * The current device may be renamed but never revoked: revocation has no
 * self-service undo, so pressing it here would lock this account out for good.
 * Signing out is the reversible action for the device in hand.
 */
const deviceActions = (device: HubDeviceView): DropdownMenuItem[] => {
  const items: DropdownMenuItem[] = [
    {
      label: t('devices.rename'),
      icon: 'i-lucide-pencil',
      onSelect: () => openRename(device)
    }
  ]
  if (!device.isCurrent && device.status !== 'revoked') {
    items.push({ type: 'separator' })
    items.push({
      label: t('devices.revoke'),
      icon: 'i-lucide-ban',
      color: 'error' as const,
      onSelect: () => openRevoke(device)
    })
  }
  return items
}

const mobileBar = useMobileBar()
mobileBar.registerActions(computed(() => [
  { icon: 'i-lucide-refresh-cw', label: t('common.refresh'), onSelect: () => load() }
]))
mobileBar.registerInfo(computed(() => ({ count: devices.value.length, loading: loading.value })))

useHead({ title: computed(() => t('devices.myTitle')) })

// `formatDate` keeps timestamps consistent with the Sessions page.
const describe = (device: HubDeviceView): string =>
  [device.osPlatform, device.arch, device.appVersion].filter(Boolean).join(' · ')
</script>

<template>
  <BaseSettingsPage id="settings-devices" :title="t('devices.myTitle')" :description="t('devices.myDescription')">
    <template #right>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="soft"
        size="sm"
        square
        :loading="loading"
        :aria-label="t('common.refresh')"
        @click="load"
      />
    </template>

    <UCard class="mb-24 lg:mb-0">
      <div v-if="loading && devices.length === 0" class="space-y-3">
        <USkeleton v-for="i in 3" :key="i" class="h-16 w-full rounded-lg" />
      </div>

      <UEmpty
        v-else-if="devices.length === 0"
        icon="i-lucide-laptop-minimal"
        size="sm"
        :title="t('devices.myEmpty')"
      />

      <ul v-else class="divide-y divide-default">
        <li v-for="device in devices" :key="device.id" class="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
          <span
            class="inline-flex shrink-0 items-center justify-center rounded-lg p-2"
            :class="device.isCurrent ? 'bg-primary/10 text-primary' : 'bg-elevated text-muted'"
          >
            <UIcon
              :name="device.deviceType === 'desktop' ? 'i-lucide-monitor' : 'i-lucide-smartphone'"
              class="size-5"
            />
          </span>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate text-sm font-medium text-highlighted">
                {{ device.deviceName || device.deviceId.slice(0, 12) }}
              </span>
              <UBadge
                v-if="device.isCurrent"
                :label="t('devices.current')"
                color="primary"
                variant="subtle"
                size="xs"
              />
              <UBadge
                :label="t(`devices.status.${device.status}`)"
                :color="statusColor(device.status)"
                variant="subtle"
                size="xs"
              />
            </div>
            <p v-if="describe(device)" class="truncate text-xs text-muted">
              {{ describe(device) }}
            </p>
            <p class="truncate font-mono text-[11px] text-dimmed" :title="device.deviceId">
              {{ device.deviceId.slice(0, 24) }} ·
              {{ t('devices.lastSeen') }} {{ formatDate(device.lastSeenAt) }}
              <template v-if="device.lastIp">
                · {{ device.lastIp }}
              </template>
            </p>
            <p v-if="device.isCurrent" class="mt-1 text-[11px] text-muted">
              {{ t('devices.currentCannotRevoke') }}
            </p>
          </div>

          <UDropdownMenu :items="deviceActions(device)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="busyId === device.id"
              :aria-label="t('common.actions')"
            />
          </UDropdownMenu>
        </li>
      </ul>
    </UCard>

    <UModal v-model:open="isRenameOpen" :title="t('devices.renameTitle')">
      <template #body>
        <UFormField :label="t('devices.name')">
          <UInput v-model="renameValue" :maxlength="120" autofocus />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="isRenameOpen = false"
          />
          <UButton
            :label="t('common.save')"
            :loading="renaming"
            :disabled="!renameValue.trim()"
            @click="confirmRename"
          />
        </div>
      </template>
    </UModal>

    <BaseConfirmModal
      v-model:open="isRevokeOpen"
      :title="t('devices.revokeTitle')"
      :description="t('devices.revokeDesc')"
      :confirm-label="t('devices.revoke')"
      :cancel-label="t('common.cancel')"
      color="error"
      icon="i-lucide-ban"
      :loading="revoking"
      @confirm="confirmRevoke"
    />
  </BaseSettingsPage>
</template>
