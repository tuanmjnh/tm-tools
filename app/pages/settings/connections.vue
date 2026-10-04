<script setup lang="ts">
import type { HubConnectionProvider, HubConnectionTestResult } from 'tm-hub-client'
import { getErrorMessage } from '~/shared/utils/errors'

type ConnectionProvider = HubConnectionProvider & { quick?: boolean }

definePageMeta({
  middleware: () => {
    if (import.meta.client) {
      const a = useAuth()
      if (!a.isAuthenticated.value) return navigateTo('/login')
    }
  }
})

const { t } = useI18n()
const toast = useToast()
const { appId, connections } = useHub()

const loading = ref(false)
const providers = ref<ConnectionProvider[]>([])
const testingKey = ref('')
const quickingKey = ref('')

const isManualOpen = ref(false)
const manualSaving = ref(false)
const manualProvider = ref<ConnectionProvider | null>(null)
const manualValues = ref<Record<string, string>>({})

const isDisconnectOpen = ref(false)
const disconnectProvider = ref<ConnectionProvider | null>(null)

const isConnected = (p: ConnectionProvider) => !!p.connection && p.connection.status === 'connected'
const hasRow = (p: ConnectionProvider) => !!p.connection
const statusLabel = (p: ConnectionProvider) => {
  if (!p.connection) return t('connections.not_connected')
  return p.connection.status === 'connected' ? t('connections.connected') : t('common.error')
}
function cleanVal(v: unknown): string {
  let s = String(v ?? '').trim()
  while ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    if (s.length < 2) break
    s = s.slice(1, -1).trim()
  }
  return s
}

const accountOf = (p: ConnectionProvider) => {
  const cfg = p.connection?.config || {}
  return cleanVal(cfg.email || cfg.CLOUDINARY_CLOUD_NAME || p.connection?.label || '')
}

function showTestFail(res: HubConnectionTestResult | undefined) {
  toast.add({
    title: res?.message ? `${t('connections.test_fail')}: ${res.message}` : t('connections.test_fail'),
    color: 'error'
  })
}

async function refresh() {
  loading.value = true
  try {
    const res = await connections.list(appId)
    providers.value = res.data || []
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    loading.value = false
  }
}

async function connectOAuth(p: ConnectionProvider) {
  const popup = window.open('', 'tmhub-oauth', 'width=540,height=680,noopener=no')
  if (!popup) {
    toast.add({ title: t('connections.popup_blocked'), color: 'error' })
    return
  }
  try {
    const res = await connections.oauthStart(p.key, appId)
    if (popup.closed) return
    popup.location.href = res.data?.authUrl || ''
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
    try {
      popup.close()
    } catch { /* ignore */ }
  }
}

function onOAuthMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) return
  const data = event.data as { type?: string, status?: string, reason?: string } | null
  if (!data || data.type !== 'tm-hub-oauth') return
  if (data.status === 'connected') {
    toast.add({ title: t('connections.saved'), icon: 'i-lucide-check', color: 'success' })
    refresh()
  } else {
    toast.add({ title: data.reason || t('connections.test_fail'), color: 'error' })
    refresh()
  }
}

onMounted(() => {
  window.addEventListener('message', onOAuthMessage)
  refresh()
})
onUnmounted(() => window.removeEventListener('message', onOAuthMessage))

function openManual(p: ConnectionProvider) {
  manualProvider.value = p
  const values: Record<string, string> = {}
  for (const field of p.fields || []) {
    if (field.type !== 'password') values[field.key] = cleanVal(p.connection?.config?.[field.key] || '')
    else values[field.key] = ''
  }
  manualValues.value = values
  isManualOpen.value = true
}

async function saveManual() {
  const p = manualProvider.value
  if (!p) return
  manualSaving.value = true
  try {
    const cleanedValues: Record<string, string> = {}
    for (const [k, v] of Object.entries(manualValues.value)) {
      cleanedValues[k] = cleanVal(v)
    }
    const res = await connections.saveManual(p.key, cleanedValues, appId)
    if (res.data?.test?.ok) toast.add({ title: t('connections.saved'), icon: 'i-lucide-check', color: 'success' })
    else showTestFail(res.data?.test)
    isManualOpen.value = false
    refresh()
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    manualSaving.value = false
  }
}

async function quickConnect(p: ConnectionProvider) {
  quickingKey.value = p.key
  try {
    const res = await connections.quick(p.key, appId)
    if (res.data?.test?.ok) toast.add({ title: t('connections.saved'), icon: 'i-lucide-check', color: 'success' })
    else showTestFail(res.data?.test)
    refresh()
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    quickingKey.value = ''
  }
}

async function testConnection(p: ConnectionProvider) {
  testingKey.value = p.key
  try {
    const res = await connections.test(p.key, appId)
    if (res.data?.ok) toast.add({ title: t('connections.test_ok'), icon: 'i-lucide-check', color: 'success' })
    else showTestFail(res.data)
    refresh()
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    testingKey.value = ''
  }
}

function askDisconnect(p: ConnectionProvider) {
  disconnectProvider.value = p
  isDisconnectOpen.value = true
}

async function doDisconnect() {
  const p = disconnectProvider.value
  if (!p) return
  try {
    await connections.disconnect(p.key, appId)
    toast.add({ title: t('connections.disconnected'), icon: 'i-lucide-check', color: 'success' })
    isDisconnectOpen.value = false
    refresh()
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  }
}
</script>

<template>
  <BasePage id="settings-connections" :title="$t('connections.title')">
    <template #right>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="soft"
        size="sm"
        :loading="loading"
        @click="refresh()"
      />
    </template>

    <template #default>
      <div class="flex flex-col gap-4 pb-6">
        <p class="text-sm text-muted">
          {{ $t('connections.description') }}
        </p>

        <div v-if="loading && !providers.length" class="flex items-center justify-center py-20">
          <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
        </div>

        <div
          v-else-if="!providers.length"
          class="flex flex-col items-center justify-center gap-2 py-16 text-center"
        >
          <UIcon name="i-lucide-plug" class="size-10 text-muted" />
          <p class="text-sm text-muted">
            {{ $t('connections.empty') }}
          </p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div
            v-for="p in providers"
            :key="p.key"
            class="rounded-xl border border-primary/30 p-4 flex flex-col gap-3 shadow-xs"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex items-center justify-center size-10 rounded-lg bg-elevated/50 shrink-0">
                  <UIcon :name="p.icon" class="size-6" />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-highlighted truncate">{{ p.name }}</span>
                    <UBadge
                      :label="p.mode === 'oauth' ? t('connections.mode_oauth') : t('connections.mode_manual')"
                      variant="subtle"
                      size="xs"
                    />
                  </div>
                  <p class="text-xs text-muted truncate">
                    {{ p.description }}
                  </p>
                </div>
              </div>
              <UBadge
                :label="statusLabel(p)"
                :color="p.connection ? (isConnected(p) ? 'success' : 'error') : 'neutral'"
                variant="subtle"
                size="sm"
                class="shrink-0"
              />
            </div>

            <div v-if="hasRow(p)" class="text-xs text-muted space-y-1">
              <p v-if="accountOf(p)">
                <span class="text-toned">{{ t('connections.account') }}: </span>
                <span class="text-highlighted">{{ accountOf(p) }}</span>
              </p>
              <p>
                <span class="text-toned">{{ t('connections.last_test') }}: </span>
                <span :class="p.connection?.lastTestOk === false ? 'text-error' : 'text-highlighted'">
                  {{
                    p.connection?.lastTestAt
                      ? new Date(p.connection.lastTestAt).toLocaleString()
                      : t('connections.never')
                  }}
                  <template v-if="p.connection?.lastTestOk === false"> ({{ t('connections.test_fail') }})</template>
                </span>
              </p>
            </div>

            <p v-if="p.mode === 'oauth' && p.scopes?.length" class="text-xs text-muted flex items-center gap-1 flex-wrap">
              <span class="text-toned">{{ t('connections.scopes') }}:</span>
              <UPopover :content="{ align: 'start', side: 'bottom', sideOffset: 8 }">
                <UButton
                  color="neutral"
                  variant="subtle"
                  size="xs"
                  icon="i-lucide-shield-check"
                  :label="String(p.scopes.length)"
                />
                <template #content>
                  <div class="p-3 max-w-80 space-y-2">
                    <p class="text-xs font-semibold text-highlighted">
                      {{ t('connections.scopes') }}
                    </p>
                    <ul class="space-y-1.5">
                      <li v-for="s in p.scopes" :key="s" class="flex items-start gap-1.5 text-xs text-muted">
                        <UIcon name="i-lucide-check" class="size-3.5 mt-0.5 text-success shrink-0" />
                        <span class="font-mono break-all">{{ s }}</span>
                      </li>
                    </ul>
                  </div>
                </template>
              </UPopover>
            </p>

            <div class="flex items-center gap-2 mt-auto pt-1 flex-wrap">
              <UButton
                v-if="p.mode === 'oauth' && !isConnected(p)"
                :label="t('connections.connect')"
                icon="i-lucide-external-link"
                color="primary"
                variant="soft"
                size="sm"
                @click="connectOAuth(p)"
              />
              <UButton
                v-if="p.mode === 'oauth' && isConnected(p)"
                :label="t('connections.reconnect')"
                icon="i-lucide-refresh-cw"
                color="warning"
                variant="soft"
                size="sm"
                @click="connectOAuth(p)"
              />
              <UButton
                v-if="p.quick && !isConnected(p)"
                :label="t('connections.quick_connect')"
                icon="i-lucide-zap"
                color="primary"
                variant="soft"
                size="sm"
                :loading="quickingKey === p.key"
                @click="quickConnect(p)"
              />
              <UButton
                v-if="p.mode === 'manual'"
                :label="hasRow(p) ? t('connections.configure') : t('connections.connect')"
                icon="i-lucide-key-round"
                color="primary"
                variant="soft"
                size="sm"
                @click="openManual(p)"
              />
              <UButton
                v-if="hasRow(p)"
                :label="t('connections.test')"
                icon="i-lucide-activity"
                :loading="testingKey === p.key"
                color="success"
                variant="soft"
                size="sm"
                @click="testConnection(p)"
              />
              <UButton
                v-if="hasRow(p)"
                :label="t('connections.disconnect')"
                icon="i-lucide-unplug"
                color="error"
                variant="soft"
                size="sm"
                @click="askDisconnect(p)"
              />
            </div>
          </div>
        </div>
      </div>

      <BaseFormModal
        v-model:open="isManualOpen"
        :title="`${t('connections.configure')} - ${manualProvider?.name || ''}`"
        :state="manualValues"
        :loading="manualSaving"
        :submit-label="t('global.save')"
        @submit="saveManual"
      >
        <UFormField
          v-for="field in manualProvider?.fields"
          :key="field.key"
          :label="field.label"
          :required="field.required"
          class="mb-3"
        >
          <UInput
            v-model="manualValues[field.key]"
            :type="field.type === 'password' ? 'password' : 'text'"
            class="w-full"
            :placeholder="field.type === 'password' ? '••••••••' : field.label"
            autocomplete="off"
          />
        </UFormField>
      </BaseFormModal>

      <LazyBaseConfirmModal
        v-model:open="isDisconnectOpen"
        :title="t('connections.disconnect_title')"
        :description="t('connections.disconnect_desc', [disconnectProvider?.name || ''])"
        :confirm-label="t('connections.disconnect')"
        :cancel-label="t('common.cancel')"
        color="error"
        icon="i-lucide-unplug"
        @confirm="doDisconnect"
      />
    </template>
  </BasePage>
</template>
