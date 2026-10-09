<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <div class="space-y-6">
    <UPageCard
      :title="t('settings.download')"
      :description="t('settings.downloadDesc')"
      variant="naked"
      orientation="horizontal"
    />
    <div class="w-full">
      <ToolsDownloadConfigManager />
    </div>
  </div>
</template>
