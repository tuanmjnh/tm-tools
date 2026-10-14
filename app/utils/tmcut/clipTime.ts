import type { TmcutTimelineItem } from '~/composables/useTmcutProject'
import { secToTicks, ticksToSec } from '@tmcut-core'

/**
 * C16-R3 helpers: dual-mode accessors chuẩn bị cho store ticks.
 * Sau migration, các field `in/out/offset` được lưu dưới dạng ticks.
 * Các hàm `*Sec` giải mã ticks → seconds để UI cũ vẫn hoạt động.
 * Các hàm `*Ticks` trả về giá trị gốc (ticks) để dùng nội bộ.
 */

/** Speed with the legacy 0/undefined → 1 fallback. */
export function clipSpeed(clip: Pick<TmcutTimelineItem, 'speed'>): number {
  return clip.speed || 1
}

/** Source-range length, ticks. */
export function clipSourceRangeTicks(clip: Pick<TmcutTimelineItem, 'in', 'out'>): number {
  return clip.out - clip.in
}

/** Source-range length, seconds (decoded). */
export function clipSourceRange(clip: Pick<TmcutTimelineItem, 'in', 'out'>): number {
  return ticksToSec(clipSourceRangeTicks(clip))
}

/** Timeline span, ticks. */
export function clipDurationTicks(clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed'>): number {
  return Math.max(0, Math.round(clipSourceRangeTicks(clip) / clipSpeed(clip)))
}

/** Timeline span, seconds (decoded). */
export function clipDurationSec(clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed'>): number {
  return ticksToSec(clipDurationTicks(clip))
}

/** Timeline start, ticks. */
export function clipStartTicks(clip: Pick<TmcutTimelineItem, 'offset'>): number {
  return clip.offset || 0
}

/** Timeline start, seconds (decoded). */
export function clipStartSec(clip: Pick<TmcutTimelineItem, 'offset'>): number {
  return ticksToSec(clipStartTicks(clip))
}

/** Timeline end, ticks. */
export function clipEndTicks(clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed', 'offset'>): number {
  return clipStartTicks(clip) + clipDurationTicks(clip)
}

/** Timeline end, seconds (decoded). */
export function clipEndSec(clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed', 'offset'>): number {
  return ticksToSec(clipEndTicks(clip))
}

/**
 * Source-media time at a timeline position (roadmap B2 retime semantics):
 * forward clips run `in + local*ticks/speed`, reverse clips run from the
 * source end backwards. All values in ticks.
 */
export function clipMediaTimeTicks(
  clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed', 'offset', 'reverse'>,
  atTicks: number
): number {
  const localTicks = Math.max(0, atTicks - clipStartTicks(clip))
  const speed = clipSpeed(clip)
  const sourceTicks = Math.round(localTicks / speed)
  return clip.reverse ? clip.out - sourceTicks : clip.in + sourceTicks
}

/** Source-media time at timeline position, in seconds (decoded). */
export function clipMediaTimeSec(
  clip: Pick<TmcutTimelineItem, 'in', 'out', 'speed', 'offset', 'reverse'>,
  atSec: number
): number {
  const atTicks = secToTicks(atSec)
  const mediaTicks = clipMediaTimeTicks(clip, atTicks)
  return ticksToSec(mediaTicks)
}
