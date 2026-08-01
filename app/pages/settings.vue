<script setup lang="ts">
const { t } = useI18n()

const links = computed(() => [[{
  label: t('nav.general'),
  icon: 'i-lucide-user',
  to: '/settings',
  exact: true
}, {
  label: t('nav.members'),
  icon: 'i-lucide-users',
  to: '/settings/members'
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

    <div class="flex flex-col gap-4 sm:gap-6 lg:gap-12 w-full lg:max-w-2xl mx-auto py-6">
      <NuxtPage />
    </div>
  </BasePage>
</template>
