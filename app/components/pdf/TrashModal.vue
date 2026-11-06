<script setup lang="ts">
import type { PdfTrashItem } from '#shared/types/pdf'
import { formatPdfBytes } from '~/utils/pdfStudio'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'restored': []
}>()

const { t } = useI18n()
const { formatDateTime } = useDateTime()
const { trashItems, loading, busy, refreshTrash, restoreTrash, deleteTrashPermanent, emptyAllTrash } = usePdfStudio()

const confirmEmptyOpen = ref(false)
const pendingDelete = ref<PdfTrashItem | null>(null)
const confirmDeleteOpen = ref(false)

watch(() => props.open, (val) => {
  if (val) {
    void refreshTrash()
  }
})

async function onRestore(item: PdfTrashItem) {
  const ok = await restoreTrash(item.id)
  if (ok) emit('restored')
}

function askDeletePermanent(item: PdfTrashItem) {
  pendingDelete.value = item
  confirmDeleteOpen.value = true
}

const deleteDescription = computed(() =>
  pendingDelete.value
    ? t('pdf.trash.deletePermanentDesc', { name: pendingDelete.value.originalName })
    : ''
)

async function onDeletePermanent() {
  const item = pendingDelete.value
  confirmDeleteOpen.value = false
  pendingDelete.value = null
  if (!item) return
  await deleteTrashPermanent(item.id)
}

async function onEmpty() {
  confirmEmptyOpen.value = false
  await emptyAllTrash()
}
</script>

<template>
  <LazyBaseResponsiveModal
    :open="open"
    :title="t('pdf.trash.title')"
    :description="t('pdf.trash.description')"
    class="max-w-3xl"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-2 border-b border-default pb-3">
        <span class="text-xs text-muted">
          {{ t('pdf.trash.count', { count: trashItems.length }) }}
        </span>
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            :aria-label="t('pdf.actions.refresh')"
            :loading="loading"
            @click="refreshTrash"
          />
          <UButton
            v-if="trashItems.length"
            icon="i-lucide-trash-2"
            :label="t('pdf.trash.emptyButton')"
            color="error"
            variant="ghost"
            size="xs"
            :disabled="busy === 'emptyTrash'"
            @click="confirmEmptyOpen = true"
          />
        </div>
      </div>

      <div v-if="!trashItems.length" class="space-y-2 py-12 text-center text-muted">
        <UIcon name="i-lucide-trash-2" class="mx-auto size-8 text-dimmed" />
        <p class="text-sm font-medium">
          {{ t('pdf.trash.empty') }}
        </p>
        <p class="text-xs">
          {{ t('pdf.trash.emptyHint') }}
        </p>
      </div>

      <div v-else class="max-h-[60vh] divide-y divide-default overflow-y-auto">
        <div
          v-for="item in trashItems"
          :key="item.id"
          class="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0 space-y-0.5">
            <div class="flex items-center gap-2">
              <UIcon
                :name="item.isDirectory ? 'i-lucide-folder' : 'i-lucide-file'"
                class="size-4 shrink-0"
                :class="item.isDirectory ? 'text-amber-500' : 'text-muted'"
              />
              <span class="truncate text-sm font-medium" :title="item.originalRelativePath">
                {{ item.originalName }}
              </span>
              <UBadge color="neutral" variant="subtle" size="xs">
                {{ item.area }}
              </UBadge>
            </div>
            <div class="flex flex-wrap items-center gap-x-3 text-xs text-muted">
              <span class="truncate max-w-[280px]" :title="item.originalRelativePath">
                {{ item.originalRelativePath }}
              </span>
              <span v-if="item.size" class="mono">{{ formatPdfBytes(item.size) }}</span>
              <span>{{ formatDateTime(item.deletedAt) }}</span>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <UButton
              icon="i-lucide-undo-2"
              :label="t('pdf.trash.restore')"
              color="primary"
              variant="soft"
              size="xs"
              :loading="busy === 'restoreTrash'"
              @click="onRestore(item)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              square
              :aria-label="t('pdf.trash.deletePermanent')"
              :loading="busy === 'deleteTrashPermanent'"
              @click="askDeletePermanent(item)"
            />
          </div>
        </div>
      </div>
    </div>

    <BaseConfirmModal
      v-model:open="confirmEmptyOpen"
      :title="t('pdf.trash.emptyTitle')"
      :description="t('pdf.trash.emptyDesc')"
      :loading="busy === 'emptyTrash'"
      @confirm="onEmpty"
    />

    <BaseConfirmModal
      v-model:open="confirmDeleteOpen"
      :title="t('pdf.trash.deletePermanent')"
      :description="deleteDescription"
      :loading="busy === 'deleteTrashPermanent'"
      @confirm="onDeletePermanent"
    />
  </LazyBaseResponsiveModal>
</template>
