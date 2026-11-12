<script setup lang="ts">
import type { AILocalConnectionRow, AILocalConnectionTest } from '~/shared/types/aiLocal'

/**
 * One local AI connection row. Fields mutate the row object in place; the page
 * owns saving, so this card never writes the vault itself.
 */
const props = defineProps<{
  row: AILocalConnectionRow
  desktop: boolean
  testing?: boolean
  testResult?: AILocalConnectionTest | null
}>()

const emit = defineEmits<{
  test: []
  remove: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="panel-flat rounded-lg p-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField :label="t('settings.aiLocal.connectionId')" :description="t('settings.aiLocal.connectionIdDesc')">
        <UInput v-model="props.row.connectionId" class="w-full" :disabled="!props.desktop" placeholder="free-local" />
      </UFormField>
      <UFormField :label="t('settings.aiLocal.baseUrl')" :description="t('settings.aiLocal.baseUrlDesc')">
        <UInput
          v-model="props.row.baseUrl"
          class="w-full"
          :disabled="!props.desktop"
          placeholder="http://127.0.0.1:11434/v1"
        />
      </UFormField>
      <UFormField :label="t('settings.aiLocal.provider')" :description="t('settings.aiLocal.providerDesc')">
        <UInput v-model="props.row.provider" class="w-full" :disabled="!props.desktop" placeholder="openai-compatible" />
      </UFormField>
      <UFormField :label="t('settings.aiLocal.models')" :description="t('settings.aiLocal.modelsDesc')">
        <UInput v-model="props.row.models" class="w-full" :disabled="!props.desktop" placeholder="llama3.2, qwen2.5" />
      </UFormField>
      <UFormField :label="t('settings.aiLocal.keySlot')" :description="t('settings.aiLocal.keySlotDesc')">
        <UInput v-model="props.row.apiKeyEnv" class="w-full" :disabled="!props.desktop" placeholder="AI_API_KEY_FREELLM" />
      </UFormField>
      <UFormField
        :label="t('settings.aiLocal.keyValue')"
        :description="props.row.hasKey ? t('settings.aiLocal.keyValueSaved') : t('settings.aiLocal.keylessHint')"
      >
        <BasePasswordInput v-model="props.row.apiKey" class="w-full" :disabled="!props.desktop" autocomplete="off" />
      </UFormField>
    </div>

    <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-activity"
          :loading="props.testing"
          :label="t('settings.aiLocal.test')"
          :disabled="!props.row.connectionId.trim() || !props.row.models.trim()"
          @click="emit('test')"
        />
        <span
          v-if="props.testResult"
          class="truncate text-xs"
          :class="props.testResult.ok ? 'text-success' : 'text-error'"
        >
          {{ props.testResult.message }}
        </span>
      </div>
      <UButton
        v-if="props.desktop"
        color="error"
        variant="ghost"
        size="sm"
        icon="i-lucide-trash-2"
        :label="t('settings.aiLocal.remove')"
        @click="emit('remove')"
      />
    </div>
  </div>
</template>
