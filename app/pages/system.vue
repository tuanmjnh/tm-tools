<script setup lang="ts">
const { t } = useI18n()

const links = computed(() => [[{
  label: t('nav.general'),
  icon: 'i-lucide-user',
  to: '/system',
  exact: true
}, {
  label: t('nav.download_presets'),
  icon: 'i-lucide-download',
  to: '/system/downloads'
}, {
  label: t('nav.browsers'),
  icon: 'i-lucide-globe',
  to: '/system/browsers'
}, {
  label: t('nav.tools_binaries'),
  icon: 'i-lucide-wrench',
  to: '/system/tools'
}, {
  label: t('nav.connections'),
  icon: 'i-lucide-plug',
  to: '/system/connections'
}, {
  label: t('nav.notifications'),
  icon: 'i-lucide-bell',
  to: '/system/notifications'
}, {
  label: t('nav.security'),
  icon: 'i-lucide-shield',
  to: '/system/security'
}, {
  label: t('nav.members'),
  icon: 'i-lucide-user-plus',
  to: '/system/members'
}], [{
  label: t('nav.documentation'),
  icon: 'i-lucide-book-open',
  to: 'https://ui.nuxt.com/docs/getting-started/installation/nuxt',
  target: '_blank'
}]])
</script>

<template>
  <BasePage id="system" :title="t('nav.system')" :description="t('settings.description')">
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
