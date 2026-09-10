<script setup lang="ts">
const { t } = useI18n()
const { isSubscribed, registerDevice, unregisterDevice } = useWebPush()

const state = reactive<{ [key: string]: boolean }>({
  email: true,
  desktop: false,
  product_updates: true,
  weekly_digest: false,
  important_updates: true
})

// Sync desktop switch state with push registration status
watch(isSubscribed, (subscribed) => {
  state.desktop = subscribed
}, { immediate: true })

const sections = computed(() => [{
  title: t('settings.notificationChannels'),
  description: t('settings.notificationChannelsDesc'),
  fields: [{
    name: 'email',
    label: t('settings.email'),
    description: t('settings.emailNotifDesc')
  }, {
    name: 'desktop',
    label: t('settings.desktop'),
    description: t('settings.desktopNotifDesc')
  }]
}, {
  title: t('settings.accountUpdates'),
  description: t('settings.accountUpdatesDesc'),
  fields: [{
    name: 'weekly_digest',
    label: t('settings.weeklyDigest'),
    description: t('settings.weeklyDigestDesc')
  }, {
    name: 'product_updates',
    label: t('settings.productUpdates'),
    description: t('settings.productUpdatesDesc')
  }, {
    name: 'important_updates',
    label: t('settings.importantUpdates'),
    description: t('settings.importantUpdatesDesc')
  }]
}])

async function onChange(name: string) {
  if (name === 'desktop') {
    if (state.desktop) {
      const success = await registerDevice()
      if (!success) {
        state.desktop = false
      }
    } else {
      await unregisterDevice()
    }
  }
}
</script>

<template>
  <div class="space-y-6">
    <div v-for="(section, index) in sections" :key="index" class="space-y-3">
      <UPageCard :title="section.title" :description="section.description" variant="naked" orientation="horizontal" />
      <UPageCard variant="subtle" :ui="{ container: 'divide-y divide-default' }">
        <UFormField v-for="field in section.fields" :key="field.name" :name="field.name" :label="field.label"
          :description="field.description" class="flex items-center justify-between not-last:pb-4 gap-2">
          <USwitch v-model="state[field.name]" @update:model-value="onChange(field.name)" />
        </UFormField>
      </UPageCard>
    </div>
  </div>
</template>
