<script setup lang="ts">
const page = useDocumentOperationPage('pdf.rasterize')
const rasterConfig = ref({ createSubfolder: true })

function runRasterize() {
  void page.run(rasterConfig.value)
}
</script>

<template>
  <BasePage id="document-rasterize" :title="page.title.value" :description="page.description.value" flush>
    <div class="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
      <DocumentStudioOperationPageShell :operation="page.definition.value"
        :capabilities="page.runtime.capabilities.value" :files="page.selection.files.value"
        :ready="page.selection.ready.value" :running="page.session.running.value"
        :uploading="page.session.uploading.value" :error="page.session.error.value"
        :output-path="page.runtime.outputPath.value" :artifacts="page.session.artifacts.value"
        :accept="page.selection.accept.value"
        @update:output-path="page.runtime.setOutputPath" @add="page.addFiles" @remove="page.selection.remove"
        @move="page.selection.move" @reset="page.selection.clear" @run="runRasterize"
        @deleted="page.session.removeArtifact">
        <template #config>
          <DocumentStudioOperationsConfigsRasterizeConfig v-model="rasterConfig" />
        </template>
      </DocumentStudioOperationPageShell>
    </div>
  </BasePage>
</template>
