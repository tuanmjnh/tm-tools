<script setup lang="ts">
import { PDF_EXPORT_FORMAT_META } from '~/utils/pdfStudio'
import type { PdfSourceExportFormat } from '#shared/types/pdf'

const page = useDocumentOperationPage('pdf.export')
const { t } = useI18n()

const formats = ref<PdfSourceExportFormat[]>(['png'])

const formatEntries = computed(() =>
  (Object.keys(PDF_EXPORT_FORMAT_META) as PdfSourceExportFormat[])
    .map(format => ({ format, ...PDF_EXPORT_FORMAT_META[format] }))
)

function toggle(format: PdfSourceExportFormat, checked: boolean) {
  formats.value = checked
    ? [...new Set([...formats.value, format])]
    : formats.value.filter(entry => entry !== format)
}

function runExport() {
  void page.run({ formats: formats.value })
}
</script>

<template>
  <BasePage id="document-export" :title="page.title.value" :description="page.description.value" flush>
    <div class="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
      <DocumentStudioOperationPageShell :operation="page.definition.value"
        :capabilities="page.runtime.capabilities.value" :files="page.selection.files.value"
        :ready="page.selection.ready.value && formats.length > 0" :running="page.session.running.value"
        :uploading="page.session.uploading.value" :error="page.session.error.value"
        :output-path="page.runtime.outputPath.value" :artifacts="page.session.artifacts.value"
        :accept="page.selection.accept.value" @add="page.addFiles" @remove="page.selection.remove"
        @move="page.selection.move" @reset="page.selection.clear" @run="runExport"
        @deleted="page.session.removeArtifact">
        <template #config>
          <div class="space-y-1.5">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">
              {{ t('document.export.formats') }}
            </p>
            <label v-for="entry in formatEntries" :key="entry.format"
              class="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-muted/10">
              <input type="checkbox" class="mt-0.5 size-3.5" :checked="formats.includes(entry.format)"
                @change="toggle(entry.format, ($event.target as HTMLInputElement).checked)">
              <span class="min-w-0">
                <span class="flex items-center gap-1.5 text-sm font-medium">
                  <UIcon :name="entry.icon" class="size-4 text-dimmed" />
                  {{ t(entry.labelKey) }}
                </span>
                <span class="block text-xs text-muted">{{ t(entry.hintKey) }}</span>
              </span>
            </label>
            <p class="text-xs text-muted">
              {{ t('document.export.rowsHint') }}
            </p>
          </div>
        </template>
      </DocumentStudioOperationPageShell>
    </div>
  </BasePage>
</template>
