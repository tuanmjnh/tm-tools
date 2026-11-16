<script setup lang="ts">
import { UtilitiesIconsPanel } from '@tuanmjnh/tm-ui'
import type { IconSearchPage, IconSearchQuery } from '@tuanmjnh/tm-ui'

const { t } = useI18n()
const toast = useToast()

// The panel owns the frame; this file owns the endpoint and the storage key.
const FAVORITES_KEY = 'tm-tools:icon-favorites'
const favorites = ref<string[]>([])
try {
  favorites.value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')
} catch { favorites.value = [] }

function onFavorites(next: string[]) {
  favorites.value = next
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
}

const fetchIcons = (query: IconSearchQuery): Promise<IconSearchPage> =>
  $fetch<IconSearchPage>('/api/icons', { query })

function onCopied(text: string) {
  toast.add({
    title: t('utilities.icons.copiedNotification', { name: text }),
    color: 'success',
    icon: 'i-lucide-check'
  })
}

function onCopyError() {
  toast.add({ title: 'Copy failed', color: 'error', icon: 'i-lucide-circle-alert' })
}
</script>

<template>
  <UtilitiesIconsPanel
    :t="t"
    :fetch-icons="fetchIcons"
    :favorites="favorites"
    @update:favorites="onFavorites"
    @copied="onCopied"
    @copy-error="onCopyError"
  />
</template>
