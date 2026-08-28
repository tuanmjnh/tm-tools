<script setup lang="ts">
defineProps<{
  collapsed?: boolean
}>()
const appConfig = useAppConfig()
</script>

<template>
  <div class="flex items-center gap-2.5 px-1 py-1 select-none overflow-hidden h-9">
    <!-- Premium Brand Logo Icon -->
    <div
      class="flex items-center justify-center shrink-0 w-6 h-6 rounded-lg bg-primary text-white shadow-md shadow-primary/20">
      <UIcon name="i-lucide-wrench" class="w-3 h-3" />
    </div>

    <!-- Brand Name (hidden when collapsed) -->
    <Transition enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200" enter-from-class="opacity-0" leave-to-class="opacity-0">
      <div v-if="!collapsed" class="flex flex-col min-w-0">
        <span class="text-sm font-bold text-highlighted truncate leading-tight tracking-wide uppercase">
          {{ appConfig.system.app_name }}
        </span>
        <span class="text-[10px] text-muted truncate leading-none">
          {{ appConfig.system.app_description }}
        </span>
      </div>
    </Transition>
  </div>
</template>
