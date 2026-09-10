<script setup lang="ts">
const { t } = useI18n()

const links = computed(() => [[{
  label: t('nav.general'),
  icon: 'i-lucide-user',
  to: '/settings',
  exact: true
}, {
  label: t('nav.download_presets'),
  icon: 'i-lucide-download',
  to: '/settings/downloads'
}, {
  label: t('nav.browsers'),
  icon: 'i-lucide-globe',
  to: '/settings/browsers'
}, {
  label: t('nav.tools_binaries'),
  icon: 'i-lucide-wrench',
  to: '/settings/tools'
}, {
  label: t('nav.notifications'),
  icon: 'i-lucide-bell',
  to: '/settings/notifications'
}, {
  label: t('nav.security'),
  icon: 'i-lucide-shield',
  to: '/settings/security'
}], [{
  label: t('nav.documentation'),
  icon: 'i-lucide-book-open',
  to: 'https://ui.nuxt.com/docs/getting-started/installation/nuxt',
  target: '_blank'
}]])
</script>

<template>
  <BasePage id="settings" :title="t('nav.settings')">
    <template #toolbar>
      <UDashboardToolbar>
        <UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <div class="p-4 flex flex-col gap-4 sm:gap-6 w-full mx-auto">
      <NuxtPage />
    </div>
  </BasePage>
</template>
