<template>
  <div class="space-y-4">
    <UTabs
      :model-value="active"
      :items="items"
      class="w-full"
      :content="false"
      :ui="{ list: 'px-4 sm:px-6 flex-nowrap overflow-x-auto scrollbar-hide shrink-0', trigger: 'flex-shrink-0', content: 'flex-1 min-h-0 overflow-y-auto custom-scrollbar py-4 sm:py-6 px-4 sm:px-6 pb-24' }"
      @update:model-value="onSelect"
    />
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUtilitiesMeta } from '~/composables/useUtilitiesMeta'

defineProps<{ active: string }>()
const emit = defineEmits<{ select: [value: string] }>()
const { utilityList } = useUtilitiesMeta()

const items = computed(() => {
  return utilityList.value
    .filter(item => item.key !== 'editor')
    .map(item => ({
      label: item.title,
      value: item.key,
      icon: item.icon
    }))
})

function onSelect(v: string | number | undefined) {
  if (v) emit('select', String(v))
}
</script>
