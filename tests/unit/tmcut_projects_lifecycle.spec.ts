/**
 * Project-management lifecycle at the web-fallback layer (R102): every
 * dashboard mutation must survive a reload. Desktop persists through IPC;
 * the web session's only durable layer is the localStorage mirror — the
 * same one loadProject/refreshProjects read. Contract pinned here:
 *  - renameProject updates the mirror for the CURRENT and NON-current
 *    project alike (J-2 rule: the web session survives reload);
 *  - togglePinProject persists the pin flag WITHOUT touching updated_at;
 *  - duplicateProject persists the clone (otherwise it vanishes on reload);
 *  - updateClipsSrc relinks every clip that references the old path
 *    (path-normalized) and reports the honest count.
 */
import { freshStore } from './helpers/tmcut_store_env'

let passed = 0
async function check(name: string, fn: () => void | Promise<void>) {
  await fn()
  passed++
  console.log(`[ok] ${name}`)
}

const mirror = (id: string) => JSON.parse(localStorage.getItem(`tmcut_project_${id}`) || 'null')

async function main() {
  await check('renaming the CURRENT project updates the mirror', async () => {
    const s = await freshStore()
    const id = s.currentProject.value!.id
    await s.renameProject(id, 'Renamed!  ')
    const m = mirror(id)
    if (m.name !== 'Renamed!') throw new Error(`mirror name: ${m.name}`)
  })

  await check('renaming a NON-current project updates its mirror too (web reload)', async () => {
    const s = await freshStore()
    const aId = s.currentProject.value!.id
    const b = s.createProject('b-current') // b is now current; a is not persisted again
    await s.renameProject(aId, 'Renamed elsewhere')
    const m = mirror(aId)
    if (!m) throw new Error('project a has no mirror yet')
    if (m.name !== 'Renamed elsewhere') throw new Error(`web rename lost: mirror shows ${m.name}`)
    if (b.id === aId) throw new Error('sanity')
  })

  await check('rename ignores blank names and unknown ids', async () => {
    const s = await freshStore()
    const id = s.currentProject.value!.id
    const before = mirror(id).updated_at
    await s.renameProject(id, '   ')
    if (mirror(id).updated_at !== before) throw new Error('blank rename must be a no-op')
    await s.renameProject('nope', 'X') // must not throw
  })

  await check('togglePinProject persists pinned WITHOUT bumping updated_at', async () => {
    const s = await freshStore()
    const id = s.currentProject.value!.id
    const before = await mirror(id)
    const pinned = await s.togglePinProject(id)
    if (pinned !== true) throw new Error('toggle must report the new state')
    const after = mirror(id)
    if (after.pinned !== true) throw new Error('pin not mirrored')
    if (after.updated_at !== before.updated_at) throw new Error('metadata write must not bump updated_at')
    const again = await s.togglePinProject(id)
    if (again !== false || mirror(id).pinned !== false) throw new Error('second toggle must unpin')
  })

  await check('duplicateProject mirrors the clone so reload keeps it', async () => {
    const s = await freshStore()
    s.addClipToTrack('video', { src: 'a.mp4', in: 0, out: 480000, offset: 0 })
    const sourceId = s.currentProject.value!.id
    const clone = await s.duplicateProject(sourceId, 'copy')
    if (!clone) throw new Error('duplicate failed')
    if (mirror(clone.id) === null) throw new Error('clone has no mirror — reload would lose the duplicate')
    const m = mirror(clone.id)
    if (m.timeline.tracks.find((t: { type: string }) => t.type === 'video').items.length !== 1) {
      throw new Error('clone mirror missing the timeline')
    }
    // The clone must not steal the current project slot.
    if (s.currentProject.value!.id !== sourceId) throw new Error('duplicate must not switch the open project')
  })

  await check('updateClipsSrc relinks by normalized path and reports the count', async () => {
    const s = await freshStore()
    s.addClipToTrack('video', { src: 'C:\\Media\\Old.MP4', in: 0, out: 480000, offset: 0 })
    s.addClipToTrack('video', { src: 'C:/media/old.mp4', in: 0, out: 480000, offset: 480000 })
    s.addClipToTrack('audio', { src: 'C:\\Other\\keep.wav', in: 0, out: 240000, offset: 0 })
    const n = s.updateClipsSrc('C:\\media\\OLD.MP4', 'D:\\New\\fixed.mp4')
    // Windows-style paths differing only in slashes: normalizePath makes
    // them equal; case differences remain (the store does not lowercase).
    const videoItems = s.currentProject.value!.timeline.tracks
      .find(t => t.type === 'video')!.items!
    const updated = videoItems.filter(i => i.src === 'D:\\New\\fixed.mp4').length
    if (updated !== n) throw new Error(`count ${n} disagrees with actual ${updated}`)
    const audioItem = s.currentProject.value!.timeline.tracks
      .find(t => t.type === 'audio')!.items![0]!
    if (audioItem.src !== 'C:\\Other\\keep.wav') throw new Error('unrelated clip was touched')
  })

  console.log(`\n=== All ${passed} project-lifecycle checks passed ===`)
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
