<script setup lang="ts">
import { isDocumentConnectionError } from '~/utils/documentStudio'

const props = defineProps<{
  code: string | null
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
const auth = useAuth()

const canConfigure = computed(() => {
  const user = auth.user.value
  return !!user && (user.permissions?.includes('*') === true || user.role === 'root')
})

const visible = computed(() => isDocumentConnectionError(props.code))

const description = computed(() => {
  if (!canConfigure.value) return t('document.connection.contactAdminDesc')
  return props.code === 'error.invalidToken'
    ? t('document.connection.invalidToken')
    : t('document.connection.notConfigured')
})
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
        v-if="canConfigure"
        to="/system/settings/hub"
        color="warning"
        variant="soft"
        size="sm"
        icon="i-lucide-settings-2"
        :label="t('document.connection.openSettings')"
      />
      <span v-else class="text-xs font-medium text-toned">
        {{ t('document.connection.contactAdmin') }}
      </span>
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
