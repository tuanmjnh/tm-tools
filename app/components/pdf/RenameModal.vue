<script setup lang="ts">
const props = defineProps<{
  open: boolean
  title?: string
  currentName?: string
  isFolder?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submit': [newName: string]
}>()

const { t } = useI18n()
const name = ref('')

watch(() => props.open, (val) => {
  if (val) {
    name.value = props.currentName || ''
  }
})

function onSubmit() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('submit', trimmed)
  emit('update:open', false)
}
</script>

<template>
  <LazyBaseResponsiveModal
    :open="open"
    :title="title || (isFolder ? t('pdf.folder.rename') : t('pdf.actions.rename'))"
    class="max-w-md"
    @update:open="emit('update:open', $event)"
  >
    <form class="space-y-4" @submit.prevent="onSubmit">
      <UFormField :label="t('common.name')" required>
        <UInput
          v-model="name"
          autofocus
          class="w-full"
          :placeholder="isFolder ? t('pdf.folder.namePlaceholder') : t('pdf.actions.namePlaceholder')"
        />
      </UFormField>

      <div class="flex justify-end gap-2 pt-2">
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="ghost"
          @click="emit('update:open', false)"
        />
        <UButton
          type="submit"
          :label="t('common.save')"
          color="primary"
          variant="soft"
          :disabled="!name.trim()"
        />
      </div>
    </form>
  </LazyBaseResponsiveModal>
</template>
