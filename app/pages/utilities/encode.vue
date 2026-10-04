<script setup lang="ts">
const { currentUtility } = useUtilitiesMeta()
</script>

<template>
  <BasePage id="utilities-encode" :title="currentUtility.title" :description="currentUtility.description">
    <UtilitiesEncodePanel />
  </BasePage>
</template>
