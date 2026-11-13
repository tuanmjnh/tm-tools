<script setup lang="ts">
import { SettingsPage as TmSettingsPage } from '@tuanmjnh/tm-ui'
import type { NavigationMenuItem } from '@nuxt/ui'

defineOptions({ inheritAttrs: false })

defineProps<{
  id: string
  title: string
  description?: string
}>()

const items = useSettingsNav()
</script>

<template>
  <TmSettingsPage :id="id" :title="title" :description="description" :items="items" v-bind="$attrs">
    <template v-for="(_, name) in $slots" #[name]="data">
      <slot :name="name" v-bind="data ?? {}" />
    </template>
  </TmSettingsPage>
</template>
