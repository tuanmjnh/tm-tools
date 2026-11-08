<script setup lang="ts">
import type { PdfSourceExportFormat } from '#shared/types/pdf'
import { operationIdFromSlug } from '~/utils/documentStudio'

const route = useRoute()
const slug = computed(() => String(route.params.slug || ''))
const operationId = computed(() => operationIdFromSlug(slug.value))

const page = useDocumentOperationPage(operationId.value)
const exportFormats = ref<PdfSourceExportFormat[]>(['png'])

// Watch for slug changes if navigating between tools
watch(operationId, (newId) => {
  if (newId) {
    page.loadDefinition()
  }
})

const isReady = computed(() => {
  if (operationId.value === 'pdf.export') {
    return page.selection.ready.value && exportFormats.value.length > 0
  }
  return page.selection.ready.value
})

function handleRun() {
  if (operationId.value === 'pdf.export') {
    void page.run({ formats: exportFormats.value })
  } else {
    void page.run()
  }
}
</script>

<template>
  <BasePage
    :id="`document-${slug}`"
    :title="page.title.value"
    :description="page.description.value"
    flush
  >
    <div class="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
      <DocumentStudioOperationPageShell
        :operation="page.definition.value"
        :capabilities="page.runtime.capabilities.value"
        :files="page.selection.files.value"
        :ready="isReady"
        :running="page.session.running.value"
        :uploading="page.session.uploading.value"
        :error="page.session.error.value"
        :output-path="page.runtime.outputPath.value"
        :artifacts="page.session.artifacts.value"
        :accept="page.selection.accept.value"
        :multiple="page.multiple.value"
        @add="page.addFiles"
        @remove="page.selection.remove"
        @move="page.selection.move"
        @reset="page.selection.clear"
        @run="handleRun"
        @deleted="page.session.removeArtifact"
      >
        <template #config>
          <LazyDocumentStudioOperationsConfigsSplitConfig
            v-if="operationId === 'pdf.split'"
          />
          <LazyDocumentStudioOperationsConfigsConvertConfig
            v-else-if="operationId === 'document.convert-to-pdf'"
          />
          <LazyDocumentStudioOperationsConfigsExportFormatsConfig
            v-else-if="operationId === 'pdf.export'"
            v-model="exportFormats"
          />
        </template>
      </DocumentStudioOperationPageShell>
    </div>
  </BasePage>
</template>
