/**
 * Store behaviour spec (roadmap C16 gate layer).
 *
 * Every assertion here is written in the unit the STORE uses for
 * `in/out/offset` — seconds today, ticks after C16-R3 — so the spec keeps
 * guarding the semantics through the flip: `durationTicks`/`startTicks`
 * helpers below compare the RAW store values against ticks, and any
 * partial unit change breaks them.
 *
 * Run: node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json \
 *        tests/unit/tmcut_store_behaviour.spec.ts
 */
import assert from 'node:assert/strict'
import { freshStore, videoClip, TICKS } from './helpers/tmcut_store_env'

let passed = 0
function check(label: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    passed++
    console.log(`   ${label} PASSED`)
  })
}

/** Raw store duration expressed in ticks — the unit C16-R3 must land on. */
function durationTicks(clip: { in: number, out: number, speed?: number }) {
  return Math.round((clip.out - clip.in) / (clip.speed || 1) * TICKS)
}
function startTicks(clip: { offset: number }) {
  return Math.round((clip.offset || 0) * TICKS)
}

async function main() {
  console.log('=== [TMCut Store Behaviour] Starting ===\n')

  await check('addClipToTrack stores seconds-based geometry and reports duration', async () => {
    const s = await freshStore()
    const clip = s.addClipToTrack('video', { src: 'a.mp4', in: 1, out: 5 })!
    assert.equal(durationTicks(clip), 4 * TICKS, 'a 4s range must stay 4s long')
    assert.equal(startTicks(clip), 0)
    // totalDuration keeps a 5s ruler floor, so a 4s timeline still reads 5.
    assert.equal(s.totalDuration.value, 5)
    // Appending lands after the last clip on the track.
    const second = s.addClipToTrack('video', { src: 'b.mp4', in: 0, out: 3 })!
    assert.equal(startTicks(second), 4 * TICKS, 'auto-offset follows the previous clip end')
    assert.equal(s.totalDuration.value, 7)
  })

  await check('splitClip cuts at the playhead without leaking source time', async () => {
    const s = await freshStore()
    const clip = s.addClipToTrack('video', { src: 'a.mp4', in: 2, out: 6, offset: 1 })!
    assert.ok(s.splitClip(clip.id, 3), 'split at 2s into a clip starting at 1s')
    const track = videoClipTrack(s)
    const [first, tail] = track.items!
    // First piece keeps the source window start; tail continues from where
    // the playhead cut it: 1s of timeline at speed 1 => +1s of source.
    assert.equal(first.in, 2)
    assert.equal(first.out, 4)
    assert.equal(tail.in, 4)
    assert.equal(tail.out, 6)
    assert.equal(startTicks(first), 1 * TICKS)
    assert.equal(startTicks(tail), 3 * TICKS)
    assert.equal(durationTicks(first), 2 * TICKS)
    assert.equal(durationTicks(tail), 2 * TICKS)
    // Geometry must be conserved: two halves == the original.
    assert.equal(durationTicks(first) + durationTicks(tail), 4 * TICKS)
  })

  await check('splitClip respects speed (source advances speed x timeline)', async () => {
    const s = await freshStore()
    // 16s of source at 2x_speed = 8s on the timeline (above the 5s ruler
    // floor, so totalDuration reflects real geometry).
    const clip = s.addClipToTrack('video', { src: 'a.mp4', in: 0, out: 16, offset: 0, speed: 2 })!
    assert.equal(s.totalDuration.value, 8)
    assert.ok(s.splitClip(clip.id, 2))
    const [first, tail] = videoClipTrack(s).items!
    assert.equal(first.out, 4, '2 timeline seconds at 2x consume 4 source seconds')
    assert.equal(tail.in, 4)
    assert.equal(tail.out, 16)
    assert.equal(tail.speed, 2)
    assert.equal(durationTicks(first), 2 * TICKS)
    assert.equal(durationTicks(tail), 6 * TICKS)
  })

  await check('splitClip near an edge is refused and changes nothing', async () => {
    const s = await freshStore()
    const clip = s.addClipToTrack('video', { src: 'a.mp4', in: 0, out: 4 })!
    const before = JSON.stringify(videoClipTrack(s).items)
    assert.equal(s.splitClip(clip.id, 0.05), false)
    assert.equal(s.splitClip(clip.id, 3.95), false)
    assert.equal(JSON.stringify(videoClipTrack(s).items), before, 'refused split must be a no-op')
  })

  await check('trimSelectedEdgeAt moves one edge and keeps the other', async () => {
    const s = await freshStore()
    const clip = s.addClipToTrack('video', { src: 'a.mp4', in: 0, out: 8, offset: 0 })!
    s.selectClip(clip.id)
    assert.ok(s.trimSelectedEdgeAt('out', 5))
    let live = videoClip(s, clip.id)
    assert.equal(live.in, 0)
    assert.equal(live.out, 5)
    assert.equal(s.totalDuration.value, 5)
    assert.ok(s.trimSelectedEdgeAt('in', 2))
    live = videoClip(s, clip.id)
    assert.equal(live.in, 2, 'trimming the in edge moves the source start')
    assert.equal(live.out, 5)
  })

  await check('updateClip writes exactly the patched fields', async () => {
    const s = await freshStore()
    const clip = s.addClipToTrack('video', { src: 'a.mp4', in: 1, out: 5, offset: 0 })!
    s.updateClip(clip.id, { offset: 3, opacity: 50 })
    const live = videoClip(s, clip.id)
    assert.equal(live.offset, 3)
    assert.equal(live.opacity, 50)
    assert.equal(live.in, 1, 'an offset edit must not touch the source window')
    assert.equal(live.out, 5)
    assert.equal(s.totalDuration.value, 7)
  })

  await check('undo/redo restores split geometry in one entry', async () => {
    const s = await freshStore()
    const clip = s.addClipToTrack('video', { src: 'a.mp4', in: 0, out: 6, offset: 0 })!
    assert.ok(s.splitClip(clip.id, 3))
    assert.equal(videoClipTrack(s).items!.length, 2)
    s.undo()
    assert.equal(videoClipTrack(s).items!.length, 1, 'undo of a split removes the tail')
    assert.equal(videoClip(s, clip.id).out, 6, 'and restores the original out point')
    s.redo()
    assert.equal(videoClipTrack(s).items!.length, 2, 'redo re-creates the split')
  })

  await check('ripple delete closes the gap on the same track', async () => {
    const s = await freshStore()
    s.addClipToTrack('video', { src: 'a.mp4', in: 0, out: 2, offset: 0 })
    const b = s.addClipToTrack('video', { src: 'b.mp4', in: 0, out: 3, offset: 2 })!
    s.addClipToTrack('video', { src: 'c.mp4', in: 0, out: 4, offset: 5 })
    s.selectClip(b.id)
    assert.ok(s.rippleDeleteSelected())
    const items = videoClipTrack(s).items!
    assert.equal(items.length, 2)
    assert.equal(startTicks(items[1]!), 2 * TICKS, 'the clip after the cut slides left')
    assert.equal(durationTicks(items[1]!), 4 * TICKS, 'and keeps its length')
    assert.equal(s.totalDuration.value, 6)
  })

  await check('closeProjectGaps pulls every clip to the start', async () => {
    const s = await freshStore()
    s.addClipToTrack('video', { src: 'a.mp4', in: 0, out: 2, offset: 4 })
    s.addClipToTrack('video', { src: 'b.mp4', in: 0, out: 3, offset: 10 })
    const closed = s.closeProjectGaps()
    assert.ok(closed > 0)
    const items = videoClipTrack(s).items!
    assert.equal(startTicks(items[0]!), 0)
    assert.equal(startTicks(items[1]!), 2 * TICKS)
  })

  await check('duplicate pastes a copy without moving the original', async () => {
    const s = await freshStore()
    const clip = s.addClipToTrack('video', { src: 'a.mp4', in: 1, out: 4, offset: 0 })!
    s.selectClip(clip.id)
    const newIds = s.duplicateSelectedClips(4)
    assert.equal(newIds.length, 1)
    const items = videoClipTrack(s).items!
    assert.equal(items.length, 2)
    assert.equal(startTicks(items.find(i => i.id === clip.id)!), 0)
    assert.equal(startTicks(items.find(i => i.id === newIds[0])!), 4 * TICKS)
  })

  await check('transition applies only to adjacent clips and stores ticks', async () => {
    const s = await freshStore()
    s.addClipToTrack('video', { src: 'a.mp4', in: 0, out: 4, offset: 0 })
    const tail = s.addClipToTrack('video', { src: 'b.mp4', in: 0, out: 4, offset: 4 })!
    const verdict = s.applyClipTransition(tail.id, 'fade', 0.5)
    assert.equal(verdict.ok, true, `transition refused: ${verdict.reason}`)
    const live = videoClip(s, tail.id)
    // transitionIn.duration is a CORE field and always lived in ticks.
    assert.equal(Math.round(live.transitionIn!.duration), Math.round(0.5 * TICKS))
  })

  await check('fade toggle stores a ticks envelope and clears again', async () => {
    const s = await freshStore()
    const clip = s.addClipToTrack('video', { src: 'a.mp4', in: 0, out: 10, offset: 0 })!
    s.selectClip(clip.id)
    assert.equal(s.toggleFadeSelection(), 'applied')
    const applied = videoClip(s, clip.id)
    assert.equal(Math.round(applied.fade!.in), Math.round(0.5 * TICKS))
    assert.equal(Math.round(applied.fade!.out), Math.round(0.5 * TICKS))
    assert.equal(s.toggleFadeSelection(), 'cleared')
    assert.equal(videoClip(s, clip.id).fade!.in, 0)
  })

  await check('save/load round-trip preserves geometry', async () => {
    const s = await freshStore()
    const clip = s.addClipToTrack('video', { src: 'a.mp4', in: 2.5, out: 8.25, offset: 1.5 })!
    const id = s.currentProject.value!.id
    await s.flushDiskSave()
    const { useTmcutProject } = await import('../../app/composables/useTmcutProject')
    const again = useTmcutProject()
    await again.loadProject(id)
    const live = again.currentProject.value!.timeline.tracks
      .find(t => t.type === 'video')!.items!.find(i => i.id === clip.id)!
    assert.equal(live.in, 2.5)
    assert.equal(live.out, 8.25)
    assert.equal(live.offset, 1.5, 'a reload must not re-scale stored time values')
  })

  console.log(`\n=== All ${passed} store behaviour checks passed ===`)
}

function videoClipTrack(s: Awaited<ReturnType<typeof freshStore>>) {
  return s.currentProject.value!.timeline.tracks.find(t => t.type === 'video')!
}

main().catch((error) => {
  console.error('\nFAILED:', error)
  process.exit(1)
})
