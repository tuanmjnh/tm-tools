<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ProfileGroup } from '~/types'

const props = defineProps<{
  modelValue: boolean
  groups: ProfileGroup[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const { saveGroup, deleteGroup } = useProfileGroups()

const isOpen = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val)
})

const newGroupName = ref('')
const newGroupColor = ref('primary')
const editingId = ref<string | null>(null)
const editName = ref('')
const editColor = ref('primary')

const colorOptions = [
  { label: 'Primary', value: 'primary' },
  { label: 'Success', value: 'success' },
  { label: 'Warning', value: 'warning' },
  { label: 'Error', value: 'error' },
  { label: 'Neutral', value: 'neutral' }
]

async function onCreateGroup() {
  if (!newGroupName.value.trim()) return
  const ok = await saveGroup({
    name: newGroupName.value.trim(),
    color: newGroupColor.value
  })
  if (ok) {
    newGroupName.value = ''
    emit('saved')
  }
}

function startEdit(g: ProfileGroup) {
  editingId.value = g.id
  editName.value = g.name
  editColor.value = g.color || 'primary'
}

async function onSaveEdit() {
  if (!editingId.value || !editName.value.trim()) return
  const ok = await saveGroup({
    id: editingId.value,
    name: editName.value.trim(),
    color: editColor.value
  })
  if (ok) {
    editingId.value = null
    emit('saved')
  }
}

async function onDeleteGroup(id: string) {
  const ok = await deleteGroup(id)
  if (ok) emit('saved')
}
</script>

<template>
  <UModal v-model:open="isOpen" :title="t('profiles.manageGroups')" :ui="{ content: 'max-w-md' }">
    <template #body>
      <div class="space-y-4">
        <!-- New Group Input -->
        <div class="flex gap-2">
          <UInput
            v-model="newGroupName"
            :placeholder="t('profiles.groupName')"
            class="flex-1"
            size="sm"
            @keydown.enter.prevent="onCreateGroup"
          />
          <USelect
            v-model="newGroupColor"
            size="sm"
            class="w-28"
            :items="colorOptions"
          />
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            icon="i-lucide-plus"
            :label="t('global.create')"
            @click="onCreateGroup"
          />
        </div>

        <!-- Groups List -->
        <div class="divide-y divide-gray-100 dark:divide-gray-800 border rounded-lg overflow-hidden">
          <div
            v-for="g in groups"
            :key="g.id"
            class="p-2.5 flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-900/50"
          >
            <div v-if="editingId === g.id" class="flex items-center gap-2 flex-1">
              <UInput v-model="editName" size="xs" class="flex-1" />
              <USelect
                v-model="editColor"
                size="xs"
                class="w-24"
                :items="colorOptions"
              />
              <UButton
                size="xs"
                icon="i-lucide-check"
                color="success"
                variant="ghost"
                @click="onSaveEdit"
              />
              <UButton
                size="xs"
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                @click="editingId = null"
              />
            </div>

            <div v-else class="flex items-center justify-between w-full">
              <div class="flex items-center gap-2">
                <UBadge
                  :color="(g.color as 'primary' | 'success' | 'warning' | 'error' | 'neutral') || 'primary'"
                  variant="subtle"
                  size="sm"
                >
                  {{ g.name }}
                </UBadge>
              </div>
              <div class="flex items-center gap-1">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-edit"
                  @click="startEdit(g)"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  icon="i-lucide-trash"
                  @click="onDeleteGroup(g.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
