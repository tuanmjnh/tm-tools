<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <BasePage id="utilities-encode" :title="t('nav.utilities_encode')">
    <UtilitiesEncodePanel />
  </BasePage>
</template>
