<script setup lang="ts">
import { ref, computed } from 'vue'
import { ALL_XFADE_TRANSITIONS } from '~/utils/transitions'

const props = withDefaults(defineProps<{
  open?: boolean
  modelValue?: string[]
}>(), {
  open: false,
  modelValue: () => []
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'update:modelValue', value: string[]): void
}>()

const { t } = useI18n()

const isOpen = computed({
  get: () => props.open,
  set: (val: boolean) => emit('update:open', val)
})

const search = ref('')

const POPULAR_TRANSITIONS = [
  'fade', 'wipeleft', 'wiperight', 'slideleft', 'slideright',
  'circlecrop', 'smoothleft', 'smoothright', 'radial', 'dissolve', 'pixelize', 'zoomin'
]

const filteredTransitions = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return ALL_XFADE_TRANSITIONS
  return ALL_XFADE_TRANSITIONS.filter(t =>
    t.name.toLowerCase().includes(q)
    || t.id.toLowerCase().includes(q)
    || t.description.toLowerCase().includes(q)
  )
})

function isSelected(id: string): boolean {
  return props.modelValue.includes(id)
}

function toggleTransition(id: string) {
  const current = [...props.modelValue]
  const idx = current.indexOf(id)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    current.push(id)
  }
  emit('update:modelValue', current)
}

function selectAll() {
  emit('update:modelValue', ALL_XFADE_TRANSITIONS.map(t => t.id))
}

function deselectAll() {
  emit('update:modelValue', [])
}

function selectPopular() {
  emit('update:modelValue', [...POPULAR_TRANSITIONS])
}
</script>

<template>
  <BaseResponsiveModal
    v-model:open="isOpen"
    :title="t('tools.transitionModalTitle')"
    :description="t('tools.transitionModalDesc')"
    class="sm:max-w-3xl"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Search and Quick Actions Bar -->
        <div class="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
          <div class="flex-1 max-w-sm">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              :placeholder="t('global.search')"
              class="w-full"
            />
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <UButton
              size="xs"
              variant="soft"
              color="neutral"
              @click="selectAll"
            >
              {{ t('tools.selectAll') }}
            </UButton>
            <UButton
              size="xs"
              variant="soft"
              color="neutral"
              @click="selectPopular"
            >
              {{ t('tools.selectPopular') }}
            </UButton>
            <UButton
              size="xs"
              variant="soft"
              color="neutral"
              @click="deselectAll"
            >
              {{ t('tools.deselectAll') }}
            </UButton>
            <UBadge
              color="primary"
              variant="subtle"
              size="sm"
              class="ml-1"
            >
              {{ modelValue.length }} / {{ ALL_XFADE_TRANSITIONS.length }}
            </UBadge>
          </div>
        </div>

        <!-- Transitions Grid -->
        <div class="max-h-[60vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <div
              v-for="item in filteredTransitions"
              :key="item.id"
              class="p-2.5 rounded-lg border cursor-pointer transition-all flex items-start gap-2.5 select-none"
              :class="isSelected(item.id)
                ? 'border-primary bg-primary/5 dark:bg-primary/10'
                : 'border-default hover:border-primary/50 hover:bg-muted/40'"
              @click="toggleTransition(item.id)"
            >
              <UCheckbox :model-value="isSelected(item.id)" class="mt-0.5 pointer-events-none" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-1">
                  <span class="text-xs font-semibold truncate">{{ item.name }}</span>
                  <span class="text-[10px] font-mono text-muted">{{ item.id }}</span>
                </div>
                <p class="text-[11px] text-muted line-clamp-2 mt-0.5 leading-snug">
                  {{ item.description }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <span class="text-xs text-muted">
          {{ t('tools.transitionsSelectedCount', { count: modelValue.length }) }}
        </span>
        <UButton color="primary" variant="solid" @click="isOpen = false">
          {{ t('global.confirm') }}
        </UButton>
      </div>
    </template>
  </BaseResponsiveModal>
</template>
