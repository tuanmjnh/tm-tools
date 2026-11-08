<script setup lang="ts">
const page = useDocumentOperationPage('pdf.merge')
</script>

<template>
  <BasePage id="document-merge" :title="page.title.value" :description="page.description.value" flush>
    <div class="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
      <DocumentStudioOperationPageShell :operation="page.definition.value"
        :capabilities="page.runtime.capabilities.value" :files="page.selection.files.value"
        :ready="page.selection.ready.value" :running="page.session.running.value"
        :uploading="page.session.uploading.value" :error="page.session.error.value"
        :output-path="page.runtime.outputPath.value" :artifacts="page.session.artifacts.value"
        :accept="page.selection.accept.value" multiple @add="page.addFiles" @remove="page.selection.remove"
        @move="page.selection.move" @reset="page.selection.clear" @run="page.run()"
        @deleted="page.session.removeArtifact" />
    </div>
  </BasePage>
</template>
