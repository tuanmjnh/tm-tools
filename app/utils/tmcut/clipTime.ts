import type { TmcutTimelineItem } from '~/composables/useTmcutProject'
import { secToTicks, ticksToSec } from '@tmcut-core'

/**
 * C16-R3 helpers: dual-mode accessors chuẩn bị cho store ticks.
 * Hiện tại app vẫn lưu seconds (v1). Các hàm `*Ticks` cung cấp mapping
 * ngay lập tức mà không đổi schema — khi store flip sang ticks thực tế,
 * chỉ cần đổi kiểu trả về, consumer không đổi.
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

/** Timeline span, ticks: wraps durationSec qua core secToTicks. */
export function clipDurationTicks(clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed'>): number {
  return secToTicks(clipDurationSec(clip))
}

/** Timeline start, seconds. */
export function clipStartSec(clip: Pick<TmcutTimelineItem, 'offset'>): number {
  return clip.offset || 0
}

/** Timeline start, ticks. */
export function clipStartTicks(clip: Pick<TmcutTimelineItem, 'offset'>): number {
  return secToTicks(clipStartSec(clip))
}

/** Timeline end, seconds. */
export function clipEndSec(clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed', 'offset'>): number {
  return clipStartSec(clip) + clipDurationSec(clip)
}

/** Timeline end, ticks. */
export function clipEndTicks(clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed', 'offset'>): number {
  return secToTicks(clipEndSec(clip))
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

/** Source-media time at timeline position, in ticks. */
export function clipMediaTimeTicks(
  clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed', 'offset', 'reverse'>,
  atTicks: number
): number {
  const atSec = ticksToSec(atTicks)
  return secToTicks(clipMediaTimeSec(clip, atSec))
}
