<script setup lang="ts">
const { currentUtility } = useUtilitiesMeta()
</script>

<template>
  <BasePage id="utilities-text" :title="currentUtility.title" :description="currentUtility.description">
    <UtilitiesTextPanel />
  </BasePage>
</template>
