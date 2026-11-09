<script setup lang="ts">
import { isDocumentConnectionError } from '~/utils/documentStudio'

const props = defineProps<{
  code: string | null
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()

const visible = computed(() => isDocumentConnectionError(props.code))

const description = computed(() =>
  props.code === 'error.invalidToken'
    ? t('document.connection.invalidToken')
    : t('document.connection.notConfigured')
)
</script>

<template>
  <UAlert
    v-if="visible"
    color="warning"
    variant="subtle"
    icon="i-lucide-plug-zap"
    :title="t('document.connection.title')"
    :description="description"
  >
    <template #actions>
      <UButton
        to="/system/settings/hub"
        color="warning"
        variant="soft"
        size="sm"
        icon="i-lucide-settings-2"
        :label="t('document.connection.openSettings')"
      />
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-refresh-cw"
        :label="t('global.retry')"
        @click="emit('retry')"
      />
    </template>
  </UAlert>
</template>
