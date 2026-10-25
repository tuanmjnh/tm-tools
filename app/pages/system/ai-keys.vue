<script setup lang="ts">
// =============================================================================
// AI Keys & Provider Governance (R140/R147)
// Dashboard for multi-provider accounts, Hub model synchronization,
// local Key Vault (OS keychain AT-REST encryption) and per-surface tests.
// =============================================================================
import type { DropdownMenuItem } from '@nuxt/ui'
import type { AiTaskStatus, AiGatewayStatus, AiKeyVaultStatus } from '#shared/types/electron'
import { useHubAi } from '~/composables/useHubAi'
import type { HubAiConnection, HubAiModel, HubAiProviderItem } from '~/composables/useHubAi'
import { getErrorMessage } from '~/shared/utils/errors'

const { t } = useI18n()
const notify = useNotify()
const { appId, hubUrl } = useHub()
const auth = useAuth()
const mobileBar = useMobileBar()
const { copy } = useClipboard()

/** Root-only affordances (secret export) — the hub enforces the same rule. */
const isRoot = computed(() => auth.user.value?.permissions?.includes('*') === true)

const { status: gatewayStatusFn, listModels: gatewayListModels, tasks } = useTmcutAi()
const {
  listProviders: hubListProviders,
  discoverModels: hubDiscoverModels,
  listModels: hubListModels,
  addModel: hubAddModel,
  toggleModel: hubSetModelEnabled,
  deleteModel: hubDeleteModel,
  saveCredential: hubSaveCredential,
  patchConnection: hubPatchConnection,
  deleteConnection: hubDeleteConnection
} = useHubAi()

// ---- Tabs -------------------------------------------------------------------
type TabKey = 'providers' | 'models' | 'surfaces'
const activeTab = ref<TabKey>('providers')

// ---- Hub Providers & Models -------------------------------------------------
const hubLoading = ref(false)
const hubSyncing = ref(false)
/** Last hub read failure, kept visible: an empty list without a reason is useless. */
const hubError = ref('')
const hubProviders = ref<HubAiProviderItem[]>([])
const hubAllModels = ref<HubAiModel[]>([])
const hubBusyKey = ref('')
const hubPatchKey = ref('')
const hubModelBusy = ref('')

// ---- Import / Export & Provider Picker --------------------------------------
const ioOpen = ref(false)
const ioMode = ref<'import' | 'export'>('import')
const connectOpen = ref(false)
const connectSearch = ref('')

// ---- Filtering & Search -----------------------------------------------------
const searchProvider = ref('')
const searchModel = ref('')
const filterModelProvider = ref('all')
const filterModelConnection = ref('all')
const filterModelStatus = ref('all')
const filterModelSource = ref('all')

// ---- Connection Models Modal (View & manage models for a specific connection) --
const isConnectionModelsOpen = ref(false)
const connectionModelsTarget = ref<HubAiConnection | null>(null)
const searchConnectionModel = ref('')
const isDiscoveringConnectionModels = ref(false)
const inlineNewModelId = ref('')
const inlineNewModelDisplayName = ref('')
const inlineModelAdding = ref(false)

// ---- Manual Model Add Modal -------------------------------------------------
const isModelModalOpen = ref(false)
const modelSaving = ref(false)
const modelForm = reactive({
  provider: 'openai',
  modelId: '',
  displayName: ''
})

// ---- Confirm Delete Modals --------------------------------------------------
const deleteConnectionTarget = ref<{ providerName: string, connection: HubAiConnection } | null>(null)
const deleteModelTarget = ref<HubAiModel | null>(null)
const isDeleting = ref(false)

// ---- Electron Key Vault & Surfaces ------------------------------------------
const hasElectron = computed(() => typeof window !== 'undefined' && !!window.electronAPI?.tools?.aiGateway)
const loading = ref(false)
const testing = ref<Record<string, boolean>>({})

const gatewayStatus = ref<AiGatewayStatus | null>(null)
const surfaceTasks = ref<Record<string, AiTaskStatus> | null>(null)
const vault = ref<AiKeyVaultStatus | null>(null)
const migrating = ref(false)
const justEncrypted = ref(false)

type TestTarget = 'global' | 'plan' | 'transcribe' | 'triage'
interface TestResult { state: 'ok' | 'warn' | 'fail', detail: string }
const testResults = ref<Record<string, TestResult>>({})

const vaultBanner = computed(() => {
  const v = vault.value
  if (!v) return { icon: 'i-lucide-loader', color: 'text-neutral-500 dark:text-neutral-400', title: '', desc: '' }
  if (!v.exists) return {
    icon: 'i-lucide-file-x',
    color: 'text-neutral-500 dark:text-neutral-400',
    title: t('settings.aiKeysVaultEmpty'),
    desc: t('settings.aiKeysVaultEmptyDesc')
  }
  if (v.available) return {
    icon: 'i-lucide-shield-check',
    color: 'text-emerald-600 dark:text-emerald-400',
    title: t('settings.aiKeysVaultOn'),
    desc: t('settings.aiKeysVaultDesc')
  }
  return {
    icon: 'i-lucide-shield-alert',
    color: 'text-amber-600 dark:text-amber-400',
    title: t('settings.aiKeysVaultOff'),
    desc: t('settings.aiKeysVaultOffDesc')
  }
})

const surfaceRows = computed(() => [
  { key: 'editorScript', task: 'plan' as TestTarget, label: t('tmcut.aiConnect.surfaceEditorScript'), st: surfaceTasks.value?.['plan'] || null },
  { key: 'captions', task: 'transcribe' as TestTarget, label: t('tmcut.aiConnect.surfaceCaptions'), st: surfaceTasks.value?.['transcribe'] || null },
  { key: 'autocut', task: 'triage' as TestTarget, label: t('tmcut.aiConnect.surfaceAutocut'), st: surfaceTasks.value?.['triage'] || null }
])

const testedRows = computed(() => {
  const rows: Array<{ task: TestTarget, label: string, res: TestResult }> = []
  for (const row of surfaceRows.value) {
    const res = testResults.value[row.task]
    if (res) rows.push({ task: row.task, label: row.label, res })
  }
  return rows
})

const showEncryptButton = computed(() =>
  !!vault.value && vault.value.available && vault.value.plaintext > 0
)

// ---- Metrics ----------------------------------------------------------------
const allConnections = computed(() => hubProviders.value.flatMap(p => p.connections))
const totalProviders = computed(() => hubProviders.value.length)
const totalConnections = computed(() => allConnections.value.length)
const totalModels = computed(() => hubAllModels.value.length)
const activeModelsCount = computed(() => hubAllModels.value.filter(m => m.isEnabled).length)

// ---- Filtered Lists ---------------------------------------------------------
/** Only providers this hub app is actually connected to (a full catalogue is noise). */
const connectedProviders = computed(() => hubProviders.value.filter(p => p.connections.length > 0))
const totalConnectedProviders = computed(() => connectedProviders.value.length)

const filteredProviders = computed(() => {
  const q = searchProvider.value.toLowerCase().trim()
  if (!q) return connectedProviders.value
  return connectedProviders.value.filter(p =>
    p.definition.name.toLowerCase().includes(q)
    || p.definition.key.toLowerCase().includes(q)
    || p.connections.some(c => (c.name || '').toLowerCase().includes(q))
  )
})

/** Definitions without a credential yet — the picker behind "Connect provider". */
const connectableProviders = computed(() => {
  const q = connectSearch.value.trim().toLowerCase()
  return hubProviders.value
    .filter(p => p.connections.length === 0)
    .filter(p => !q
      || p.definition.name.toLowerCase().includes(q)
      || p.definition.key.toLowerCase().includes(q))
})

function openConnect() {
  connectSearch.value = ''
  connectOpen.value = true
}

/**
 * Credential authoring lives in the Connections wizard, not here (see
 * docs/ai-key-ownership-and-hub-sharing.md §3): the vault reads and governs,
 * it never renders a key field. Deep-link with the provider preselected.
 */
function goToConnections(providerKey?: string) {
  connectOpen.value = false
  navigateTo(providerKey ? `/resources/connections?provider=${encodeURIComponent(providerKey)}` : '/resources/connections')
}

function connectProvider(providerKey: string) {
  goToConnections(providerKey)
}

function openImport() {
  ioMode.value = 'import'
  ioOpen.value = true
}

function openExport() {
  ioMode.value = 'export'
  ioOpen.value = true
}

/** Header overflow: only "Connect provider" stays visible as a pill. */
const headerMenu = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t('aiProviders.sync_from_hub'),
      icon: 'i-lucide-cloud',
      disabled: hubSyncing.value,
      onSelect: () => syncFromHub()
    },
    {
      label: t('aiProviders.import'),
      icon: 'i-lucide-upload',
      disabled: hubLoading.value,
      onSelect: openImport
    },
    {
      label: t('aiProviders.export'),
      icon: 'i-lucide-download',
      disabled: hubLoading.value || totalConnections.value === 0,
      onSelect: openExport
    }
  ],
  [
    {
      label: t('common.refresh'),
      icon: 'i-lucide-refresh-cw',
      disabled: hubLoading.value || loading.value,
      onSelect: () => refresh()
    }
  ]
])

const providerOptions = computed(() => [
  { label: t('aiProviders.filter_all_providers'), value: 'all' },
  ...hubProviders.value.map(p => ({ label: p.definition.name, value: p.definition.key }))
])

const connectionOptions = computed(() => [
  { label: t('common.all'), value: 'all' },
  ...allConnections.value.map(c => ({ label: `${c.name || 'default'} (${c.provider})`, value: c.id }))
])

const connectionModelsList = computed(() => {
  if (!connectionModelsTarget.value) return []
  const cid = connectionModelsTarget.value.id
  const prov = connectionModelsTarget.value.provider
  return hubAllModels.value.filter(m => m.connectionId === cid || (!m.connectionId && m.provider === prov))
})

const filteredConnectionModels = computed(() => {
  const q = searchConnectionModel.value.toLowerCase().trim()
  if (!q) return connectionModelsList.value
  return connectionModelsList.value.filter(m =>
    m.modelId.toLowerCase().includes(q) || (m.displayName || '').toLowerCase().includes(q)
  )
})

const filteredModels = computed(() => {
  return hubAllModels.value.filter((m) => {
    if (filterModelProvider.value !== 'all' && m.provider !== filterModelProvider.value) return false
    if (filterModelConnection.value !== 'all' && m.connectionId !== filterModelConnection.value) return false
    if (filterModelStatus.value === 'enabled' && !m.isEnabled) return false
    if (filterModelStatus.value === 'disabled' && m.isEnabled) return false
    if (filterModelSource.value === 'discovered' && m.source !== 'discovered') return false
    if (filterModelSource.value === 'manual' && m.source !== 'manual') return false
    if (searchModel.value.trim()) {
      const q = searchModel.value.toLowerCase().trim()
      return m.modelId.toLowerCase().includes(q) || (m.displayName || '').toLowerCase().includes(q)
    }
    return true
  })
})

// ---- Provider UI Helpers ----------------------------------------------------
function providerIcon(key: string): string {
  switch (key.toLowerCase()) {
    case 'openai': return 'i-simple-icons-openai'
    case 'anthropic': return 'i-simple-icons-anthropic'
    case 'google':
    case 'gemini': return 'i-simple-icons-google'
    case 'groq': return 'i-lucide-zap'
    case 'deepseek': return 'i-lucide-brain'
    case 'ollama': return 'i-simple-icons-ollama'
    case 'openrouter': return 'i-lucide-network'
    case 'mistral': return 'i-lucide-wind'
    case 'elevenlabs': return 'i-lucide-audio-waveform'
    case 'runway': return 'i-lucide-video'
    default: return 'i-lucide-bot'
  }
}

function providerHealth(c: HubAiConnection): { label: string, color: 'success' | 'error' | 'neutral' | 'warning' } {
  if (!c.isEnabled) return { label: t('aiProviders.disabled'), color: 'neutral' }
  if (c.lastTestOk === false) return { label: t('aiProviders.unhealthy'), color: 'error' }
  if (c.lastTestOk === true) return { label: t('aiProviders.healthy'), color: 'success' }
  return { label: t('aiProviders.unknown'), color: 'warning' }
}

const testStateColor = (r: TestResult | undefined) =>
  r?.state === 'ok' ? 'success' : r?.state === 'warn' ? 'warning' : 'error'

// ---- Lifecycle & Hub Operations ---------------------------------------------
onMounted(() => {
  void refresh()
})

async function refresh() {
  if (hasElectron.value) {
    loading.value = true
    try {
      gatewayStatus.value = await gatewayStatusFn()
      surfaceTasks.value = await tasks()
      const res = await window.electronAPI?.aiKeyStatus?.()
      vault.value = res?.ok && res.data ? res.data : null
    } catch {
      // keep previous
    } finally {
      loading.value = false
    }
  }
  await refreshHub()
}

async function refreshHub() {
  hubLoading.value = true
  hubError.value = ''
  try {
    const [providers, models] = await Promise.all([
      hubListProviders(appId),
      hubListModels(appId, { includeDisabled: true })
    ])
    hubProviders.value = providers
    hubAllModels.value = models
  } catch (err) {
    const reason = getErrorMessage(err, k => t(k))
    hubError.value = `${reason} · ${hubUrl} · app: ${appId}`
    notify.error(t('aiProviders.sync_failed'), hubError.value)
  } finally {
    hubLoading.value = false
  }
}

/**
 * Synchronize all providers and discovery models from TM Hub.
 * Discovers and persists models for all enabled credentials.
 */
async function syncFromHub() {
  hubSyncing.value = true
  try {
    await refreshHub()
    if (hubError.value) return

    const providersLoaded = hubProviders.value.length
    const active = allConnections.value.filter(c => c.isEnabled)
    let totalDiscovered = 0

    for (const conn of active) {
      try {
        const res = await hubDiscoverModels(appId, { connectionId: conn.id, persist: true })
        totalDiscovered += res.discovered || 0
      } catch {
        // Individual connection failure does not block the sync batch
      }
    }

    await refreshHub()

    // Never report a silent "success" that loaded nothing: say WHY the list is empty.
    if (providersLoaded === 0) {
      notify.warning(t('aiProviders.sync_empty_hub'), t('aiProviders.sync_empty_hub_desc', { url: hubUrl, appId }))
      return
    }
    if (active.length === 0) {
      notify.warning(t('aiProviders.sync_no_credentials'), t('aiProviders.sync_no_credentials_desc', { appId }))
      return
    }
    notify.success(
      t('aiProviders.sync_from_hub'),
      t('aiProviders.sync_done', [String(active.length), String(totalDiscovered)])
    )
  } catch (err) {
    notify.error(t('aiProviders.sync_failed'), getErrorMessage(err, k => t(k)))
  } finally {
    hubSyncing.value = false
  }
}

// ---- Connection Actions -----------------------------------------------------
async function hubTest(c: HubAiConnection) {
  hubBusyKey.value = c.id
  try {
    const res = await hubDiscoverModels(appId, { connectionId: c.id, persist: false })
    c.lastTestOk = true
    c.status = 'connected'
    c.lastTestAt = new Date().toISOString()
    const count = res.models?.length || res.discovered || 0
    notify.success(t('aiProviders.test_ok'), count ? t('aiProviders.models_fetched', [String(count)]) : undefined)
  } catch (err) {
    c.lastTestOk = false
    c.status = 'error'
    c.lastTestAt = new Date().toISOString()
    notify.error(t('aiProviders.test_fail'), getErrorMessage(err, k => t(k)))
  } finally {
    hubBusyKey.value = ''
    await refreshHub()
  }
}

async function hubFetchModels(c: HubAiConnection) {
  hubBusyKey.value = c.id
  try {
    const res = await hubDiscoverModels(appId, { connectionId: c.id, persist: true })
    c.lastTestOk = true
    c.status = 'connected'
    c.lastTestAt = new Date().toISOString()
    notify.success(t('aiProviders.models_fetched', [String(res.discovered)]))
  } catch (err) {
    c.lastTestOk = false
    c.status = 'error'
    c.lastTestAt = new Date().toISOString()
    notify.error(t('aiProviders.test_fail'), getErrorMessage(err, k => t(k)))
  } finally {
    hubBusyKey.value = ''
    await refreshHub()
  }
}

async function hubToggleEnabled(c: HubAiConnection) {
  hubPatchKey.value = c.id
  try {
    await hubPatchConnection(appId, c.id, { isEnabled: !c.isEnabled })
    await refreshHub()
  } catch (err) {
    notify.error(t('global.error'), getErrorMessage(err, k => t(k)))
  } finally {
    hubPatchKey.value = ''
  }
}

async function hubToggleShared(c: HubAiConnection) {
  hubPatchKey.value = c.id
  try {
    await hubPatchConnection(appId, c.id, { isShared: !c.isShared })
    await refreshHub()
  } catch (err) {
    notify.error(t('global.error'), getErrorMessage(err, k => t(k)))
  } finally {
    hubPatchKey.value = ''
  }
}

function promptDeleteConnection(providerName: string, c: HubAiConnection) {
  deleteConnectionTarget.value = { providerName, connection: c }
}

async function executeDeleteConnection() {
  if (!deleteConnectionTarget.value) return
  const { connection } = deleteConnectionTarget.value
  isDeleting.value = true
  try {
    await hubDeleteConnection(appId, connection.id)
    notify.success(t('aiProviders.disconnected'))
    deleteConnectionTarget.value = null
    await refreshHub()
  } catch (err) {
    notify.error(t('global.error'), getErrorMessage(err, k => t(k)))
  } finally {
    isDeleting.value = false
  }
}

// ---- Connection Models Modal Handlers (like tm-trading) -----------------------
function openConnectionModels(c: HubAiConnection) {
  connectionModelsTarget.value = c
  searchConnectionModel.value = ''
  inlineNewModelId.value = ''
  inlineNewModelDisplayName.value = ''
  isConnectionModelsOpen.value = true
}

async function refreshModelsForConnection(c: HubAiConnection) {
  isDiscoveringConnectionModels.value = true
  try {
    const res = await hubDiscoverModels(appId, { connectionId: c.id, persist: true })
    c.lastTestOk = true
    c.status = 'connected'
    c.lastTestAt = new Date().toISOString()
    notify.success(t('aiProviders.discover_models'), t('aiProviders.discovered_count', { count: res.discovered }))
    await refreshHub()
  } catch (err) {
    c.lastTestOk = false
    c.status = 'error'
    c.lastTestAt = new Date().toISOString()
    notify.error(t('aiProviders.discover_failed'), getErrorMessage(err, k => t(k)))
  } finally {
    isDiscoveringConnectionModels.value = false
  }
}

async function setDefaultModelForConnection(c: HubAiConnection, modelId: string) {
  try {
    const values: Record<string, string> = { AI_MODEL: modelId }
    if (c.baseUrlOverride || c.config?.AI_BASE_URL) {
      values.AI_BASE_URL = c.baseUrlOverride || String(c.config?.AI_BASE_URL)
    }
    await hubSaveCredential(appId, {
      provider: c.provider,
      name: c.name,
      values,
      baseUrlOverride: c.baseUrlOverride || undefined,
      isShared: c.isShared,
      preserveSecrets: true
    })
    notify.success(t('aiProviders.primary_set', [modelId]))
    await refreshHub()
    if (connectionModelsTarget.value && connectionModelsTarget.value.id === c.id) {
      connectionModelsTarget.value.config = { ...connectionModelsTarget.value.config, AI_MODEL: modelId }
    }
  } catch (err) {
    notify.error(t('global.error'), getErrorMessage(err, k => t(k)))
  }
}

async function addInlineModelSubmit() {
  const modelId = inlineNewModelId.value.trim()
  if (!modelId || !connectionModelsTarget.value) return
  inlineModelAdding.value = true
  try {
    await hubAddModel(appId, {
      provider: connectionModelsTarget.value.provider,
      connectionId: connectionModelsTarget.value.id,
      modelId,
      displayName: inlineNewModelDisplayName.value.trim() || undefined
    })
    notify.success(t('aiProviders.model_added'))
    inlineNewModelId.value = ''
    inlineNewModelDisplayName.value = ''
    await refreshHub()
  } catch (err) {
    notify.error(t('global.error'), getErrorMessage(err, k => t(k)))
  } finally {
    inlineModelAdding.value = false
  }
}

// ---- Connection Row Dropdown Actions (matches tm-trading style) -------------
function getConnectionActions(p: HubAiProviderItem, c: HubAiConnection) {
  return [
    {
      label: t('aiProviders.test_connection'),
      icon: 'i-lucide-activity',
      color: 'primary' as const,
      disabled: hubBusyKey.value === c.id,
      onSelect: () => hubTest(c)
    },
    {
      label: t('aiProviders.models_title'),
      icon: 'i-lucide-library',
      color: 'neutral' as const,
      onSelect: () => openConnectionModels(c)
    },
    {
      label: t('aiProviders.fetch_models'),
      icon: 'i-lucide-sparkles',
      color: 'neutral' as const,
      disabled: hubBusyKey.value === c.id,
      onSelect: () => hubFetchModels(c)
    },
    {
      label: t('common.edit'),
      icon: 'i-lucide-pencil',
      color: 'neutral' as const,
      onSelect: () => goToConnections(c.provider)
    },
    {
      label: c.isShared ? t('aiProviders.unshare') : t('aiProviders.share'),
      icon: 'i-lucide-share-2',
      color: 'neutral' as const,
      onSelect: () => hubToggleShared(c)
    },
    { type: 'separator' as const },
    {
      label: t('common.delete'),
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => promptDeleteConnection(p.definition.name, c)
    }
  ]
}

// ---- Model Operations -------------------------------------------------------
async function hubToggleModel(m: HubAiModel) {
  hubModelBusy.value = m.id
  try {
    await hubSetModelEnabled(appId, m.id, !m.isEnabled)
    await refreshHub()
  } catch (err) {
    notify.error(t('global.error'), getErrorMessage(err, k => t(k)))
  } finally {
    hubModelBusy.value = ''
  }
}

function promptDeleteModel(m: HubAiModel) {
  deleteModelTarget.value = m
}

async function executeDeleteModel() {
  if (!deleteModelTarget.value) return
  const m = deleteModelTarget.value
  isDeleting.value = true
  try {
    await hubDeleteModel(appId, m.id)
    notify.success(t('common.deleted'))
    deleteModelTarget.value = null
    await refreshHub()
  } catch (err) {
    notify.error(t('global.error'), getErrorMessage(err, k => t(k)))
  } finally {
    isDeleting.value = false
  }
}

function openAddModel(providerKey?: string) {
  modelForm.provider = providerKey || hubProviders.value[0]?.definition.key || 'openai'
  modelForm.modelId = ''
  modelForm.displayName = ''
  isModelModalOpen.value = true
}

async function saveModelSubmit() {
  const modelId = modelForm.modelId.trim()
  if (!modelId) return
  modelSaving.value = true
  try {
    await hubAddModel(appId, {
      provider: modelForm.provider,
      connectionId: null,
      modelId,
      displayName: modelForm.displayName.trim() || undefined
    })
    notify.success(t('aiProviders.model_added'))
    isModelModalOpen.value = false
    await refreshHub()
  } catch (err) {
    notify.error(t('global.error'), getErrorMessage(err, k => t(k)))
  } finally {
    modelSaving.value = false
  }
}

// ---- Electron Desktop Key Vault Operations ----------------------------------
async function handleTest(task: TestTarget) {
  if (testing.value[task]) return
  testing.value = { ...testing.value, [task]: true }
  try {
    const list = await gatewayListModels(task === 'global' ? {} : { task })
    testResults.value = {
      ...testResults.value,
      [task]: { state: 'ok', detail: t('tmcut.aiConnect.testOk', { count: list.length }) }
    }
  } catch (err) {
    const message = String((err as Error)?.message || err)
    const reachable = /no model ids|has no model/i.test(message)
    testResults.value = {
      ...testResults.value,
      [task]: { state: reachable ? 'warn' : 'fail', detail: message.slice(0, 180) }
    }
  } finally {
    testing.value = { ...testing.value, [task]: false }
  }
}

async function handleEncrypt() {
  if (migrating.value) return
  migrating.value = true
  justEncrypted.value = false
  try {
    const res = await window.electronAPI?.aiMigrateKeys?.()
    if (res?.ok && res.data) {
      vault.value = res.data
      justEncrypted.value = res.data.plaintext === 0
      notify.success(t('settings.aiKeysEncryptedNow'))
    }
  } catch {
    // keep as is
  } finally {
    migrating.value = false
  }
}

// ---- Page Header Actions ----------------------------------------------------
mobileBar.registerActions(computed(() => [
  {
    icon: 'i-lucide-plus',
    label: t('aiProviders.connect_provider'),
    color: 'primary',
    primary: true,
    onSelect: () => openConnect()
  },
  {
    icon: 'i-lucide-cloud',
    label: t('aiProviders.sync_from_hub'),
    disabled: hubSyncing.value,
    onSelect: () => syncFromHub()
  },
  {
    icon: 'i-lucide-upload',
    label: t('aiProviders.import'),
    disabled: hubLoading.value,
    onSelect: () => openImport()
  },
  {
    icon: 'i-lucide-download',
    label: t('aiProviders.export'),
    disabled: hubLoading.value || totalConnections.value === 0,
    onSelect: () => openExport()
  },
  {
    icon: 'i-lucide-refresh-cw',
    label: t('common.refresh'),
    disabled: hubLoading.value,
    onSelect: () => refresh()
  }
]))

useHead({ title: computed(() => t('settings.aiKeysTitle')) })
</script>

<template>
  <BasePage id="ai_keys" :title="t('settings.aiKeysTitle')" :description="t('settings.aiKeysDesc')">
    <template #right>
      <div class="flex items-center gap-2">
        <UButton
          color="primary"
          variant="soft"
          size="sm"
          icon="i-lucide-plus"
          :label="t('aiProviders.connect_provider')"
          @click="openConnect()"
        />
        <UDropdownMenu :items="headerMenu" :content="{ align: 'end' }">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            square
            size="sm"
            :aria-label="t('common.actions')"
            :title="t('common.actions')"
          />
        </UDropdownMenu>
      </div>
    </template>

    <div class="flex flex-col gap-5 w-full pb-20">
      <!-- ============ Metric Cards ======================================== -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          class="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between"
        >
          <div>
            <p class="text-xs text-muted">
              {{ t('aiProviders.total_providers') }}
            </p>
            <p class="text-xl font-bold text-highlighted mt-0.5">
              {{ totalProviders }}
            </p>
          </div>
          <div class="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <UIcon name="i-lucide-server" class="size-5" />
          </div>
        </div>

        <div
          class="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between"
        >
          <div>
            <p class="text-xs text-muted">
              {{ t('aiProviders.total_credentials') }}
            </p>
            <p class="text-xl font-bold text-highlighted mt-0.5">
              {{ totalConnections }}
            </p>
          </div>
          <div
            class="size-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400"
          >
            <UIcon name="i-lucide-key-round" class="size-5" />
          </div>
        </div>

        <div
          class="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between"
        >
          <div>
            <p class="text-xs text-muted">
              {{ t('aiProviders.total_models') }}
            </p>
            <p class="text-xl font-bold text-highlighted mt-0.5">
              {{ activeModelsCount }} <span class="text-xs font-normal text-muted">/ {{ totalModels }}</span>
            </p>
          </div>
          <div
            class="size-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400"
          >
            <UIcon name="i-lucide-cpu" class="size-5" />
          </div>
        </div>

        <div
          class="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between"
        >
          <div class="min-w-0 flex-1 pr-2">
            <p class="text-xs text-muted truncate">
              {{ t('settings.aiKeysTitle') }}
            </p>
            <p class="text-sm font-semibold truncate mt-0.5" :class="vaultBanner.color">
              {{ vault?.available ? t('settings.aiKeysVaultOn') : t('settings.aiKeysVaultOff') }}
            </p>
          </div>
          <div class="size-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
            <UIcon :name="vaultBanner.icon" class="size-5" :class="vaultBanner.color" />
          </div>
        </div>
      </div>

      <!-- ============ Tab Switcher ======================================== -->
      <div class="flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800 pb-2">
        <button
          type="button"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          :class="activeTab === 'providers'
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-muted hover:text-highlighted hover:bg-neutral-100 dark:hover:bg-neutral-800/50'"
          @click="activeTab = 'providers'"
        >
          <UIcon name="i-lucide-server" class="size-4" />
          <span>{{ t('aiProviders.tab_providers') }}</span>
          <UBadge size="xs" color="neutral" variant="subtle">
            {{ totalConnections }}
          </UBadge>
        </button>

        <button
          type="button"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          :class="activeTab === 'models'
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-muted hover:text-highlighted hover:bg-neutral-100 dark:hover:bg-neutral-800/50'"
          @click="activeTab = 'models'"
        >
          <UIcon name="i-lucide-cpu" class="size-4" />
          <span>{{ t('aiProviders.tab_models') }}</span>
          <UBadge size="xs" color="neutral" variant="subtle">
            {{ totalModels }}
          </UBadge>
        </button>

        <button
          type="button"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          :class="activeTab === 'surfaces'
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-muted hover:text-highlighted hover:bg-neutral-100 dark:hover:bg-neutral-800/50'"
          @click="activeTab = 'surfaces'"
        >
          <UIcon name="i-lucide-shield-check" class="size-4" />
          <span>{{ t('aiProviders.tab_surfaces') }}</span>
        </button>
      </div>

      <!-- ================================================================== -->
      <!-- TAB 1: PROVIDERS & CREDENTIALS TABLE                               -->
      <!-- ================================================================== -->
      <div v-if="activeTab === 'providers'" class="space-y-4">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="w-full sm:w-72">
            <UInput
              v-model="searchProvider"
              icon="i-lucide-search"
              size="sm"
              :placeholder="t('common.search')"
              :ui="{ trailing: 'pe-0.5' }"
              class="w-full"
            >
              <template v-if="searchProvider?.length" #trailing>
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  icon="i-lucide-circle-x"
                  aria-label="Clear input"
                  @click="searchProvider = ''"
                />
              </template>
            </UInput>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              color="primary"
              variant="soft"
              size="xs"
              icon="i-lucide-plus"
              :label="t('aiProviders.connect_provider')"
              @click="openConnect()"
            />
          </div>
        </div>

        <UAlert
          v-if="hubError"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('aiProviders.sync_failed')"
          :description="hubError"
        >
          <template #actions>
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              :label="t('common.refresh')"
              @click="refresh"
            />
          </template>
        </UAlert>

        <div v-if="hubLoading && hubProviders.length === 0" class="space-y-2 py-4">
          <USkeleton class="h-14 w-full rounded-lg" />
          <USkeleton class="h-14 w-full rounded-lg" />
          <USkeleton class="h-14 w-full rounded-lg" />
        </div>

        <div
          v-else-if="filteredProviders.length === 0"
          class="rounded-xl border border-neutral-200 dark:border-neutral-800 p-10 text-center"
        >
          <UIcon
            :name="totalConnectedProviders === 0 ? 'i-lucide-plug' : 'i-lucide-bot'"
            class="size-10 text-muted mx-auto mb-2"
          />
          <p class="text-sm font-medium text-highlighted">
            {{ totalConnectedProviders === 0 ? t('aiProviders.no_connected_providers') : t('aiProviders.no_credentials') }}
          </p>
          <p class="text-xs text-muted mt-1">
            {{ totalConnectedProviders === 0 ? t('aiProviders.no_connected_hint') : t('aiProviders.description') }}
          </p>
          <div class="flex flex-wrap items-center justify-center gap-2 mt-4">
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-plus"
              :label="t('aiProviders.connect_provider')"
              @click="openConnect()"
            />
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-upload"
              :label="t('aiProviders.import')"
              @click="openImport()"
            />
          </div>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="p in filteredProviders"
            :key="p.definition.key"
            class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs"
          >
            <!-- Provider Card Header -->
            <div
              class="flex items-center justify-between gap-3 px-4 py-3 bg-neutral-50/70 dark:bg-neutral-800/40 border-b border-neutral-200 dark:border-neutral-800"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <div
                  class="size-7 rounded-lg bg-neutral-200/60 dark:bg-neutral-700/60 flex items-center justify-center shrink-0"
                >
                  <UIcon :name="providerIcon(p.definition.key)" class="size-4 text-highlighted" />
                </div>
                <div class="min-w-0">
                  <span class="text-xs font-semibold text-highlighted">{{ p.definition.name }}</span>
                  <span class="text-[10px] text-muted ml-2 font-mono">{{ p.definition.adapter_type }}</span>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <UBadge color="neutral" variant="subtle" size="xs">
                  {{ t('aiProviders.credentials_count', [String(p.connections.length)]) }}
                </UBadge>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-plus"
                  :label="t('aiProviders.add_credential')"
                  @click="goToConnections(p.definition.key)"
                />
              </div>
            </div>

            <!-- Credentials Table for this provider -->
            <div v-if="p.connections.length === 0" class="p-4 text-center text-xs text-muted">
              {{ t('aiProviders.no_credentials') }}
            </div>

            <div v-else class="divide-y divide-neutral-200 dark:divide-neutral-800">
              <div
                v-for="c in p.connections"
                :key="c.id"
                class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20 transition-colors"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-semibold text-highlighted truncate">{{ c.name
                      || t('aiProviders.default_name')
                    }}</span>
                    <UBadge
                      v-if="hubBusyKey === c.id"
                      color="info"
                      variant="subtle"
                      size="sm"
                      class="animate-pulse"
                    >
                      <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin mr-1" />
                      {{ t('aiProviders.testing_connection') }}
                    </UBadge>
                    <UBadge
                      v-else
                      :color="providerHealth(c).color"
                      variant="subtle"
                      size="sm"
                    >
                      <UIcon v-if="providerHealth(c).color === 'success'" name="i-lucide-check" class="size-3.5 mr-1" />
                      <UIcon
                        v-else-if="providerHealth(c).color === 'error'"
                        name="i-lucide-alert-triangle"
                        class="size-3.5 mr-1"
                      />
                      {{ providerHealth(c).label }}
                    </UBadge>
                    <span class="inline-flex items-center gap-1 font-mono text-xs text-muted">
                      <UIcon :name="providerIcon(p.definition.key)" class="size-3.5" />
                      {{ p.definition.name }}
                    </span>
                    <UBadge
                      v-if="c.isShared"
                      color="warning"
                      variant="subtle"
                      size="xs"
                    >
                      {{ t('aiProviders.shared') }}
                    </UBadge>
                  </div>

                  <!-- Model & Base URL line (like tm-trading) -->
                  <p class="mt-1 truncate text-xs text-muted font-mono">
                    <span v-if="c.config?.AI_MODEL" class="text-highlighted font-medium">
                      {{ c.config?.AI_MODEL }}
                    </span>
                    <span v-else class="italic text-muted">
                      {{ t('aiProviders.default_model') }}
                    </span>
                    <template v-if="c.baseUrlOverride || c.config?.AI_BASE_URL || p.definition.base_url_default">
                      · {{ c.baseUrlOverride || String(c.config?.AI_BASE_URL || p.definition.base_url_default) }}
                    </template>
                  </p>

                  <!-- Last test info (like tm-trading) -->
                  <p class="mt-0.5 text-xs text-muted">
                    {{ t('aiProviders.last_test') }}:
                    {{ c.lastTestAt ? new Date(c.lastTestAt).toLocaleString() : t('aiProviders.never') }}
                  </p>
                </div>

                <!-- Controls & Actions (matching tm-trading style: single switch + dropdown menu) -->
                <div class="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <UTooltip :text="c.isEnabled ? t('aiProviders.enable') : t('aiProviders.disabled')">
                    <USwitch
                      :model-value="c.isEnabled"
                      size="sm"
                      :disabled="hubPatchKey === c.id"
                      :aria-label="t('aiProviders.enable')"
                      @update:model-value="hubToggleEnabled(c)"
                    />
                  </UTooltip>

                  <UDropdownMenu :items="getConnectionActions(p, c)" :content="{ align: 'end' }">
                    <UButton
                      icon="i-lucide-ellipsis-vertical"
                      color="neutral"
                      variant="ghost"
                      square
                      size="sm"
                      :loading="hubBusyKey === c.id"
                      :disabled="hubBusyKey === c.id"
                      :aria-label="t('common.actions')"
                      :title="t('common.actions')"
                    />
                  </UDropdownMenu>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ================================================================== -->
      <!-- TAB 2: MODELS CATALOG TABLE                                        -->
      <!-- ================================================================== -->
      <div v-if="activeTab === 'models'" class="space-y-4">
        <!-- Filter Toolbar -->
        <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2 flex-1">
            <div class="w-full sm:w-64">
              <UInput
                v-model="searchModel"
                icon="i-lucide-search"
                size="sm"
                :placeholder="t('aiProviders.search_models_placeholder')"
              />
            </div>
            <USelect
              v-model="filterModelProvider"
              :items="providerOptions"
              size="sm"
              class="w-40"
            />
            <USelect
              v-model="filterModelConnection"
              :items="connectionOptions"
              size="sm"
              class="w-44"
            />
            <USelect
              v-model="filterModelStatus"
              :items="[
                { label: t('aiProviders.filter_status_all'), value: 'all' },
                { label: t('aiProviders.filter_status_enabled'), value: 'enabled' },
                { label: t('aiProviders.filter_status_disabled'), value: 'disabled' }
              ]"
              size="sm"
              class="w-36"
            />
            <USelect
              v-model="filterModelSource"
              :items="[
                { label: t('aiProviders.filter_all_sources'), value: 'all' },
                { label: t('aiProviders.filter_source_discovered'), value: 'discovered' },
                { label: t('aiProviders.filter_source_manual'), value: 'manual' }
              ]"
              size="sm"
              class="w-32"
            />
          </div>

          <div class="flex items-center gap-2">
            <UButton
              color="primary"
              variant="soft"
              size="xs"
              icon="i-lucide-plus"
              :label="t('aiProviders.add_model')"
              @click="openAddModel()"
            />
            <UButton
              color="neutral"
              variant="soft"
              size="xs"
              icon="i-lucide-cloud"
              :loading="hubSyncing"
              :label="t('aiProviders.sync_from_hub')"
              @click="syncFromHub"
            />
          </div>
        </div>

        <div v-if="hubLoading && hubAllModels.length === 0" class="space-y-2 py-4">
          <USkeleton class="h-12 w-full rounded-lg" />
          <USkeleton class="h-12 w-full rounded-lg" />
          <USkeleton class="h-12 w-full rounded-lg" />
        </div>

        <div
          v-else-if="filteredModels.length === 0"
          class="rounded-xl border border-neutral-200 dark:border-neutral-800 p-10 text-center"
        >
          <UIcon name="i-lucide-cpu" class="size-10 text-muted mx-auto mb-2" />
          <p class="text-sm font-medium text-highlighted">
            {{ t('aiProviders.models_empty') }}
          </p>
          <p class="text-xs text-muted mt-1">
            {{ t('aiProviders.models_catalog_desc') }}
          </p>
          <div class="flex items-center justify-center gap-2 mt-4">
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-plus"
              :label="t('aiProviders.add_model')"
              @click="openAddModel()"
            />
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              icon="i-lucide-cloud"
              :label="t('aiProviders.sync_from_hub')"
              @click="syncFromHub"
            />
          </div>
        </div>

        <!-- Models Table -->
        <div
          v-else
          class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs"
        >
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead
                class="bg-neutral-50/80 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800 text-muted uppercase text-[10px]"
              >
                <tr>
                  <th class="py-2.5 px-3 font-semibold">
                    {{ t('aiProviders.model_id') }}
                  </th>
                  <th class="py-2.5 px-3 font-semibold">
                    {{ t('aiProviders.display_name') }}
                  </th>
                  <th class="py-2.5 px-3 font-semibold">
                    Provider
                  </th>
                  <th class="py-2.5 px-3 font-semibold">
                    {{ t('aiProviders.connection_scope') }}
                  </th>
                  <th class="py-2.5 px-3 font-semibold text-center">
                    {{ t('aiProviders.enable') }}
                  </th>
                  <th class="py-2.5 px-3 font-semibold text-right">
                    {{ t('common.actions') }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-neutral-200 dark:border-neutral-800">
                <tr
                  v-for="m in filteredModels"
                  :key="m.id"
                  class="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20 transition-colors"
                >
                  <td class="py-2 px-3 font-mono text-[11px] text-highlighted max-w-xs truncate">
                    <span
                      class="cursor-pointer hover:underline"
                      :title="'Click to copy ' + m.modelId"
                      @click="copy(m.modelId); notify.success(t('aiProviders.model_id_copied', [m.modelId]))"
                    >
                      {{ m.modelId }}
                    </span>
                  </td>
                  <td class="py-2 px-3 font-medium text-highlighted truncate max-w-xs">
                    {{ m.displayName || '—' }}
                  </td>
                  <td class="py-2 px-3 whitespace-nowrap">
                    <span
                      class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-highlighted text-[11px]"
                    >
                      <UIcon :name="providerIcon(m.provider)" class="size-3.5" />
                      <span>{{ m.provider }}</span>
                    </span>
                  </td>
                  <td class="py-2 px-3 whitespace-nowrap">
                    <div class="flex items-center gap-1.5">
                      <UBadge size="xs" variant="subtle" :color="m.source === 'discovered' ? 'info' : 'neutral'">
                        {{ m.source === 'discovered' ? t('aiProviders.source_discovered')
                          : t('aiProviders.source_manual') }}
                      </UBadge>
                      <span v-if="m.connectionId" class="text-[10px] text-muted truncate max-w-[100px]">
                        {{ allConnections.find(c => c.id === m.connectionId)?.name || 'scoped' }}
                      </span>
                    </div>
                  </td>
                  <td class="py-2 px-3 text-center whitespace-nowrap">
                    <USwitch
                      :model-value="m.isEnabled"
                      size="sm"
                      :disabled="hubModelBusy === m.id"
                      :aria-label="t('aiProviders.enable')"
                      @update:model-value="hubToggleModel(m)"
                    />
                  </td>
                  <td class="py-2 px-3 text-right whitespace-nowrap">
                    <UDropdownMenu
                      :items="[
                        ...(allConnections.find(c => c.id === m.connectionId) ? [{
                          label: t('aiProviders.set_primary'),
                          icon: 'i-lucide-star',
                          color: 'primary' as const,
                          disabled: !m.isEnabled,
                          onSelect: () => setDefaultModelForConnection(allConnections.find(c => c.id === m.connectionId)!, m.modelId)
                        }] : []),
                        {
                          label: t('aiProviders.copy_model_id'),
                          icon: 'i-lucide-copy',
                          color: 'neutral' as const,
                          onSelect: () => { copy(m.modelId); notify.success(t('aiProviders.model_id_copied', [m.modelId])) }
                        },
                        { type: 'separator' as const },
                        {
                          label: t('aiProviders.delete_model'),
                          icon: 'i-lucide-trash-2',
                          color: 'error' as const,
                          onSelect: () => promptDeleteModel(m)
                        }
                      ]"
                      :content="{ align: 'end' }"
                    >
                      <UButton
                        icon="i-lucide-ellipsis-vertical"
                        color="neutral"
                        variant="ghost"
                        square
                        size="xs"
                        :aria-label="t('common.actions')"
                      />
                    </UDropdownMenu>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            class="px-3 py-2 bg-neutral-50/50 dark:bg-neutral-800/30 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-muted flex items-center justify-between"
          >
            <span>{{ t('common.showing') }} {{ filteredModels.length }} / {{ hubAllModels.length }}
              models</span>
          </div>
        </div>
      </div>

      <!-- ================================================================== -->
      <!-- TAB 3: KEY VAULT & LOCAL DESKTOP SURFACES                          -->
      <!-- ================================================================== -->
      <div v-if="activeTab === 'surfaces'" class="space-y-4 max-w-3xl">
        <p v-if="!hasElectron" class="text-xs text-amber-600 dark:text-amber-400">
          {{ t('tmcut.aiConnect.desktopOnly') }}
        </p>

        <template v-else>
          <!-- At-rest encryption banner -->
          <div
            class="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900 shadow-xs"
          >
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div class="flex items-center gap-2.5 min-w-0">
                <UIcon :name="vaultBanner.icon" class="size-5 shrink-0" :class="vaultBanner.color" />
                <div class="min-w-0">
                  <p class="text-sm font-medium text-highlighted">
                    {{ vaultBanner.title }}
                  </p>
                  <p class="text-[11px] text-muted leading-snug">
                    {{ vaultBanner.desc }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <UBadge color="success" variant="subtle" size="xs">
                  <UIcon name="i-lucide-lock" class="w-3 h-3 mr-1" />
                  {{ t('settings.aiKeysEncryptedCount', { count: vault?.encrypted ?? 0 }) }}
                </UBadge>
                <UBadge
                  v-if="(vault?.plaintext ?? 0) > 0"
                  color="warning"
                  variant="subtle"
                  size="xs"
                >
                  <UIcon name="i-lucide-eye" class="w-3 h-3 mr-1" />
                  {{ t('settings.aiKeysPlaintextCount', { count: vault?.plaintext ?? 0 }) }}
                </UBadge>
                <UButton
                  v-if="showEncryptButton"
                  color="primary"
                  variant="soft"
                  size="xs"
                  icon="i-lucide-lock-keyhole-open"
                  :loading="migrating"
                  :label="t('settings.aiKeysEncryptNow')"
                  :title="t('settings.aiKeysEncryptNowTitle')"
                  @click="handleEncrypt"
                />
              </div>
            </div>
            <p v-if="justEncrypted" class="text-[11px] mt-2 text-emerald-600 dark:text-emerald-400">
              {{ t('settings.aiKeysEncryptedNow') }}
            </p>
          </div>

          <!-- Global connection -->
          <div
            class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 divide-y divide-neutral-200 dark:divide-neutral-800 shadow-xs overflow-hidden"
          >
            <div class="flex items-center justify-between gap-2 px-3 py-2.5 bg-neutral-50/70 dark:bg-neutral-800/30">
              <span class="text-xs font-semibold text-highlighted uppercase tracking-wide">
                {{ t('tmcut.aiConnect.globalLabel') }}
              </span>
              <span class="flex items-center gap-1.5 min-w-0">
                <span
                  class="text-[11px] font-mono text-muted truncate max-w-[60%]"
                  :class="gatewayStatus?.configured ? '' : 'text-amber-600 dark:text-amber-400'"
                >
                  {{ gatewayStatus ? `${gatewayStatus.providerLabel}${gatewayStatus.model ? ' · ' + gatewayStatus.model
                    : ''}` : '—' }}
                </span>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-plug-zap"
                  :loading="testing['global']"
                  :aria-label="t('tmcut.aiConnect.testTitle')"
                  @click="handleTest('global')"
                />
              </span>
            </div>
            <div class="flex items-center justify-between gap-2 px-3 py-2">
              <span class="text-[11px] text-muted">{{ t('tmcut.aiConnect.apiKeyLabel') }}</span>
              <UBadge :color="gatewayStatus?.hasKey ? 'success' : 'neutral'" variant="subtle" size="xs">
                {{ gatewayStatus?.keyless
                  ? t('settings.aiKeysKeyless')
                  : gatewayStatus?.hasKey
                    ? t('settings.aiKeysStored')
                    : t('settings.aiKeysMissing') }}
              </UBadge>
            </div>
            <p
              v-if="testResults['global']"
              class="px-3 py-1.5 text-[10px]"
              :class="testResults['global'].state === 'ok'
                ? 'text-emerald-600 dark:text-emerald-400'
                : testResults['global'].state === 'warn'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400'"
            >
              {{ testResults['global'].detail }}
            </p>
          </div>

          <!-- Per-surface rows -->
          <div
            class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 divide-y divide-neutral-200 dark:divide-neutral-800 shadow-xs overflow-hidden"
          >
            <div v-for="row in surfaceRows" :key="row.key" class="flex items-center justify-between gap-2 px-3 py-2.5">
              <span class="text-[11px] text-highlighted">{{ row.label }}</span>
              <span class="flex items-center gap-1.5 min-w-0">
                <UBadge
                  v-if="row.st && !row.st.hasKey && !row.st.provider?.includes('ollama')"
                  color="warning"
                  variant="subtle"
                  size="xs"
                >
                  {{ t('settings.aiKeysMissing') }}
                </UBadge>
                <span
                  class="text-[10px] font-mono text-muted truncate max-w-[55%]"
                  :class="row.st?.configured ? '' : 'text-amber-600 dark:text-amber-400'"
                >
                  {{ row.st ? `${row.st.providerLabel}${row.st.overridden ? ' •' : ''}${row.st.model ? ' · '
                    + row.st.model : ''}` : '—' }}
                </span>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-plug-zap"
                  :loading="testing[row.task]"
                  :title="t('tmcut.aiConnect.testTitle')"
                  :aria-label="t('tmcut.aiConnect.testTitle')"
                  @click="handleTest(row.task)"
                />
              </span>
            </div>
            <!-- Last test verdict per surface -->
            <div
              v-for="tested in testedRows"
              :key="`res-${tested.task}`"
              class="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50/50 dark:bg-neutral-800/20"
            >
              <UBadge :color="testStateColor(tested.res)" variant="subtle" size="xs">
                {{ tested.label }}
              </UBadge>
              <span class="text-[10px] text-muted truncate">
                {{ tested.res.detail }}
              </span>
            </div>
          </div>
          <p class="text-[10px] text-muted">
            {{ t('tmcut.aiConnect.surfaceHint') }}
          </p>

          <!-- How-to note -->
          <div
            class="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 text-xs space-y-1.5 text-muted"
          >
            <div class="flex items-center gap-2 font-medium text-highlighted">
              <UIcon name="i-lucide-info" class="w-4 h-4 text-primary" />
              <span>{{ t('settings.aiKeysWhereTitle') }}</span>
            </div>
            <p>{{ t('settings.aiKeysWhere1') }}</p>
            <p>{{ t('settings.aiKeysWhere2') }}</p>
            <p>{{ t('settings.aiKeysWhere3') }}</p>
          </div>
        </template>
      </div>
    </div>

    <!-- ==================================================================== -->
    <!-- MODAL: CONNECTION MODELS CATALOG (like tm-trading ConnectionModelsModal) -->
    <!-- ==================================================================== -->
    <UModal
      v-model:open="isConnectionModelsOpen"
      :title="connectionModelsTarget ? t('aiProviders.models_for_connection', [connectionModelsTarget.name || connectionModelsTarget.provider]) : t('aiProviders.models_title')"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div class="space-y-3">
          <!-- Toolbar with search & re-discover -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex-1">
              <UInput
                v-model="searchConnectionModel"
                icon="i-lucide-search"
                size="sm"
                :placeholder="t('aiProviders.search_models_placeholder')"
              />
            </div>
            <UButton
              v-if="connectionModelsTarget"
              icon="i-lucide-sparkles"
              color="neutral"
              variant="soft"
              size="sm"
              :loading="isDiscoveringConnectionModels"
              :label="t('aiProviders.fetch_models')"
              @click="refreshModelsForConnection(connectionModelsTarget)"
            />
          </div>

          <div
            v-if="isDiscoveringConnectionModels"
            class="p-8 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl space-y-3"
          >
            <UIcon name="i-lucide-loader-2" class="size-8 text-primary animate-spin mx-auto" />
            <p class="text-sm font-medium text-highlighted animate-pulse">
              {{ t('aiProviders.testing_connection') }}
            </p>
            <p class="text-xs text-muted">
              {{ t('aiProviders.models_catalog_desc') }}
            </p>
          </div>

          <div
            v-else-if="filteredConnectionModels.length === 0"
            class="p-8 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl space-y-2"
          >
            <UIcon name="i-lucide-cpu" class="size-8 text-muted mx-auto" />
            <p class="text-sm text-muted">
              {{ t('aiProviders.models_empty') }}
            </p>
            <UButton
              v-if="connectionModelsTarget"
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-sparkles"
              :loading="isDiscoveringConnectionModels"
              :label="t('aiProviders.fetch_models')"
              @click="refreshModelsForConnection(connectionModelsTarget)"
            />
          </div>

          <!-- Models List -->
          <div
            v-else
            class="max-h-[50vh] divide-y divide-neutral-200 dark:divide-neutral-800 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
          >
            <div
              v-for="m in filteredConnectionModels"
              :key="m.id"
              class="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20 transition-colors"
            >
              <UIcon
                :name="connectionModelsTarget?.config?.AI_MODEL === m.modelId ? 'i-lucide-star' : 'i-lucide-box'"
                class="size-4 shrink-0"
                :class="connectionModelsTarget?.config?.AI_MODEL === m.modelId ? 'text-warning fill-warning' : 'text-muted'"
              />

              <div class="min-w-0 flex-1">
                <p
                  class="truncate font-mono text-xs"
                  :class="m.isEnabled ? 'text-highlighted font-medium' : 'text-muted line-through'"
                  :title="m.modelId"
                >
                  {{ m.modelId }}
                </p>
                <p v-if="m.displayName && m.displayName !== m.modelId" class="text-[11px] text-muted truncate">
                  {{ m.displayName }}
                </p>
              </div>

              <!-- Primary badge -->
              <UBadge
                v-if="connectionModelsTarget?.config?.AI_MODEL === m.modelId"
                color="warning"
                variant="subtle"
                size="xs"
              >
                {{ t('aiProviders.primary_badge') }}
              </UBadge>

              <!-- Source badge -->
              <UBadge color="neutral" variant="subtle" size="xs">
                {{ m.source === 'discovered' ? t('aiProviders.source_discovered')
                  : t('aiProviders.source_manual') }}
              </UBadge>

              <!-- Enable Switch -->
              <USwitch
                :model-value="m.isEnabled"
                size="xs"
                :disabled="hubModelBusy === m.id"
                :aria-label="m.modelId"
                @update:model-value="hubToggleModel(m)"
              />

              <!-- Model Action Dropdown -->
              <UDropdownMenu
                :items="[
                  ...(connectionModelsTarget && connectionModelsTarget.config?.AI_MODEL !== m.modelId ? [{
                    label: t('aiProviders.set_primary'),
                    icon: 'i-lucide-star',
                    color: 'primary' as const,
                    disabled: !m.isEnabled,
                    onSelect: () => setDefaultModelForConnection(connectionModelsTarget!, m.modelId)
                  }] : []),
                  {
                    label: t('aiProviders.copy_model_id'),
                    icon: 'i-lucide-copy',
                    color: 'neutral' as const,
                    onSelect: () => { copy(m.modelId); notify.success(t('aiProviders.model_id_copied', [m.modelId])) }
                  },
                  { type: 'separator' as const },
                  {
                    label: t('aiProviders.delete_model'),
                    icon: 'i-lucide-trash-2',
                    color: 'error' as const,
                    onSelect: () => promptDeleteModel(m)
                  }
                ]"
                :content="{ align: 'end' }"
              >
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  square
                  size="xs"
                  :aria-label="t('common.actions')"
                />
              </UDropdownMenu>
            </div>
          </div>

          <!-- Bottom: Add Manual Model input row (like tm-trading) -->
          <div class="flex flex-wrap items-center gap-2 border-t border-neutral-200 dark:border-neutral-800 pt-3">
            <UInput
              v-model="inlineNewModelId"
              size="sm"
              class="min-w-[180px] flex-1"
              :placeholder="t('aiProviders.model_id_hint')"
              @keyup.enter="addInlineModelSubmit"
            />
            <UInput
              v-model="inlineNewModelDisplayName"
              size="sm"
              class="min-w-[140px] flex-1"
              :placeholder="t('aiProviders.display_name')"
              @keyup.enter="addInlineModelSubmit"
            />
            <UButton
              size="sm"
              icon="i-lucide-plus"
              :loading="inlineModelAdding"
              variant="soft"
              color="primary"
              :disabled="!inlineNewModelId.trim()"
              :label="t('aiProviders.add_model')"
              @click="addInlineModelSubmit"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- ==================================================================== -->
    <!-- MODAL: ADD MANUAL MODEL                                              -->
    <!-- ==================================================================== -->
    <LazyBaseFormModal
      v-model:open="isModelModalOpen"
      :title="t('aiProviders.add_model')"
      :state="modelForm"
      :loading="modelSaving"
      :submit-label="t('common.save')"
      @submit="saveModelSubmit"
    >
      <div class="space-y-3">
        <UFormField :label="'Provider'" required>
          <USelect
            v-model="modelForm.provider"
            :items="providerOptions.filter(o => o.value !== 'all')"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('aiProviders.model_id')" required>
          <UInput
            v-model="modelForm.modelId"
            :placeholder="t('aiProviders.model_id_hint')"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('aiProviders.display_name')">
          <UInput
            v-model="modelForm.displayName"
            placeholder="vd. GPT-4o Mini (OpenAI)"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>
      </div>
    </LazyBaseFormModal>

    <!-- ==================================================================== -->
    <!-- MODAL: CONNECT PROVIDER (catalogue picker, unconnected only)          -->
    <!-- ==================================================================== -->
    <UModal
      v-model:open="connectOpen"
      :title="t('aiProviders.connect_provider_title')"
      :description="t('aiProviders.connect_provider_hint')"
      :ui="{ content: 'sm:max-w-xl' }"
    >
      <template #body>
        <div class="space-y-3">
          <UInput
            v-model="connectSearch"
            icon="i-lucide-search"
            :placeholder="t('common.search')"
            class="w-full"
            autocomplete="off"
          />
          <div v-if="!connectableProviders.length" class="py-6 text-center text-xs text-muted">
            {{ t('aiProviders.connect_all_connected') }}
          </div>
          <div v-else class="max-h-80 space-y-1 overflow-y-auto pr-1">
            <button
              v-for="p in connectableProviders"
              :key="p.definition.key"
              type="button"
              class="flex w-full items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
              @click="connectProvider(p.definition.key)"
            >
              <UIcon :name="providerIcon(p.definition.key)" class="size-4 shrink-0 text-muted" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-highlighted">{{ p.definition.name }}</span>
                <span class="block truncate text-[11px] text-muted">
                  {{ p.definition.adapter_type }} ·
                  {{ p.definition.base_url_default || t('aiProviders.custom_endpoint') }}
                </span>
              </span>
              <UIcon name="i-lucide-plus" class="size-4 shrink-0 text-primary" />
            </button>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ==================================================================== -->
    <!-- MODAL: IMPORT / EXPORT PROVIDERS (JSON / ENV / CSV)                  -->
    <!-- ==================================================================== -->
    <LazyAiProvidersIoModal
      v-model:open="ioOpen"
      :mode="ioMode"
      :app-id="appId"
      :providers="hubProviders"
      :can-export-secrets="isRoot"
      @completed="refreshHub"
    />

    <!-- ==================================================================== -->
    <!-- MODAL: CONFIRM DELETE CREDENTIAL                                     -->
    <!-- ==================================================================== -->
    <LazyBaseConfirmModal
      :open="!!deleteConnectionTarget"
      :title="t('aiProviders.delete_credential')"
      :description="deleteConnectionTarget
        ? t('aiProviders.connection_deleted_confirm', [deleteConnectionTarget.connection.name || deleteConnectionTarget.providerName])
        : ''"
      :loading="isDeleting"
      :confirm-label="t('common.delete')"
      @update:open="val => !val && (deleteConnectionTarget = null)"
      @confirm="executeDeleteConnection"
    />

    <!-- ==================================================================== -->
    <!-- MODAL: CONFIRM DELETE MODEL                                          -->
    <!-- ==================================================================== -->
    <LazyBaseConfirmModal
      :open="!!deleteModelTarget"
      :title="t('aiProviders.delete_model')"
      :description="deleteModelTarget
        ? t('aiProviders.model_deleted_confirm', [deleteModelTarget.displayName || deleteModelTarget.modelId])
        : ''"
      :loading="isDeleting"
      :confirm-label="t('common.delete')"
      @update:open="val => !val && (deleteModelTarget = null)"
      @confirm="executeDeleteModel"
    />
  </BasePage>
</template>
