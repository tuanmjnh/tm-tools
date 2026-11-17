<script setup lang="ts">
import type { BackgroundConfigModel } from '~/utils/documentStudio'

const props = withDefaults(defineProps<{
  modelValue?: BackgroundConfigModel
}>(), {
  modelValue: () => ({ mode: 'chroma' })
})

const emit = defineEmits<{
  'update:modelValue': [value: BackgroundConfigModel]
}>()

const { t } = useI18n()
const api = useDocumentApi()

const mode = computed(() => props.modelValue?.mode ?? 'chroma')

// ── AI model install state ────────────────────────────────────────────────
const modelInstalled = ref(false)
const modelVerified = ref(false)
const modelBytes = ref(0)
const modelExpectedBytes = ref(0)
const installing = ref(false)
const installPercent = ref(0)
const installError = ref('')
let poll: ReturnType<typeof setInterval> | null = null

function stopPoll() {
  if (poll) {
    clearInterval(poll)
    poll = null
  }
}

async function refreshModel() {
  try {
    const status = await api.imageModelStatus()
    modelInstalled.value = status.installed
    modelVerified.value = status.verified
    modelBytes.value = status.bytes
    modelExpectedBytes.value = status.expectedBytes
    installing.value = status.installing
    if (status.installing && status.progress) installPercent.value = status.progress.percent
    if (status.verified) stopPoll()
  } catch {
    // A missing route or unconfigured runtime just means "not installed".
  }
}

async function installModel() {
  if (installing.value) return
  installing.value = true
  installError.value = ''
  installPercent.value = 0
  stopPoll()
  poll = setInterval(() => {
    void refreshModel()
  }, 1000)
  try {
    await api.installImageModel()
    await refreshModel()
  } catch {
    installError.value = t('document.removeBackground.installFailed')
  } finally {
    installing.value = false
    stopPoll()
    await refreshModel()
  }
}

const sizeLabel = computed(() => {
  const bytes = modelExpectedBytes.value || modelBytes.value
  return bytes ? `${(bytes / (1024 * 1024)).toFixed(0)} MB` : ''
})

onMounted(() => {
  void refreshModel()
})
onBeforeUnmount(stopPoll)

const modes = computed(() => [
  { value: 'chroma' as const, label: t('document.removeBackground.modeChroma'), hint: t('document.removeBackground.modeChromaHint') },
  { value: 'ai' as const, label: t('document.removeBackground.modeAi'), hint: t('document.removeBackground.modeAiHint') }
])

function selectMode(value: 'chroma' | 'ai') {
  emit('update:modelValue', { ...props.modelValue, mode: value })
}

const tolerance = computed({
  get: () => props.modelValue?.tolerance ?? 30,
  set: (value: number) => emit('update:modelValue', { ...props.modelValue, tolerance: value })
})

const backdropHex = computed({
  get: () => {
    const [r, g, b] = props.modelValue?.backdrop ?? [255, 255, 255]
    return '#' + [r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('')
  },
  set: (value: string) => {
    const hex = value.replace('#', '')
    if (hex.length !== 6) return
    emit('update:modelValue', {
      ...props.modelValue,
      backdrop: [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ]
    })
  }
})
</script>

<template>
  <div class="space-y-3">
    <UFormField :label="t('document.removeBackground.mode')">
      <div class="grid gap-2">
        <button
          v-for="entry in modes"
          :key="entry.value"
          type="button"
          class="panel-flat flex w-full items-start gap-3 rounded-md p-3 text-start transition-all cursor-pointer"
          :class="[
            mode === entry.value
              ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
              : 'border-default hover:border-default/80 hover:bg-muted/10'
          ]"
          :aria-pressed="mode === entry.value"
          @click="selectMode(entry.value)"
        >
          <div
            class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
            :class="mode === entry.value ? 'border-primary bg-primary text-primary-foreground' : 'border-gray-500 bg-transparent'"
          >
            <UIcon v-if="mode === entry.value" name="i-lucide-check" class="size-3" />
          </div>
          <span class="min-w-0">
            <span class="block text-sm font-medium">{{ entry.label }}</span>
            <span class="block text-xs text-muted">{{ entry.hint }}</span>
          </span>
        </button>
      </div>
    </UFormField>

    <template v-if="mode === 'chroma'">
      <UFormField :label="t('document.removeBackground.backdrop')">
        <UInput v-model="backdropHex" type="color" class="w-full" />
      </UFormField>
      <UFormField :label="t('document.removeBackground.tolerance')">
        <div class="flex items-center gap-3">
          <input
            v-model.number="tolerance"
            type="range"
            min="0"
            max="120"
            class="flex-1 accent-primary"
          >
          <span class="w-10 text-right text-xs font-mono">{{ tolerance }}</span>
        </div>
      </UFormField>
    </template>

    <div v-if="mode === 'ai'" class="space-y-2">
      <div
        v-if="modelVerified"
        class="flex items-center gap-2 rounded-md bg-success/10 p-2 text-xs text-success"
      >
        <UIcon name="i-lucide-circle-check" class="size-4 shrink-0" />
        <span>{{ t('document.removeBackground.modelReady') }}</span>
      </div>

      <UAlert
        v-else-if="installError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="t('document.removeBackground.modelMissing')"
        :description="installError"
      >
        <template #actions>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :label="t('document.removeBackground.retryInstall')"
            @click="installModel"
          />
        </template>
      </UAlert>

      <div v-else class="space-y-2 rounded-md border border-default/60 p-3">
        <p class="text-xs text-muted">
          {{ t('document.removeBackground.modelMissingHint', { size: sizeLabel }) }}
        </p>
        <div v-if="installing" class="space-y-1">
          <UProgress :model-value="installPercent" size="xs" />
          <p class="text-[11px] text-muted">
            {{ t('document.removeBackground.installing', { percent: installPercent }) }}
          </p>
        </div>
        <UButton
          v-else
          size="sm"
          color="primary"
          variant="soft"
          icon="i-lucide-download"
          block
          :label="t('document.removeBackground.install', { size: sizeLabel })"
          @click="installModel"
        />
      </div>
    </div>
  </div>
</template>
