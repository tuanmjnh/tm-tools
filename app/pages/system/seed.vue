<script setup lang="ts">
import { getErrorMessage } from '~/shared/utils/errors'

definePageMeta({ middleware: 'root' })

const toast = useToast()
const { t } = useI18n()
const running = ref(false)
const result = ref('')

async function runSeed(reset: boolean) {
  if (running.value) return
  running.value = true
  result.value = ''
  try {
    const res = await $fetch<{ success: boolean, message: string }>('/api/seed', {
      method: 'POST',
      body: { reset }
    })
    result.value = res.message
    toast.add({ title: res.message, icon: 'i-lucide-check', color: 'success' })
  } catch (err: unknown) {
    const msg = getErrorMessage(err, key => t(key))
    result.value = msg
    toast.add({ title: msg, color: 'error' })
  } finally {
    running.value = false
  }
}
</script>

<template>
  <BasePage id="system-seed" :title="$t('nav.seedData')">
    <div class="p-4 space-y-6">
      <UCard variant="subtle">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-database-backup" class="text-indigo-500 size-5" />
            <p class="font-semibold text-lg">
              {{ $t('nav.seedData') }}
            </p>
          </div>
        </template>
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap gap-3">
            <UButton
              icon="i-lucide-database-plus"
              :label="$t('seed.idempotent')"
              color="neutral"
              :loading="running"
              @click="runSeed(false)"
            />
            <UButton
              icon="i-lucide-database-zap"
              :label="$t('seed.reset')"
              color="error"
              variant="outline"
              :loading="running"
              @click="runSeed(true)"
            />
          </div>
          <p class="text-xs text-dimmed">
            {{ $t('seed.resetWarning') }}
          </p>
          <p
            v-if="result"
            class="text-sm text-muted font-mono bg-gray-50 dark:bg-gray-800/50 p-4 rounded border dark:border-gray-800"
          >
            {{ result }}
          </p>
        </div>
      </UCard>
    </div>
  </BasePage>
</template>
