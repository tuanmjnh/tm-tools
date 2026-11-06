<script setup lang="ts">
import { formatPdfBytes, openPdfPreview, pdfFileUrl, pdfPreviewKind, type PdfFileArea } from '~/utils/pdfStudio'
import { sanitizeHtml } from '~/utils/sanitizeHtml'

interface PdfInspectResult {
  name: string
  type: 'table' | 'json' | 'text' | 'html' | 'unsupported'
  rows?: string[][]
  text?: string
  reason?: string
}

/**
 * Picks the right viewer for a library file: native PDF/image frames, table preview
 * for csv/xlsx with horizontal scrolling, formatted HTML for docx, JSON editor, and XML viewer.
 */
const props = defineProps<{
  area: PdfFileArea
  name: string
  size?: number
}>()

const emit = defineEmits<{ convert: [] }>()
const { t } = useI18n()
const route = useRoute()
const { errorText } = usePdfStudio()

const kind = computed(() => pdfPreviewKind(props.name))
const label = computed(() => props.name.split('/').pop() || props.name)
const fileUrl = computed(() => pdfFileUrl(props.area, props.name, true))
const isStandaloneWindow = computed(() => route.path === '/pdf/preview')
const loading = ref(false)
const failure = ref('')
const inspected = ref<PdfInspectResult | null>(null)

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
const zoom = ref(1)
const rotation = ref(0)

const canZoom = computed(() => kind.value === 'image')
/** Only inputs (and the legacy word area) reach the conversion route. */
const canConvert = computed(() => props.area === 'inputs' || props.area === 'word')
const imageStyle = computed(() => ({
  transform: `rotate(${rotation.value}deg) scale(${zoom.value})`,
  transition: 'transform 150ms ease'
}))

function zoomBy(direction: 1 | -1) {
  const index = ZOOM_STEPS.indexOf(zoom.value)
  const nextIndex = Math.min(ZOOM_STEPS.length - 1, Math.max(0, (index === -1 ? 2 : index) + direction))
  zoom.value = ZOOM_STEPS[nextIndex] ?? 1
}

function resetView() {
  zoom.value = 1
  rotation.value = 0
}

function rotateBy(direction: 1 | -1) {
  rotation.value = (rotation.value + direction * 90 + 360) % 360
}

watch(() => [props.area, props.name], resetView)

const jsonValue = computed<unknown>(() => {
  const text = inspected.value?.text
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
})

async function load() {
  inspected.value = null
  failure.value = ''
  if (!['table', 'json', 'xml', 'docx'].includes(kind.value)) return

  loading.value = true
  try {
    const res = await $fetch<{ data: PdfInspectResult }>('/api/v1/pdf/inspect', {
      query: { area: props.area, name: props.name }
    })
    inspected.value = res.data
  } catch (error) {
    failure.value = errorText(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => [props.area, props.name], load)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col w-full min-w-0 overflow-hidden bg-default">
    <!-- Top toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-3 py-2 bg-elevated/40 shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <UIcon
          :name="kind === 'pdf' ? 'i-lucide-file-text' : kind === 'docx' ? 'i-lucide-file-type-2' : kind === 'table' ? 'i-lucide-table-2' : kind === 'image' ? 'i-lucide-image' : 'i-lucide-file'"
          class="size-4 shrink-0 text-primary"
        />
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-highlighted" :title="name">
            {{ label }}
          </p>
          <p class="text-[11px] text-muted leading-none">
            <span v-if="typeof size === 'number'" class="mono">{{ formatPdfBytes(size) }}</span>
            <span v-if="typeof size === 'number'"> · </span>
            <span class="capitalize">{{ area }}</span>
          </p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1.5">
        <template v-if="canZoom">
          <UButton
            icon="i-lucide-zoom-out"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            :disabled="zoom === ZOOM_STEPS[0]"
            :aria-label="t('pdf.preview.zoomOut')"
            :title="t('pdf.preview.zoomOut')"
            @click="zoomBy(-1)"
          />
          <span class="mono text-[11px] text-muted tabular-nums w-9 text-center">{{ Math.round(zoom * 100) }}%</span>
          <UButton
            icon="i-lucide-zoom-in"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            :disabled="zoom === ZOOM_STEPS.at(-1)"
            :aria-label="t('pdf.preview.zoomIn')"
            :title="t('pdf.preview.zoomIn')"
            @click="zoomBy(1)"
          />
          <UButton
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            :aria-label="t('pdf.preview.rotateLeft')"
            :title="t('pdf.preview.rotateLeft')"
            @click="rotateBy(-1)"
          />
          <UButton
            icon="i-lucide-rotate-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            :aria-label="t('pdf.preview.rotateRight')"
            :title="t('pdf.preview.rotateRight')"
            @click="rotateBy(1)"
          />
          <UButton
            icon="i-lucide-maximize"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            :disabled="zoom === 1 && rotation === 0"
            :aria-label="t('pdf.preview.zoomReset')"
            :title="t('pdf.preview.zoomReset')"
            @click="resetView"
          />
        </template>
        <UButton
          v-if="!isStandaloneWindow"
          icon="i-lucide-external-link"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :aria-label="t('pdf.actions.previewWindow')"
          :title="t('pdf.actions.previewWindow')"
          @click="openPdfPreview(area, name)"
        />
        <PdfFileActions :area="area" :name="name" :deletable="false" />
      </div>
    </div>

    <!-- Content surface -->
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <div class="flex flex-col items-center gap-2">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
        <span class="text-xs text-muted">{{ t('common.loading') }}</span>
      </div>
    </div>

    <div v-else-if="failure" class="flex flex-1 items-center justify-center p-6">
      <UAlert
        color="error"
        variant="subtle"
        :title="failure"
        class="max-w-md"
      />
    </div>

    <!-- 1. Native PDF viewer frame -->
    <iframe
      v-else-if="kind === 'pdf'"
      :src="fileUrl"
      :title="name"
      class="min-h-0 w-full flex-1 border-0 bg-white"
    />

    <!-- 2. Image viewer -->
    <div v-else-if="kind === 'image'" class="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-elevated/20 p-4">
      <img
        :src="fileUrl"
        :alt="name"
        class="max-h-full max-w-full object-contain rounded-(--ui-radius) shadow-sm"
        :style="imageStyle"
      >
    </div>

    <!-- 3. Table viewer (CSV / XLSX) with full horizontal and vertical scroll -->
    <PdfPreviewTable
      v-else-if="kind === 'table'"
      :rows="inspected?.rows ?? []"
      :name="name"
      class="min-h-0 flex-1 w-full min-w-0 overflow-hidden"
    />

    <!-- 4. DOCX Word viewer rendered via HTML (content is sanitized above) -->
    <div
      v-else-if="kind === 'docx' && inspected?.type === 'html'"
      class="min-h-0 flex-1 overflow-auto bg-elevated/20 p-4 md:p-8"
    >
      <div class="max-w-4xl mx-auto rounded-(--ui-radius) border border-default bg-elevated p-8 md:p-12 shadow-sm text-sm leading-relaxed overflow-x-auto">
        <!-- eslint-disable-next-line vue/no-v-html -- sanitizeHtml strips scripts, handlers and javascript: URLs -->
        <div class="prose dark:prose-invert max-w-none docx-preview-content" v-html="sanitizeHtml(inspected?.text ?? '')" />
      </div>
    </div>

    <!-- 5. JSON editor viewer -->
    <div v-else-if="kind === 'json'" class="flex min-h-0 flex-1 flex-col p-2 w-full min-w-0 overflow-hidden">
      <InputsJsonEditor v-model="jsonValue" read-only class="min-h-0 flex-1 w-full" />
    </div>

    <!-- 6. XML / text viewer -->
    <PdfPreviewText
      v-else-if="kind === 'xml'"
      :text="inspected?.text ?? ''"
      language="xml"
      class="min-h-0 flex-1 w-full min-w-0 overflow-hidden"
    />

    <!-- 7. Fallback for docx needing conversion -->
    <div v-else-if="kind === 'docx'" class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <UIcon name="i-lucide-file-type-2" class="size-8 text-muted" />
      <p class="max-w-sm text-sm text-muted">
        {{ canConvert ? t('pdf.preview.docxNeedsPdf') : t('pdf.preview.docxNoConvert') }}
      </p>
      <UButton
        v-if="canConvert"
        icon="i-lucide-file-text"
        color="primary"
        variant="soft"
        :label="t('pdf.actions.convertInput')"
        @click="emit('convert')"
      />
    </div>

    <!-- 8. Unsupported file type -->
    <div v-else class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <UIcon name="i-lucide-file-question" class="size-8 text-muted" />
      <p class="text-sm text-muted">
        {{ t('pdf.preview.unsupported') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
:deep(.docx-preview-content table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
}
:deep(.docx-preview-content th),
:deep(.docx-preview-content td) {
  border: 1px solid var(--ui-border);
  padding: 0.5rem 0.75rem;
}
:deep(.docx-preview-content img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--ui-radius);
}
</style>
