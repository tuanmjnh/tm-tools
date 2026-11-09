<script setup lang="ts">
const model = defineModel<string>({ default: '' })

const show = ref(false)
withDefaults(defineProps<{
  placeholder?: string
  size?: 'sm' | 'md' | 'lg'
  ariaLabel?: string
  disabled?: boolean
}>(), {
  placeholder: '',
  size: 'md',
  ariaLabel: '',
  disabled: false
})

const { t } = useI18n()
</script>

<template>
  <UInput
    v-model="model"
    :placeholder="placeholder"
    :size="size"
    :type="show ? 'text' : 'password'"
    :disabled="disabled"
    :ui="{ trailing: 'pe-1' }"
  >
    <template #trailing>
      <UButton
        color="neutral"
        variant="link"
        size="sm"
        :icon="show ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        :aria-label="ariaLabel || (show ? t('auth.hidePassword') : t('auth.showPassword'))"
        :aria-pressed="show"
        @click="show = !show"
      />
    </template>
  </UInput>
</template>

<style scoped>
::-ms-reveal {
  display: none;
}
</style>
