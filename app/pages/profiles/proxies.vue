<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { ProfileProxy, GridColumn } from '~/types'

const { t } = useI18n()
const toast = useToast()
const router = useRouter()

const {
  proxies,
  loading,
  testingProxyId,
  fetchProxies,
  saveProxy,
  deleteProxy,
  batchDelete,
  checkProxy
} = useProfileProxies()

const selected = ref<ProfileProxy[]>([])
const searchQuery = ref('')
const typeFilter = ref('all')
const statusFilter = ref('all')
const checkingAll = ref(false)

// Modal state
const showModal = ref(false)
const editingProxy = ref<ProfileProxy | null>(null)
const form = reactive<Partial<ProfileProxy>>({
  name: '',
  type: 'http',
  host: '',
  port: 8080,
  username: '',
  password: ''
})
const saving = ref(false)

// Delete confirmation state
const showDeleteConfirm = ref(false)
const proxyToDelete = ref<ProfileProxy | null>(null)
const showBatchDeleteConfirm = ref(false)
const deleting = ref(false)

const proxyTypeOptions = [
  { label: 'HTTP', value: 'http' },
  { label: 'SOCKS5', value: 'socks5' }
]

const filterTypeOptions = [
  { label: 'All Types', value: 'all' },
  { label: 'HTTP', value: 'http' },
  { label: 'SOCKS5', value: 'socks5' }
]

const filterStatusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Active (Live)', value: 'active' },
  { label: 'Dead / Offline', value: 'dead' },
  { label: 'Unknown', value: 'unknown' }
]

const columns = computed<GridColumn[]>(() => [
  { key: 'name', label: t('profiles.proxyHost'), class: 'min-w-44 flex-1' },
  { key: 'type', label: t('profiles.proxyType'), class: 'w-24' },
  { key: 'status', label: t('common.status') || 'Status', class: 'w-32' },
  { key: 'latency', label: t('profiles.latency'), class: 'w-28' },
  { key: 'profile_count', label: t('profiles.profilesCount'), class: 'w-28' },
  { key: 'last_checked', label: t('profiles.lastChecked'), class: 'w-40' }
])

const filteredProxies = computed(() => {
  return proxies.value.filter((p) => {
    if (typeFilter.value !== 'all' && p.type !== typeFilter.value) return false
    if (statusFilter.value !== 'all' && (p.status || 'unknown') !== statusFilter.value) return false
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim()
      const matchName = p.name?.toLowerCase().includes(q)
      const matchHost = p.host?.toLowerCase().includes(q)
      const matchPort = String(p.port).includes(q)
      const matchUser = p.username?.toLowerCase().includes(q)
      if (!matchName && !matchHost && !matchPort && !matchUser) return false
    }
    return true
  })
})

onMounted(async () => {
  await fetchProxies()
})

function openCreate() {
  editingProxy.value = null
  form.name = `Proxy ${proxies.value.length + 1}`
  form.type = 'http'
  form.host = ''
  form.port = 8080
  form.username = ''
  form.password = ''
  showModal.value = true
}

function openEdit(proxy: ProfileProxy) {
  editingProxy.value = proxy
  form.name = proxy.name
  form.type = proxy.type || 'http'
  form.host = proxy.host
  form.port = proxy.port
  form.username = proxy.username || ''
  form.password = proxy.password || ''
  showModal.value = true
}

async function handleSave() {
  if (!form.host?.trim() || !form.port) return
  saving.value = true
  try {
    const ok = await saveProxy({
      ...(editingProxy.value ? { id: editingProxy.value.id } : {}),
      name: form.name?.trim() || `${form.host}:${form.port}`,
      type: form.type,
      host: form.host.trim(),
      port: Number(form.port),
      username: form.username?.trim() || undefined,
      password: form.password?.trim() || undefined
    })
    if (ok) {
      toast.add({
        title: t('global.success'),
        description: t('profiles.proxySaved'),
        icon: 'i-lucide-check',
        color: 'success'
      })
      showModal.value = false
    }
  } finally {
    saving.value = false
  }
}

async function handleTestProxy(proxy: ProfileProxy) {
  const result = await checkProxy(proxy)
  if (result && 'ip' in result && result.status === 'active') {
    toast.add({
      title: t('profiles.proxyLive'),
      description: `${result.ip || proxy.host} (${result.latency_ms}ms)`,
      icon: 'i-lucide-check-circle',
      color: 'success'
    })
  } else {
    const errorMsg = result && 'error' in result ? result.error : 'Connection failed'
    toast.add({
      title: t('profiles.proxyDead'),
      description: errorMsg || 'Connection failed',
      icon: 'i-lucide-alert-circle',
      color: 'error'
    })
  }
}

async function handleCheckAll() {
  if (checkingAll.value || !proxies.value.length) return
  checkingAll.value = true
  try {
    for (const p of proxies.value) {
      await checkProxy(p)
    }
    toast.add({
      title: t('global.success'),
      description: t('profiles.proxiesChecked'),
      icon: 'i-lucide-check',
      color: 'success'
    })
  } finally {
    checkingAll.value = false
  }
}

function confirmDelete(proxy: ProfileProxy) {
  proxyToDelete.value = proxy
  showDeleteConfirm.value = true
}

async function executeSingleDelete() {
  if (!proxyToDelete.value) return
  deleting.value = true
  try {
    const ok = await deleteProxy(proxyToDelete.value.id)
    if (ok) {
      toast.add({
        title: t('global.success'),
        description: t('profiles.proxyDeleted'),
        icon: 'i-lucide-check',
        color: 'success'
      })
      showDeleteConfirm.value = false
      proxyToDelete.value = null
      selected.value = selected.value.filter(item => item.id !== proxyToDelete.value?.id)
    }
  } finally {
    deleting.value = false
  }
}

async function executeBatchDelete() {
  if (!selected.value.length) return
  deleting.value = true
  try {
    const ids = selected.value.map(p => p.id)
    const ok = await batchDelete(ids)
    if (ok) {
      toast.add({
        title: t('global.success'),
        description: t('profiles.proxiesDeleted'),
        icon: 'i-lucide-check',
        color: 'success'
      })
      selected.value = []
      showBatchDeleteConfirm.value = false
    }
  } finally {
    deleting.value = false
  }
}

function viewProxyProfiles(proxy: ProfileProxy) {
  router.push({
    path: '/profiles',
    query: { proxyId: proxy.id }
  })
}

const getActionOptions = (item: ProfileProxy) => [
  [
    {
      label: t('profiles.checkProxy'),
      icon: 'i-lucide-refresh-cw',
      loading: testingProxyId.value === item.id,
      onSelect: () => handleTestProxy(item)
    },
    {
      label: t('profiles.quickProfiles'),
      icon: 'i-lucide-layers',
      onSelect: () => viewProxyProfiles(item)
    },
    {
      label: t('global.edit'),
      icon: 'i-lucide-edit',
      onSelect: () => openEdit(item)
    }
  ],
  [
    {
      label: t('global.delete'),
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect: () => confirmDelete(item)
    }
  ]
]

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return dateStr
  }
}
</script>

<template>
  <BasePage id="profile-proxies" :title="t('profiles.proxiesTitle')" :description="t('profiles.proxiesSubtitle')">
    <template #right>
      <div class="flex items-center gap-2">
        <!-- Batch Delete Button -->
        <UButton v-if="selected.length" :label="t('profiles.batchDelete')" color="error" variant="subtle"
          icon="i-lucide-trash" @click="showBatchDeleteConfirm = true">
          <template #trailing>
            <UKbd>{{ selected.length }}</UKbd>
          </template>
        </UButton>

        <!-- Check All Proxies -->
        <UButton variant="soft" color="neutral" icon="i-lucide-refresh-cw"
          :label="checkingAll ? t('profiles.checkingAll') : t('profiles.checkAll')" :loading="checkingAll"
          @click="handleCheckAll" />

        <!-- Back to Profiles -->
        <UButton variant="soft" color="neutral" icon="i-lucide-layers" :label="t('profiles.title')" to="/profiles" />

        <!-- Add Proxy -->
        <UButton color="primary" variant="soft" icon="i-lucide-plus" :label="t('profiles.addProxy')"
          @click="openCreate" />
      </div>
    </template>

    <template #default>
      <div class="flex flex-col gap-4 h-full">
        <!-- Filter Toolbar -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <UInput v-model="searchQuery" class="w-full sm:max-w-xs" icon="i-lucide-search"
            :placeholder="t('global.searchPlaceholder')" />

          <div class="flex flex-wrap items-center gap-2">
            <!-- Type Filter -->
            <USelect v-model="typeFilter" class="w-32" :items="filterTypeOptions" />

            <!-- Status Filter -->
            <USelect v-model="statusFilter" class="w-36" :items="filterStatusOptions" />
          </div>
        </div>

        <!-- GridList -->
        <div class="flex-1 min-h-0 relative">
          <LazyGridList v-model:selected="selected" :items="filteredProxies" :columns="columns" :loading="loading"
            item-key="id" selectable :action-options="getActionOptions" @refresh="fetchProxies">
            <!-- Custom Name Column -->
            <template #name="{ item }">
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-gray-900 dark:text-white truncate">
                    {{ item.name }}
                  </span>
                  <span v-if="item.country_code"
                    class="text-xs uppercase font-mono px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                    {{ item.country_code }}
                  </span>
                </div>
                <span class="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
                  {{ item.host }}:{{ item.port }}
                </span>
              </div>
            </template>

            <!-- Custom Type Column -->
            <template #type="{ item }">
              <UBadge color="neutral" variant="subtle" size="xs" class="uppercase font-mono font-semibold">
                {{ item.type }}
              </UBadge>
            </template>

            <!-- Custom Status Column -->
            <template #status="{ item }">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full shrink-0" :class="{
                  'bg-emerald-500 ring-2 ring-emerald-500/20': item.status === 'active',
                  'bg-rose-500 ring-2 ring-rose-500/20': item.status === 'dead',
                  'bg-gray-400': !item.status || item.status === 'unknown'
                }" />
                <span class="text-xs capitalize font-medium text-gray-700 dark:text-gray-300">
                  {{ item.status === 'active' ? t('profiles.proxyLive') : item.status === 'dead' ?
                    t('profiles.proxyDead') : 'Unknown' }}
                </span>
              </div>
            </template>

            <!-- Custom Latency Column -->
            <template #latency="{ item }">
              <span v-if="item.latency_ms" class="text-xs font-mono font-medium" :class="{
                'text-emerald-500': item.latency_ms < 500,
                'text-amber-500': item.latency_ms >= 500 && item.latency_ms < 1500,
                'text-rose-500': item.latency_ms >= 1500
              }">
                {{ item.latency_ms }} ms
              </span>
              <span v-else class="text-xs text-gray-400">-</span>
            </template>

            <!-- Custom Profile Count Column -->
            <template #profile_count="{ item }">
              <UBadge color="neutral" variant="subtle" size="sm"
                class="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800" @click="viewProxyProfiles(item)">
                <UIcon name="i-lucide-layers" class="w-3 h-3 mr-1" />
                {{ item.profile_count ?? 0 }}
              </UBadge>
            </template>

            <!-- Custom Last Checked Column -->
            <template #last_checked="{ item }">
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatDate(item.last_checked_at) }}
              </span>
            </template>

            <!-- Mobile Card Layout -->
            <template #mobile-content="{ item }">
              <div class="flex flex-col gap-3 p-1">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex flex-col min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="font-medium text-sm text-gray-900 dark:text-white truncate">
                        {{ item.name }}
                      </span>
                      <UBadge color="neutral" variant="subtle" size="xs" class="uppercase font-mono">
                        {{ item.type }}
                      </UBadge>
                    </div>
                    <span class="text-xs font-mono text-gray-400 truncate">
                      {{ item.host }}:{{ item.port }}
                    </span>
                  </div>

                  <div class="flex items-center gap-1.5 shrink-0">
                    <span class="w-2 h-2 rounded-full shrink-0" :class="{
                      'bg-emerald-500': item.status === 'active',
                      'bg-rose-500': item.status === 'dead',
                      'bg-gray-400': !item.status || item.status === 'unknown'
                    }" />
                    <span v-if="item.latency_ms" class="text-xs font-mono font-medium text-gray-500">
                      {{ item.latency_ms }}ms
                    </span>
                  </div>
                </div>

                <div
                  class="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-800">
                  <span>{{ item.profile_count ?? 0 }} {{ t('profiles.title') }}</span>
                  <div class="flex items-center gap-1">
                    <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-refresh-cw"
                      :loading="testingProxyId === item.id" @click="handleTestProxy(item)" />
                    <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-arrow-right"
                      :label="t('profiles.quickProfiles')" @click="viewProxyProfiles(item)" />
                  </div>
                </div>
              </div>
            </template>

            <!-- Empty State -->
            <template #empty>
              <div class="flex flex-col items-center justify-center p-8 text-center">
                <UIcon name="i-lucide-network" class="w-12 h-12 text-gray-400 mb-3" />
                <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">
                  {{ t('profiles.noProxies') }}
                </h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-4">
                  {{ t('profiles.noProxiesDesc') }}
                </p>
                <UButton color="primary" variant="soft" icon="i-lucide-plus" :label="t('profiles.addProxy')"
                  @click="openCreate" />
              </div>
            </template>
          </LazyGridList>
        </div>
      </div>

      <!-- Create / Edit Modal -->
      <UModal v-model:open="showModal" :title="editingProxy ? t('profiles.editProxy') : t('profiles.addProxy')"
        :ui="{ content: 'max-w-lg' }">
        <template #body>
          <div class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <UFormField :label="t('profiles.name')" class="sm:col-span-2">
                <UInput v-model="form.name" placeholder="Proxy Name" class="w-full" />
              </UFormField>

              <UFormField :label="t('profiles.proxyType')">
                <USelect v-model="form.type" :items="proxyTypeOptions" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <UFormField :label="t('profiles.proxyHost')" required class="sm:col-span-2">
                <UInput v-model="form.host" placeholder="127.0.0.1 or domain" class="w-full font-mono" autofocus />
              </UFormField>

              <UFormField :label="t('profiles.proxyPort')" required>
                <UInput v-model.number="form.port" type="number" placeholder="8080" class="w-full font-mono" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UFormField :label="t('profiles.proxyUser')">
                <UInput v-model="form.username" placeholder="Optional username" class="w-full" />
              </UFormField>

              <UFormField :label="t('profiles.proxyPass')">
                <UInput v-model="form.password" type="password" placeholder="Optional password" class="w-full" />
              </UFormField>
            </div>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" :label="t('global.cancel')" @click="showModal = false" />
            <UButton color="primary" variant="soft" :label="t('global.save')" :loading="saving" @click="handleSave" />
          </div>
        </template>
      </UModal>

      <!-- Single Delete Confirm Modal -->
      <LazyBaseConfirmModal v-model:open="showDeleteConfirm" :title="t('profiles.deleteProxyConfirm')"
        :description="t('profiles.deleteProxyConfirmDesc', { name: proxyToDelete?.name || '' })" :loading="deleting"
        @confirm="executeSingleDelete" />

      <!-- Batch Delete Confirm Modal -->
      <LazyBaseConfirmModal v-model:open="showBatchDeleteConfirm" :title="t('profiles.batchDeleteProxiesConfirm')"
        :description="t('profiles.batchDeleteProxiesConfirmDesc', { count: selected.length })" :loading="deleting"
        @confirm="executeBatchDelete" />
    </template>
  </BasePage>
</template>
