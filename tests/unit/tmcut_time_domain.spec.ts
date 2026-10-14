/**
 * Time-domain contract guard (roadmap C16).
 *
 * The app store keeps clip time geometry in SECONDS while the DSL/core
 * works in TICKS. That boundary is only safe while EVERY side agrees on
 * the unit, and a partial migration breaks it silently: `tsc` cannot see a
 * wrong number, and the render graph still compiles — it just asks FFmpeg
 * for `trim=start=240000`. This spec pins the contract down so any drift
 * fails here instead.
 *
 * Run: node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json \
 *        tests/unit/tmcut_time_domain.spec.ts
 */
import assert from 'node:assert/strict'
import { TICKS_PER_SECOND, secToTicks, ticksToSec, v1ClipToV3, v3ClipToV1 } from '@tmcut-core'
import { clipDurationSec, clipEndSec, clipStartSec, clipMediaTimeSec, clipSourceRange } from '../../app/utils/tmcut/clipTime'
import { toRenderClip } from '../../app/utils/tmcut/render/clip'
import type { TmcutTimelineItem } from '../../app/composables/useTmcutProject'

let passed = 0

function check(label: string, fn: () => void) {
  fn()
  passed++
  console.log(`   ${label} PASSED`)
}

/** A v1-shaped clip: seconds domain, exactly what the store holds. */
function clip(patch: Partial<TmcutTimelineItem> = {}): TmcutTimelineItem {
  return {
    id: 'c1',
    src: 'a.mp4',
    in: 1,
    out: 5,
    offset: 2,
    speed: 1,
    opacity: 100,
    scale: 100,
    x: 0,
    y: 0,
    rotation: 0,
    ...patch
  } as TmcutTimelineItem
}

function main() {
  console.log('=== [TMCut Time-Domain Contract] Starting ===\n')

  check('store fields stay SECONDS — accessors do not rescale by TICKS_PER_SECOND', () => {
    const c = clip()
    assert.equal(clipStartSec(c), 2)
    assert.equal(clipSourceRange(c), 4)
    assert.equal(clipDurationSec(c), 4)
    assert.equal(clipEndSec(c), 6)
    // The exact failure mode of a half-done flip: values scaled by 120000.
    assert.ok(clipDurationSec(c) < 1000, 'duration looks like ticks, not seconds')
  })

  check('accessors match the legacy inline formulas byte-for-byte', () => {
    for (const c of [clip(), clip({ speed: 2 }), clip({ speed: 0.5 }), clip({ in: 3.25, out: 9.75, offset: 1.5, speed: 1.5 })]) {
      const speed = c.speed || 1
      assert.equal(clipDurationSec(c), (c.out - c.in) / speed)
      assert.equal(clipStartSec(c), c.offset || 0)
      assert.equal(clipEndSec(c), (c.offset || 0) + (c.out - c.in) / speed)
    }
  })

  check('media time stays in the seconds domain (playback seeks by seconds)', () => {
    assert.equal(clipMediaTimeSec(clip(), 2), 1) // start of clip -> source in
    assert.equal(clipMediaTimeSec(clip(), 4), 3) // +2s timeline -> +2s source
    // Reverse runs backwards from the source end (core C4 semantics).
    assert.equal(clipMediaTimeSec(clip({ reverse: true }), 2), 5)
    assert.equal(clipMediaTimeSec(clip({ reverse: true }), 3), 4)
  })

  check('toRenderClip keeps SECONDS — export trim must not receive ticks', () => {
    const r = toRenderClip(clip({ in: 1, out: 5, offset: 2 }))
    assert.equal(r.inSec, 1)
    assert.equal(r.outSec, 5)
    assert.equal(r.offsetSec, 2)
    assert.ok(r.inSec < 1000 && r.outSec < 1000, 'render clip looks like ticks')
  })

  check('core bridge converts at the boundary and round-trips seconds', () => {
    const c = clip({ in: 1, out: 5, offset: 2 })
    const v3 = v1ClipToV3(c, 'video')
    // v3 is the ticks domain…
    assert.equal(v3.source.in, secToTicks(1))
    assert.equal(v3.source.out, secToTicks(5))
    assert.equal(v3.timeline.start, secToTicks(2))
    assert.equal(v3.timeline.duration, TICKS_PER_SECOND * 4)
    // …and coming back gives the original seconds, so syncV3Result is a no-op
    // on an untouched clip (any drift would rewrite every clip on open).
    const back = v3ClipToV1(v3)
    assert.equal(back.in, 1)
    assert.equal(back.out, 5)
    assert.equal(back.offset, 2)
  })

  check('seconds↔ticks helpers are exact inverses at frame boundaries', () => {
    for (const sec of [0, 0.5, 1, 2.5, 10, 59.94]) {
      assert.equal(ticksToSec(secToTicks(sec)), sec)
    }
    assert.equal(TICKS_PER_SECOND, 120000)
  })

  console.log(`\n=== All ${passed} time-domain checks passed ===`)
}

main()
