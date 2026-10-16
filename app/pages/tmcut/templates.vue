<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TmcutTemplate } from '~/types/tmcut'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const { createProject } = useTmcutProject()
const {
  filteredTemplates,
  categoryCounts,
  selectedCategory,
  selectedAspectRatio,
  searchQuery,
  createProjectFromTemplate,
  deleteUserTemplate,
  ticksToSeconds
} = useTmcutTemplates()

// Modal customization state
const customizeModalOpen = ref(false)
const activeTemplate = ref<TmcutTemplate | null>(null)
const projectNameInput = ref('')
const placeholderTextInputs = ref<Record<string, string>>({})
const isCreating = ref(false)

// Delete confirm modal state
const deleteModalOpen = ref(false)
const targetDeleteId = ref<string | null>(null)
const targetDeleteName = ref('')

const categories = computed(() => [
  { id: 'all', label: t('tmcut.templateLibrary.allCategories'), count: categoryCounts.value.all || 0 },
  { id: 'intro', label: t('tmcut.templateLibrary.catIntro'), count: categoryCounts.value.intro || 0 },
  { id: 'outro', label: t('tmcut.templateLibrary.catOutro'), count: categoryCounts.value.outro || 0 },
  { id: 'split-screen', label: t('tmcut.templateLibrary.catSplit'), count: categoryCounts.value['split-screen'] || 0 },
  { id: 'promo', label: t('tmcut.templateLibrary.catPromo'), count: categoryCounts.value.promo || 0 },
  { id: 'minimal', label: t('tmcut.templateLibrary.catMinimal'), count: categoryCounts.value.minimal || 0 },
  { id: 'custom', label: t('tmcut.templateLibrary.catCustom'), count: categoryCounts.value.custom || 0 }
])

const aspectRatios = computed(() => [
  { id: 'all', label: t('tmcut.templateLibrary.allRatios') },
  { id: '9:16', label: t('tmcut.templateLibrary.ratioVertical'), icon: 'i-lucide-smartphone' },
  { id: '16:9', label: t('tmcut.templateLibrary.ratioHorizontal'), icon: 'i-lucide-monitor' },
  { id: '1:1', label: t('tmcut.templateLibrary.ratioSquare'), icon: 'i-lucide-square' }
])

function handleCreateBlank() {
  const proj = createProject(t('tmcut.newProject'))
  router.push(`/tmcut/editor?project=${proj.id}`)
}

async function handleDirectUse(tpl: TmcutTemplate) {
  try {
    isCreating.value = true
    const proj = await createProjectFromTemplate(tpl, {
      projectName: `${tpl.name} - Project`
    })
    toast.add({
      title: t('tmcut.templateLibrary.createdToast', { name: tpl.name }),
      color: 'success',
      icon: 'i-lucide-check-circle'
    })
    router.push(`/tmcut/editor?project=${proj.id}`)
  } catch (err) {
    console.error('Failed to instantiate template', err)
    toast.add({
      title: t('tmcut.save.error'),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    isCreating.value = false
  }
}

function openCustomizeModal(tpl: TmcutTemplate) {
  activeTemplate.value = tpl
  projectNameInput.value = `${tpl.name} - Project`
  placeholderTextInputs.value = {}

  if (Array.isArray(tpl.placeholders)) {
    for (const ph of tpl.placeholders) {
      if (ph.type === 'text') {
        placeholderTextInputs.value[ph.id] = ph.defaultContent || ''
      }
    }
  }
  customizeModalOpen.value = true
}

async function handleConfirmCustomize() {
  if (!activeTemplate.value) return
  try {
    isCreating.value = true
    const replacements: Record<string, { text?: string }> = {}
    for (const [phId, textVal] of Object.entries(placeholderTextInputs.value)) {
      if (textVal.trim()) {
        replacements[phId] = { text: textVal.trim() }
      }
    }

    const proj = await createProjectFromTemplate(activeTemplate.value, {
      projectName: projectNameInput.value.trim() || activeTemplate.value.name,
      replacements
    })

    toast.add({
      title: t('tmcut.templateLibrary.createdToast', { name: activeTemplate.value.name }),
      color: 'success',
      icon: 'i-lucide-check-circle'
    })
    customizeModalOpen.value = false
    router.push(`/tmcut/editor?project=${proj.id}`)
  } catch (err) {
    console.error('Failed to create customized template project', err)
    toast.add({
      title: t('tmcut.save.error'),
      color: 'error',
      icon: 'i-lucide-alert-triangle'
    })
  } finally {
    isCreating.value = false
  }
}

function promptDeleteTemplate(tpl: TmcutTemplate) {
  targetDeleteId.value = tpl.id
  targetDeleteName.value = tpl.name
  deleteModalOpen.value = true
}

function confirmDeleteTemplate() {
  if (targetDeleteId.value) {
    deleteUserTemplate(targetDeleteId.value)
    toast.add({
      title: t('tmcut.templateLibrary.deleted'),
      color: 'success',
      icon: 'i-lucide-trash-2'
    })
  }
  deleteModalOpen.value = false
  targetDeleteId.value = null
}

function getMediaSlotsCount(tpl: TmcutTemplate): number {
  if (!Array.isArray(tpl.placeholders)) return 0
  return tpl.placeholders.filter(p => p.type === 'video' || p.type === 'image').length
}

function getTextSlotsCount(tpl: TmcutTemplate): number {
  if (!Array.isArray(tpl.placeholders)) return 0
  return tpl.placeholders.filter(p => p.type === 'text').length
}
</script>

<template>
  <BasePage
    id="tmcut-templates"
    :title="t('tmcut.templateLibrary.title')"
    :description="t('tmcut.templateLibrary.subtitle')"
  >
    <template #right>
      <div class="flex items-center gap-2">
        <UButton
          to="/tmcut"
          icon="i-lucide-arrow-left"
          variant="soft"
          color="neutral"
          size="sm"
        >
          <span class="hidden sm:inline">{{ t('tmcut.back') }}</span>
        </UButton>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          variant="soft"
          size="sm"
          @click="handleCreateBlank"
        >
          {{ t('tmcut.templateLibrary.createBlank') }}
        </UButton>
      </div>
    </template>

    <div class="space-y-6">
      <!-- Search & Filters Toolbar -->
      <div class="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
        <!-- Search bar -->
        <div class="relative w-full md:w-80">
          <UIcon
            name="i-lucide-search"
            class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('tmcut.templateLibrary.searchPlaceholder')"
            class="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg pl-9 pr-3 py-1.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:border-primary/50 transition-colors"
          >
        </div>

        <!-- Aspect Ratio Filter Chips -->
        <div class="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          <button
            v-for="aspect in aspectRatios"
            :key="aspect.id"
            type="button"
            class="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            :class="selectedAspectRatio === aspect.id
              ? 'bg-primary/15 text-primary border border-primary/40'
              : 'bg-neutral-100 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'"
            @click="selectedAspectRatio = aspect.id"
          >
            <UIcon v-if="aspect.icon" :name="aspect.icon" class="w-3.5 h-3.5" />
            <span>{{ aspect.label }}</span>
          </button>
        </div>
      </div>

      <!-- Category Filter Pills -->
      <div class="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          v-for="cat in categories"
          :key="cat.id"
          type="button"
          class="px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
          :class="selectedCategory === cat.id
            ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold'
            : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700'"
          @click="selectedCategory = cat.id"
        >
          <span>{{ cat.label }}</span>
          <span
            class="px-1.5 py-0.2 rounded-full text-[10px]"
            :class="selectedCategory === cat.id
              ? 'bg-white/20 text-white dark:bg-neutral-900/20 dark:text-neutral-900'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'"
          >
            {{ cat.count }}
          </span>
        </button>
      </div>

      <!-- Templates Grid -->
      <div
        v-if="filteredTemplates.length > 0"
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        <div
          v-for="tpl in filteredTemplates"
          :key="tpl.id"
          class="group border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900 flex flex-col justify-between hover:border-primary/50 transition-all duration-200 shadow-xs hover:shadow-md overflow-hidden"
        >
          <!-- Card Visual Stage -->
          <div class="w-full h-40 bg-neutral-950 flex items-center justify-center relative overflow-hidden p-4 border-b border-neutral-100 dark:border-neutral-800">
            <!-- Simulated aspect ratio container -->
            <div
              class="border-2 border-dashed border-neutral-700 rounded-lg flex items-center justify-center bg-neutral-900/80"
              :class="{
                'w-20 h-32': tpl.aspectRatio === '9:16',
                'w-40 h-24': tpl.aspectRatio === '16:9',
                'w-28 h-28': tpl.aspectRatio === '1:1'
              }"
            >
              <UIcon
                :name="tpl.thumbnail || 'i-lucide-layout-template'"
                class="w-7 h-7 text-primary/80"
              />
            </div>

            <!-- Badges top row -->
            <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5">
              <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-black/60 text-white backdrop-blur-xs">
                {{ tpl.aspectRatio }}
              </span>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-mono bg-black/60 text-white backdrop-blur-xs">
                {{ ticksToSeconds(tpl.durationTicks) }}s
              </span>
            </div>

            <div class="absolute top-2.5 right-2.5">
              <span
                v-if="tpl.isBuiltin"
                class="px-2 py-0.5 rounded-md text-[10px] font-medium bg-primary/20 text-primary border border-primary/30 flex items-center gap-1 backdrop-blur-xs"
              >
                <UIcon name="i-lucide-sparkles" class="w-3 h-3" />
                {{ t('tmcut.templateLibrary.builtInBadge') }}
              </span>
              <span
                v-else
                class="px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 backdrop-blur-xs"
              >
                <UIcon name="i-lucide-user" class="w-3 h-3" />
                {{ t('tmcut.templateLibrary.customBadge') }}
              </span>
            </div>
          </div>

          <!-- Card Content -->
          <div class="p-5 flex-1 flex flex-col justify-between">
            <div>
              <div class="flex items-start justify-between gap-2">
                <h3 class="font-semibold text-base text-neutral-900 dark:text-neutral-100 group-hover:text-primary transition-colors">
                  {{ tpl.name }}
                </h3>
                <UButton
                  v-if="!tpl.isBuiltin"
                  icon="i-lucide-trash-2"
                  size="xs"
                  color="error"
                  variant="ghost"
                  :title="t('tmcut.templateLibrary.deleteTemplate')"
                  @click.stop="promptDeleteTemplate(tpl)"
                />
              </div>
              <p class="text-xs text-neutral-500 mt-1 line-clamp-2">
                {{ tpl.description || t('tmcut.templateLibrary.subtitle') }}
              </p>

              <!-- Placeholders statistics -->
              <div class="flex items-center gap-3 mt-4 text-[11px] text-neutral-500 border-t border-neutral-100 dark:border-neutral-800 pt-3">
                <div class="flex items-center gap-1">
                  <UIcon name="i-lucide-video" class="w-3.5 h-3.5 text-neutral-400" />
                  <span>{{ t('tmcut.templateLibrary.videoPlaceholders', { n: getMediaSlotsCount(tpl) }) }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <UIcon name="i-lucide-type" class="w-3.5 h-3.5 text-neutral-400" />
                  <span>{{ t('tmcut.templateLibrary.textPlaceholders', { n: getTextSlotsCount(tpl) }) }}</span>
                </div>
                <div class="flex items-center gap-1 ml-auto">
                  <UIcon name="i-lucide-layers" class="w-3.5 h-3.5 text-neutral-400" />
                  <span>{{ t('tmcut.templateLibrary.tracksCount', { n: tpl.tracks?.length || 1 }) }}</span>
                </div>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="mt-5 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2">
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-sliders"
                @click="openCustomizeModal(tpl)"
              >
                {{ t('tmcut.templateLibrary.previewDetails') }}
              </UButton>
              <UButton
                size="xs"
                color="primary"
                variant="soft"
                icon="i-lucide-sparkles"
                :loading="isCreating"
                @click="handleDirectUse(tpl)"
              >
                {{ t('tmcut.templateLibrary.useTemplate') }}
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else
        class="py-16 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900/40 p-8"
      >
        <div class="w-12 h-12 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto text-neutral-400 mb-3">
          <UIcon name="i-lucide-layout-template" class="w-6 h-6" />
        </div>
        <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {{ t('tmcut.templateLibrary.emptyTitle') }}
        </h3>
        <p class="text-xs text-neutral-500 max-w-sm mx-auto mt-1">
          {{ t('tmcut.templateLibrary.emptyDesc') }}
        </p>
        <div class="mt-4">
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            @click="selectedCategory = 'all'; selectedAspectRatio = 'all'; searchQuery = ''"
          >
            {{ t('tmcut.animation.reset') }}
          </UButton>
        </div>
      </div>
    </div>

    <!-- Customize & Preview Modal -->
    <UModal v-model:open="customizeModalOpen">
      <template #content>
        <div class="p-6 space-y-5">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                {{ t('tmcut.templateLibrary.modalTitle') }}
              </h3>
              <p class="text-xs text-neutral-500 mt-0.5">
                {{ activeTemplate?.name }} · {{ activeTemplate?.aspectRatio }} ({{ activeTemplate ? ticksToSeconds(activeTemplate.durationTicks) : 0 }}s)
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="customizeModalOpen = false"
            />
          </div>

          <!-- Project name input -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              {{ t('tmcut.templateLibrary.projectNameLabel') }}
            </label>
            <UInput
              v-model="projectNameInput"
              :placeholder="t('tmcut.templateLibrary.projectNamePlaceholder')"
              class="w-full"
            />
          </div>

          <!-- Placeholders Tuning Section -->
          <div class="space-y-3">
            <div>
              <h4 class="text-xs font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                {{ t('tmcut.templateLibrary.placeholdersTitle') }}
              </h4>
              <p class="text-[11px] text-neutral-500 mt-0.5">
                {{ t('tmcut.templateLibrary.placeholdersHint') }}
              </p>
            </div>

            <div class="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              <div
                v-for="ph in activeTemplate?.placeholders"
                :key="ph.id"
                class="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 space-y-1.5"
              >
                <div class="flex items-center justify-between text-xs">
                  <span class="font-medium text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                    <UIcon
                      :name="ph.type === 'text' ? 'i-lucide-type' : ph.type === 'audio' ? 'i-lucide-music' : 'i-lucide-video'"
                      class="w-3.5 h-3.5 text-primary"
                    />
                    {{ ph.label }}
                  </span>
                  <span class="text-[10px] text-neutral-400 font-mono">
                    {{ ph.type === 'text' ? t('tmcut.templateLibrary.textSlot') : t('tmcut.templateLibrary.mediaSlot') }}
                  </span>
                </div>

                <div v-if="ph.type === 'text'">
                  <UInput
                    v-model="placeholderTextInputs[ph.id]"
                    size="sm"
                    class="w-full"
                  />
                </div>
                <div v-else class="text-[11px] text-neutral-400 italic">
                  {{ t('tmcut.templateLibrary.mediaSlotHint') }}
                </div>
              </div>
            </div>
          </div>

          <!-- Modal footer actions -->
          <div class="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              @click="customizeModalOpen = false"
            >
              {{ t('tmcut.hotkeys.close') }}
            </UButton>
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-sparkles"
              :loading="isCreating"
              @click="handleConfirmCustomize"
            >
              {{ t('tmcut.templateLibrary.createProjectBtn') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirm Modal -->
    <UModal v-model:open="deleteModalOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {{ t('tmcut.templateLibrary.deleteTemplate') }}
          </h3>
          <p class="text-sm text-neutral-500">
            {{ t('tmcut.templateLibrary.deleteConfirm', { name: targetDeleteName }) }}
          </p>
          <div class="flex items-center justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              @click="deleteModalOpen = false"
            >
              {{ t('tmcut.hotkeys.close') }}
            </UButton>
            <UButton
              color="error"
              variant="soft"
              size="sm"
              @click="confirmDeleteTemplate"
            >
              {{ t('tmcut.home.deleteConfirm') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </BasePage>
</template>
