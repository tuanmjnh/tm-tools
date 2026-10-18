<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiGatewayStatus, AiModelInfo, AiProviderPreset } from '~~/types/electron'
import { useTmcutAi } from '~/composables/useTmcutAi'

// =============================================================================
//  AI connection panel (roadmap R128 branch D).
//
//  One endpoint, many providers/models: this is the setup surface for
//  OpenAI-compatible AGGREGATORS (FreeLLMAPI, OpenRouter, LiteLLM, …). The
//  config is persisted through the existing config.env IPC — set-config also
//  writes process.env, which the main-process gateway reads on every call, so
//  saving here takes effect immediately (no app restart).
//
//  The API key is WRITE-ONLY in this panel: it is never read back into the
//  renderer (the masked status only reports whether one is stored), so a
//  saved key cannot leak through the UI or a devtools session.
// =============================================================================

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { t } = useI18n()
const toast = useToast()
const { status, listModels, providerPresets } = useTmcutAi()

const expanded = ref(false)
const loading = ref(false)
const saving = ref(false)
const hasStoredKey = ref(false)
const gatewayStatus = ref<AiGatewayStatus | null>(null)
const presets = ref<AiProviderPreset[]>([])
const models = ref<AiModelInfo[]>([])

const form = ref({ provider: 'openai', baseUrl: '', apiKey: '', model: '' })

const isDesktop = computed(() => typeof window !== 'undefined' && !!window.electronAPI?.tools?.aiGateway)

const selectedPreset = computed(() => presets.value.find(p => p.id === form.value.provider) || null)

/** The endpoint still has to come from the user (aggregator/custom providers). */
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
    // Show the built-in endpoint when the stored provider has one, so the
    // field is never a blank mystery; aggregators keep the stored value.
    form.value.baseUrl = gatewayStatus.value.baseUrl || selectedPreset.value?.baseUrl || ''
    form.value.model = gatewayStatus.value.model || ''
  }
}

async function loadPresets() {
  if (presets.value.length > 0) return
  presets.value = await providerPresets()
  if (presets.value.length > 0 && selectedPreset.value) {
    const builtIn = presets.value.find(p => p.id === form.value.provider)?.baseUrl
    if (builtIn && !form.value.baseUrl) form.value.baseUrl = builtIn
  }
}

/** Switching provider prefills the built-in endpoint and clears a stale model. */
function handleProviderChange() {
  models.value = []
  const preset = selectedPreset.value
  form.value.baseUrl = preset?.baseUrl || ''
  if (form.value.provider === 'anthropic') form.value.model = form.value.model || 'claude-haiku-4-5'
  else form.value.model = ''
}

async function handleLoadModels() {
  if (!isDesktop.value) return
  loading.value = true
  try {
    const args: { provider?: string, baseUrl?: string, apiKey?: string } = {
      provider: form.value.provider,
      baseUrl: form.value.baseUrl.trim()
    }
    // Only forward a freshly typed key; otherwise the gateway uses the stored one.
    if (form.value.apiKey.trim()) args.apiKey = form.value.apiKey.trim()
    const list = await listModels(args)
    models.value = list
    if (!form.value.model && list.length === 1) form.value.model = list[0]!.id
    toast.add({
      title: t('tmcut.aiConnect.modelsLoadedTitle'),
      description: t('tmcut.aiConnect.modelsLoadedDesc', { count: list.length }),
      color: 'success'
    })
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
    // Never overwrite a stored key with an empty string.
    if (form.value.apiKey.trim()) values.AI_API_KEY = form.value.apiKey.trim()
    const res = await window.electronAPI?.setConfig(values)
    if (!res?.success) throw new Error('set-config failed')
    form.value.apiKey = ''
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

        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
              {{ t('tmcut.aiConnect.modelLabel') }}
            </label>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-refresh-cw"
              :loading="loading"
              @click="handleLoadModels"
            >
              {{ t('tmcut.aiConnect.loadModels') }}
            </UButton>
          </div>
          <select
            v-if="models.length > 0"
            v-model="form.model"
            class="w-full text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
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
            class="w-full text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
          >
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
