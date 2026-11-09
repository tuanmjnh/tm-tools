<script setup lang="ts">
const page = useDocumentOperationPage('pdf.split')
const splitConfig = ref({ createSubfolder: true })

function runSplit() {
  void page.run(splitConfig.value)
}
</script>

<template>
  <BasePage
    id="document-split"
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
        :artifacts="page.session.artifacts.value"
        :accept="page.selection.accept.value"
        :multiple="page.multiple.value"
        @update:output-path="page.runtime.setOutputPath"
        @add="page.addFiles"
        @remove="page.selection.remove"
        @move="page.selection.move"
        @reset="page.selection.clear"
        @run="runSplit"
        @deleted="page.session.removeArtifact"
      >
        <template #config>
          <DocumentStudioOperationsConfigsSplitConfig v-model="splitConfig" />
        </template>
      </DocumentStudioOperationPageShell>
    </div>
  </BasePage>
</template>
