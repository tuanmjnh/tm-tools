<script setup lang="ts">
import type { BackgroundConfigModel } from '~/utils/documentStudio'

const page = useDocumentOperationPage('image.background-remove')
const config = ref<BackgroundConfigModel>(page.restoredConfig<BackgroundConfigModel>({ mode: 'chroma' }))

function runRemoveBackground() {
  void page.run(config.value)
}

watch(config, (value) => {
  page.batch.updateConfig(value)
  page.rememberSettings(value)
}, { deep: true })
</script>

<template>
  <BasePage
    id="document-remove-bg"
    :title="page.title.value"
    :description="page.description.value"
    flush
  >
    <div class="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
      <DocumentStudioOperationPageShell
        :operation="page.definition.value"
        :available="page.entry.value.available"
        :unavailable-reason="page.entry.value.unavailableReason"
        :capabilities="page.runtime.capabilities.value"
        :files="page.selection.files.value"
        :connection-code="page.runtime.connectionError.value"
        :ready="page.selection.ready.value"
        :running="page.session.running.value"
        :uploading="page.session.uploading.value"
        :loading-definition="page.loading.value"
        :progress="page.progressPercent.value"
        :progress-units="page.progressUnits.value"
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
        @run="runRemoveBackground"
        @deleted="page.removeArtifact"
        @batch-start="runRemoveBackground"
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
          <DocumentStudioOperationsConfigsBackgroundConfig v-model="config" />
        </template>
      </DocumentStudioOperationPageShell>
    </div>
  </BasePage>
</template>
