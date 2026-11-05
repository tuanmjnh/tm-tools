<script setup lang="ts">
const props = defineProps<{
  open: boolean
  parentFolder?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submit': [name: string]
}>()

const { t } = useI18n()
const name = ref('')

watch(() => props.open, (val) => {
  if (val) name.value = ''
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
    :title="t('pdf.folder.createTitle')"
    :description="parentFolder ? t('pdf.folder.createIn', { folder: parentFolder }) : undefined"
    class="max-w-md"
    @update:open="emit('update:open', $event)"
  >
    <form class="space-y-4" @submit.prevent="onSubmit">
      <UFormField :label="t('pdf.folder.name')" required>
        <UInput
          v-model="name"
          autofocus
          class="w-full"
          :placeholder="t('pdf.folder.namePlaceholder')"
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
          :label="t('pdf.folder.create')"
          color="primary"
          variant="soft"
          :disabled="!name.trim()"
        />
      </div>
    </form>
  </LazyBaseResponsiveModal>
</template>
