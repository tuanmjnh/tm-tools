<script setup lang="ts">
// R140 (§204): AI key vault dashboard — WHERE each surface runs, whether
// keys are protected AT REST (R139 §203), and a per-surface connectivity
// test signed by the STORED key in the main process (the page never
// holds, reads, or writes any key). Editing stays in the AI connect
// panel on the surfaces themselves — single writer, this page observes
// and verifies.
import type { AiTaskStatus, AiGatewayStatus, AiKeyVaultStatus } from '~~/types/electron'

const { t } = useI18n()
const { status, listModels, tasks } = useTmcutAi()

const hasElectron = computed(() => typeof window !== 'undefined' && !!window.electronAPI?.tools?.aiGateway)
const loading = ref(false)
const testing = ref<Record<string, boolean>>({})

const gatewayStatus = ref<AiGatewayStatus | null>(null)
const surfaceTasks = ref<Record<string, AiTaskStatus> | null>(null)
const vault = ref<AiKeyVaultStatus | null>(null)

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
  if (hasElectron.value) void refresh()
})

async function refresh() {
  loading.value = true
  try {
    gatewayStatus.value = await status()
    surfaceTasks.value = await tasks()
    const res = await window.electronAPI?.aiKeyStatus?.()
    vault.value = res?.ok && res.data ? res.data : null
  } catch {
    // surfaces stay '—' until a successful refresh
  } finally {
    loading.value = false
  }
}

/** Tests the SAVED slots for a task IN THE MAIN PROCESS — the stored key
 *  never travels here, so the result is about the real config, not about
 *  anything this page could hold (§203 honesty rule). */
async function handleTest(task: TestTarget) {
  if (testing.value[task]) return
  testing.value = { ...testing.value, [task]: true }
  try {
    const list = await listModels(task === 'global' ? {} : { task })
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
        :title="t('tmcut.captions.refreshStatus')"
        :aria-label="t('tmcut.captions.refreshStatus')"
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
            </div>
          </div>
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
    </div>
  </BasePage>
</template>
