<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <BasePage id="utilities-random" :title="t('nav.utilities_random')">
    <UtilitiesRandomPanel />
  </BasePage>
</template>
