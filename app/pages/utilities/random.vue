<script setup lang="ts">
const { currentUtility } = useUtilitiesMeta()
</script>

<template>
  <BasePage id="utilities-random" :title="currentUtility.title" :description="currentUtility.description">
    <UtilitiesRandomPanel />
  </BasePage>
</template>
