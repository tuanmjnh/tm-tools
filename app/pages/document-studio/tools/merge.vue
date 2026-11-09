<script setup lang="ts">
const page = useDocumentOperationPage('pdf.merge')
const mergeConfig = ref({ outputName: '' })

function runMerge() {
  void page.run(mergeConfig.value)
}
</script>

<template>
  <BasePage
    id="document-merge"
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
        multiple
        @update:output-path="page.runtime.setOutputPath"
        @add="page.addFiles"
        @remove="page.selection.remove"
        @move="page.selection.move"
        @reset="page.selection.clear"
        @run="runMerge"
        @deleted="page.session.removeArtifact"
      >
        <template #config>
          <DocumentStudioOperationsConfigsMergeConfig v-model="mergeConfig" />
        </template>
      </DocumentStudioOperationPageShell>
    </div>
  </BasePage>
</template>
