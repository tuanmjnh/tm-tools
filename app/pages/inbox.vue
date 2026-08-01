<script setup lang="ts">
import type { Mail } from '~/types'
import { breakpointsTailwind } from '@vueuse/core'

const { t } = useI18n()

const tabItems = computed(() => [{
  label: t('inbox.all'),
  value: 'all'
}, {
  label: t('inbox.unread'),
  value: 'unread'
}])

const selectedTab = ref('all')

const { data: mails } = await useFetch<Mail[]>('/api/mails', { default: () => [] })

const filteredMails = computed(() => {
  if (selectedTab.value === 'unread') {
    return mails.value.filter(mail => !!mail.unread)
  }
  return mails.value
})

const selectedMail = ref<Mail | null>()

const isMailPanelOpen = computed({
  get() { return !!selectedMail.value },
  set(value: boolean) { if (!value) selectedMail.value = null }
})

watch(filteredMails, () => {
  if (!filteredMails.value.find(mail => mail.id === selectedMail.value?.id)) {
    selectedMail.value = null
  }
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
</script>

<template>
  <UDashboardPanel id="inbox-1" :default-size="25" :min-size="20" :max-size="30" resizable>
    <UDashboardNavbar :title="$t('inbox.title')">
      <template #leading>
        <UDashboardSidebarCollapse />
      </template>
      <template #trailing>
        <UBadge :label="filteredMails.length" variant="subtle" />
      </template>
      <template #right>
        <UTabs v-model="selectedTab" :items="tabItems" :content="false" size="xs" />
      </template>
    </UDashboardNavbar>
    <LazyInboxList v-model="selectedMail" :mails="filteredMails" />
  </UDashboardPanel>

  <LazyInboxMail v-if="selectedMail" :mail="selectedMail" @close="selectedMail = null" />
  <div v-else class="hidden lg:flex flex-1 items-center justify-center">
    <UIcon name="i-lucide-inbox" class="size-32 text-dimmed" />
  </div>

  <ClientOnly>
    <USlideover v-if="isMobile" v-model:open="isMailPanelOpen">
      <template #content>
        <LazyInboxMail v-if="selectedMail" :mail="selectedMail" @close="selectedMail = null" />
      </template>
    </USlideover>
  </ClientOnly>
</template>
