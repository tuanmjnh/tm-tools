<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {{ t('tmcut.videoTemplates.tabFactory') }}
        </h1>
        <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          {{ t('tmcut.factory.newBatchDesc') }}
        </p>
      </div>
      <URouterLink to="/tmcut/templates" class="text-sm text-primary-500 hover:underline">
        {{ t('tmcut.factory.backToTemplates') }}
      </URouterLink>
    </div>

    <TmcutVideoFactory />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { TmcutVideoFactory } from '#components'

const { t } = useI18n()
</script>