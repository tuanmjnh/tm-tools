// =============================================================================
//  Pure helpers for the effects/transitions library panel (roadmap R112) and
//  the media animation presets in the inspector. Deliberately store-free so
//  they run in the node spec runner; components own history + IPC concerns.
// =============================================================================

import { TICKS_PER_SECOND } from '@tmcut-core'
import type { EFFECT_REGISTRY } from '@tmcut-core'

type EffectDescriptor = (typeof EFFECT_REGISTRY)[keyof typeof EFFECT_REGISTRY]
type EffectItem = { type: string, params: Record<string, unknown> }
type KeyframeItem = { t: number, prop: string, value: number, easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step' }

/** Default `params` object for a fresh effect instance (registry defaults). */
export function effectDefaultParams(desc: EffectDescriptor): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const p of desc.params) params[p.name] = p.default
  return params
}

/**
 * Toggle a registry effect on a clip's effect list. Returns a NEW array;
 * the effect is added with registry defaults or removed when already there.
 */
export function toggleEffectOnClip(effects: EffectItem[], desc: EffectDescriptor): EffectItem[] {
  const exists = effects.some(e => e.type === desc.type)
  if (exists) return effects.filter(e => e.type !== desc.type)
  return [...effects, { type: desc.type, params: effectDefaultParams(desc) }]
}

/**
 * Set (or clear) the LUT preset used by the Filters library tab.
 * Returns null when `preset` is ALREADY the active lut3d preset — the
 * caller treats that as the remove-toggle. Otherwise a new list with the
 * lut3d entry added or replaced, everything else untouched.
 */
export function setLutPresetOnClip(effects: EffectItem[], preset: string): EffectItem[] | null {
  const current = effects.find(e => e.type === 'lut3d')
  if (current && current.params.lut === preset) return null
  const rest = effects.filter(e => e.type !== 'lut3d')
  return [...rest, { type: 'lut3d', params: { lut: preset } }]
}

/** The LUT preset currently active on a clip, or null. */
export function activeLutPreset(effects: EffectItem[]): string | null {
  const lut = effects.find(e => e.type === 'lut3d')
  return typeof lut?.params.lut === 'string' ? lut.params.lut : null
}

// ===== Media animation presets (inspector "Animation" tab, video/image) ====
// CapCut-style: a whole-clip entrance/exit written as OPACITY/SCALE keyframe
// pairs — the same engine the ⏱ buttons use, so keyframes stay visible and
// editable afterwards. Fade edges clamp to half the clip (core fade rule).

export type MediaAnimPreset = 'fade' | 'fade-in' | 'fade-out' | 'zoom-in' | 'zoom-out' | 'reset'

export function applyMediaAnimPreset(
  existing: KeyframeItem[],
  preset: MediaAnimPreset,
  durTicks: number,
  opacity: number,
  scale: number
): KeyframeItem[] {
  // Presets own the opacity/scale channels; other props (x/y/volume) survive.
  const kept = existing.filter(k => k.prop !== 'opacity' && k.prop !== 'scale')
  if (preset === 'reset' || durTicks <= 0) return kept

  const edge = Math.max(1, Math.min(Math.round(TICKS_PER_SECOND / 2), Math.floor(durTicks / 2)))
  const added: KeyframeItem[] = []
  switch (preset) {
    case 'fade':
      added.push({ t: 0, prop: 'opacity', value: 0, easing: 'ease-out' })
      added.push({ t: edge, prop: 'opacity', value: opacity })
      added.push({ t: durTicks - edge, prop: 'opacity', value: opacity })
      added.push({ t: durTicks, prop: 'opacity', value: 0, easing: 'ease-in' })
      break
    case 'fade-in':
      added.push({ t: 0, prop: 'opacity', value: 0, easing: 'ease-out' })
      added.push({ t: edge, prop: 'opacity', value: opacity })
      break
    case 'fade-out':
      added.push({ t: durTicks - edge, prop: 'opacity', value: opacity })
      added.push({ t: durTicks, prop: 'opacity', value: 0, easing: 'ease-in' })
      break
    case 'zoom-in':
      added.push({ t: 0, prop: 'scale', value: scale * 0.92, easing: 'linear' })
      added.push({ t: durTicks, prop: 'scale', value: scale * 1.08, easing: 'linear' })
      break
    case 'zoom-out':
      added.push({ t: 0, prop: 'scale', value: scale * 1.08, easing: 'linear' })
      added.push({ t: durTicks, prop: 'scale', value: scale * 0.92, easing: 'linear' })
      break
  }
  return [...kept, ...added].sort((a, b) => a.t - b.t)
}

/** Map a core transition refusal reason to its i18n key suffix (tmcut.fxLib.*). */
export function transitionReasonKey(reason: string | undefined): string {
  switch (reason) {
    case 'gap': return 'reasonGap'
    case 'too-long': return 'reasonTooLong'
    case 'unknown-type': return 'reasonUnknown'
    default: return 'reasonNoNeighbor'
  }
}
