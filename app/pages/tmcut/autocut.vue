<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const currentStep = ref(1)

const steps = computed(() => [
  { step: 1, title: t('tmcut.steps.step1Title'), desc: t('tmcut.steps.step1Desc') },
  { step: 2, title: t('tmcut.steps.step2Title'), desc: t('tmcut.steps.step2Desc') },
  { step: 3, title: t('tmcut.steps.step3Title'), desc: t('tmcut.steps.step3Desc') },
  { step: 4, title: t('tmcut.steps.step4Title'), desc: t('tmcut.steps.step4Desc') }
])

const aiProfiles = computed(() => [
  { id: 'viral-shorts', name: t('tmcut.aiProfiles.viralShortsTitle'), desc: t('tmcut.aiProfiles.viralShortsDesc'), icon: 'i-lucide-zap' },
  { id: 'podcast-summary', name: t('tmcut.aiProfiles.podcastTitle'), desc: t('tmcut.aiProfiles.podcastDesc'), icon: 'i-lucide-mic' },
  { id: 'cinematic-vlog', name: t('tmcut.aiProfiles.vlogTitle'), desc: t('tmcut.aiProfiles.vlogDesc'), icon: 'i-lucide-film' }
])

const selectedProfile = ref('viral-shorts')
</script>

<template>
  <BasePage id="tmcut-autocut" :title="t('nav.tmcut_autocut')" :description="t('tmcut.autocutDesc')">
    <template #right>
      <UButton
        to="/tmcut"
        icon="i-lucide-arrow-left"
        variant="soft"
        color="neutral"
        size="sm"
      >
        <span class="hidden sm:inline">{{ t('tmcut.back') }}</span>
      </UButton>
    </template>

    <div class="space-y-6 max-w-5xl">
      <!-- Stepper Indicator -->
      <div class="grid grid-cols-4 gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div
          v-for="s in steps"
          :key="s.step"
          class="flex flex-col border-t-2 pt-2 transition"
          :class="currentStep >= s.step ? 'border-primary text-primary' : 'border-neutral-200 dark:border-neutral-800 text-neutral-400'"
        >
          <span class="text-xs font-semibold">{{ t('tmcut.steps.step', { step: s.step }) }}</span>
          <span class="text-xs font-medium truncate text-neutral-900 dark:text-neutral-100">{{ s.title }}</span>
        </div>
      </div>

      <!-- Step 1: Upload Source -->
      <div v-if="currentStep === 1" class="space-y-4">
        <div
          class="border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-2xl p-12 text-center bg-neutral-50 dark:bg-neutral-900/50"
        >
          <UIcon name="i-lucide-upload-cloud" class="w-12 h-12 text-primary mx-auto mb-3" />
          <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {{ t('tmcut.steps.dragDrop') }}
          </h3>
          <p class="text-xs text-neutral-500 max-w-md mx-auto mt-1 mb-4">
            {{ t('tmcut.steps.dragDropDesc') }}
          </p>
          <div class="flex justify-center gap-3">
            <UButton icon="i-lucide-file-video" color="primary" variant="soft">
              {{ t('tmcut.steps.chooseFromDevice') }}
            </UButton>
            <UButton icon="i-lucide-cloud" variant="soft" color="neutral">
              {{ t('tmcut.steps.chooseFromMedia') }}
            </UButton>
          </div>
        </div>

        <div class="flex justify-end">
          <UButton color="primary" variant="solid" @click="currentStep = 2">
            {{ t('tmcut.steps.continueStep2') }}
          </UButton>
        </div>
      </div>

      <!-- Step 2: Choose AI Profile -->
      <div v-else-if="currentStep === 2" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            v-for="prof in aiProfiles"
            :key="prof.id"
            class="border-2 rounded-xl p-5 cursor-pointer transition flex flex-col justify-between"
            :class="selectedProfile === prof.id ? 'border-primary bg-primary/5' : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300'"
            @click="selectedProfile = prof.id"
          >
            <div class="space-y-2">
              <UIcon :name="prof.icon" class="w-6 h-6 text-primary" />
              <h4 class="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                {{ prof.name }}
              </h4>
              <p class="text-xs text-neutral-500">
                {{ prof.desc }}
              </p>
            </div>
          </div>
        </div>

        <div class="flex justify-between pt-4">
          <UButton variant="soft" color="neutral" @click="currentStep = 1">
            {{ t('tmcut.back') }}
          </UButton>
          <UButton color="primary" variant="solid" @click="currentStep = 3">
            {{ t('tmcut.steps.analyzeEdl') }}
          </UButton>
        </div>
      </div>

      <!-- Step 3: Review EDL -->
      <div v-else-if="currentStep === 3" class="space-y-4">
        <div class="border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 bg-neutral-900 text-neutral-100">
          <div class="flex items-center gap-2 text-primary font-semibold text-sm mb-4">
            <UIcon name="i-lucide-check-circle" class="w-5 h-5" />
            {{ t('tmcut.steps.edlDoneTitle') }}
          </div>
          <p class="text-xs text-neutral-400">
            {{ t('tmcut.steps.edlDoneDesc') }}
          </p>
        </div>

        <div class="flex justify-between pt-4">
          <UButton variant="soft" color="neutral" @click="currentStep = 2">
            {{ t('tmcut.back') }}
          </UButton>
          <UButton
            color="primary"
            variant="solid"
            icon="i-lucide-clapperboard"
            to="/tmcut/editor?project=autocut-demo"
          >
            {{ t('tmcut.steps.openInEditor') }}
          </UButton>
        </div>
      </div>
    </div>
  </BasePage>
</template>
