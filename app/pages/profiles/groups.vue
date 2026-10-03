<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { ProfileGroup, GridColumn } from '~/types'

const { t } = useI18n()
const toast = useToast()
const router = useRouter()

const {
  groups,
  loading,
  fetchGroups,
  saveGroup,
  deleteGroup,
  batchDelete
} = useProfileGroups()

const selected = ref<ProfileGroup[]>([])
const searchQuery = ref('')

// Modal state
const showModal = ref(false)
const editingGroup = ref<ProfileGroup | null>(null)
const form = reactive({
  name: '',
  color: 'primary',
  icon: 'i-lucide-folder',
  description: '',
  sort: 0
})
const saving = ref(false)

// Delete confirmation state
const showDeleteConfirm = ref(false)
const groupToDelete = ref<ProfileGroup | null>(null)
const showBatchDeleteConfirm = ref(false)
const deleting = ref(false)

const colorOptions = [
  { label: 'Primary', value: 'primary' },
  { label: 'Success', value: 'success' },
  { label: 'Warning', value: 'warning' },
  { label: 'Error', value: 'error' },
  { label: 'Neutral', value: 'neutral' }
]

const columns = computed<GridColumn[]>(() => [
  { key: 'name', label: t('profiles.groupName'), class: 'min-w-48 flex-1' },
  { key: 'profile_count', label: t('profiles.profilesCount'), class: 'w-32' },
  { key: 'sort', label: t('common.sort') || 'Sort', class: 'w-24' },
  { key: 'created_at', label: t('common.created_at') || 'Created', class: 'w-44' }
])

const filteredGroups = computed(() => {
  if (!searchQuery.value.trim()) return groups.value
  const query = searchQuery.value.toLowerCase().trim()
  return groups.value.filter(g =>
    g.name.toLowerCase().includes(query)
    || (g.description && g.description.toLowerCase().includes(query))
  )
})

onMounted(async () => {
  await fetchGroups()
})

function openCreate() {
  editingGroup.value = null
  form.name = ''
  form.color = 'primary'
  form.icon = 'i-lucide-folder'
  form.description = ''
  form.sort = groups.value.length
  showModal.value = true
}

function openEdit(group: ProfileGroup) {
  editingGroup.value = group
  form.name = group.name
  form.color = group.color || 'primary'
  form.icon = group.icon || 'i-lucide-folder'
  form.description = group.description || ''
  form.sort = group.sort ?? 0
  showModal.value = true
}

async function handleSave() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    const ok = await saveGroup({
      ...(editingGroup.value ? { id: editingGroup.value.id } : {}),
      name: form.name.trim(),
      color: form.color,
      icon: form.icon,
      description: form.description.trim() || undefined,
      sort: Number(form.sort) || 0
    })
    if (ok) {
      toast.add({
        title: t('global.success'),
        description: t('profiles.groupSaved'),
        icon: 'i-lucide-check',
        color: 'success'
      })
      showModal.value = false
    }
  } finally {
    saving.value = false
  }
}

function confirmDelete(group: ProfileGroup) {
  groupToDelete.value = group
  showDeleteConfirm.value = true
}

async function executeSingleDelete() {
  if (!groupToDelete.value) return
  deleting.value = true
  try {
    const ok = await deleteGroup(groupToDelete.value.id)
    if (ok) {
      toast.add({
        title: t('global.success'),
        description: t('profiles.groupDeleted'),
        icon: 'i-lucide-check',
        color: 'success'
      })
      showDeleteConfirm.value = false
      groupToDelete.value = null
      selected.value = selected.value.filter(item => item.id !== groupToDelete.value?.id)
    }
  } finally {
    deleting.value = false
  }
}

async function executeBatchDelete() {
  if (!selected.value.length) return
  deleting.value = true
  try {
    const ids = selected.value.map(g => g.id)
    const ok = await batchDelete(ids)
    if (ok) {
      toast.add({
        title: t('global.success'),
        description: t('profiles.groupsDeleted'),
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

function viewGroupProfiles(group: ProfileGroup) {
  router.push({
    path: '/profiles',
    query: { groupId: group.id }
  })
}

const getActionOptions = (item: ProfileGroup) => [
  [
    {
      label: t('profiles.quickProfiles'),
      icon: 'i-lucide-layers',
      onSelect: () => viewGroupProfiles(item)
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
  <BasePage id="profile-groups" :title="t('profiles.groupsTitle')" :description="t('profiles.groupsSubtitle')">
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

        <!-- Back to Profiles -->
        <UButton
          variant="soft"
          color="neutral"
          icon="i-lucide-layers"
          :label="t('profiles.title')"
          to="/profiles"
        />

        <!-- Add Group -->
        <UButton
          color="primary"
          variant="soft"
          icon="i-lucide-plus"
          :label="t('profiles.addGroup')"
          @click="openCreate"
        />
      </div>
    </template>

    <template #default>
      <div class="flex flex-col gap-4 h-full">
        <!-- Search Bar -->
        <div class="flex items-center justify-between gap-2">
          <UInput
            v-model="searchQuery"
            class="w-full sm:max-w-xs"
            icon="i-lucide-search"
            :placeholder="t('global.searchPlaceholder')"
          />
        </div>

        <!-- GridList -->
        <div class="flex-1 min-h-0 relative">
          <LazyGridList
            v-model:selected="selected"
            :items="filteredGroups"
            :columns="columns"
            :loading="loading"
            item-key="id"
            selectable
            :action-options="getActionOptions"
            @refresh="fetchGroups"
          >
            <!-- Custom Name Column -->
            <template #name="{ item }">
              <div class="flex items-center gap-2.5 min-w-0">
                <span
                  class="w-3 h-3 rounded-full shrink-0"
                  :class="{
                    'bg-primary-500': item.color === 'primary',
                    'bg-emerald-500': item.color === 'success',
                    'bg-amber-500': item.color === 'warning',
                    'bg-rose-500': item.color === 'error',
                    'bg-gray-400': !item.color || item.color === 'neutral'
                  }"
                />
                <div class="flex flex-col min-w-0">
                  <span
                    class="font-medium text-gray-900 dark:text-white truncate cursor-pointer hover:underline"
                    @click="viewGroupProfiles(item)"
                  >
                    {{ item.name }}
                  </span>
                  <span v-if="item.description" class="text-xs text-gray-400 truncate">
                    {{ item.description }}
                  </span>
                </div>
              </div>
            </template>

            <!-- Custom Profile Count Column -->
            <template #profile_count="{ item }">
              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
                class="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800"
                @click="viewGroupProfiles(item)"
              >
                <UIcon name="i-lucide-layers" class="w-3 h-3 mr-1" />
                {{ item.profile_count ?? 0 }}
              </UBadge>
            </template>

            <!-- Custom Sort Column -->
            <template #sort="{ item }">
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ item.sort ?? 0 }}
              </span>
            </template>

            <!-- Custom Created At Column -->
            <template #created_at="{ item }">
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatDate(item.created_at) }}
              </span>
            </template>

            <!-- Mobile Card Layout -->
            <template #mobile-content="{ item }">
              <div class="flex flex-col gap-3 p-1">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="w-3 h-3 rounded-full shrink-0"
                      :class="{
                        'bg-primary-500': item.color === 'primary',
                        'bg-emerald-500': item.color === 'success',
                        'bg-amber-500': item.color === 'warning',
                        'bg-rose-500': item.color === 'error',
                        'bg-gray-400': !item.color || item.color === 'neutral'
                      }"
                    />
                    <span class="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {{ item.name }}
                    </span>
                  </div>
                  <UBadge color="neutral" variant="subtle" size="xs">
                    {{ item.profile_count ?? 0 }} {{ t('profiles.title') }}
                  </UBadge>
                </div>

                <p v-if="item.description" class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                  {{ item.description }}
                </p>

                <div
                  class="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-800"
                >
                  <span>{{ t('common.created_at') || 'Created' }}: {{ formatDate(item.created_at) }}</span>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="primary"
                    icon="i-lucide-arrow-right"
                    :label="t('profiles.quickProfiles')"
                    @click="viewGroupProfiles(item)"
                  />
                </div>
              </div>
            </template>

            <!-- Empty State -->
            <template #empty>
              <div class="flex flex-col items-center justify-center p-8 text-center">
                <UIcon name="i-lucide-folder-tree" class="w-12 h-12 text-gray-400 mb-3" />
                <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">
                  {{ t('profiles.noGroups') }}
                </h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-4">
                  {{ t('profiles.noGroupsDesc') }}
                </p>
                <UButton
                  color="primary"
                  variant="soft"
                  icon="i-lucide-plus"
                  :label="t('profiles.addGroup')"
                  @click="openCreate"
                />
              </div>
            </template>
          </LazyGridList>
        </div>
      </div>

      <!-- Create / Edit Modal -->
      <UModal
        v-model:open="showModal"
        :title="editingGroup ? t('profiles.editGroup') : t('profiles.addGroup')"
        :ui="{ content: 'max-w-md' }"
      >
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('profiles.groupName')" required>
              <UInput
                v-model="form.name"
                :placeholder="t('profiles.groupName')"
                class="w-full"
                autofocus
                @keydown.enter.prevent="handleSave"
              />
            </UFormField>

            <div class="grid grid-cols-2 gap-3">
              <UFormField :label="t('profiles.groupColor')">
                <USelect v-model="form.color" :items="colorOptions" class="w-full" />
              </UFormField>

              <UFormField :label="t('common.sort') || 'Sort'">
                <UInput v-model.number="form.sort" type="number" class="w-full" />
              </UFormField>
            </div>

            <UFormField :label="t('profiles.notes')">
              <UTextarea
                v-model="form.description"
                :rows="3"
                placeholder="Optional group notes..."
                class="w-full"
              />
            </UFormField>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              :label="t('global.cancel')"
              @click="showModal = false"
            />
            <UButton
              color="primary"
              variant="soft"
              :label="t('global.save')"
              :loading="saving"
              @click="handleSave"
            />
          </div>
        </template>
      </UModal>

      <!-- Single Delete Confirm Modal -->
      <LazyBaseConfirmModal
        v-model:open="showDeleteConfirm"
        :title="t('profiles.deleteGroupConfirm')"
        :description="t('profiles.deleteGroupConfirmDesc', { name: groupToDelete?.name || '' })"
        :loading="deleting"
        @confirm="executeSingleDelete"
      />

      <!-- Batch Delete Confirm Modal -->
      <LazyBaseConfirmModal
        v-model:open="showBatchDeleteConfirm"
        :title="t('profiles.batchDeleteGroupsConfirm')"
        :description="t('profiles.batchDeleteGroupsConfirmDesc', { count: selected.length })"
        :loading="deleting"
        @confirm="executeBatchDelete"
      />
    </template>
  </BasePage>
</template>
