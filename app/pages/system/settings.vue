<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const auth = useAuth()

// Device credentials are root-only. Hiding the tab keeps non-root users out of
// a page that would only answer 403; the server guard is the real check.
const isRoot = computed(() => {
  const user = auth.user.value
  return !!user && (user.permissions?.includes('*') === true || user.role === 'root')
})

const navItems = computed<NavigationMenuItem[]>(() => [
  { label: t('settings.appearance'), icon: 'i-lucide-palette', to: '/system/settings/appearance' },
  { label: t('nav.system'), icon: 'i-lucide-cpu', to: '/system/settings/system' },
  ...(isRoot.value
    ? [{ label: t('settings.hub.title'), icon: 'i-lucide-plug-zap', to: '/system/settings/hub' }]
    : []),
  { label: t('profile.info'), icon: 'i-lucide-user-circle', to: '/system/settings/profile' },
  { label: t('profile.security'), icon: 'i-lucide-shield', to: '/system/settings/security' },
  { label: t('profile.sessions'), icon: 'i-lucide-monitor-smartphone', to: '/system/settings/sessions' },
  { label: t('notifications.pushTitle'), icon: 'i-lucide-radio-tower', to: '/system/settings/push' }
])
</script>

<template>
  <BasePage id="settings" :title="t('settings.title')" :description="t('settings.description')">
    <BaseSectionNav :items="navItems">
      <NuxtPage />
    </BaseSectionNav>
  </BasePage>
</template>
