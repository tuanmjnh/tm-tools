<script setup lang="ts">
import type { PdfSourceExportFormat } from '#shared/types/pdf'

const page = useDocumentOperationPage('pdf.export')

const formats = ref<PdfSourceExportFormat[]>(['png'])

function runExport() {
  void page.run({ formats: formats.value })
}
</script>

<template>
  <BasePage
    id="document-export"
    :title="page.title.value"
    :description="page.description.value"
    flush
  >
    <div class="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
      <DocumentStudioOperationPageShell
        :operation="page.definition.value"
        :capabilities="page.runtime.capabilities.value"
        :files="page.selection.files.value"
        :connection-code="page.runtime.connectionError.value"
        :ready="page.selection.ready.value && formats.length > 0"
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
        @run="runExport"
        @deleted="page.removeArtifact"
        @batch-start="runExport"
        @batch-pause="page.batch.pause"
        @batch-resume="page.batch.resume"
        @batch-stop="page.batch.stop"
        @batch-retry="page.batch.retryItem"
        @update:concurrency="page.batch.setConcurrency"
        @update:pause-ms="page.batch.setPauseMs"
        @update:max-retry="page.batch.setMaxRetry"
      >
        <template #config>
          <DocumentStudioOperationsConfigsExportFormatsConfig
            v-model="formats"
          />
        </template>
      </DocumentStudioOperationPageShell>
    </div>
  </BasePage>
</template>
