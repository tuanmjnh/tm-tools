<script setup lang="ts">
// =============================================================================
//  Effects / Transitions / Filters library (roadmap R112) — the "More" tab of
//  the media library, replacing the old coming-soon placeholder. Data-driven
//  from the core registries (EFFECT_REGISTRY, KNOWN_TRANSITIONS, lut3d enum)
//  so the panel can never drift from what actually renders in preview/export.
//
//  Semantics: effects & filters apply to the SELECTED clip (add/toggle);
//  transitions apply to the selected clip's cut with its left neighbor via
//  the store's validated applyClipTransition (reasons surface as toasts —
//  the same contract the clip context menu uses).
// =============================================================================
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { EFFECT_REGISTRY, KNOWN_TRANSITIONS } from '@tmcut-core'
import { useTmcutProject } from '~/composables/useTmcutProject'
import {
  toggleEffectOnClip,
  setLutPresetOnClip,
  activeLutPreset,
  transitionReasonKey
} from '~/utils/tmcut/fxLibrary'

const { t } = useI18n()
const toast = useToast()
const {
  selectedClip,
  selectedClipId,
  updateClip,
  pushHistory,
  applyClipTransition,
  clearClipTransition
} = useTmcutProject()

type FxTab = 'effects' | 'transitions' | 'filters'
const fxTab = ref<FxTab>('effects')

const DEFAULT_TRANSITION_SEC = 0.5
const LUT_OPTIONS = ['neutral', 'warm', 'cool', 'cinematic', 'vintage']

// Swatch gradients are presentation constants for the LUT tiles.
const LUT_SWATCH: Record<string, [string, string]> = {
  neutral: ['#3f3f46', '#71717a'],
  warm: ['#b45309', '#f59e0b'],
  cool: ['#1e3a8a', '#38bdf8'],
  cinematic: ['#0f172a', '#334155'],
  vintage: ['#92400e', '#d6d3d1']
}

// Icon per effect type (registry owns the truth; this is presentation only).
const EFFECT_ICONS: Record<string, string> = {
  'blur': 'i-lucide-cloud-fog',
  'sharpen': 'i-lucide-aperture',
  'vignette': 'i-lucide-circle-dot',
  'grain': 'i-lucide-grid-3x3',
  'chromakey': 'i-lucide-droplet',
  'lut3d': 'i-lucide-palette',
  'stabilize': 'i-lucide-wind',
  'eq-grade': 'i-lucide-contrast'
}

const TRANSITION_ICONS: Record<string, string> = {
  'fade': 'i-lucide-sun-medium',
  'dissolve': 'i-lucide-layers',
  'wipe-left': 'i-lucide-arrow-left-to-line',
  'wipe-right': 'i-lucide-arrow-right-to-line',
  'slide-left': 'i-lucide-move-left',
  'zoom-in': 'i-lucide-zoom-in'
}

const selectionKind = computed(() => selectedClip.value?.track || null)
// Effects/filters need a media clip; a text clip carries its own anim model
// and an audio clip has no visual channel — no dead tiles.
const canApplyVisual = computed(() => selectionKind.value === 'video')
const canApplyTransition = computed(() => selectionKind.value === 'video')
// The hint bar reflects what the CURRENT sub-tab acts on.
const targetOk = computed(() => !!selectedClip.value
  && (fxTab.value === 'transitions' ? canApplyTransition.value : canApplyVisual.value))

const clipEffects = computed(() => selectedClip.value?.item.effects || [])
const activeEffectTypes = computed(() => new Set(clipEffects.value.map(e => e.type)))
const activeLut = computed(() => activeLutPreset(clipEffects.value))
const activeTransition = computed(() => {
  const ti = selectedClip.value?.item.transitionIn
  return (ti?.duration ?? 0) > 0 ? ti!.type : null
})

const effectCards = computed(() =>
  Object.values(EFFECT_REGISTRY)
    // lut3d lives in the Filters tab; stabilize has its own E-5 section.
    .filter(desc => desc.type !== 'lut3d' && desc.type !== 'stabilize')
    .map(desc => ({
      type: desc.type,
      icon: EFFECT_ICONS[desc.type] || 'i-lucide-sparkles',
      label: t(`tmcut.effects.${desc.type === 'eq-grade' ? 'eqGrade' : desc.type}`),
      desc: t(`tmcut.effects.${desc.type === 'eq-grade' ? 'eqGradeDesc' : `${desc.type}Desc`}`),
      active: activeEffectTypes.value.has(desc.type)
    }))
)

const transitionCards = computed(() =>
  KNOWN_TRANSITIONS.map(type => ({
    type,
    icon: TRANSITION_ICONS[type] || 'i-lucide-shapes',
    label: t(`tmcut.clipMenu.types.${type}`),
    active: activeTransition.value === type
  }))
)

const filterCards = computed(() =>
  LUT_OPTIONS.map(preset => ({
    preset,
    label: t(`tmcut.fxLib.lut.${preset}`),
    active: activeLut.value === preset,
    swatch: `linear-gradient(135deg, ${LUT_SWATCH[preset]?.[0] ?? '#3f3f46'}, ${LUT_SWATCH[preset]?.[1] ?? '#71717a'})`
  }))
)

function toastNeedClip() {
  toast.add({ title: t('tmcut.fxLib.needClip'), color: 'neutral' })
}

function handleToggleEffect(descType: string) {
  if (!selectedClipId.value || !canApplyVisual.value) {
    toastNeedClip()
    return
  }
  const desc = EFFECT_REGISTRY[descType as keyof typeof EFFECT_REGISTRY]
  if (!desc) return
  pushHistory()
  updateClip(selectedClipId.value, { effects: toggleEffectOnClip(selectedClip.value!.item.effects || [], desc) })
}

function handleToggleLut(preset: string) {
  if (!selectedClipId.value || !canApplyVisual.value) {
    toastNeedClip()
    return
  }
  const next = setLutPresetOnClip(selectedClip.value!.item.effects || [], preset)
  pushHistory()
  if (next === null) {
    // Toggle-off of the active preset: drop the lut3d entry entirely.
    updateClip(selectedClipId.value, { effects: clipEffects.value.filter(e => e.type !== 'lut3d') })
  } else {
    updateClip(selectedClipId.value, { effects: next })
  }
}

function handlePickTransition(type: string) {
  const clipId = selectedClipId.value
  if (!clipId || !canApplyTransition.value) {
    toastNeedClip()
    return
  }
  // Same tile again = remove the transition (matches the filter toggle feel).
  if (activeTransition.value === type) {
    clearClipTransition(clipId)
    return
  }
  const res = applyClipTransition(clipId, type, DEFAULT_TRANSITION_SEC)
  if (!res.ok) {
    toast.add({
      title: t('tmcut.fxLib.transitionRejected'),
      description: t(`tmcut.fxLib.${transitionReasonKey(res.reason)}`),
      color: 'warning'
    })
  }
}
</script>

<template>
  <!-- The library panel lives inside the media panel's own scroll area, so
       it must not set its own height/overflow (double scrollbars). -->
  <div class="flex flex-col min-h-0">
    <!-- Sub-tab bar (Effects / Transitions / Filters) -->
    <div class="flex items-center gap-1 border-b border-neutral-300 dark:border-neutral-800 pb-1.5">
      <button
        type="button"
        class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
        :class="fxTab === 'effects' ? 'bg-primary/15 text-primary' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'"
        @click="fxTab = 'effects'"
      >
        <UIcon name="i-lucide-sparkles" class="size-3" />
        {{ t('tmcut.tabs.effects') }}
      </button>
      <button
        type="button"
        class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
        :class="fxTab === 'transitions' ? 'bg-primary/15 text-primary' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'"
        @click="fxTab = 'transitions'"
      >
        <UIcon name="i-lucide-shapes" class="size-3" />
        {{ t('tmcut.tabs.transitions') }}
      </button>
      <button
        type="button"
        class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
        :class="fxTab === 'filters' ? 'bg-primary/15 text-primary' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'"
        @click="fxTab = 'filters'"
      >
        <UIcon name="i-lucide-palette" class="size-3" />
        {{ t('tmcut.tabs.filters') }}
      </button>
    </div>

    <!-- Context hint: which clip the library acts on -->
    <div
      class="mx-2 mt-2 px-2 py-1.5 rounded-md text-[10px] leading-snug flex items-start gap-1.5"
      :class="targetOk
        ? 'bg-primary/10 text-primary border border-primary/20'
        : 'bg-neutral-200/60 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-800'"
    >
      <UIcon :name="targetOk ? 'i-lucide-mouse-pointer-click' : 'i-lucide-info'" class="size-3 shrink-0 mt-0.5" />
      <span>{{ t('tmcut.fxLib.targetHint', { clip: selectedClip?.item?.name || selectedClip?.item?.text || t('tmcut.fxLib.unnamedClip') }) }}</span>
    </div>

    <div class="grid grid-cols-2 gap-2 p-2 overflow-y-auto min-h-0">
      <!-- Effects grid (core EFFECT_REGISTRY, minus the tabs' own members) -->
      <template v-if="fxTab === 'effects'">
        <button
          v-for="card in effectCards"
          :key="card.type"
          type="button"
          class="flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left transition-colors cursor-pointer"
          :class="card.active
            ? 'border-primary bg-primary/10'
            : 'border-neutral-300 dark:border-neutral-800 bg-neutral-100/60 dark:bg-neutral-950/60 hover:border-primary/60'"
          :title="card.desc"
          @click="handleToggleEffect(card.type)"
        >
          <div class="flex items-center justify-between w-full">
            <UIcon :name="card.icon" class="size-4" :class="card.active ? 'text-primary' : 'text-neutral-500 dark:text-neutral-400'" />
            <UIcon v-if="card.active" name="i-lucide-check" class="size-3.5 text-primary" />
          </div>
          <span class="text-[11px] font-medium text-neutral-700 dark:text-neutral-200 leading-tight">{{ card.label }}</span>
          <span class="text-[9px] text-neutral-500 dark:text-neutral-500 leading-snug line-clamp-2">{{ card.desc }}</span>
        </button>
      </template>

      <!-- Transitions grid (core KNOWN_TRANSITIONS — single source) -->
      <template v-else-if="fxTab === 'transitions'">
        <button
          v-for="card in transitionCards"
          :key="card.type"
          type="button"
          class="flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left transition-colors cursor-pointer"
          :class="card.active
            ? 'border-primary bg-primary/10'
            : 'border-neutral-300 dark:border-neutral-800 bg-neutral-100/60 dark:bg-neutral-950/60 hover:border-primary/60'"
          @click="handlePickTransition(card.type)"
        >
          <div class="flex items-center justify-between w-full">
            <UIcon :name="card.icon" class="size-4" :class="card.active ? 'text-primary' : 'text-neutral-500 dark:text-neutral-400'" />
            <UIcon v-if="card.active" name="i-lucide-check" class="size-3.5 text-primary" />
          </div>
          <span class="text-[11px] font-medium text-neutral-700 dark:text-neutral-200 leading-tight">{{ card.label }}</span>
          <span class="text-[9px] text-neutral-500 dark:text-neutral-500 leading-snug">{{ t('tmcut.fxLib.transitionDefault') }}</span>
        </button>
      </template>

      <!-- Filters grid (lut3d presets — single effect, five grades) -->
      <template v-else>
        <button
          v-for="card in filterCards"
          :key="card.preset"
          type="button"
          class="flex flex-col items-stretch gap-1.5 p-2 rounded-lg border text-left transition-colors cursor-pointer"
          :class="card.active
            ? 'border-primary bg-primary/10'
            : 'border-neutral-300 dark:border-neutral-800 bg-neutral-100/60 dark:bg-neutral-950/60 hover:border-primary/60'"
          @click="handleToggleLut(card.preset)"
        >
          <span
            class="h-10 rounded-md border border-neutral-300 dark:border-neutral-700"
            :style="{ background: card.swatch }"
          />
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-medium text-neutral-700 dark:text-neutral-200">{{ card.label }}</span>
            <UIcon v-if="card.active" name="i-lucide-check" class="size-3.5 text-primary" />
          </div>
        </button>
      </template>
    </div>
  </div>
</template>
