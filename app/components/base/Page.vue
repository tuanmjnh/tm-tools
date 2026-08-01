<script setup lang="ts">
defineProps<{
  id: string
  title: string
  navbarUi?: Record<string, unknown>
}>()
</script>

<template>
  <UDashboardPanel :id="id">
    <template #header>
      <UDashboardNavbar :title="title" :ui="navbarUi">
        <template #leading>
          <slot name="leading">
            <UDashboardSidebarCollapse />
          </slot>
        </template>
        <template v-if="$slots.left" #left>
          <slot name="left" />
        </template>
        <template #right>
          <slot name="right" />
        </template>
      </UDashboardNavbar>
      <slot name="toolbar" />
    </template>

    <template #body>
      <slot />
    </template>
  </UDashboardPanel>
</template>
