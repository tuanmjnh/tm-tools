<script setup lang="ts">
import { DialogTitle, DialogDescription } from 'reka-ui'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue?: boolean
  open?: boolean
  title?: string
  description?: string
  loading?: boolean
  disabled?: boolean
  dismissible?: boolean
  close?: boolean
  side?: 'top' | 'right' | 'bottom' | 'left'
  icon?: string
  ui?: any
}>(), {
  modelValue: undefined,
  open: undefined,
  title: '',
  description: undefined,
  loading: false,
  disabled: false,
  dismissible: true,
  close: true,
  side: 'right',
  icon: undefined,
  ui: () => ({})
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:open', value: boolean): void
  (e: 'close'): void
}>()

const isOpen = computed({
  get: () => props.modelValue ?? props.open ?? false,
  set: (val) => {
    emit('update:modelValue', val)
    emit('update:open', val)
    if (!val) emit('close')
  }
})

const isLoading = computed(() => props.loading)
const isDisabled = computed(() => props.disabled)

// Default UI configuration for slideover
const defaultUi = {
  header: 'flex items-center gap-2 justify-between w-full border-b border-gray-200 dark:border-gray-800 px-4 py-3',
  body: 'flex-1 overflow-y-auto p-4 sm:p-6',
  content: 'w-screen max-w-xl flex flex-col',
  footer: 'flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50'
}

const uiConfig = computed(() => {
  const ui: any = { ...defaultUi }
  if (props.ui) {
    for (const key in props.ui) {
      if (typeof props.ui[key] === 'object' && props.ui[key] !== null && ui[key]) {
        ui[key] = { ...ui[key], ...props.ui[key] }
      } else {
        ui[key] = props.ui[key]
      }
    }
  }
  return ui
})
</script>

<template>
  <USlideover v-model:open="isOpen" :title="title" :description="description" :ui="uiConfig"
    :dismissible="isDisabled || isLoading ? false : dismissible" :side="side" v-bind="$attrs">
    <template #header>
      <slot v-if="$slots.header" name="header" />
      <div v-else class="flex items-center gap-2 justify-between w-full min-w-0">
        <div class="flex items-center justify-center gap-2 min-w-0">
          <!-- Mobile Back Button -->
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" class="inline-flex sm:hidden"
            @click="isOpen = false" :disabled="isDisabled" :loading="isLoading" />

          <!-- Icon Slot/Prop -->
          <slot name="icon">
            <UIcon v-if="icon" :name="icon" class="size-5 text-primary shrink-0" />
          </slot>

          <div class="flex flex-col min-w-0">
            <DialogTitle class="text-base font-bold leading-6 text-gray-900 dark:text-white truncate"
              :class="ui?.title">
              {{ title }}
              <slot name="header-left" />
            </DialogTitle>
            <DialogDescription v-if="description" class="text-sm text-gray-500 font-normal truncate"
              :class="ui?.description">
              {{ description }}
            </DialogDescription>
            <DialogDescription v-else class="sr-only">
              Slideover Description
            </DialogDescription>
          </div>
        </div>
        <!-- Desktop Close Button -->
        <div class="flex items-center gap-2">
          <slot name="header-right" />
          <!-- <UTooltip v-if="close" :text="$t('common.close')"> -->
          <UButton v-if="close" color="neutral" variant="ghost" icon="i-lucide-x" class="hidden sm:inline-flex"
            @click="isOpen = false" :disabled="isDisabled" :loading="isLoading" />
          <!-- </UTooltip> -->
        </div>
      </div>
    </template>

    <template v-if="$slots.content" #content>
      <slot name="content" />
    </template>
    <template v-else-if="$slots.body" #body>
      <slot name="body" />
    </template>

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </USlideover>
</template>
