import type { TmcutTimelineItem } from '~/composables/useTmcutProject'

/**
 * C16-R2: single accessors for clip TIME GEOMETRY.
 *
 * The app store still holds seconds (v1) while the DSL works in ticks.
 * Every consumer that needs a clip's timeline span or source position must
 * go through these helpers instead of spreading `(clip.out - clip.in) /
 * (clip.speed || 1)` — when the store flips to ticks (C16-R3) only this
 * file re-derives the numbers, consumers keep compiling.
 *
 * Field names are read through a small local type on purpose: this module
 * must stay importable from anywhere (composables, components, utils) with
 * no runtime imports of its own.
 */

/** Speed with the legacy 0/undefined → 1 fallback. */
export function clipSpeed(clip: Pick<TmcutTimelineItem, 'speed'>): number {
  return clip.speed || 1
}

/** Source-range length, source seconds. */
export function clipSourceRange(clip: Pick<TmcutTimelineItem, 'in', 'out'>): number {
  return clip.out - clip.in
}

/** Timeline span, seconds: source range divided by playback speed. */
export function clipDurationSec(clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed'>): number {
  return clipSourceRange(clip) / clipSpeed(clip)
}

/** Timeline start, seconds. */
export function clipStartSec(clip: Pick<TmcutTimelineItem, 'offset'>): number {
  return clip.offset || 0
}

/** Timeline end, seconds. */
export function clipEndSec(clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed', 'offset'>): number {
  return clipStartSec(clip) + clipDurationSec(clip)
}

/**
 * Source-media time at a timeline position (roadmap B2 retime semantics):
 * forward clips run `in + localSec*speed`, reverse clips run from the
 * source end backwards.
 */
export function clipMediaTimeSec(
  clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed', 'offset', 'reverse'>,
  atSec: number
): number {
  const localSec = atSec - clipStartSec(clip)
  return clip.reverse
    ? clip.out - localSec * clipSpeed(clip)
    : clip.in + localSec * clipSpeed(clip)
}
