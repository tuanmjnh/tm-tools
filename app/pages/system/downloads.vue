<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <BasePage id="system_downloads" :title="t('settings.download')" :description="t('settings.downloadDesc')">
    <div class="w-full">
      <ToolsDownloadConfigManager />
    </div>
  </BasePage>
</template>
