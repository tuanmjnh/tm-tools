<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiGatewayStatus, AiModelInfo, AiProviderPreset, AiTaskStatus } from '~~/types/electron'
import { useTmcutAi } from '~/composables/useTmcutAi'

// =============================================================================
//  AI connection panel (roadmap R128 / R129).
//
//  Structure: ONE global config (AI_PROVIDER / AI_BASE_URL / AI_API_KEY /
//  AI_MODEL) + two per-surface overrides:
//
//    Editor  — script generation (task `plan`) + captions (task `transcribe`)
//    AutoCut — captions (task `transcribe`) + future analysis (task `triage`)
//
//  A surface card set to "custom" writes the AI_*_<TASK> slots (set-config
//  -> process.env, so the gateway picks changes up without restart); left
//  at "global" it simply inherits the top form. The read-only surface rows
//  show the RESOLVED provider/model each part of the app actually runs on
//  (tasksStatus), so a user can see "script = GPT-4o, captions = whisper"
//  at a glance. The API key is WRITE-ONLY in this panel (never read back).
// =============================================================================

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { t } = useI18n()
const toast = useToast()
const { status, listModels, providerPresets, tasks } = useTmcutAi()

const expanded = ref(false)
const loading = ref(false)
const saving = ref(false)
const hasStoredKey = ref(false)
const gatewayStatus = ref<AiGatewayStatus | null>(null)
const presets = ref<AiProviderPreset[]>([])
const models = ref<AiModelInfo[]>([])
const surfaceTasks = ref<Record<string, AiTaskStatus> | null>(null)

const form = ref({ provider: 'openai', baseUrl: '', apiKey: '', model: '' })

/**
 * Editable surfaces = the two AI-powered parts of the app:
 * `plan` is the editor script writer, `transcribe` is AutoCut's audio pass
 * (the editor's caption button shares it — the gateway knows one task).
 */
type SurfaceTask = 'plan' | 'transcribe'
const SURFACE_KEYS: SurfaceTask[] = ['plan', 'transcribe']

interface SurfaceForm {
  custom: boolean
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

const surfaces = ref<Record<SurfaceTask, SurfaceForm>>({
  plan: { custom: false, provider: '', baseUrl: '', apiKey: '', model: '' },
  transcribe: { custom: false, provider: '', baseUrl: '', apiKey: '', model: '' }
})

const isDesktop = computed(() => typeof window !== 'undefined' && !!window.electronAPI?.tools?.aiGateway)

const selectedPreset = computed(() => presets.value.find(p => p.id === form.value.provider) || null)

const baseUrlMissing = computed(() => !form.value.baseUrl.trim() && !selectedPreset.value?.baseUrl)

const configured = computed(() => gatewayStatus.value?.configured === true)

const statusColor = computed(() => {
  if (configured.value) return 'success'
  return isDesktop.value ? 'warning' : 'neutral'
})

onMounted(async () => {
  if (!isDesktop.value) return
  await refresh()
})

async function refresh() {
  await loadPresets()
  gatewayStatus.value = await status()
  hasStoredKey.value = gatewayStatus.value?.hasKey === true
  if (gatewayStatus.value) {
    form.value.provider = gatewayStatus.value.provider || 'openai'
    form.value.baseUrl = gatewayStatus.value.baseUrl || selectedPreset.value?.baseUrl || ''
    form.value.model = gatewayStatus.value.model || ''
  }
  surfaceTasks.value = await tasks()
  // Hydrate the override editors from the RESOLVED surface status: a
  // customized surface starts from its own provider/model/endpoint, a
  // global one stays inherited (with the current key shown as "stored").
  for (const task of SURFACE_KEYS) {
    const st = surfaceTasks.value?.[task]
    const s = surfaces.value[task]
    if (!st) continue
    s.custom = st.customized === true
    if (s.custom) {
      s.provider = st.provider
      s.baseUrl = st.baseUrl || presetBaseUrl(st.provider) || ''
      s.model = st.model || ''
    } else {
      s.provider = ''
      s.baseUrl = ''
      s.apiKey = ''
      s.model = ''
    }
  }
}

function presetBaseUrl(provider: string): string | undefined {
  return presets.value.find(p => p.id === provider)?.baseUrl || undefined
}

async function loadPresets() {
  if (presets.value.length > 0) return
  presets.value = await providerPresets()
}

/** Switching the global provider prefills the built-in endpoint. */
function handleProviderChange() {
  models.value = []
  const preset = selectedPreset.value
  form.value.baseUrl = preset?.baseUrl || ''
  if (form.value.provider === 'anthropic') form.value.model = form.value.model || 'claude-haiku-4-5'
  else form.value.model = form.value.model || ''
}

function handleSurfaceToggle(task: SurfaceTask) {
  const s = surfaces.value[task]
  if (!s.custom) {
    // Start the override from the CURRENTLY RESOLVED values so toggling is
    // non-destructive: the surface keeps what it ran on before.
    const st = surfaceTasks.value?.[task]
    s.provider = st?.provider || form.value.provider
    s.baseUrl = st?.baseUrl || presetBaseUrl(s.provider) || form.value.baseUrl
    s.model = st?.model || form.value.model
    s.custom = true
  } else {
    s.custom = false
    s.provider = ''
    s.baseUrl = ''
    s.apiKey = ''
    s.model = ''
  }
}

/** Load models for the FORM the button sits next to (global or a surface). */
async function handleLoadModels(target: 'global' | SurfaceTask) {
  if (!isDesktop.value) return
  loading.value = true
  try {
    const args: { provider?: string, baseUrl?: string, apiKey?: string } = {}
    if (target === 'global') {
      args.provider = form.value.provider
      args.baseUrl = form.value.baseUrl.trim()
      if (form.value.apiKey.trim()) args.apiKey = form.value.apiKey.trim()
      const list = await listModels(args)
      models.value = list
      if (!form.value.model && list.length === 1) form.value.model = list[0]!.id
      toast.add({
        title: t('tmcut.aiConnect.modelsLoadedTitle'),
        description: t('tmcut.aiConnect.modelsLoadedDesc', { count: list.length }),
        color: 'success'
      })
    } else {
      const s = surfaces.value[target]
      args.provider = s.provider
      args.baseUrl = s.baseUrl.trim()
      if (s.apiKey.trim()) args.apiKey = s.apiKey.trim()
      const list = await listModels(args)
      s.baseUrl = args.baseUrl || s.baseUrl
      s.model = list.length === 1 ? list[0]!.id : s.model
      toast.add({
        title: t('tmcut.aiConnect.modelsLoadedTitle'),
        description: t('tmcut.aiConnect.modelsLoadedDesc', { count: list.length }),
        color: 'success'
      })
    }
  } catch (err) {
    toast.add({
      title: t('tmcut.aiConnect.loadFailedTitle'),
      description: String((err as Error)?.message || err),
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!isDesktop.value) return
  if (baseUrlMissing.value) {
    toast.add({
      title: t('tmcut.aiConnect.needsBaseTitle'),
      description: t('tmcut.aiConnect.needsBaseDesc'),
      color: 'warning'
    })
    return
  }
  saving.value = true
  try {
    const values: Record<string, string> = {
      AI_PROVIDER: form.value.provider,
      AI_BASE_URL: form.value.baseUrl.trim(),
      AI_MODEL: form.value.model.trim()
    }
    if (form.value.apiKey.trim()) values.AI_API_KEY = form.value.apiKey.trim()

    // Per-surface slots: a surface toggled to custom writes its
    // AI_*_<TASK> keys; a surface back at "global" clears its slots so the
    // saved state is exactly what the UI shows.
    for (const task of SURFACE_KEYS) {
      const up = task.toUpperCase()
      const s = surfaces.value[task]
      if (!s.custom) {
        values[`AI_PROVIDER_${up}`] = ''
        values[`AI_BASE_URL_${up}`] = ''
        values[`AI_API_KEY_${up}`] = ''
        values[`AI_MODEL_${up}`] = ''
        continue
      }
      const preset = presets.value.find(p => p.id === s.provider)
      if (!s.baseUrl.trim() && !preset?.baseUrl) {
        throw new Error(`${task}: ${t('tmcut.aiConnect.needsBaseDesc')}`)
      }
      values[`AI_PROVIDER_${up}`] = s.provider
      values[`AI_BASE_URL_${up}`] = s.baseUrl.trim()
      if (s.apiKey.trim()) values[`AI_API_KEY_${up}`] = s.apiKey.trim()
      values[`AI_MODEL_${up}`] = s.model.trim()
    }

    const res = await window.electronAPI?.setConfig(values)
    if (!res?.success) throw new Error('set-config failed')
    form.value.apiKey = ''
    for (const task of SURFACE_KEYS) surfaces.value[task].apiKey = ''
    await refresh()
    emit('saved')
    toast.add({
      title: t('tmcut.aiConnect.savedTitle'),
      description: t('tmcut.aiConnect.savedDesc'),
      color: 'success'
    })
  } catch (err) {
    toast.add({
      title: t('tmcut.aiConnect.saveFailedTitle'),
      description: String((err as Error)?.message || err),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

/** Read-only rows: what each part of the app actually runs right now. */
const surfaceRows = computed(() => {
  const rows: Array<{ key: string, label: string, st: AiTaskStatus | null }> = [
    { key: 'editorScript', label: t('tmcut.aiConnect.surfaceEditorScript'), st: surfaceTasks.value?.['plan'] || null },
    { key: 'captions', label: t('tmcut.aiConnect.surfaceCaptions'), st: surfaceTasks.value?.['transcribe'] || null },
    { key: 'autocut', label: t('tmcut.aiConnect.surfaceAutocut'), st: surfaceTasks.value?.['triage'] || null }
  ]
  return rows
})
</script>

<template>
  <div class="rounded-lg border border-neutral-200 dark:border-neutral-800">
    <button
      type="button"
      class="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      @click="expanded = !expanded"
    >
      <span class="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
        <UIcon name="i-lucide-plug" class="w-4 h-4 shrink-0" />
        {{ t('tmcut.aiConnect.title') }}
      </span>
      <span class="flex items-center gap-2 shrink-0">
        <UBadge :color="statusColor" variant="subtle" size="xs">
          {{ configured ? t('tmcut.aiConnect.ready') : t('tmcut.aiConnect.notConfigured') }}
        </UBadge>
        <UIcon :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="w-4 h-4 text-neutral-400" />
      </span>
    </button>

    <div
      v-if="expanded"
      class="px-3 pb-3 pt-3 border-t border-neutral-200 dark:border-neutral-800 flex flex-col gap-3"
    >
      <p v-if="!isDesktop" class="text-[11px] text-amber-600 dark:text-amber-400">
        {{ t('tmcut.aiConnect.desktopOnly') }}
      </p>

      <template v-else>
        <!-- ============ What each part of the app runs RIGHT NOW ============ -->
        <div class="rounded-md border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
          <div
            v-for="row in surfaceRows"
            :key="row.key"
            class="flex items-center justify-between gap-2 px-2 py-1.5"
          >
            <span class="text-[11px] text-neutral-600 dark:text-neutral-300">{{ row.label }}</span>
            <span
              class="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 truncate max-w-[55%]"
              :class="row.st?.configured ? '' : 'text-amber-600 dark:text-amber-400'"
            >
              {{ row.st ? `${row.st.providerLabel}${row.st.overridden ? ' •' : ''}${row.st.model ? ' · ' + row.st.model : ''}` : '—' }}
            </span>
          </div>
        </div>
        <p class="text-[10px] text-neutral-400 dark:text-neutral-500 -mt-1.5">
          {{ t('tmcut.aiConnect.surfaceHint') }}
        </p>

        <!-- ============ Global (default) configuration ==================== -->
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-settings" class="w-3.5 h-3.5 text-neutral-400" />
          <span class="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wide">
            {{ t('tmcut.aiConnect.globalLabel') }}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
              {{ t('tmcut.aiConnect.providerLabel') }}
            </label>
            <select
              v-model="form.provider"
              class="w-full text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
              @change="handleProviderChange"
            >
              <option v-for="preset in presets" :key="preset.id" :value="preset.id">
                {{ preset.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
              {{ t('tmcut.aiConnect.modelLabel') }}
            </label>
            <div class="flex items-center gap-1">
              <select
                v-if="models.length > 0"
                v-model="form.model"
                class="w-full min-w-0 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
              >
                <option value="">
                  {{ t('tmcut.aiConnect.modelNone') }}
                </option>
                <option v-for="model in models" :key="model.id" :value="model.id">
                  {{ model.label === model.id ? model.id : `${model.label} — ${model.id}` }}
                </option>
              </select>
              <input
                v-else
                v-model="form.model"
                type="text"
                spellcheck="false"
                :placeholder="t('tmcut.aiConnect.modelPlaceholder')"
                class="w-full min-w-0 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
              >
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-refresh-cw"
                :loading="loading"
                :title="t('tmcut.aiConnect.loadModels')"
                @click="handleLoadModels('global')"
              />
            </div>
          </div>
        </div>

        <div>
          <label class="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
            {{ t('tmcut.aiConnect.baseUrlLabel') }}
          </label>
          <input
            v-model="form.baseUrl"
            type="text"
            spellcheck="false"
            :placeholder="t('tmcut.aiConnect.baseUrlPlaceholder')"
            class="w-full text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
          >
          <p v-if="baseUrlMissing" class="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
            {{ t('tmcut.aiConnect.needsBaseHint') }}
          </p>
        </div>

        <div>
          <label class="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
            {{ t('tmcut.aiConnect.apiKeyLabel') }}
          </label>
          <input
            v-model="form.apiKey"
            type="password"
            autocomplete="off"
            :placeholder="hasStoredKey ? t('tmcut.aiConnect.apiKeyKeepPlaceholder') : t('tmcut.aiConnect.apiKeyPlaceholder')"
            class="w-full text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
          >
          <p v-if="hasStoredKey && !form.apiKey" class="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            {{ t('tmcut.aiConnect.apiKeyStoredHint') }}
          </p>
        </div>

        <!-- ============ Per-surface overrides (AI_*_<TASK> slots) ========= -->
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-git-branch" class="w-3.5 h-3.5 text-neutral-400" />
          <span class="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wide">
            {{ t('tmcut.aiConnect.overridesLabel') }}
          </span>
        </div>

        <div
          v-for="task in SURFACE_KEYS"
          :key="task"
          class="rounded-md border border-neutral-200 dark:border-neutral-800 p-2 space-y-2"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between gap-2"
            @click="handleSurfaceToggle(task)"
          >
            <span class="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
              <UIcon :name="task === 'plan' ? 'i-lucide-pen-line' : 'i-lucide-captions'" class="w-3.5 h-3.5 text-neutral-400" />
              {{ task === 'plan' ? t('tmcut.aiConnect.surfaceEditor') : t('tmcut.aiConnect.surfaceTranscribe') }}
            </span>
            <UBadge :color="surfaces[task].custom ? 'primary' : 'neutral'" variant="subtle" size="xs">
              {{ surfaces[task].custom ? t('tmcut.aiConnect.surfaceCustom') : t('tmcut.aiConnect.surfaceGlobal') }}
            </UBadge>
          </button>

          <template v-if="surfaces[task].custom">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                  {{ t('tmcut.aiConnect.providerLabel') }}
                </label>
                <select
                  v-model="surfaces[task].provider"
                  class="w-full text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
                >
                  <option v-for="preset in presets" :key="preset.id" :value="preset.id">
                    {{ preset.label }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                  {{ t('tmcut.aiConnect.modelLabel') }}
                </label>
                <input
                  v-model="surfaces[task].model"
                  type="text"
                  spellcheck="false"
                  :placeholder="t('tmcut.aiConnect.modelPlaceholder')"
                  class="w-full text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
                >
              </div>
            </div>
            <div>
              <label class="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                {{ t('tmcut.aiConnect.baseUrlLabel') }}
              </label>
              <input
                v-model="surfaces[task].baseUrl"
                type="text"
                spellcheck="false"
                :placeholder="presetBaseUrl(surfaces[task].provider) || t('tmcut.aiConnect.baseUrlPlaceholder')"
                class="w-full text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
              >
            </div>
            <div>
              <label class="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                {{ t('tmcut.aiConnect.apiKeyLabel') }}
              </label>
              <input
                v-model="surfaces[task].apiKey"
                type="password"
                autocomplete="off"
                :placeholder="t('tmcut.aiConnect.apiKeyPlaceholder')"
                class="w-full text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
              >
            </div>
          </template>
        </div>

        <div class="flex items-center justify-between gap-2">
          <p class="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
            {{ t('tmcut.aiConnect.hint') }}
          </p>
          <UButton
            color="primary"
            variant="soft"
            size="xs"
            icon="i-lucide-save"
            :loading="saving"
            :disabled="baseUrlMissing"
            @click="handleSave"
          >
            {{ t('tmcut.aiConnect.save') }}
          </UButton>
        </div>
      </template>
    </div>
  </div>
</template>
