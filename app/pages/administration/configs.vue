<script setup lang="ts">
import { getErrorMessage } from '~/shared/utils/errors'

definePageMeta({
  middleware: () => {
    if (import.meta.client) {
      const a = useAuth()
      if (!a.isAuthenticated.value) return navigateTo('/login')
    }
  }
})

const { t } = useI18n()
const toast = useToast()
const { hubFetch, appId, configs } = useHub()

interface ConfigMeta {
  key: string
  category: string
  isSecret: boolean
  isPublic: boolean
  description?: string
  updatedAt?: string
}

interface ConfigItem extends ConfigMeta {
  value: string
}

interface ConfigsPage {
  success: boolean
  data: Record<string, unknown>
  meta?: ConfigMeta[]
  nextCursor?: string | null
}

const loading = ref(false)
const initialLoading = ref(false)
const items = ref<ConfigItem[]>([])
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)
const search = ref('')
const categoryFilter = ref('all')

const isCreateOpen = ref(false)
const isEditOpen = ref(false)
const editingKey = ref('')
const newKey = ref('')
const newValue = ref('')
const saving = ref(false)

const isDeleteOpen = ref(false)
const deletingKey = ref('')
const deleting = ref(false)

const revealed = ref<Record<string, boolean>>({})

function mergePage(res: ConfigsPage, reset: boolean) {
  const metaMap = new Map((res.meta || []).map(m => [m.key, m]))
  const page: ConfigItem[] = Object.entries(res.data || {}).map(([key, value]) => {
    const meta = metaMap.get(key)
    return {
      key,
      value: String(value ?? ''),
      category: meta?.category || 'general',
      isSecret: meta?.isSecret || false,
      isPublic: meta?.isPublic ?? true,
      description: meta?.description,
      updatedAt: meta?.updatedAt
    }
  })
  items.value = reset ? page : [...items.value, ...page]
  nextCursor.value = res.nextCursor || null
  hasMore.value = !!res.nextCursor && page.length > 0
}

async function load(reset = false) {
  if (loading.value) return
  loading.value = true
  if (reset) initialLoading.value = true
  try {
    const res = await hubFetch<ConfigsPage>(`/api/v1/apps/${encodeURIComponent(appId)}/configs`, {
      query: { limit: 50, cursor: !reset && nextCursor.value ? nextCursor.value : undefined }
    })
    mergePage(res, reset)
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

function refresh() {
  categoryFilter.value = 'all'
  return load(true)
}

function loadMore() {
  if (hasMore.value && !loading.value) load(false)
}

const categoryItems = computed(() => {
  const cats = [...new Set(items.value.map(i => i.category))].sort()
  return [
    { label: t('common.all'), value: 'all' },
    ...cats.map(c => ({ label: c, value: c }))
  ]
})

const displayItems = computed(() => {
  let list = items.value
  if (categoryFilter.value !== 'all') list = list.filter(i => i.category === categoryFilter.value)
  const q = search.value.trim().toLowerCase()
  if (q) list = list.filter(i => i.key.toLowerCase().includes(q) || i.category.includes(q))
  return list
})

const columns = computed(() => [
  { key: 'key', label: t('configs.key'), class: 'w-56' },
  { key: 'value', label: t('configs.value') },
  { key: 'category', label: t('configs.category'), class: 'w-28' },
  { key: 'isSecret', label: t('configs.secret'), class: 'w-24' }
])

function openCreate() {
  newKey.value = ''
  newValue.value = ''
  editingKey.value = ''
  isCreateOpen.value = true
}

function openEdit(item: ConfigItem) {
  editingKey.value = item.key
  newKey.value = item.key
  newValue.value = item.isSecret && item.value.includes('•') ? '' : item.value
  isEditOpen.value = true
}

async function handleSave() {
  const key = newKey.value.trim()
  if (!key) return
  saving.value = true
  try {
    await configs.update({ [key]: newValue.value })
    toast.add({ title: t('configs.saved'), icon: 'i-lucide-check', color: 'success' })
    isCreateOpen.value = false
    isEditOpen.value = false
    await load(true)
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    saving.value = false
  }
}

function confirmDelete(item: ConfigItem) {
  deletingKey.value = item.key
  isDeleteOpen.value = true
}

async function handleDelete() {
  if (!deletingKey.value) return
  deleting.value = true
  try {
    await hubFetch(`/api/v1/apps/${encodeURIComponent(appId)}/configs/${encodeURIComponent(deletingKey.value)}`, {
      method: 'DELETE'
    })
    toast.add({ title: t('configs.deleted'), icon: 'i-lucide-check', color: 'success' })
    isDeleteOpen.value = false
    deletingKey.value = ''
    await load(true)
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    deleting.value = false
  }
}

function copyValue(value: string) {
  navigator.clipboard.writeText(value).then(() =>
    toast.add({ title: t('common.copied'), icon: 'i-lucide-check', color: 'success' })
  )
}

const getActionOptions = (item: ConfigItem) => [
  [
    {
      label: t('global.edit'),
      icon: 'i-lucide-pencil',
      onSelect() { openEdit(item) }
    },
    {
      label: t('global.copy'),
      icon: 'i-lucide-copy',
      onSelect() { copyValue(item.value) }
    },
    {
      label: t('global.delete'),
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect() { confirmDelete(item) }
    }
  ]
]

onMounted(() => load(true))
</script>

<template>
  <BasePage id="admin-configs" :title="$t('configs.title')">
    <template #right>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-plus"
          :label="t('configs.new')"
          color="primary"
          variant="soft"
          @click="openCreate"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          variant="soft"
          color="neutral"
          size="sm"
          :loading="loading"
          @click="refresh"
        />
      </div>
    </template>

    <template #toolbar>
      <div class="flex items-center gap-2 px-4 pb-3 flex-wrap">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="t('common.search')"
          size="sm"
          class="w-full sm:w-56"
        />
        <USelect
          v-model="categoryFilter"
          :items="categoryItems"
          value-key="value"
          size="sm"
          class="w-36"
          :aria-label="t('configs.category')"
        />
        <span class="text-xs text-muted whitespace-nowrap">{{ displayItems.length }}</span>
      </div>
    </template>

    <template #default>
      <div class="flex-1 min-h-0 relative h-full">
        <LazyGridList
          :items="displayItems"
          :columns="columns"
          :loading="initialLoading"
          item-key="key"
          :can-load-more="hasMore"
          :action-options="getActionOptions"
          @load-more="loadMore"
          @refresh="refresh"
          @click="openEdit"
        >
          <template #key="{ item }">
            <div class="min-w-0">
              <span class="font-mono text-xs font-medium text-highlighted truncate block">{{ item.key }}</span>
              <p v-if="item.description" class="text-[11px] text-muted mt-0.5 truncate">
                {{ item.description }}
              </p>
            </div>
          </template>

          <template #value="{ item }">
            <div class="flex items-center gap-1 min-w-0 w-full">
              <code class="text-[11px] py-1 rounded truncate max-w-full flex-1">
                {{ item.isSecret && !revealed[item.key] ? '••••••••' : item.value }}
              </code>
              <UButton
                v-if="item.isSecret"
                :icon="revealed[item.key] ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                variant="soft"
                size="xs"
                @click.stop="revealed[item.key] = !revealed[item.key]"
              />
              <UButton
                icon="i-lucide-copy"
                variant="soft"
                size="xs"
                @click.stop="copyValue(item.value)"
              />
            </div>
          </template>

          <template #category="{ item }">
            <UBadge :label="item.category" variant="subtle" size="xs" />
          </template>

          <template #isSecret="{ item }">
            <UBadge
              v-if="item.isSecret"
              :label="t('configs.secret')"
              color="warning"
              variant="subtle"
              size="xs"
            />
            <UBadge
              v-else-if="item.isPublic"
              :label="t('configs.public')"
              color="success"
              variant="subtle"
              size="xs"
            />
          </template>

          <template #mobile-content="{ item }">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-xs font-semibold text-highlighted truncate">{{ item.key }}</span>
                  <UBadge :label="item.category" variant="subtle" size="xs" />
                  <UBadge
                    v-if="item.isSecret"
                    :label="t('configs.secret')"
                    color="warning"
                    variant="subtle"
                    size="xs"
                  />
                </div>
                <code class="text-[11px] py-0.5 rounded break-all block">
                  {{ item.isSecret && !revealed[item.key] ? '••••••••' : item.value }}
                </code>
                <p v-if="item.description" class="text-[11px] text-muted truncate">
                  {{ item.description }}
                </p>
              </div>
              <UDropdownMenu :items="getActionOptions(item)">
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                />
              </UDropdownMenu>
            </div>
          </template>

          <template #empty>
            <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <UIcon name="i-lucide-sliders-horizontal" class="size-10 text-muted" />
              <p class="text-sm text-muted">
                {{ $t('common.no_results') }}
              </p>
            </div>
          </template>
        </LazyGridList>
      </div>

      <BaseFormModal
        v-model:open="isCreateOpen"
        :title="t('configs.new')"
        :state="{ key: newKey, value: newValue }"
        :loading="saving"
        :submit-label="t('common.create')"
        @submit="handleSave"
      >
        <UFormField :label="t('configs.key')" required>
          <UInput v-model="newKey" class="w-full" placeholder="APP_NAME" />
        </UFormField>
        <UFormField :label="t('configs.value')">
          <UInput v-model="newValue" class="w-full" />
        </UFormField>
      </BaseFormModal>

      <BaseFormModal
        v-model:open="isEditOpen"
        :title="t('global.edit')"
        :description="editingKey"
        :state="{ key: newKey, value: newValue }"
        :loading="saving"
        :submit-label="t('common.save')"
        @submit="handleSave"
      >
        <UFormField :label="t('configs.key')" required>
          <UInput v-model="newKey" class="w-full" :disabled="!!editingKey" />
        </UFormField>
        <UFormField :label="t('configs.value')">
          <UInput v-model="newValue" class="w-full" type="text" />
        </UFormField>
      </BaseFormModal>

      <LazyBaseConfirmModal
        v-model:open="isDeleteOpen"
        :title="t('confirm.delete_title')"
        :description="t('confirm.delete_desc_name', [deletingKey])"
        :confirm-label="t('common.delete')"
        :cancel-label="t('common.cancel')"
        :loading="deleting"
        color="error"
        icon="i-lucide-trash-2"
        @confirm="handleDelete"
      />
    </template>
  </BasePage>
</template>
