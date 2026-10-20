<script setup lang="ts">
// R140 (§204): AI key vault dashboard — WHERE each surface runs, whether
// keys are protected AT REST (R139 §203), and a per-surface connectivity
// test signed by the STORED key in the main process (the page never
// holds, reads, or writes any key). Editing stays in the AI connect
// panel on the surfaces themselves — single writer, this page observes
// and verifies.
// R147: hub-backed provider accounts, credential health and the model
// catalogue are managed here too (TM Hub /ai namespace). Secrets stay
// server-side; this page only sees masked state.
import type { AiTaskStatus, AiGatewayStatus, AiKeyVaultStatus } from '~~/types/electron'
import { useHubAi } from '~/composables/useHubAi'
import type { HubAiConnection, HubAiModel, HubAiProviderItem } from '~/composables/useHubAi'

const { t } = useI18n()
const toast = useToast()
const { appId } = useHub()
const { status: gatewayStatusFn, listModels: gatewayListModels, tasks } = useTmcutAi()
const {
  listProviders: hubListProviders,
  discoverModels: hubDiscoverModels,
  listModels: hubListModels,
  addModel: hubAddModel,
  toggleModel: hubSetModelEnabled,
  deleteModel: hubDeleteModel,
  patchConnection: hubPatchConnection,
  deleteConnection: hubDeleteConnection
} = useHubAi()

const hasElectron = computed(() => typeof window !== 'undefined' && !!window.electronAPI?.tools?.aiGateway)
const loading = ref(false)
const testing = ref<Record<string, boolean>>({})

const gatewayStatus = ref<AiGatewayStatus | null>(null)
const surfaceTasks = ref<Record<string, AiTaskStatus> | null>(null)
const vault = ref<AiKeyVaultStatus | null>(null)

// R147: hub-backed provider accounts + model catalogue
const hubLoading = ref(false)
const hubProviders = ref<HubAiProviderItem[]>([])
const hubModelsByProvider = ref<Record<string, HubAiModel[]>>({})
const expandedProvider = ref<string | null>(null)
const hubBusyKey = ref('')
const hubPatchKey = ref('')
const hubModelBusy = ref('')

// R141: three distinguishable states — fresh install (no config file yet),
// keychain available (keys encrypted), keychain unavailable (keys
// plaintext). Without `exists` the first two both reported 0/0 and the
// banner lied about the OS keychain.
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

type TestTarget = 'global' | 'plan' | 'transcribe' | 'triage'
interface TestResult { state: 'ok' | 'warn' | 'fail', detail: string }
const testResults = ref<Record<string, TestResult>>({})

const testStateColor = (r: TestResult | undefined) =>
  r?.state === 'ok' ? 'success' : r?.state === 'warn' ? 'warning' : 'error'

const surfaceRows = computed(() => {
  return [
    { key: 'editorScript', task: 'plan' as TestTarget, label: t('tmcut.aiConnect.surfaceEditorScript'), st: surfaceTasks.value?.['plan'] || null },
    { key: 'captions', task: 'transcribe' as TestTarget, label: t('tmcut.aiConnect.surfaceCaptions'), st: surfaceTasks.value?.['transcribe'] || null },
    { key: 'autocut', task: 'triage' as TestTarget, label: t('tmcut.aiConnect.surfaceAutocut'), st: surfaceTasks.value?.['triage'] || null }
  ]
})

/** Surfaces WITH a verdict, pre-joined so the template never indexes a
 *  Record with a possibly-missing key (loop shape narrows `res`). */
const testedRows = computed(() => {
  const rows: Array<{ task: TestTarget, label: string, res: TestResult }> = []
  for (const row of surfaceRows.value) {
    const res = testResults.value[row.task]
    if (res) rows.push({ task: row.task, label: row.label, res })
  }
  return rows
})

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
      // surfaces stay '—' until a successful refresh
    } finally {
      loading.value = false
    }
  }
  await refreshHub()
}

/** Loads provider accounts + the model catalogue from TM Hub. Runs even
 *  without Electron so the page stays useful in a plain browser (R147). */
async function refreshHub() {
  hubLoading.value = true
  try {
    const [providers, models] = await Promise.all([
      hubListProviders(appId),
      hubListModels(appId, { includeDisabled: true })
    ])
    hubProviders.value = providers
    const byProvider: Record<string, HubAiModel[]> = {}
    for (const m of models) (byProvider[m.provider] ||= []).push(m)
    hubModelsByProvider.value = byProvider
  } catch (err) {
    toast.add({ title: t('global.error'), description: String(err), color: 'error' })
  } finally {
    hubLoading.value = false
  }
}

function providerHealth(c: HubAiConnection): { label: string, color: 'success' | 'error' | 'neutral' | 'warning' } {
  if (!c.isEnabled) return { label: t('aiProviders.disabled'), color: 'neutral' }
  if (c.lastTestOk === false) return { label: t('aiProviders.unhealthy'), color: 'error' }
  if (c.lastTestOk === true) return { label: t('aiProviders.healthy'), color: 'success' }
  return { label: t('aiProviders.unknown'), color: 'warning' }
}

function toggleProviderExpand(key: string) {
  expandedProvider.value = expandedProvider.value === key ? null : key
}

async function hubTest(p: HubAiProviderItem, c: HubAiConnection) {
  hubBusyKey.value = c.id
  try {
    await hubDiscoverModels(appId, { connectionId: c.id, persist: false })
    toast.add({ title: t('aiProviders.test_ok'), color: 'success' })
  } catch (err) {
    toast.add({ title: t('aiProviders.test_fail'), description: String(err), color: 'error' })
  } finally {
    hubBusyKey.value = ''
    await refreshHub()
  }
}

async function hubFetchModels(p: HubAiProviderItem, c: HubAiConnection) {
  hubBusyKey.value = c.id
  try {
    const res = await hubDiscoverModels(appId, { connectionId: c.id, persist: true })
    toast.add({ title: t('aiProviders.models_fetched', [String(res.discovered)]), color: 'success' })
  } catch (err) {
    toast.add({ title: t('aiProviders.test_fail'), description: String(err), color: 'error' })
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
    toast.add({ title: t('global.error'), description: String(err), color: 'error' })
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
    toast.add({ title: t('global.error'), description: String(err), color: 'error' })
  } finally {
    hubPatchKey.value = ''
  }
}

async function hubDelete(c: HubAiConnection) {
  hubPatchKey.value = c.id
  try {
    await hubDeleteConnection(appId, c.id)
    toast.add({ title: t('aiProviders.disconnected'), color: 'success' })
    await refreshHub()
  } catch (err) {
    toast.add({ title: t('global.error'), description: String(err), color: 'error' })
  } finally {
    hubPatchKey.value = ''
  }
}

async function hubToggleModel(m: HubAiModel) {
  hubModelBusy.value = m.id
  try {
    await hubSetModelEnabled(appId, m.id, !m.isEnabled)
    await refreshHub()
  } catch (err) {
    toast.add({ title: t('global.error'), description: String(err), color: 'error' })
  } finally {
    hubModelBusy.value = ''
  }
}

async function hubRemoveModel(m: HubAiModel) {
  hubModelBusy.value = m.id
  try {
    await hubDeleteModel(appId, m.id)
    await refreshHub()
  } catch (err) {
    toast.add({ title: t('global.error'), description: String(err), color: 'error' })
  } finally {
    hubModelBusy.value = ''
  }
}

// Manual model add (roadmap §2.5 — when discovery is unsupported).
const isModelOpen = ref(false)
const modelSaving = ref(false)
const modelProviderKey = ref('')
const modelForm = ref<{ modelId: string, displayName: string }>({ modelId: '', displayName: '' })

function openAddModel(p: HubAiProviderItem) {
  modelProviderKey.value = p.definition.key
  modelForm.value = { modelId: '', displayName: '' }
  isModelOpen.value = true
}

async function saveModel() {
  const modelId = modelForm.value.modelId.trim()
  if (!modelId) return
  modelSaving.value = true
  try {
    await hubAddModel(appId, {
      provider: modelProviderKey.value,
      connectionId: null,
      modelId,
      displayName: modelForm.value.displayName.trim() || undefined
    })
    toast.add({ title: t('aiProviders.model_added'), color: 'success' })
    isModelOpen.value = false
    await refreshHub()
  } catch (err) {
    toast.add({ title: t('global.error'), description: String(err), color: 'error' })
  } finally {
    modelSaving.value = false
  }
}

/** Tests the SAVED slots for a task IN THE MAIN PROCESS — the stored key
 *  never travels here, so the result is about the real config, not about
 *  anything this page could hold (§203 honesty rule). */
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
    // The provider answered, just not with a model list → credentials fine.
    const reachable = /no model ids|has no model/i.test(message)
    testResults.value = {
      ...testResults.value,
      [task]: { state: reachable ? 'warn' : 'fail', detail: message.slice(0, 180) }
    }
  } finally {
    testing.value = { ...testing.value, [task]: false }
  }
}

// R143 (§206): the amber "keychain unavailable / plaintext keys" banner
// used to be a dead end — the startup migration runs once, so a keychain
// that was briefly unavailable at boot left plaintext sitting until the
// next launch. This button re-runs the SAME idempotent migration in main
// (already-encrypted tokens skipped) and reads the counts back; it can
// only change storage FORM, never a config value (§203).
const migrating = ref(false)
const justEncrypted = ref(false)

const showEncryptButton = computed(() =>
  !!vault.value && vault.value.available && vault.value.plaintext > 0
)

async function handleEncrypt() {
  if (migrating.value) return
  migrating.value = true
  justEncrypted.value = false
  try {
    const res = await window.electronAPI?.aiMigrateKeys?.()
    if (res?.ok && res.data) {
      vault.value = res.data
      justEncrypted.value = res.data.plaintext === 0
    }
  } catch {
    // banner + counts stay as-is; the action is safe to retry
  } finally {
    migrating.value = false
  }
}
</script>

<template>
  <BasePage id="ai_keys" :title="t('settings.aiKeysTitle')" :description="t('settings.aiKeysDesc')">
    <template #right>
      <UButton
        color="neutral"
        variant="soft"
        size="xs"
        icon="i-lucide-refresh-cw"
        :loading="loading"
        :title="t('settings.aiKeysRefresh')"
        :aria-label="t('settings.aiKeysRefresh')"
        @click="refresh"
      />
    </template>

    <div class="max-w-3xl space-y-4">
      <p v-if="!hasElectron" class="text-xs text-amber-600 dark:text-amber-400">
        {{ t('tmcut.aiConnect.desktopOnly') }}
      </p>

      <template v-else>
        <!-- ============ At-rest encryption banner ========================= -->
        <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-2 min-w-0">
              <UIcon
                :name="vaultBanner.icon"
                class="w-5 h-5 shrink-0"
                :class="vaultBanner.color"
              />
              <div class="min-w-0">
                <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {{ vaultBanner.title }}
                </p>
                <p class="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
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

        <!-- ============ Global connection ================================= -->
        <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
          <div class="flex items-center justify-between gap-2 px-3 py-2">
            <span class="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wide">
              {{ t('tmcut.aiConnect.globalLabel') }}
            </span>
            <span class="flex items-center gap-1 min-w-0">
              <span
                class="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 truncate max-w-[50%]"
                :class="gatewayStatus?.configured ? '' : 'text-amber-600 dark:text-amber-400'"
              >
                {{ gatewayStatus ? `${gatewayStatus.providerLabel}${gatewayStatus.model ? ' · ' + gatewayStatus.model : ''}` : '—' }}
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
          <div class="flex items-center justify-between gap-2 px-3 py-1.5">
            <span class="text-[11px] text-neutral-500 dark:text-neutral-400">{{ t('tmcut.aiConnect.apiKeyLabel') }}</span>
            <UBadge
              :color="gatewayStatus?.hasKey ? 'success' : 'neutral'"
              variant="subtle"
              size="xs"
            >
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

        <!-- ============ Per-surface rows ================================= -->
        <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
          <div
            v-for="row in surfaceRows"
            :key="row.key"
            class="flex items-center justify-between gap-2 px-3 py-2"
          >
            <span class="text-[11px] text-neutral-600 dark:text-neutral-300">{{ row.label }}</span>
            <span class="flex items-center gap-1 min-w-0">
              <UBadge
                v-if="row.st && !row.st.hasKey && !row.st.provider?.includes('ollama')"
                color="warning"
                variant="subtle"
                size="xs"
              >
                {{ t('settings.aiKeysMissing') }}
              </UBadge>
              <span
                class="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 truncate max-w-[55%]"
                :class="row.st?.configured ? '' : 'text-amber-600 dark:text-amber-400'"
              >
                {{ row.st ? `${row.st.providerLabel}${row.st.overridden ? ' •' : ''}${row.st.model ? ' · ' + row.st.model : ''}` : '—' }}
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
          <!-- Last test verdict per surface (kept until the next test). -->
          <div
            v-for="tested in testedRows"
            :key="`res-${tested.task}`"
            class="flex items-center gap-1.5 px-3 py-1"
          >
            <UBadge :color="testStateColor(tested.res)" variant="subtle" size="xs">
              {{ tested.label }}
            </UBadge>
            <span class="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
              {{ tested.res.detail }}
            </span>
          </div>
        </div>
        <p class="text-[10px] text-neutral-400 dark:text-neutral-500">
          {{ t('tmcut.aiConnect.surfaceHint') }}
        </p>

        <!-- ============ How-to note ====================================== -->
        <div class="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 text-xs space-y-1.5 text-neutral-600 dark:text-neutral-400">
          <div class="flex items-center gap-2 font-medium text-neutral-800 dark:text-neutral-200">
            <UIcon name="i-lucide-info" class="w-4 h-4 text-primary" />
            <span>{{ t('settings.aiKeysWhereTitle') }}</span>
          </div>
          <p>{{ t('settings.aiKeysWhere1') }}</p>
          <p>{{ t('settings.aiKeysWhere2') }}</p>
          <p>{{ t('settings.aiKeysWhere3') }}</p>
        </div>
      </template>

      <!-- ============ R147: hub provider accounts + model catalogue ====== -->
      <div class="space-y-3 pt-2">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {{ t('settings.aiKeysHubProvidersTitle') }}
          </h2>
          <UButton
            color="neutral"
            variant="soft"
            size="xs"
            icon="i-lucide-plus"
            :label="t('aiProviders.add_credential')"
            @click="navigateTo('/resources/connections')"
          />
        </div>

        <div v-if="hubLoading" class="flex items-center justify-center py-10">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-muted" />
        </div>

        <div v-else-if="!hubProviders.length" class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
          <UIcon name="i-lucide-bot" class="size-8 text-muted mx-auto mb-2" />
          <p class="text-sm text-neutral-700 dark:text-neutral-300">
            {{ t('settings.aiKeysNoProviders') }}
          </p>
          <p class="text-xs text-muted mt-1">
            {{ t('settings.aiKeysNoProvidersDesc') }}
          </p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="p in hubProviders"
            :key="p.definition.key"
            class="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden"
          >
            <button
              type="button"
              class="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
              @click="toggleProviderExpand(p.definition.key)"
            >
              <UIcon :name="expandedProvider === p.definition.key ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-muted shrink-0" />
              <UIcon name="i-lucide-bot" class="size-4 text-muted shrink-0" />
              <div class="min-w-0 flex-1">
                <span class="text-xs font-medium text-neutral-800 dark:text-neutral-200">{{ p.definition.name }}</span>
                <span class="text-[10px] text-muted ml-2">{{ p.definition.adapter_type }}</span>
              </div>
              <UBadge
                variant="subtle"
                size="xs"
                color="neutral"
                class="shrink-0"
              >
                {{ t('aiProviders.credentials_count', [String(p.connections.length)]) }}
              </UBadge>
            </button>

            <div v-if="expandedProvider === p.definition.key" class="border-t border-neutral-200 dark:border-neutral-800 px-3 py-2 space-y-2">
              <div v-if="!p.connections.length" class="text-xs text-muted py-1">
                {{ t('aiProviders.no_credentials') }}
              </div>

              <div v-for="c in p.connections" :key="c.id" class="rounded-md border border-neutral-200 dark:border-neutral-800 p-2 space-y-1.5">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">{{ c.name || t('aiProviders.default_name') }}</span>
                    <UBadge :color="providerHealth(c).color" variant="subtle" size="xs">
                      {{ providerHealth(c).label }}
                    </UBadge>
                    <UBadge
                      v-if="c.isShared"
                      color="warning"
                      variant="subtle"
                      size="xs"
                    >
                      {{ t('aiProviders.shared') }}
                    </UBadge>
                  </div>
                  <div class="flex items-center gap-1 flex-wrap">
                    <UTooltip :text="t('aiProviders.enable')">
                      <USwitch
                        :model-value="c.isEnabled"
                        size="sm"
                        :disabled="hubPatchKey === c.id"
                        :aria-label="t('aiProviders.enable')"
                        @update:model-value="hubToggleEnabled(c)"
                      />
                    </UTooltip>
                    <UTooltip :text="t('aiProviders.share')">
                      <USwitch
                        :model-value="c.isShared"
                        size="sm"
                        :disabled="hubPatchKey === c.id"
                        :aria-label="t('aiProviders.share')"
                        @update:model-value="hubToggleShared(c)"
                      />
                    </UTooltip>
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-plug-zap"
                      :loading="hubBusyKey === c.id"
                      :title="t('connections.test')"
                      @click="hubTest(p, c)"
                    />
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-download"
                      :loading="hubBusyKey === c.id"
                      :title="t('aiProviders.fetch_models')"
                      @click="hubFetchModels(p, c)"
                    />
                    <UButton
                      color="error"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-trash-2"
                      :loading="hubPatchKey === c.id"
                      :title="t('aiProviders.delete_credential')"
                      @click="hubDelete(c)"
                    />
                  </div>
                </div>
                <p class="text-[10px] text-muted">
                  <template v-if="c.baseUrlOverride || c.config?.AI_BASE_URL">
                    {{ c.baseUrlOverride || String(c.config?.AI_BASE_URL) }} ·
                  </template>
                  {{ t('aiProviders.last_test') }}:
                  {{ c.lastTestAt ? new Date(c.lastTestAt).toLocaleString() : t('aiProviders.never') }}
                </p>
              </div>

              <!-- Model catalogue for this provider (roadmap §2.4-§2.7) -->
              <div class="pt-1">
                <div class="flex items-center justify-between gap-2 mb-1.5">
                  <span class="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                    {{ t('aiProviders.models_title') }}
                    <span class="text-muted font-normal">({{ (hubModelsByProvider[p.definition.key] || []).length }})</span>
                  </span>
                  <UButton
                    color="primary"
                    variant="soft"
                    size="xs"
                    icon="i-lucide-plus"
                    :label="t('aiProviders.add_model')"
                    @click="openAddModel(p)"
                  />
                </div>
                <div v-if="!(hubModelsByProvider[p.definition.key] || []).length" class="text-[11px] text-muted py-1">
                  {{ t('aiProviders.models_empty') }}
                </div>
                <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
                  <div v-for="m in hubModelsByProvider[p.definition.key] || []" :key="m.id" class="flex items-center gap-2 rounded-md border border-neutral-200 dark:border-neutral-800 px-2 py-1">
                    <div class="min-w-0 flex-1">
                      <p class="text-[11px] font-medium text-neutral-800 dark:text-neutral-200 truncate">
                        {{ m.displayName || m.modelId }}
                      </p>
                      <p class="text-[10px] text-muted truncate font-mono">
                        {{ m.modelId }}
                      </p>
                    </div>
                    <UBadge variant="subtle" size="xs" :color="m.source === 'discovered' ? 'info' : 'neutral'">
                      {{ m.source }}
                    </UBadge>
                    <USwitch
                      :model-value="m.isEnabled"
                      size="sm"
                      :disabled="hubModelBusy === m.id"
                      :aria-label="t('aiProviders.enable')"
                      @update:model-value="hubToggleModel(m)"
                    />
                    <UButton
                      color="error"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-x"
                      :aria-label="t('aiProviders.delete_model')"
                      @click="hubRemoveModel(m)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <BaseFormModal
      v-model:open="isModelOpen"
      :title="t('aiProviders.add_model')"
      :state="{ modelId: modelForm.modelId }"
      :loading="modelSaving"
      :submit-label="t('common.save')"
      @submit="saveModel"
    >
      <UFormField :label="t('aiProviders.model_id')" required class="mb-3">
        <UInput
          v-model="modelForm.modelId"
          :placeholder="t('aiProviders.model_id_hint')"
          autocomplete="off"
          class="w-full"
        />
      </UFormField>
      <UFormField :label="t('aiProviders.display_name')" class="mb-3">
        <UInput v-model="modelForm.displayName" autocomplete="off" class="w-full" />
      </UFormField>
    </BaseFormModal>
  </BasePage>
</template>
