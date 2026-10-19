<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import type { BrowserProfile, GridColumn } from '~/types'

const { t } = useI18n()
const {
  profiles,
  loading,
  selected,
  search,
  groupId,
  statusFilter,
  fetchProfiles,
  launchProfile,
  stopProfile,
  cloneProfile,
  deleteProfile,
  batchDelete,
  openFolder,
  clearCache
} = useProfiles()

const { groups, fetchGroups } = useProfileGroups()
const { proxies, fetchProxies } = useProfileProxies()

// Modals state
const showFormModal = ref(false)
const editingProfile = ref<BrowserProfile | null>(null)
const showGroupModal = ref(false)
const showProxyModal = ref(false)

// Delete confirmation state
const showDeleteConfirm = ref(false)
const profileToDelete = ref<BrowserProfile | null>(null)
const showBatchDeleteConfirm = ref(false)
const deleting = ref(false)

const searchQuery = ref('')
const handleSearch = useDebounceFn((val: string) => {
  search.value = val
  fetchProfiles(true)
}, 300)

watch(searchQuery, (val) => {
  handleSearch(val)
})

watch([groupId, statusFilter], () => {
  fetchProfiles(true)
})

const route = useRoute()

onMounted(async () => {
  if (route.query.groupId && typeof route.query.groupId === 'string') {
    groupId.value = route.query.groupId
  }
  await Promise.all([
    fetchGroups(),
    fetchProxies(),
    fetchProfiles(true)
  ])
})

const columns = computed<GridColumn[]>(() => [
  { key: 'name', label: t('profiles.name'), class: 'min-w-48 flex-1' },
  { key: 'group', label: t('profiles.groups'), class: 'w-32' },
  { key: 'proxy', label: t('profiles.proxies'), class: 'w-48' },
  { key: 'status', label: t('global.actions'), class: 'w-28' },
  { key: 'last_launched', label: t('profiles.lastLaunched'), class: 'w-40' }
])

function openCreate() {
  editingProfile.value = null
  showFormModal.value = true
}

function openEdit(p: BrowserProfile) {
  editingProfile.value = p
  showFormModal.value = true
}

function confirmDelete(p: BrowserProfile) {
  profileToDelete.value = p
  showDeleteConfirm.value = true
}

async function executeSingleDelete() {
  if (!profileToDelete.value) return
  deleting.value = true
  try {
    await deleteProfile(profileToDelete.value.id)
    showDeleteConfirm.value = false
    profileToDelete.value = null
  } finally {
    deleting.value = false
  }
}

async function executeBatchDelete() {
  deleting.value = true
  try {
    await batchDelete()
    showBatchDeleteConfirm.value = false
  } finally {
    deleting.value = false
  }
}

const getActionOptions = (item: BrowserProfile) => [
  [
    item.isRunning
      ? {
          label: t('profiles.stop'),
          icon: 'i-lucide-square',
          color: 'warning' as const,
          onSelect: () => stopProfile(item.id)
        }
      : {
          label: t('profiles.launch'),
          icon: 'i-lucide-play',
          color: 'primary' as const,
          onSelect: () => launchProfile(item.id)
        },
    {
      label: t('global.edit'),
      icon: 'i-lucide-edit',
      onSelect: () => openEdit(item)
    },
    {
      label: t('profiles.cloneProfile'),
      icon: 'i-lucide-copy',
      onSelect: () => cloneProfile(item.id)
    }
  ],
  [
    {
      label: t('profiles.openFolder'),
      icon: 'i-lucide-folder-open',
      onSelect: () => openFolder(item.id)
    },
    {
      label: t('profiles.clearCache'),
      icon: 'i-lucide-eraser',
      onSelect: () => clearCache(item.id)
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

function getOsIcon(os?: string) {
  if (os === 'macos') return 'i-lucide-apple'
  if (os === 'linux') return 'i-lucide-terminal'
  return 'i-lucide-monitor'
}

function formatLastLaunched(dateStr?: string | null) {
  if (!dateStr) return t('profiles.neverLaunched')
  try {
    const d = new Date(dateStr)
    return d.toLocaleString()
  } catch {
    return dateStr
  }
}
</script>

<template>
  <BasePage id="profiles" :title="t('profiles.title')" :description="t('profiles.subtitle')">
    <template #right>
      <div class="flex items-center gap-2">
        <!-- Batch Delete Button -->
        <UButton
          v-if="selected.length"
          :label="t('profiles.batchDelete')"
          color="error"
          variant="subtle"
          icon="i-lucide-trash"
          @click="showBatchDeleteConfirm = true"
        >
          <template #trailing>
            <UKbd>{{ selected.length }}</UKbd>
          </template>
        </UButton>

        <!-- Manage Groups -->
        <UButton
          variant="soft"
          color="neutral"
          icon="i-lucide-folder"
          :label="t('profiles.groups')"
          @click="showGroupModal = true"
        />

        <!-- Manage Proxies -->
        <UButton
          variant="soft"
          color="neutral"
          icon="i-lucide-network"
          :label="t('profiles.proxies')"
          @click="showProxyModal = true"
        />

        <!-- Create Profile -->
        <UButton
          color="primary"
          variant="soft"
          icon="i-lucide-plus"
          :label="t('profiles.addProfile')"
          @click="openCreate"
        />
      </div>
    </template>

    <template #default>
      <div class="flex flex-col gap-4 h-full">
        <!-- Filter Bar -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <UInput
            v-model="searchQuery"
            class="w-full sm:max-w-xs"
            icon="i-lucide-search"
            :placeholder="t('global.searchPlaceholder')"
          />

          <div class="flex flex-wrap items-center gap-2">
            <!-- Group Filter -->
            <USelect
              v-model="groupId"
              class="w-40"
              :items="[
                { label: t('profiles.allGroups'), value: 'all' },
                ...groups.filter(g => Boolean(g.id)).map(g => ({ label: g.name, value: g.id }))
              ]"
            />

            <!-- Status Filter -->
            <USelect
              v-model="statusFilter"
              class="w-36"
              :items="[
                { label: t('global.all'), value: 'all' },
                { label: t('profiles.running'), value: 'running' },
                { label: t('profiles.stopped'), value: 'stopped' }
              ]"
            />
          </div>
        </div>

        <!-- Profiles Grid / Table -->
        <div class="flex-1 min-h-0 relative">
          <LazyGridList
            v-model:selected="selected"
            :items="profiles"
            :columns="columns"
            :loading="loading"
            item-key="id"
            selectable
            :can-load-more="false"
            :action-options="getActionOptions"
            @refresh="fetchProfiles(true)"
          >
            <!-- Custom Slot: Name & OS info -->
            <template #name="{ item }">
              <div class="flex items-center gap-2.5 py-1">
                <div class="p-1.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                  <UIcon :name="getOsIcon(item.os)" class="size-4" />
                </div>
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="font-medium text-sm text-gray-900 dark:text-gray-100">{{ item.name }}</span>
                    <span v-if="item.isRunning" class="relative flex size-2">
                      <span
                        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
                      />
                      <span class="relative inline-flex rounded-full size-2 bg-emerald-500" />
                    </span>
                  </div>
                  <div class="text-xs text-gray-400 font-mono flex items-center gap-1">
                    <span>{{ item.screen_resolution }}</span>
                    <span>•</span>
                    <span class="truncate max-w-50">{{ item.user_agent }}</span>
                  </div>
                </div>
              </div>
            </template>

            <!-- Custom Slot: Group -->
            <template #group="{ item }">
              <UBadge
                v-if="item.group_name"
                :color="(item.group_color as 'primary' | 'success' | 'warning' | 'error' | 'neutral') || 'primary'"
                variant="subtle"
                size="sm"
              >
                {{ item.group_name }}
              </UBadge>
              <span v-else class="text-xs text-gray-400">-</span>
            </template>

            <!-- Custom Slot: Proxy -->
            <template #proxy="{ item }">
              <div v-if="item.proxy_host" class="text-xs space-y-0.5">
                <div class="flex items-center gap-1">
                  <UBadge size="xs" variant="subtle" :color="item.proxy_type === 'socks5' ? 'warning' : 'neutral'">
                    {{ (item.proxy_type || 'HTTP').toUpperCase() }}
                  </UBadge>
                  <span class="font-mono text-gray-700 dark:text-gray-300">{{ item.proxy_host }}:{{ item.proxy_port
                  }}</span>
                </div>
                <div v-if="item.proxy_country" class="text-gray-400">
                  {{ item.proxy_country }}
                </div>
              </div>
              <div
                v-else-if="item.raw_proxy"
                class="text-xs font-mono text-gray-600 dark:text-gray-400 truncate max-w-45"
              >
                {{ item.raw_proxy }}
              </div>
              <span v-else class="text-xs text-gray-400">{{ t('profiles.directProxy') }}</span>
            </template>

            <!-- Custom Slot: Action / Status button -->
            <template #status="{ item }">
              <UButton
                v-if="item.isRunning"
                size="xs"
                color="warning"
                variant="soft"
                icon="i-lucide-square"
                :label="t('profiles.stop')"
                @click="stopProfile(item.id)"
              />
              <UButton
                v-else
                size="xs"
                color="primary"
                variant="soft"
                icon="i-lucide-play"
                :label="t('profiles.launch')"
                @click="launchProfile(item.id)"
              />
            </template>

            <!-- Custom Slot: Last Launched -->
            <template #last_launched="{ item }">
              <span class="text-xs text-gray-500">
                {{ formatLastLaunched(item.last_launched_at) }}
              </span>
            </template>

            <!-- Mobile Card Layout -->
            <template #mobile-content="{ item }">
              <div
                class="p-3 border rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon :name="getOsIcon(item.os)" class="size-4 text-gray-500" />
                    <span class="font-semibold text-sm">{{ item.name }}</span>
                  </div>
                  <UBadge :color="item.isRunning ? 'success' : 'neutral'" variant="subtle" size="xs">
                    {{ item.isRunning ? t('profiles.running') : t('profiles.stopped') }}
                  </UBadge>
                </div>

                <div class="flex items-center justify-between text-xs text-gray-500">
                  <span>{{ item.group_name || 'No Group' }}</span>
                  <span>{{ item.proxy_host ? `${item.proxy_host}:${item.proxy_port}` : t('profiles.directProxy')
                  }}</span>
                </div>

                <div class="flex justify-end gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                  <UButton
                    v-if="item.isRunning"
                    size="xs"
                    color="warning"
                    variant="soft"
                    icon="i-lucide-square"
                    :label="t('profiles.stop')"
                    @click="stopProfile(item.id)"
                  />
                  <UButton
                    v-else
                    size="xs"
                    color="primary"
                    variant="soft"
                    icon="i-lucide-play"
                    :label="t('profiles.launch')"
                    @click="launchProfile(item.id)"
                  />
                </div>
              </div>
            </template>
          </LazyGridList>
        </div>
      </div>
    </template>
  </BasePage>

  <!-- Profile Form Modal -->
  <ProfilesFormModal
    v-model="showFormModal"
    :profile="editingProfile"
    :groups="groups"
    :proxies="proxies"
    @saved="fetchProfiles(false)"
  />

  <!-- Groups Modal -->
  <ProfilesGroupModal v-model="showGroupModal" :groups="groups" @saved="fetchGroups" />

  <!-- Proxies Modal -->
  <ProfilesProxyModal v-model="showProxyModal" :proxies="proxies" @saved="fetchProxies" />

  <!-- Single Delete Confirm Modal -->
  <LazyBaseConfirmModal
    v-model:open="showDeleteConfirm"
    :title="t('profiles.deleteConfirmTitle')"
    :description="profileToDelete ? t('profiles.deleteConfirmDesc', { name: profileToDelete.name }) : ''"
    :loading="deleting"
    @confirm="executeSingleDelete"
  />

  <!-- Batch Delete Confirm Modal -->
  <LazyBaseConfirmModal
    v-model:open="showBatchDeleteConfirm"
    :title="t('profiles.batchDeleteConfirmTitle')"
    :description="t('profiles.batchDeleteConfirmDesc', { count: selected.length })"
    :loading="deleting"
    @confirm="executeBatchDelete"
  />
</template>
