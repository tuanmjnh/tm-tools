<script setup lang="ts">
definePageMeta({ middleware: 'root' })

const { t } = useI18n()

const links = computed(() => [[{
  label: t('nav.config'),
  icon: 'i-lucide-plug',
  to: '/system/config',
  exact: true
}, {
  label: t('nav.seedData'),
  icon: 'i-lucide-database-backup',
  to: '/system/seed'
}]])
</script>

<template>
  <BasePage id="system" :title="t('nav.system')">
    <template #toolbar>
      <UDashboardToolbar>
        <UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <NuxtPage />
  </BasePage>
</template>
