<script setup lang="ts">
import { UtilitiesToolTabs as TmUtilitiesToolTabs } from '@tuanmjnh/tm-ui'
import { useUtilitiesMeta } from '~/composables/useUtilitiesMeta'

// The tab list is app-specific (it comes from useUtilitiesMeta), so this wrapper
// builds it and hands the package plain { label, value, icon } items.
defineProps<{ active: string }>()
const emit = defineEmits<{ select: [value: string] }>()

const { utilityList } = useUtilitiesMeta()

const items = computed(() => utilityList.value
  .filter(item => item.key !== 'editor')
  .map(item => ({ label: item.title, value: item.key, icon: item.icon })))
</script>

<template>
  <TmUtilitiesToolTabs :active="active" :items="items" @select="emit('select', $event)" />
</template>
