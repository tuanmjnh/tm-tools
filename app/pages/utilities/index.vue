<script setup lang="ts">
const { t } = useI18n()
const { utilityList } = useUtilitiesMeta()
</script>

<template>
  <BasePage id="utilities-index" :title="t('nav.utilities')" :description="t('utilities.subtitle')">
    <div class="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
      <!-- Hero card -->
      <div
        class="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-linear-to-br from-primary-500/10 via-primary-500/5 to-transparent p-6 sm:p-8">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="space-y-2 max-w-xl">
            <div class="flex items-center gap-2">
              <UBadge color="primary" variant="subtle" size="sm">
                {{ t('utilities.title') }}
              </UBadge>
              <span class="text-xs text-gray-500 dark:text-gray-400">v1.0</span>
            </div>
            <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              {{ t('utilities.title') }}
            </h1>
            <p class="text-sm text-gray-600 dark:text-gray-300">
              {{ t('utilities.subtitle') }}
            </p>
          </div>
          <div
            class="hidden sm:flex size-16 rounded-2xl bg-primary-500/10 dark:bg-primary-500/20 text-primary-500 items-center justify-center shrink-0">
            <UIcon name="i-lucide-sparkles" class="size-8" />
          </div>
        </div>
      </div>

      <!-- Feature Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <NuxtLink v-for="item in utilityList" :key="item.key" :to="item.to"
          class="group block p-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-primary-500/50 dark:hover:border-primary-500/50 hover:shadow-xl hover:shadow-primary-500/5 transition-all duration-300">
          <div class="flex items-start justify-between">
            <div
              class="size-12 rounded-xl bg-primary-500/10 dark:bg-primary-500/20 text-primary-500 flex items-center justify-center group-hover:scale-110 group-hover:bg-primary-500 group-hover:text-white transition-all duration-300">
              <UIcon :name="item.icon" class="size-6" />
            </div>
            <UIcon name="i-lucide-arrow-up-right"
              class="size-5 text-gray-400 group-hover:text-primary-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>

          <h2
            class="mt-5 text-lg font-semibold text-gray-900 dark:text-white group-hover:text-primary-500 transition-colors">
            {{ item.title }}
          </h2>
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
            {{ item.description }}
          </p>

          <div class="mt-6 flex flex-wrap gap-1.5">
            <UBadge v-for="tag in item.tags" :key="tag" color="neutral" variant="subtle" size="xs" class="font-mono">
              {{ tag }}
            </UBadge>
          </div>
        </NuxtLink>
      </div>
    </div>
  </BasePage>
</template>
