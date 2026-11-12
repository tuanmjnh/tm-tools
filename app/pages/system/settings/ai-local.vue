<script setup lang="ts">
import type { AILocalConnectionRow, AILocalConnectionTest } from '~/shared/types/aiLocal'

/**
 * Local AI connections (Hybrid AI, mode = `local`).
 *
 * A connection listed here is called by this machine, not by the Hub relay.
 * The key never lives in the JSON: the row stores a config slot name
 * (`AI_API_KEY_<SUFFIX>`), which the desktop shell encrypts with the OS
 * keychain. The server only ever sees `hasKey`.
 */
interface LocalConnectionStatus {
  connectionId: string
  provider: string
  baseUrl: string
  hasKey: boolean
  apiKeyEnv: string | null
  models: string[]
}

const MASK = '********'

const { t } = useI18n()
const notify = useNotify()
const auth = useAuth()

const desktop = computed(() => Boolean(window.electronAPI?.isElectron))
const rows = ref<AILocalConnectionRow[]>([])
const loading = ref(true)
const saving = ref(false)
const loadFailed = ref(false)
const errors = ref<string[]>([])
const testingId = ref('')
const tests = ref<Record<string, AILocalConnectionTest>>({})

function emptyRow(): AILocalConnectionRow {
  return {
    connectionId: '',
    provider: 'openai-compatible',
    baseUrl: '',
    models: '',
    apiKeyEnv: '',
    apiKey: '',
    hasKey: false
  }
}

function toRow(entry: LocalConnectionStatus): AILocalConnectionRow {
  return {
    connectionId: entry.connectionId,
    provider: entry.provider || 'openai-compatible',
    baseUrl: entry.baseUrl,
    models: (entry.models || []).join(', '),
    apiKeyEnv: entry.apiKeyEnv || '',
    apiKey: '',
    hasKey: entry.hasKey
  }
}

async function loadStatus() {
  try {
    const res = await $fetch<{ success: boolean, data: { connections: LocalConnectionStatus[], errors: string[] } }>(
      '/api/v1/ai/local-connections'
    )
    const data = res?.data
    errors.value = data?.errors || []
    rows.value = (data?.connections || []).map(toRow)
    loadFailed.value = false
  } catch {
    loadFailed.value = true
    errors.value = []
  } finally {
    loading.value = false
  }
}

/**
 * The vault is the source of truth for editing: it keeps the slot names of
 * connections whose key is already stored. The server view only reports
 * `hasKey`, which is not enough to round-trip a row.
 */
async function loadVault() {
  if (!desktop.value) return
  try {
    const conf = await window.electronAPI!.getConfig()
    const parsed = parseAILocalConnections(conf?.AI_LOCAL_CONNECTIONS || '')
    rows.value = parsed.connections.map((entry) => {
      const slot = entry.apiKeyEnv || ''
      const stored = slot ? String(conf?.[slot] || '') : ''
      return {
        connectionId: entry.connectionId,
        provider: entry.provider,
        baseUrl: entry.baseUrl,
        models: (entry.models || []).map(model => model.modelId).join(', '),
        apiKeyEnv: slot,
        apiKey: '',
        hasKey: Boolean(entry.apiKey) || stored === MASK || stored !== ''
      }
    })
    if (parsed.errors.length) errors.value = parsed.errors
    loadFailed.value = false
  } catch {
    notify.error(t('settings.aiLocal.loadFailed'), '')
  }
}

onMounted(async () => {
  await loadStatus()
  await loadVault()
  loading.value = false
})

function addRow() {
  rows.value.push(emptyRow())
}

function removeRow(row: AILocalConnectionRow) {
  const index = rows.value.indexOf(row)
  if (index !== -1) rows.value.splice(index, 1)
}

function buildConfig() {
  const entries = rows.value
    .filter(row => row.connectionId.trim() || row.baseUrl.trim())
    .map((row) => {
      const apiKeyEnv = row.apiKeyEnv.trim()
      return {
        connectionId: row.connectionId.trim(),
        provider: row.provider.trim() || 'openai-compatible',
        baseUrl: row.baseUrl.trim(),
        ...(apiKeyEnv ? { apiKeyEnv } : {}),
        models: row.models
          .split(',')
          .map(model => model.trim())
          .filter(Boolean)
      }
    })
  const json = JSON.stringify(entries)
  const parsed = parseAILocalConnections(json)
  return { entries, json, errors: parsed.errors }
}

async function save() {
  if (!desktop.value) return
  const built = buildConfig()
  if (built.errors.length) {
    notify.error(t('settings.aiLocal.invalid'), built.errors[0] || '')
    return
  }

  const values: Record<string, string> = { AI_LOCAL_CONNECTIONS: built.json }
  for (const row of rows.value) {
    const slot = row.apiKeyEnv.trim()
    const key = row.apiKey.trim()
    if (slot && key && key !== MASK) values[slot] = key
  }

  saving.value = true
  try {
    const token = auth.accessToken.value || String(useCookie('accessToken').value || '')
    const result = await window.electronAPI!.setConfig(values, token)
    if (!result?.success) {
      if (result?.code === 'notRoot') {
        notify.error(t('settings.hub.notRoot'), '')
        return
      }
      throw new Error('set-config failed')
    }
    for (const row of rows.value) row.apiKey = ''
    await loadStatus()
    await loadVault()
    notify.success(t('settings.aiLocal.saved'), result.path || '')
  } catch (error) {
    notify.error(t('settings.aiLocal.saveFailed'), error instanceof Error ? error.message : '')
  } finally {
    saving.value = false
  }
}

async function testRow(row: AILocalConnectionRow) {
  const connectionId = row.connectionId.trim()
  const model = row.models.split(',').map(value => value.trim()).filter(Boolean)[0]
  if (!connectionId || !model) return

  testingId.value = connectionId
  try {
    const res = await $fetch<{
      success: boolean
      data: { ok: boolean, latencyMs: number, error?: string }
    }>('/api/v1/ai/check', {
      method: 'POST',
      body: { connectionId, model }
    })
    const data = res?.data
    tests.value[connectionId] = data?.ok
      ? { ok: true, message: t('settings.aiLocal.testOk', { ms: data.latencyMs }) }
      : { ok: false, message: data?.error || t('settings.aiLocal.testFailed') }
  } catch (error) {
    tests.value[connectionId] = {
      ok: false,
      message: error instanceof Error ? error.message : t('settings.aiLocal.testFailed')
    }
  } finally {
    testingId.value = ''
  }
}

useHead({ title: computed(() => t('settings.aiLocal.title')) })
</script>

<template>
  <BaseSettingsPage
    id="settings-ai-local"
    :title="t('settings.aiLocal.title')"
    :description="t('settings.aiLocal.description')"
  >
    <div class="space-y-4">
      <UAlert
        v-if="loadFailed"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        :title="t('settings.aiLocal.loadFailed')"
      />

      <UAlert
        v-if="errors.length"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="t('settings.aiLocal.errorsTitle')"
        :description="errors.join(' · ')"
      />

      <UCard>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <span class="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary/10 p-2.5 text-primary">
              <UIcon name="i-lucide-hard-drive" class="size-5" />
            </span>
            <div class="min-w-0">
              <h2 class="text-sm font-semibold text-highlighted">
                {{ t('settings.aiLocal.title') }}
              </h2>
              <p class="text-xs text-muted">
                {{ t('settings.aiLocal.description') }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ t('settings.aiLocal.localBadge') }}
            </UBadge>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-refresh-cw"
              square
              :loading="loading"
              :aria-label="t('common.refresh')"
              @click="async () => { await loadStatus(); await loadVault() }"
            />
          </div>
        </div>

        <USkeleton v-if="loading && !rows.length" class="mt-4 h-24 w-full" />

        <p v-if="!loading && !rows.length" class="mt-4 text-sm text-muted">
          {{ t('settings.aiLocal.empty') }}
        </p>

        <div v-if="rows.length" class="mt-4 space-y-3">
          <AiProvidersLocalConnectionCard
            v-for="row in rows"
            :key="row.connectionId + '-' + row.baseUrl"
            :row="row"
            :desktop="desktop"
            :testing="testingId === row.connectionId.trim()"
            :test-result="tests[row.connectionId.trim()]"
            @test="testRow(row)"
            @remove="removeRow(row)"
          />
        </div>


        <template v-if="desktop" #footer>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                color="neutral"
                variant="soft"
                size="sm"
                icon="i-lucide-plus"
                :label="t('settings.aiLocal.add')"
                @click="addRow"
              />
              <span class="text-xs text-muted">{{ t('settings.aiLocal.unsavedHint') }}</span>
            </div>
            <UButton
              color="primary"
              variant="soft"
              icon="i-lucide-save"
              :label="t('settings.aiLocal.save')"
              :loading="saving"
              @click="save"
            />
          </div>
        </template>
      </UCard>

      <UCard v-if="!desktop">
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-server" class="mt-0.5 size-5 shrink-0 text-primary" />
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-highlighted">
              {{ t('settings.aiLocal.webTitle') }}
            </h3>
            <p class="text-xs text-muted">
              {{ t('settings.aiLocal.webDesc') }}
            </p>
            <p class="text-xs text-muted">
              {{ t('settings.aiLocal.envHint') }}
            </p>
            <pre class="overflow-x-auto rounded-md bg-elevated/60 p-2 font-mono text-xs text-muted">AI_LOCAL_CONNECTIONS=[{"connectionId":"...","baseUrl":"http://127.0.0.1:11434/v1"}]</pre>
          </div>
        </div>
      </UCard>
    </div>
  </BaseSettingsPage>
</template>
