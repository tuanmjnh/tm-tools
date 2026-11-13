<script setup lang="ts">
import type { PdfSourceExportFormat } from '#shared/types/pdf'
import { operationIdFromSlug } from '~/utils/documentStudio'

const route = useRoute()
const slug = computed(() => String(route.params.slug || ''))
const operationId = computed(() => operationIdFromSlug(slug.value))

const page = useDocumentOperationPage(operationId.value)
const exportFormats = ref<PdfSourceExportFormat[]>(['png'])
const extractConfig = ref<Record<string, unknown>>({})
const splitConfig = ref({ createSubfolder: true })
const mergeConfig = ref({ outputName: '' })
const rasterConfig = ref({ createSubfolder: true })

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
  } else if (operationId.value === 'document.ai-extract') {
    void page.run(extractConfig.value)
  } else if (operationId.value === 'pdf.split') {
    void page.run(splitConfig.value)
  } else if (operationId.value === 'pdf.merge') {
    void page.run(mergeConfig.value)
  } else if (operationId.value === 'pdf.rasterize') {
    void page.run(rasterConfig.value)
  } else {
    void page.run()
  }
}

watch(exportFormats, (formats) => {
  if (operationId.value === 'pdf.export') page.batch.updateConfig({ formats })
}, { deep: true })

watch(extractConfig, (config) => {
  if (operationId.value === 'document.ai-extract') page.batch.updateConfig(config)
}, { deep: true })

watch(splitConfig, (config) => {
  if (operationId.value === 'pdf.split') page.batch.updateConfig(config)
}, { deep: true })

watch(rasterConfig, (config) => {
  if (operationId.value === 'pdf.rasterize') page.batch.updateConfig(config)
}, { deep: true })
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
        :connection-code="page.runtime.connectionError.value"
        :files="page.selection.files.value"
        :ready="isReady"
        :running="page.session.running.value"
        :uploading="page.session.uploading.value"
        :error="page.session.error.value"
        :output-path="page.runtime.outputPath.value"
        :artifacts="page.resultArtifacts.value"
        :accept="page.selection.accept.value"
        :multiple="page.multiple.value"
        :batch="page.batchViewModel.value"
        @update:output-path="page.runtime.setOutputPath"
        @add="page.addFiles"
        @remove="page.selection.remove"
        @move="page.selection.move"
        @reset="page.selection.clear"
        @reload="page.reload"
        @run="handleRun"
        @deleted="page.removeArtifact"
        @batch-start="handleRun"
        @batch-pause="page.batch.pause"
        @batch-resume="page.batch.resume"
        @batch-stop="page.batch.stop"
        @batch-retry="page.batch.retryItem"
        @batch-retry-all="page.batch.retryAllFailed"
        @batch-clear="page.batch.clear"
        @update:concurrency="page.batch.setConcurrency"
        @update:pause-ms="page.batch.setPauseMs"
        @update:max-retry="page.batch.setMaxRetry"
      >
        <template #config>
          <LazyDocumentStudioOperationsConfigsSplitConfig
            v-if="operationId === 'pdf.split'"
            v-model="splitConfig"
          />
          <LazyDocumentStudioOperationsConfigsMergeConfig
            v-else-if="operationId === 'pdf.merge'"
            v-model="mergeConfig"
          />
          <LazyDocumentStudioOperationsConfigsRasterizeConfig
            v-else-if="operationId === 'pdf.rasterize'"
            v-model="rasterConfig"
          />
          <LazyDocumentStudioOperationsConfigsConvertConfig
            v-else-if="operationId === 'document.convert-to-pdf'"
          />
          <LazyDocumentStudioOperationsConfigsExportFormatsConfig
            v-else-if="operationId === 'pdf.export'"
            v-model="exportFormats"
          />
          <LazyDocumentStudioOperationsConfigsAiExtractionConfig
            v-else-if="operationId === 'document.ai-extract'"
            v-model="extractConfig"
          />
        </template>
      </DocumentStudioOperationPageShell>
    </div>
  </BasePage>
</template>
