<script setup lang="ts">
import type { HeaderAction } from '~/components/base/HeaderActions.vue'

const { t } = useI18n()
const { projects, createProject, deleteProject, refreshProjects } = useTmcutProject()
const router = useRouter()

onMounted(() => {
  refreshProjects()
})

function handleNewProject() {
  const proj = createProject(t('tmcut.newProject'))
  router.push(`/tmcut/editor?project=${proj.id}`)
}

function openProject(id: string) {
  router.push(`/tmcut/editor?project=${id}`)
}

const headerActions = computed<HeaderAction[]>(() => [
  {
    key: 'new-project',
    icon: 'i-lucide-plus',
    label: t('tmcut.newProject'),
    color: 'primary',
    variant: 'solid',
    primary: true,
    onSelect: () => handleNewProject()
  },
  {
    key: 'templates',
    icon: 'i-lucide-layout-template',
    label: t('nav.tmcut_templates'),
    color: 'neutral',
    variant: 'soft',
    onSelect: () => router.push('/tmcut/templates')
  },
  {
    key: 'autocut',
    icon: 'i-lucide-scissors',
    label: t('nav.tmcut_autocut'),
    color: 'neutral',
    variant: 'soft',
    onSelect: () => router.push('/tmcut/autocut')
  }
])
</script>

<template>
  <BasePage id="tmcut-index" :title="t('nav.tmcut')" :description="t('tmcut.subtitle')">
    <template #right>
      <BaseHeaderActions :actions="headerActions" />
    </template>

    <div class="space-y-6">
      <!-- Quick Shortcuts / Presets Banner -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-linear-to-br from-primary/5 to-transparent hover:border-primary/50 cursor-pointer transition"
          @click="handleNewProject">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <UIcon name="i-lucide-smartphone" class="w-5 h-5" />
            </div>
            <div>
              <h4 class="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                {{ t('tmcut.shortcuts.verticalTitle') }}
              </h4>
              <p class="text-xs text-neutral-500">
                {{ t('tmcut.shortcuts.verticalDesc') }}
              </p>
            </div>
          </div>
        </div>

        <div
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-linear-to-br from-primary/5 to-transparent hover:border-primary/50 cursor-pointer transition"
          @click="handleNewProject">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <UIcon name="i-lucide-monitor" class="w-5 h-5" />
            </div>
            <div>
              <h4 class="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                {{ t('tmcut.shortcuts.horizontalTitle') }}
              </h4>
              <p class="text-xs text-neutral-500">
                {{ t('tmcut.shortcuts.horizontalDesc') }}
              </p>
            </div>
          </div>
        </div>

        <div
          class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 bg-linear-to-br from-primary/5 to-transparent hover:border-primary/50 cursor-pointer transition"
          @click="router.push('/tmcut/autocut')">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <UIcon name="i-lucide-sparkles" class="w-5 h-5" />
            </div>
            <div>
              <h4 class="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                {{ t('tmcut.shortcuts.autocutTitle') }}
              </h4>
              <p class="text-xs text-neutral-500">
                {{ t('tmcut.shortcuts.autocutDesc') }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Projects List -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {{ t('tmcut.recentProjects') }}
          </h2>
          <span class="text-xs text-neutral-500">{{ projects.length }} {{ t('tmcut.project') }}</span>
        </div>

        <div v-if="projects.length === 0"
          class="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-12 text-center">
          <UIcon name="i-lucide-film" class="w-12 h-12 text-neutral-400 mx-auto mb-3" />
          <h3 class="text-base font-medium text-neutral-900 dark:text-neutral-100">
            {{ t('tmcut.noProjects') }}
          </h3>
          <p class="text-sm text-neutral-500 max-w-sm mx-auto mt-1 mb-4">
            {{ t('tmcut.noProjectsDesc') }}
          </p>
          <UButton color="primary" variant="solid" icon="i-lucide-plus" @click="handleNewProject">
            {{ t('tmcut.createFirstProject') }}
          </UButton>
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div v-for="project in projects" :key="project.id"
            class="group border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden bg-white dark:bg-neutral-900 hover:border-primary/50 transition cursor-pointer flex flex-col"
            @click="openProject(project.id)">
            <!-- Thumbnail -->
            <div
              class="aspect-video bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center relative overflow-hidden">
              <img v-if="project.cover" :src="project.cover" class="w-full h-full object-cover">
              <UIcon v-else name="i-lucide-film" class="w-10 h-10 text-neutral-400" />
              <div class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] bg-black/70 text-white font-mono">
                {{ project.canvas?.width }}x{{ project.canvas?.height }}
              </div>
            </div>

            <!-- Info -->
            <div class="p-3 flex items-center justify-between flex-1">
              <div class="min-w-0 flex-1 pr-2">
                <h4 class="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate">
                  {{ project.name }}
                </h4>
                <p class="text-[11px] text-neutral-500">
                  {{ new Date(project.updated_at || project.created_at).toLocaleDateString() }}
                </p>
              </div>

              <UButton icon="i-lucide-trash" size="xs" variant="soft" color="error" :title="t('tmcut.deleteProject')"
                @click.stop="deleteProject(project.id)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </BasePage>
</template>
