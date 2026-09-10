<script setup lang="ts">
import { useDebounceFn, useInfiniteScroll } from '@vueuse/core'

const { t } = useI18n()
const toast = useToast()

const filters = reactive({
  search: '',
  collection: 'all',
  cursor: '',
  limit: 80
})

const icons = ref<string[]>([])
const isFetching = ref(false)
const hasMore = ref(false)
const scrollParent = ref<HTMLElement | null>(null)

// Customization & preview settings
const iconSize = ref<number>(28)
const selectedColor = ref<string>('currentColor')
const copyFormat = ref<'name' | 'vue_ui' | 'vue_btn' | 'class'>('name')

// Favorites in localStorage
const FAVORITES_KEY = 'utilities:icons:favorites'
const favorites = useLocalStorage<string[]>(FAVORITES_KEY, [])

// Modal inspect
const selectedIcon = ref<string | null>(null)
const isDetailsOpen = ref(false)

const collections = computed(() => [
  { label: t('utilities.icons.allCollections'), value: 'all' },
  { label: 'Lucide', value: 'lucide' },
  { label: 'Simple Icons', value: 'simple-icons' },
  { label: `${t('utilities.icons.favorites')} (${favorites.value.length})`, value: 'favorites' }
])

const colors = [
  { label: 'Default', value: 'currentColor', class: 'text-gray-700 dark:text-gray-200' },
  { label: 'Primary', value: '#10b981', class: 'text-emerald-500' },
  { label: 'Blue', value: '#3b82f6', class: 'text-blue-500' },
  { label: 'Purple', value: '#8b5cf6', class: 'text-purple-500' },
  { label: 'Rose', value: '#f43f5e', class: 'text-rose-500' },
  { label: 'Amber', value: '#f59e0b', class: 'text-amber-500' }
]

const copyFormats = computed(() => [
  { label: t('utilities.icons.copyName'), value: 'name' },
  { label: t('utilities.icons.copyVue'), value: 'vue_ui' },
  { label: t('utilities.icons.copyButton'), value: 'vue_btn' },
  { label: t('utilities.icons.copyClass'), value: 'class' }
])

function generateSnippet(icon: string, format: string) {
  switch (format) {
    case 'vue_ui':
      return `<UIcon name="${icon}" class="size-5" />`
    case 'vue_btn':
      return `<UButton icon="${icon}" label="Button" />`
    case 'class':
      return icon
    case 'name':
    default:
      return icon
  }
}

async function copyText(text: string, message?: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({
      title: message || t('utilities.icons.copiedNotification', { name: text }),
      color: 'success',
      icon: 'i-lucide-check'
    })
  } catch {
    toast.add({
      title: t('common.error'),
      color: 'error'
    })
  }
}

function copyIcon(icon: string) {
  const snippet = generateSnippet(icon, copyFormat.value)
  copyText(snippet, t('utilities.icons.copiedNotification', { name: snippet }))
}

function toggleFavorite(icon: string) {
  const idx = favorites.value.indexOf(icon)
  if (idx > -1) {
    favorites.value.splice(idx, 1)
  } else {
    favorites.value.push(icon)
  }
}

function isFavorite(icon: string) {
  return favorites.value.includes(icon)
}

function openDetails(icon: string) {
  selectedIcon.value = icon
  isDetailsOpen.value = true
}

interface IconsResponse {
  icons: string[]
  nextCursor: string
  hasMore: boolean
}

async function fetchIcons(isLoadMore = false) {
  if (isFetching.value) return

  if (filters.collection === 'favorites') {
    let list = [...favorites.value]
    if (filters.search) {
      const q = filters.search.toLowerCase()
      list = list.filter(item => item.toLowerCase().includes(q))
    }
    icons.value = list
    hasMore.value = false
    return
  }

  isFetching.value = true
  try {
    if (!isLoadMore) filters.cursor = ''

    if (filters.collection === 'all') {
      // Fetch from both collections or query lucide/simple-icons sequentially
      // For smooth browsing, query lucide first if no cursor, and if cursor belongs to simple-icons query simple-icons
      const targetCol = (filters.cursor && filters.cursor.startsWith('i-simple-icons')) ? 'simple-icons' : 'lucide'
      const data = await $fetch<IconsResponse>('/api/icons', {
        query: {
          collection: targetCol,
          search: filters.search,
          cursor: filters.cursor,
          limit: filters.limit
        }
      })

      let loaded = data.icons || []
      let nextCur = data.nextCursor
      let more = data.hasMore

      // If finished lucide, bridge over to simple-icons
      if (!more && targetCol === 'lucide') {
        const simpleData = await $fetch<IconsResponse>('/api/icons', {
          query: {
            collection: 'simple-icons',
            search: filters.search,
            limit: filters.limit
          }
        })
        loaded = [...loaded, ...(simpleData.icons || [])]
        nextCur = simpleData.nextCursor
        more = simpleData.hasMore
      }

      if (isLoadMore) {
        icons.value.push(...loaded)
      } else {
        icons.value = loaded
      }
      filters.cursor = nextCur || ''
      hasMore.value = more
    } else {
      const data = await $fetch<IconsResponse>('/api/icons', {
        query: {
          collection: filters.collection,
          search: filters.search,
          cursor: filters.cursor,
          limit: filters.limit
        }
      })
      if (isLoadMore) {
        icons.value.push(...(data.icons || []))
      } else {
        icons.value = data.icons || []
      }
      filters.cursor = data.nextCursor || ''
      hasMore.value = data.hasMore
    }
  } catch (error) {
    console.error('Failed to fetch icons:', error)
  } finally {
    isFetching.value = false
  }
}

const debouncedFetch = useDebounceFn(() => {
  fetchIcons(false)
}, 300)

useInfiniteScroll(
  scrollParent,
  () => {
    if (hasMore.value && !isFetching.value && filters.collection !== 'favorites') {
      fetchIcons(true)
    }
  },
  { distance: 150 }
)

watch(() => filters.collection, () => {
  filters.search = ''
  filters.cursor = ''
  icons.value = []
  fetchIcons(false)
})

watch(() => filters.search, debouncedFetch)

onMounted(() => {
  fetchIcons(false)
})
</script>

<template>
  <BasePage id="utilities-icons" :title="t('nav.utilities_icons')">
    <template #right>
      <div class="flex items-center gap-2">
        <USelectMenu v-model="copyFormat" :items="copyFormats" value-key="value" label-key="label" size="xs"
          :search-input="{ icon: 'i-lucide-search', placeholder: t('global.search') }" class="w-36 hidden sm:block" />
      </div>
    </template>

    <div class="flex flex-col flex-1 min-h-0 p-4 sm:p-6 gap-4 h-full">
      <!-- Controls card -->
      <div
        class="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm space-y-3 shrink-0">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <!-- Search input -->
          <div class="flex-1 min-w-60">
            <UInput v-model="filters.search" icon="i-lucide-search"
              :placeholder="t('utilities.icons.searchPlaceholder')" clearable size="sm" />
          </div>

          <!-- Collection tabs -->
          <div class="flex flex-wrap items-center gap-1.5">
            <UButton v-for="c in collections" :key="c.value"
              :variant="filters.collection === c.value ? 'solid' : 'subtle'"
              :color="filters.collection === c.value ? 'primary' : 'neutral'" size="xs"
              @click="filters.collection = c.value">
              {{ c.label }}
            </UButton>
          </div>
        </div>

        <!-- Customizer Bar -->
        <div
          class="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-gray-100 dark:border-gray-800/80 text-xs text-gray-500 dark:text-gray-400">
          <div class="flex items-center gap-4 flex-wrap">
            <!-- Size controls -->
            <div class="flex items-center gap-2">
              <span>{{ t('utilities.icons.size') }}:</span>
              <div class="flex items-center gap-1">
                <UButton v-for="s in [20, 24, 28, 36, 44]" :key="s" :variant="iconSize === s ? 'solid' : 'ghost'"
                  :color="iconSize === s ? 'primary' : 'neutral'" size="xs" class="px-2 py-0.5 text-xs font-mono"
                  @click="iconSize = s">
                  {{ s }}
                </UButton>
              </div>
            </div>

            <!-- Color controls -->
            <div class="flex items-center gap-1.5">
              <span>{{ t('utilities.icons.color') }}:</span>
              <button v-for="c in colors" :key="c.value" type="button" :title="c.label"
                class="size-5 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center transition-transform"
                :class="[c.value === selectedColor ? 'scale-125 ring-2 ring-primary-500' : 'hover:scale-110']"
                :style="{ backgroundColor: c.value === 'currentColor' ? 'transparent' : c.value }"
                @click="selectedColor = c.value">
                <span v-if="c.value === 'currentColor'" class="text-[9px] font-bold">A</span>
              </button>
            </div>
          </div>

          <!-- Total count & format -->
          <div class="flex items-center gap-3">
            <span class="font-mono">{{ icons.length }} {{ t('utilities.icons.iconCount') }}</span>
          </div>
        </div>
      </div>

      <!-- Icon grid area -->
      <div ref="scrollParent"
        class="flex-1 min-h-0 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 p-4 scrollbar-thin">
        <div v-if="icons.length > 0"
          class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
          <div v-for="icon in icons" :key="icon"
            class="group relative flex flex-col items-center justify-center p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-primary-500 hover:shadow-md hover:shadow-primary-500/10 transition-all duration-200 cursor-pointer aspect-square"
            @click="copyIcon(icon)">
            <!-- Favorite button -->
            <button type="button"
              class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-amber-500"
              :class="{ 'opacity-100! text-amber-500': isFavorite(icon) }" @click.stop="toggleFavorite(icon)">
              <UIcon :name="isFavorite(icon) ? 'i-lucide-star' : 'i-lucide-star'" class="size-3.5"
                :class="{ 'fill-amber-500': isFavorite(icon) }" />
            </button>

            <!-- Inspect button -->
            <button type="button"
              class="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-primary-500"
              :title="t('utilities.icons.previewDetails')" @click.stop="openDetails(icon)">
              <UIcon name="i-lucide-info" class="size-3.5" />
            </button>

            <!-- Icon preview -->
            <div class="flex items-center justify-center my-auto transition-transform group-hover:scale-110"
              :style="{ color: selectedColor }">
              <UIcon :name="icon" :style="{ width: `${iconSize}px`, height: `${iconSize}px` }" />
            </div>

            <!-- Icon name label -->
            <span
              class="w-full text-center text-[11px] font-mono text-gray-500 dark:text-gray-400 truncate px-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 mt-auto"
              :title="icon">
              {{ icon.replace(/^(i-lucide:|i-lucide-|i-simple-icons:|i-simple-icons-)/, '') }}
            </span>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="!isFetching && icons.length === 0"
          class="flex flex-col items-center justify-center h-64 text-center">
          <div
            class="size-12 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center mb-3">
            <UIcon name="i-lucide-search-x" class="size-6" />
          </div>
          <p class="text-sm font-medium text-gray-900 dark:text-white">
            {{ t('utilities.icons.noIconsFound') }}
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ t('utilities.icons.tryAnotherQuery') }}
          </p>
        </div>

        <!-- Loading spinner -->
        <div v-if="isFetching" class="py-8 flex justify-center items-center gap-2 text-primary-500">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" />
          <span class="text-xs font-medium">{{ t('utilities.icons.loading') }}</span>
        </div>
      </div>
    </div>

    <!-- Details/Snippet Modal -->
    <UModal v-model:open="isDetailsOpen">
      <template #content>
        <div v-if="selectedIcon" class="p-6 space-y-6">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-4">
              <div
                class="size-16 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center justify-center shrink-0"
                :style="{ color: selectedColor }">
                <UIcon :name="selectedIcon" class="size-10" />
              </div>
              <div>
                <h3 class="text-lg font-bold text-gray-900 dark:text-white font-mono break-all">
                  {{ selectedIcon }}
                </h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {{ selectedIcon.startsWith('i-lucide') ? 'Lucide Icon Set' : 'Simple Icons Set' }}
                </p>
              </div>
            </div>
            <UButton color="neutral" variant="ghost" icon="i-lucide-x" size="xs" @click="isDetailsOpen = false" />
          </div>

          <!-- Snippet options -->
          <div class="space-y-3">
            <p class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              {{ t('utilities.icons.snippets') }}
            </p>

            <!-- Icon Name -->
            <div
              class="p-3 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2">
              <div class="flex-1 min-w-0">
                <span class="text-[10px] text-gray-400 uppercase font-mono block">{{ t('utilities.icons.copyName')
                  }}</span>
                <code class="text-xs font-mono text-gray-800 dark:text-gray-200 break-all">{{ selectedIcon }}</code>
              </div>
              <UButton size="xs" color="neutral" variant="subtle" icon="i-lucide-copy"
                @click="copyText(selectedIcon)" />
            </div>

            <!-- Nuxt UI v4 UIcon -->
            <div
              class="p-3 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2">
              <div class="flex-1 min-w-0">
                <span class="text-[10px] text-gray-400 uppercase font-mono block">{{ t('utilities.icons.copyVue')
                  }}</span>
                <code
                  class="text-xs font-mono text-primary-600 dark:text-primary-400 break-all">&lt;UIcon name="{{ selectedIcon }}" class="size-5" /&gt;</code>
              </div>
              <UButton size="xs" color="neutral" variant="subtle" icon="i-lucide-copy"
                @click="copyText(`<UIcon name=&quot;${selectedIcon}&quot; class=&quot;size-5&quot; />`)" />
            </div>

            <!-- Nuxt UI v4 UButton -->
            <div
              class="p-3 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2">
              <div class="flex-1 min-w-0">
                <span class="text-[10px] text-gray-400 uppercase font-mono block">{{ t('utilities.icons.copyButton')
                  }}</span>
                <code
                  class="text-xs font-mono text-warning-600 dark:text-warning-400 break-all">&lt;UButton icon="{{ selectedIcon }}" label="Click me" /&gt;</code>
              </div>
              <UButton size="xs" color="neutral" variant="subtle" icon="i-lucide-copy"
                @click="copyText(`<UButton icon=&quot;${selectedIcon}&quot; label=&quot;Click me&quot; />`)" />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <UButton :color="isFavorite(selectedIcon) ? 'warning' : 'neutral'" variant="soft"
              :icon="isFavorite(selectedIcon) ? 'i-lucide-star-off' : 'i-lucide-star'"
              @click="toggleFavorite(selectedIcon)">
              {{ isFavorite(selectedIcon) ? t('utilities.icons.removeFromFavorites')
                : t('utilities.icons.addToFavorites') }}
            </UButton>
            <UButton color="primary" variant="soft" icon="i-lucide-check" @click="isDetailsOpen = false">
              {{ t('common.done') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </BasePage>
</template>
