<script setup lang="ts">
const page = useDocumentOperationPage('document.convert-to-pdf')

function runConvert() {
  void page.run()
}
</script>

<template>
  <BasePage
    id="document-convert"
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
        :ready="page.selection.ready.value"
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
        @reload="page.reload"
        @move="page.selection.move"
        @reset="page.selection.clear"
        @run="runConvert"
        @deleted="page.removeArtifact"
        @batch-start="runConvert"
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
          <DocumentStudioOperationsConfigsConvertConfig />
        </template>
      </DocumentStudioOperationPageShell>
    </div>
  </BasePage>
</template>
