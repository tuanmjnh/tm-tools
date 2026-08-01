<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <div>
    <UPageHeader
      :title="t('nav.tools')"
      class="mb-6"
    />

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <UCard
        class="cursor-pointer hover:ring-2 hover:ring-primary transition-all"
        @click="navigateTo('/tools/download')"
      >
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon
              name="i-lucide-download"
              class="text-primary text-xl"
            />
            <div>
              <h3 class="font-semibold">
                {{ t('nav.download') }}
              </h3>
              <p class="text-sm text-gray-500">
                {{ t('tools.downloadDesc') }}
              </p>
            </div>
          </div>
        </template>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t('tools.downloadBody') }}
        </p>
      </UCard>

      <UCard
        class="cursor-pointer hover:ring-2 hover:ring-primary transition-all"
        @click="navigateTo('/tools/video')"
      >
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon
              name="i-lucide-video"
              class="text-primary text-xl"
            />
            <div>
              <h3 class="font-semibold">
                {{ t('nav.video') }}
              </h3>
              <p class="text-sm text-gray-500">
                {{ t('tools.videoDesc') }}
              </p>
            </div>
          </div>
        </template>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t('tools.videoBody') }}
        </p>
      </UCard>
    </div>
  </div>
</template>
