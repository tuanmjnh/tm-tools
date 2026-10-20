<script setup lang="ts">
import type { HubConnectionProvider, HubConnectionTestResult } from 'tm-hub-client'
import { useHubAi } from '~/composables/useHubAi'
import { getErrorMessage } from '~/shared/utils/errors'

type ConnectionProvider = HubConnectionProvider & { quick?: boolean, ai?: boolean, category?: string, connections?: HubConnectionProvider['connection'][] }

definePageMeta({
  middleware: () => {
    if (import.meta.client) {
      const a = useAuth()
      if (!a.isAuthenticated.value) return navigateTo('/login')
    }
  },
  alias: ['/system/connections', '/settings/connections']
})

const { t } = useI18n()
const toast = useToast()
const { appId, connections, hubUrl } = useHub()
const { saveCredential: hubSaveCredential } = useHubAi()

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

// Add Connection Wizard
const isAddOpen = ref(false)
const addStep = ref<'category' | 'provider' | 'form'>('category')
const addCategory = ref<string>('')
const addProvider = ref<ConnectionProvider | null>(null)
const addSaving = ref(false)
const addValues = ref<Record<string, string>>({})
const addCredentialName = ref('')
const addShared = ref(false)

const isConnected = (p: ConnectionProvider) => !!p.connection && p.connection.status === 'connected'
const hasRow = (p: ConnectionProvider) => !!p.connection
const statusLabel = (p: ConnectionProvider) => {
  if (!p.connection) return t('connections.not_connected')
  return p.connection.status === 'connected' ? t('connections.connected') : t('common.error')
}
function cleanVal(v: unknown): string {
  let s = String(v ?? '').trim()
  while ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('\'') && s.endsWith('\''))) {
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
    // Hub merges BOTH domains in one canonical inventory (R147):
    // code-registry providers (cloudinary, google) + DB-backed AI
    // providers flagged `ai: true` with all credentials in `connections`.
    const res = await connections.list(appId)
    providers.value = (res.data || []) as ConnectionProvider[]
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    loading.value = false
  }
}

async function connectOAuth(p: ConnectionProvider) {
  let popup: Window | null = null

  try {
    const res = await connections.oauthStart(p.key, appId)
    const authUrl = res.data?.authUrl
    if (!authUrl) {
      toast.add({ title: t('connections.test_fail') + ': No auth URL returned', color: 'error' })
      return
    }

    popup = window.open(authUrl, 'tmhub-oauth', 'width=540,height=680')
    if (!popup) {
      toast.add({ title: t('connections.popup_blocked'), color: 'error' })
      return
    }
    toast.add({
      title: t('connections.connect') + ': ' + p.name,
      color: 'info'
    })
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
    return
  }

  let isFinished = false
  let pollAttempts = 0
  const maxAttempts = 120

  const cleanup = () => {
    isFinished = true
    clearInterval(pollTimer)
  }

  const pollTimer = setInterval(async () => {
    if (isFinished) return
    pollAttempts++

    try {
      const res = await connections.list(appId)
      const current = res.data?.find(item => item.key === p.key)
      if (current?.connection?.status === 'connected') {
        cleanup()
        providers.value = res.data || []
        toast.add({ title: t('connections.saved'), icon: 'i-lucide-check', color: 'success' })
        return
      }
    } catch {
      // transient poll failure, retry next tick
    }

    if (pollAttempts >= maxAttempts) {
      cleanup()
      refresh()
    }
  }, 1500)
}

function onOAuthMessage(event: MessageEvent) {
  const allowedOrigins = [window.location.origin]
  try {
    if (hubUrl) allowedOrigins.push(new URL(hubUrl).origin)
  } catch { /* ignore */ }
  if (!allowedOrigins.includes(event.origin)) return

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

let bc: BroadcastChannel | null = null
onMounted(() => {
  window.addEventListener('message', onOAuthMessage)
  try {
    bc = new BroadcastChannel('tm-hub-oauth')
    bc.onmessage = (event) => {
      if (event.data?.type === 'tm-hub-oauth' && event.data?.status === 'connected') {
        toast.add({ title: t('connections.saved'), icon: 'i-lucide-check', color: 'success' })
        refresh()
      }
    }
  } catch { /* ignore */ }
  refresh()
})
onUnmounted(() => {
  window.removeEventListener('message', onOAuthMessage)
  try {
    bc?.close()
  } catch { /* ignore */ }
})

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

// ============ ADD CONNECTION WIZARD ============
// Category list mirrors roadmap §2 (provider-connections-upgrade-roadmap).
// Labels/descriptions live in i18n (`connections.wizard.<key>_label/_desc`);
// categories with no registered provider yet show an honest empty state —
// Phase 4 registers non-AI categories incrementally.
const CATEGORIES = [
  { key: 'ai_llm', icon: 'i-lucide-brain' },
  { key: 'coding_gateway', icon: 'i-lucide-terminal' },
  { key: 'media_generation', icon: 'i-lucide-sparkles' },
  { key: 'exchange', icon: 'i-lucide-coin' },
  { key: 'market_data', icon: 'i-lucide-chart-line' },
  { key: 'news', icon: 'i-lucide-newspaper' },
  { key: 'media_storage', icon: 'i-lucide-hard-drive' },
  { key: 'notifications', icon: 'i-lucide-bell' },
  { key: 'mcp', icon: 'i-lucide-plug-zap' },
  { key: 'custom', icon: 'i-lucide-plus-circle' }
] as const

function categoryLabel(key: string): string {
  return key ? t(`connections.wizard.${key}_label`) : ''
}

function openAddWizard() {
  addStep.value = 'category'
  addCategory.value = ''
  addProvider.value = null
  addCredentialName.value = ''
  addValues.value = {}
  isAddOpen.value = true
}

function selectCategory(cat: typeof CATEGORIES[number]) {
  addCategory.value = cat.key
  addStep.value = 'provider'
}

/** Providers offered for the chosen category (roadmap §2: wizard starts
 *  with a category, then a provider-specific form). Legacy code-registry
 *  providers carry no category — they show under custom. */
const categoryProviders = computed(() => {
  if (addCategory.value === 'custom') return providers.value.filter(p => !p.category)
  return providers.value.filter(p => p.category === addCategory.value)
})

function providerFields(p: ConnectionProvider) {
  return p.fields || []
}

function selectProvider(p: ConnectionProvider) {
  addProvider.value = p
  addCredentialName.value = 'default'
  addValues.value = {}
  for (const field of providerFields(p)) {
    if (field.type !== 'password') addValues.value[field.key] = ''
    else addValues.value[field.key] = ''
  }
  addStep.value = 'form'
}

function backToCategory() {
  addStep.value = 'category'
}
function backToProvider() {
  addStep.value = 'provider'
}

/** Open the wizard straight on a provider's form — used by the
 *  "Add credential" action on connected provider cards (multi-key R147). */
function addCredentialFor(p: ConnectionProvider) {
  addCategory.value = p.category || 'custom'
  isAddOpen.value = true
  selectProvider(p)
}

async function saveAddConnection() {
  const p = addProvider.value
  if (!p) return
  addSaving.value = true
  try {
    const cleanedValues: Record<string, string> = {}
    for (const [k, v] of Object.entries(addValues.value)) {
      const trimmed = cleanVal(v)
      // Keep saved secrets rotatable: an untouched password field means
      // "leave as-is" when a record already exists.
      if (v === '' && fieldIsSecret(p, k) && hasRow(p)) continue
      cleanedValues[k] = trimmed
    }
    // Same canonical record for both screens (roadmap §2: no duplicate
    // writes): AI credentials go through the AI endpoint which persists
    // name/environment/isShared alongside the AES-GCM secret.
    let test: HubConnectionTestResult | undefined
    if (p.ai) {
      const saved = await hubSaveCredential(appId, {
        provider: p.key,
        name: addCredentialName.value.trim() || 'default',
        values: cleanedValues,
        isShared: addShared.value
      })
      test = saved?.test
    } else {
      const saved = await connections.saveManual(p.key, cleanedValues, appId)
      test = saved.data?.test
    }
    if (test?.ok) toast.add({ title: t('connections.saved'), icon: 'i-lucide-check', color: 'success' })
    else if (test) showTestFail(test)
    else toast.add({ title: t('connections.saved'), icon: 'i-lucide-check', color: 'success' })
    isAddOpen.value = false
    refresh()
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    addSaving.value = false
  }
}

function fieldIsSecret(p: ConnectionProvider, key: string): boolean {
  return providerFields(p).some(f => f.key === key && f.type === 'password')
}

const mobileBar = useMobileBar()
mobileBar.registerActions(computed(() => [
  { icon: 'i-lucide-refresh-cw', label: t('common.refresh'), onSelect: () => refresh() },
  { icon: 'i-lucide-plus', label: t('connections.add'), onSelect: () => openAddWizard() }
]))

useHead({ title: t('connections.title') })
</script>

<template>
  <BasePage id="system-connections" :title="t('connections.title')" :description="t('connections.description')">
    <template #right>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          size="sm"
          @click="openAddWizard"
        >
          {{ t('connections.add') }}
        </UButton>
        <UButton
          icon="i-lucide-refresh-cw"
          variant="soft"
          size="sm"
          :loading="loading"
          @click="refresh"
        />
      </div>
    </template>

    <div class="flex flex-col gap-4 pb-6">
      <div v-if="loading && !providers.length" class="flex items-center justify-center py-20">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
      </div>

      <div v-else-if="!providers.length" class="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <UIcon name="i-lucide-plug" class="size-10 text-muted" />
        <p class="text-sm text-muted">
          {{ t('connections.empty') }}
        </p>
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          size="sm"
          @click="openAddWizard"
        >
          {{ t('connections.add_first') }}
        </UButton>
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
                  <UBadge :label="p.mode === 'oauth' ? t('connections.mode_oauth') : t('connections.mode_manual')" variant="subtle" size="xs" />
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
            <p v-if="p.ai">
              <span class="text-toned">{{ t('aiProviders.credentials_count', [String(p.connections?.length || (p.connection ? 1 : 0))]) }}</span>
            </p>
            <p>
              <span class="text-toned">{{ t('connections.last_test') }}: </span>
              <span :class="p.connection?.lastTestOk === false ? 'text-error' : 'text-highlighted'">
                {{ p.connection?.lastTestAt ? new Date(p.connection.lastTestAt).toLocaleString() : t('connections.never') }}
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
              v-if="p.mode === 'manual' && !p.ai"
              :label="hasRow(p) ? t('connections.configure') : t('connections.connect')"
              icon="i-lucide-key-round"
              color="primary"
              variant="soft"
              size="sm"
              @click="openManual(p)"
            />
            <!-- AI cards manage credentials per provider (multi-key R147):
                 the wizard's AI branch writes through /ai/connections/manual,
                 and health/governance live on the AI providers screen. -->
            <UButton
              v-if="p.ai"
              :label="t('aiProviders.add_credential')"
              icon="i-lucide-key-round"
              color="primary"
              variant="soft"
              size="sm"
              @click="addCredentialFor(p)"
            />
            <UButton
              v-if="p.ai"
              :label="t('connections.manage_ai')"
              icon="i-lucide-external-link"
              color="neutral"
              variant="soft"
              size="sm"
              :to="`/system/ai-keys`"
            />
            <UButton
              v-if="hasRow(p) && !p.ai"
              :label="t('connections.test')"
              icon="i-lucide-activity"
              :loading="testingKey === p.key"
              color="success"
              variant="soft"
              size="sm"
              @click="testConnection(p)"
            />
            <UButton
              v-if="hasRow(p) && !p.ai"
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

    <!-- Manual Configure Modal (legacy single-credential) -->
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

    <!-- Add Connection Wizard Modal -->
    <BaseResponsiveModal
      v-model:open="isAddOpen"
      :title="t('connections.add')"
      :close="!addSaving"
      :dismissible="!addSaving"
    >
      <template #body>
        <!-- Step 1: Category -->
        <div v-if="addStep === 'category'" class="space-y-4">
          <p class="text-sm text-muted">
            {{ t('connections.add_category_hint') }}
          </p>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div
              v-for="cat in CATEGORIES"
              :key="cat.key"
              class="rounded-xl border border-default/50 p-4 cursor-pointer hover:border-primary/50 transition-colors"
              @click="selectCategory(cat)"
            >
              <div class="flex items-center justify-center size-12 rounded-lg bg-primary/10 mb-2">
                <UIcon :name="cat.icon" class="size-6 text-primary" />
              </div>
              <p class="font-medium text-highlighted text-center">
                {{ categoryLabel(cat.key) }}
              </p>
              <p class="text-xs text-muted text-center mt-1">
                {{ t(`connections.wizard.${cat.key}_desc`) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Step 2: Provider (within category) -->
        <div v-if="addStep === 'provider'" class="space-y-4">
          <div class="flex items-center gap-2">
            <UButton
              variant="ghost"
              size="sm"
              icon="i-lucide-chevron-left"
              @click="backToCategory"
            />
            <span class="font-medium text-highlighted">{{ categoryLabel(addCategory) }}</span>
          </div>
          <p class="text-sm text-muted">
            {{ t('connections.add_provider_hint') }}
          </p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            <div
              v-for="p in categoryProviders"
              :key="p.key"
              class="rounded-xl border border-default/50 p-3 cursor-pointer hover:border-primary/50 transition-colors flex items-center gap-3"
              @click="selectProvider(p)"
            >
              <div class="flex items-center justify-center size-10 rounded-lg bg-elevated/50 shrink-0">
                <UIcon :name="p.icon" class="size-5" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-medium text-highlighted truncate">
                  {{ p.name }}
                </p>
                <p class="text-xs text-muted truncate">
                  {{ p.description }}
                </p>
              </div>
              <UIcon name="i-lucide-chevron-right" class="size-4 text-muted shrink-0" />
            </div>
            <p v-if="!categoryProviders.length" class="text-xs text-muted col-span-full py-4 text-center">
              {{ t('connections.no_providers_in_category') }}
            </p>
          </div>
        </div>

        <!-- Step 3: Form (credential name + fields) -->
        <div v-if="addStep === 'form'" class="space-y-4">
          <div class="flex items-center gap-2">
            <UButton
              variant="ghost"
              size="sm"
              icon="i-lucide-chevron-left"
              @click="backToProvider"
            />
            <span class="font-medium text-highlighted">{{ addProvider?.name }}</span>
          </div>
          <UFormField
            v-if="addProvider?.ai"
            :label="t('aiProviders.credential_name')"
            :hint="t('aiProviders.credential_name_hint')"
            class="mb-3"
          >
            <UInput
              v-model="addCredentialName"
              :placeholder="t('aiProviders.default_name')"
              autocomplete="off"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="addProvider?.ai"
            :label="t('aiProviders.share')"
            :hint="t('aiProviders.share_hint')"
            class="mb-3"
          >
            <USwitch v-model="addShared" :aria-label="t('aiProviders.share')" />
          </UFormField>
          <UFormField
            v-for="field in addProvider ? providerFields(addProvider) : []"
            :key="field.key"
            :label="field.label"
            :required="field.required"
            class="mb-3"
          >
            <UInput
              v-model="addValues[field.key]"
              :type="field.type === 'password' ? 'password' : 'text'"
              class="w-full"
              :placeholder="field.type === 'password' ? '••••••••' : field.label"
              autocomplete="off"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            v-if="addStep !== 'category'"
            :label="t('common.back')"
            color="neutral"
            variant="ghost"
            :disabled="addSaving"
            @click="addStep === 'provider' ? backToCategory() : backToProvider()"
          />
          <UButton
            v-if="addStep === 'form'"
            type="button"
            :label="t('common.save')"
            :loading="addSaving"
            variant="soft"
            color="primary"
            @click="saveAddConnection"
          />
          <UButton
            v-if="addStep !== 'form'"
            :label="t('common.cancel')"
            color="neutral"
            variant="ghost"
            :disabled="addSaving"
            @click="isAddOpen = false"
          />
        </div>
      </template>
    </BaseResponsiveModal>

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
  </BasePage>
</template>
