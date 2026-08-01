<script setup lang="ts">
const { locale, setLocale: setI18nLocale, t } = useI18n()
const { isSettingsSlideoverOpen } = useDashboard()

const isStorageModalOpen = ref(false)

const locales: any[] = [
  { code: 'en', name: t('common.english'), language: 'English', dir: 'ltr', messages: {} },
  { code: 'vi', name: t('common.vietnamese'), language: 'Tiếng Việt', dir: 'ltr', messages: {} }
]

const uiLocale = computed({
  get: () => locale.value,
  set: (val: any) => {
    const code = (val && typeof val === 'object') ? (val.code || val.value) : val
    if (code) {
      setI18nLocale(code)
    }
  }
})
</script>

<template>
  <BaseResponsiveSlideover v-model:open="isSettingsSlideoverOpen" :title="$t('settings.title')"
    :description="$t('settings.slideoverDesc')" icon="i-lucide-settings" side="right">
    <template #body>
      <div class="space-y-6">
        <!-- Editor Type -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium text-highlighted">
              {{ $t('settings.editorType') }}
            </div>
            <LazySharedEditorTypeSwitch />
          </div>
        </div>

        <!-- Language -->
        <div class="space-y-3">
          <div class="text-sm font-medium text-highlighted">
            {{ $t('settings.language') }}
          </div>
          <ULocaleSelect v-model="uiLocale" :locales="locales" class="w-full" />
        </div>

        <!-- Storage Management -->
        <div class="space-y-3">
          <UButton icon="i-lucide-database" variant="outline" color="neutral" block
            class="justify-start text-xs rounded-xl" @click="isStorageModalOpen = true">
            {{ $t('settings.storage.storage_management') }}
          </UButton>
        </div>
      </div>

      <LazyDashboardStorageSettingsModal v-model:open="isStorageModalOpen" />
    </template>
  </BaseResponsiveSlideover>
</template>
