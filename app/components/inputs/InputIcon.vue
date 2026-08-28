<script setup lang="ts">
const { copy } = useClipboard()
const toast = useToast()
const { t } = useI18n()
defineProps<{
  label?: string
  description?: string
}>()

const modelValue = defineModel<string>({ default: '' })
const selectedType = ref<'icon' | 'image' | 'svg'>('icon')

// Modals state
const isIconModalOpen = ref(false)
const isImageModalOpen = ref(false)
const isSvgModalOpen = ref(false)
const isConfirmOpen = ref(false)

onMounted(() => {
  if (modelValue.value) {
    selectedType.value = detectDisplayType(modelValue.value) as 'icon' | 'image' | 'svg'
  }
})

const iconOptions = computed(() => [
  { label: t('input_icon.iconify_label'), value: 'icon', icon: 'i-lucide-box', description: t('input_icon.iconify_desc') },
  { label: t('input_icon.image_label'), value: 'image', icon: 'i-lucide-image', description: t('input_icon.image_desc') },
  { label: t('input_icon.svg_label'), value: 'svg', icon: 'i-lucide-code-xml', description: t('input_icon.svg_desc') }
])

const actualDisplayType = computed(() => detectDisplayType(modelValue.value))
const isActuallySvg = computed(() => actualDisplayType.value === 'svg')

function openSelector(type: 'icon' | 'image' | 'svg') {
  selectedType.value = type
  if (type === 'icon') isIconModalOpen.value = true
  else if (type === 'image') isImageModalOpen.value = true
  else if (type === 'svg') isSvgModalOpen.value = true
}

// Image handler
const previewMetadata = computed(() => {
  const val = modelValue.value
  if (!val) return null
  const type = detectDisplayType(val)
  if (type === 'image') return { url: val, public_id: val, display_name: 'Icon Image' }
  if (type === 'svg') return { url: val, public_id: 'svg_preview', display_name: 'SVG Preview' }
  return { url: val, public_id: val, display_name: `Icon: ${val}` }
})

function handleImageUpdate(file: Cloudinary.IFileAttach | Cloudinary.IFileAttach[] | null) {
  if (!file) {
    modelValue.value = ''
    return
  }
  const target = Array.isArray(file) ? file[0] : file
  if (target?.url) {
    modelValue.value = target.url
    isImageModalOpen.value = false
  }
}

function handleIconSelect(icon: string) {
  modelValue.value = icon
  isIconModalOpen.value = false
}

const isPreviewOpen = ref(false)

const onPreview = () => {
  isPreviewOpen.value = true
}

function clearValue() {
  modelValue.value = ''
  isConfirmOpen.value = false
}

function saveSvg() {
  if (modelValue.value && detectDisplayType(modelValue.value) === 'svg') {
    modelValue.value = minifySvg(modelValue.value)
  }
  isSvgModalOpen.value = false
}

function copyToClipboard() {
  if (modelValue.value) {
    copy(modelValue.value)
    toast.add({
      title: t('common.success'),
      description: t('input_icon.svg_copied', 'SVG code copied to clipboard'),
      color: 'success'
    })
  }
}

const svgPreview = computed(() => {
  return sanitizeSvg(modelValue.value)
})
</script>

<template>
  <div class="flex items-center gap-4">
    <!-- Main Interactive Preview -->
    <UPopover :popper="{ placement: 'bottom-start' }">
      <template #default>
        <UButton color="neutral" variant="ghost" class="p-0 hover:bg-transparent overflow-visible group">
          <div
            class="relative w-14 h-14 flex items-center justify-center bg-white dark:bg-gray-900 rounded-xl shadow-sm border-2 border-dashed border-gray-200 dark:border-gray-800 group-hover:border-primary-500/50 group-hover:ring-4 group-hover:ring-primary-500/10 transition-all duration-300"
          >
            <MediaVisual
              v-if="modelValue"
              :src="modelValue"
              size="size-8"
              inner-class="p-1"
            />
            <UIcon
              v-else
              name="i-lucide-plus"
              class="w-6 h-6 text-gray-400 group-hover:scale-110 transition-transform"
            />

            <!-- Little edit badge -->
            <div
              class="absolute -bottom-1 -right-1 w-5 h-5 bg-primary-500 rounded-full border-2 border-white dark:border-gray-950 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <UIcon name="i-lucide-pencil" class="w-2.5 h-2.5 text-white" />
            </div>
          </div>
        </UButton>
      </template>

      <template #content="{ close }">
        <div class="p-2 w-64 divide-y divide-gray-100 dark:divide-gray-800">
          <div class="px-2 py-2">
            <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-2 mb-2">
              {{ $t('input_icon.change_type') }}
            </p>
            <UButton
              v-for="opt in iconOptions"
              :key="opt.value"
              color="neutral"
              variant="ghost"
              class="w-full justify-start gap-3 py-2 px-2 hover:bg-gray-100 dark:hover:bg-gray-800/50"
              @click="openSelector(opt.value as 'icon' | 'image' | 'svg'); close()"
            >
              <div class="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800">
                <UIcon :name="opt.icon" class="flex w-4 h-4 text-gray-600 dark:text-gray-400" />
              </div>
              <div class="text-left">
                <p class="text-sm font-semibold">
                  {{ opt.label }}
                </p>
                <p class="text-[10px] text-gray-500 truncate">
                  {{ opt.description }}
                </p>
              </div>
            </UButton>
          </div>
          <div v-if="modelValue" class="px-2 py-2 space-y-1">
            <UButton
              color="info"
              variant="ghost"
              icon="i-lucide-fullscreen"
              :label="$t('input_icon.preview_image', 'View Large')"
              class="w-full justify-start text-xs"
              @click="onPreview(); close()"
            />
            <UButton
              v-if="isActuallySvg"
              color="neutral"
              variant="ghost"
              icon="i-lucide-copy"
              :label="$t('common.copy', 'Copy Code')"
              class="w-full justify-start text-xs"
              @click="copyToClipboard(); close()"
            />
            <UButton
              v-if="!isIconify(modelValue)"
              color="secondary"
              variant="ghost"
              icon="i-lucide-download"
              :label="$t('common.download', 'Download')"
              class="w-full justify-start text-xs"
              @click="downloadFile(modelValue, label); close()"
            />
            <UButton
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              :label="$t('input_icon.clear')"
              class="w-full justify-start text-xs"
              @click="isConfirmOpen = true; close()"
            />
          </div>
        </div>
      </template>
    </UPopover>

    <!-- Label/Desc -->
    <div v-if="label || description" class="flex-1">
      <p v-if="label" class="text-sm font-semibold text-gray-900 dark:text-white">
        {{ label }}
      </p>
      <p v-if="description" class="text-xs text-gray-500">
        {{ description }}
      </p>
    </div>

    <!-- MODALS -->
    <!-- 1. Iconify Modal -->
    <UModal
      v-model:open="isIconModalOpen"
      :title="$t('input_icon.select_icon')"
      :description="$t('input_icon.select_icon_desc')"
    >
      <template #body>
        <LazyInputsIconSelector v-model="modelValue" mode="inline" @select="handleIconSelect" />
      </template>
    </UModal>

    <!-- 2. Image Modal -->
    <UModal
      v-model:open="isImageModalOpen"
      :title="$t('input_icon.select_image')"
      :description="$t('input_icon.select_image_desc')"
      :ui="{ body: 'min-h-[300px]' }"
    >
      <template #body>
        <LazyMediaGallery
          :model-value="previewMetadata"
          :multiple="false"
          size="200px"
          accept="image/*"
          @update:model-value="handleImageUpdate"
        />
      </template>
    </UModal>

    <!-- 3. SVG Modal -->
    <UModal
      v-model:open="isSvgModalOpen"
      :title="$t('input_icon.svg_code')"
      :description="$t('input_icon.svg_help')"
      :ui="{ content: 'sm:max-w-lg', footer: 'justify-end' }"
    >
      <template #body>
        <div class="space-y-4">
          <UTextarea
            v-model="modelValue"
            :placeholder="$t('input_icon.svg_placeholder')"
            :rows="10"
            class="font-mono text-xs w-full"
            autofocus
          />
          <div
            class="p-4 border border-dashed rounded-xl flex items-center justify-center bg-gray-50 dark:bg-gray-900/50 min-h-[140px]"
          >
            <div
              v-if="svgPreview"
              class="w-20 h-20 text-gray-700 dark:text-gray-200 [&>svg]:w-full [&>svg]:h-full [&>svg]:block [&>svg]:fill-current [&>svg]:stroke-current"
              v-html="svgPreview"
            />
            <p v-else class="text-xs text-gray-400 italic">
              {{ $t('input_icon.svg_preview') }}
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton
          v-if="modelValue"
          color="neutral"
          variant="ghost"
          icon="i-lucide-download"
          :label="$t('common.download', 'Download')"
          @click="downloadFile(modelValue)"
        />
        <UButton
          v-if="modelValue"
          color="neutral"
          variant="ghost"
          icon="i-lucide-copy"
          :label="$t('common.copy')"
          @click="copyToClipboard"
        />
        <UButton
          color="primary"
          variant="soft"
          :label="$t('input_icon.apply_svg')"
          @click="saveSvg"
        />
      </template>
    </UModal>

    <!-- Preview Modal -->
    <LazyMediaImagePreview v-if="isPreviewOpen" v-model:open="isPreviewOpen" :file="previewMetadata!" />

    <!-- Confirm Modal -->
    <LazyBaseConfirmModal
      v-model="isConfirmOpen"
      :title="t('confirm.delete_title')"
      :description="t('confirm.delete_desc')"
      color="error"
      icon="i-lucide-trash-2"
      :confirm-label="t('confirm.accept')"
      :cancel-label="t('common.cancel')"
      @confirm="clearValue"
    />
  </div>
</template>
