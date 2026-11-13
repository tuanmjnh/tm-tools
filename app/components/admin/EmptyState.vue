<script setup lang="ts">
import { EmptyState as TmEmptyState } from '@tuanmjnh/tm-ui'
import type { EmptyStateAction } from '@tuanmjnh/tm-ui'

defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  title: string
  description?: string
  icon?: string
  actions?: EmptyStateAction[]
}>(), {
  description: '',
  icon: '',
  actions: () => []
})
</script>

<template>
  <TmEmptyState :title="title" :description="description" :icon="icon" :actions="actions" v-bind="$attrs">
    <template v-for="(_, name) in $slots" #[name]="data">
      <slot :name="name" v-bind="data ?? {}" />
    </template>
  </TmEmptyState>
</template>
