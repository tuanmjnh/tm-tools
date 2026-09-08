<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  filePath?: string
  title?: string
}>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()

const isAudio = computed(() => {
  if (!props.filePath) return false
  return /\.(mp3|wav|aac|m4a|ogg|flac)$/i.test(props.filePath)
})

const isVideo = computed(() => {
  if (!props.filePath) return false
  return /\.(mp4|mkv|webm|mov|avi|flv|ts)$/i.test(props.filePath)
})

const mediaUrl = computed(() => {
  if (!props.filePath) return ''
  return `media://?file=${encodeURIComponent(props.filePath.replace(/\\/g, '/'))}`
})

function showInFolder() {
  if (props.filePath && window.electronAPI?.showItemInFolder) {
    window.electronAPI.showItemInFolder(props.filePath)
  }
}

async function openDefaultPlayer() {
  if (props.filePath && window.electronAPI?.openPath) {
    await window.electronAPI.openPath(props.filePath)
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="title || t('tools.previewResult')" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <div class="space-y-4">
        <!-- Media Player -->
        <div
          class="flex flex-col items-center justify-center bg-black/90 rounded-xl overflow-hidden min-h-75 max-h-[70vh] p-2">
          <video v-if="isVideo" :key="mediaUrl" :src="mediaUrl" controls autoplay
            class="w-full max-h-[60vh] rounded-lg object-contain" />
          <div v-else-if="isAudio" class="flex flex-col items-center justify-center p-8 w-full">
            <UIcon name="i-lucide-music" class="size-16 text-primary mb-4 animate-pulse" />
            <audio :key="mediaUrl" :src="mediaUrl" controls autoplay class="w-full max-w-md" />
          </div>
          <div v-else class="text-neutral-400 text-sm p-8 text-center">
            {{ t('tools.unsupportedPreviewFormat') }}
          </div>
        </div>

        <!-- File Info & Actions -->
        <div
          class="flex items-center justify-between p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 text-xs">
          <div class="flex items-center gap-2 min-w-0 pr-4">
            <UIcon :name="isAudio ? 'i-lucide-file-audio' : 'i-lucide-file-video'"
              class="text-primary size-5 shrink-0" />
            <span class="font-mono truncate" :title="filePath">{{ filePath }}</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <UButton icon="i-lucide-folder" size="xs" variant="outline" color="neutral" :title="t('tools.openInFolder')"
              @click="showInFolder">
              {{ t('tools.openInFolder') }}
            </UButton>
            <UButton icon="i-lucide-external-link" size="xs" variant="soft" color="primary"
              :title="t('tools.openWithApp')" @click="openDefaultPlayer">
              {{ t('tools.openWithApp') }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
