// =============================================================================
//  R112 — fxLibrary pure helpers spec: effect/filters toggle math on clip
//  effect lists, media animation preset keyframe math, and the transition
//  reason mapping the Fx library panel surfaces as toasts.
//  Run: pnpm test:fxlibrary (or through run-all).
// =============================================================================
import assert from 'node:assert/strict'
import { EFFECT_REGISTRY, TICKS_PER_SECOND } from '@tmcut-core'
import {
  effectDefaultParams,
  toggleEffectOnClip,
  setLutPresetOnClip,
  activeLutPreset,
  applyMediaAnimPreset,
  transitionReasonKey
} from '../../app/utils/tmcut/fxLibrary'

let passed = 0
function check(label: string, fn: () => void) {
  fn()
  passed++
  console.log(`   ${label} PASSED`)
}

console.log('=== [TMCut R112 Fx Library helpers] Starting ===\n')

// 1. Defaults come straight from the registry descriptors.
check('effectDefaultParams mirrors registry defaults', () => {
  const p = effectDefaultParams(EFFECT_REGISTRY.blur)
  assert.deepEqual(p, { amount: 50 })
  const ck = effectDefaultParams(EFFECT_REGISTRY.chromakey)
  assert.deepEqual(ck, { color: '#00ff00', similarity: 30, blend: 10, spill: true })
})

// 2. Toggle adds with defaults, removes on second click, never mutates input.
check('toggleEffectOnClip add/remove is pure and idempotent', () => {
  const before: Array<{ type: string, params: Record<string, unknown> }> = []
  const once = toggleEffectOnClip(before, EFFECT_REGISTRY.vignette)
  assert.equal(once.length, 1)
  assert.deepEqual(once[0], { type: 'vignette', params: { intensity: 50 } })
  assert.equal(before.length, 0, 'input list must not be mutated')
  const twice = toggleEffectOnClip(once, EFFECT_REGISTRY.vignette)
  assert.equal(twice.length, 0)
  // A second effect coexists.
  const withBlur = toggleEffectOnClip(once, EFFECT_REGISTRY.blur)
  assert.deepEqual(withBlur.map(e => e.type).sort(), ['blur', 'vignette'])
})

// 3. LUT toggle: replace, remove-on-same-preset signal, untouched siblings.
check('setLutPresetOnClip replace/toggle semantics', () => {
  const start = [{ type: 'blur', params: { amount: 20 } }]
  const warm = setLutPresetOnClip(start, 'warm')
  assert.ok(warm)
  assert.deepEqual(warm.map(e => e.type), ['blur', 'lut3d'])
  assert.equal(activeLutPreset(warm), 'warm')
  // Same preset again -> null = caller removes the lut entry.
  assert.equal(setLutPresetOnClip(warm, 'warm'), null)
  assert.equal(activeLutPreset(start), null)
  // A different preset REPLACES (never stacks two lut3d entries).
  const cool = setLutPresetOnClip(warm, 'cool')
  assert.ok(cool)
  assert.equal(cool.filter(e => e.type === 'lut3d').length, 1)
  assert.equal(activeLutPreset(cool), 'cool')
})

// 4. Media animation presets write clean keyframe pairs, clamped edges.
check('applyMediaAnimPreset fade writes 4 sorted opacity keyframes', () => {
  const dur = 10 * TICKS_PER_SECOND
  const kfs = applyMediaAnimPreset([], 'fade', dur, 100, 100)
  assert.equal(kfs.length, 4)
  assert.deepEqual(kfs.map(k => [k.t, k.prop, k.value]), [
    [0, 'opacity', 0],
    [TICKS_PER_SECOND / 2, 'opacity', 100],
    [dur - TICKS_PER_SECOND / 2, 'opacity', 100],
    [dur, 'opacity', 0]
  ])
  // Sorted output invariant.
  for (let i = 1; i < kfs.length; i++) assert.ok(kfs[i].t >= kfs[i - 1].t)
})

check('applyMediaAnimPreset clamps edges to half a short clip', () => {
  const dur = TICKS_PER_SECOND / 4 // 0.25 s clip
  const kfs = applyMediaAnimPreset([], 'fade-in', dur, 100, 100)
  const maxEdge = Math.floor(dur / 2)
  assert.deepEqual(kfs.map(k => k.t), [0, maxEdge])
})

check('applyMediaAnimPreset zoom owns scale only; presets replace each other', () => {
  const dur = 4 * TICKS_PER_SECOND
  const zoom = applyMediaAnimPreset(
    [{ t: 123, prop: 'opacity', value: 40 }, { t: 55, prop: 'x', value: 10 }],
    'zoom-in',
    dur,
    80,
    100
  )
  // Previous opacity wiped (preset owns the channel) but x survives.
  assert.ok(!zoom.some(k => k.prop === 'opacity'))
  assert.ok(zoom.some(k => k.prop === 'x' && k.t === 55))
  assert.deepEqual(
    zoom.filter(k => k.prop === 'scale').map(k => Math.round(k.value)),
    [92, 108] // 100 * 0.92 / 1.08 (rounded: float-safe)
  )
  // Switching to fade-out keeps only the fade edge pair, replaces scale set.
  const faded = applyMediaAnimPreset(zoom, 'fade-out', dur, 80, 100)
  assert.ok(!faded.some(k => k.prop === 'scale'))
  assert.equal(faded.filter(k => k.prop === 'opacity').length, 2)
  // Reset clears both channels, keeps the unrelated x keyframe.
  const reset = applyMediaAnimPreset(faded, 'reset', dur, 80, 100)
  assert.deepEqual(reset.map(k => k.prop), ['x'])
})

// 5. Transition refusal reasons map to existing i18n key suffixes.
check('transitionReasonKey covers every core reason', () => {
  assert.equal(transitionReasonKey('gap'), 'reasonGap')
  assert.equal(transitionReasonKey('too-long'), 'reasonTooLong')
  assert.equal(transitionReasonKey('unknown-type'), 'reasonUnknown')
  assert.equal(transitionReasonKey('no-neighbor'), 'reasonNoNeighbor')
  assert.equal(transitionReasonKey(undefined), 'reasonNoNeighbor')
})

console.log(`\n=== All ${passed} fx-library checks passed ===`)
