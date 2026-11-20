import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDesktopOnlyPath, isWebNoticePath, DESKTOP_ONLY_PREFIXES, WEB_NOTICE_PREFIXES } from '../../app/composables/useCapabilities'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('desktop-only path gate', () => {
  it('lists exactly the three desktop-only prefixes', () => {
    assert.deepEqual([...DESKTOP_ONLY_PREFIXES], ['/browser-hub', '/media/video', '/media/download'])
  })

  it('matches the prefix root and any child', () => {
    assert.equal(isDesktopOnlyPath('/browser-hub'), true)
    assert.equal(isDesktopOnlyPath('/browser-hub/groups'), true)
    assert.equal(isDesktopOnlyPath('/media/video'), true)
    assert.equal(isDesktopOnlyPath('/media/download'), true)
  })

  it('does not match unrelated or lookalike paths', () => {
    assert.equal(isDesktopOnlyPath('/media'), false)
    assert.equal(isDesktopOnlyPath('/media/videos'), false)
    assert.equal(isDesktopOnlyPath('/document-studio/tools/split'), false)
    assert.equal(isDesktopOnlyPath('/'), false)
  })
})

describe('web notice vs redirect split', () => {
  // The media pages already render an alert when Electron is absent. Redirecting
  // them to `/` hides that notice, so they must be allowed to render on the web
  // and explain themselves instead of bouncing the visitor to the dashboard.
  it('treats the media pages as a notice, not a redirect', () => {
    assert.deepEqual([...WEB_NOTICE_PREFIXES], ['/media/video', '/media/download'])
    assert.equal(isWebNoticePath('/media/video'), true)
    assert.equal(isWebNoticePath('/media/download'), true)
    assert.equal(isWebNoticePath('/media'), false)
    assert.equal(isWebNoticePath('/browser-hub'), false)
  })

  it('a notice path is still desktop-only', () => {
    for (const path of WEB_NOTICE_PREFIXES) {
      assert.equal(isDesktopOnlyPath(path), true, `${path} must stay desktop-only for the sidebar filter`)
    }
  })
})

describe('sidebar hides desktop-only routes on web', () => {
  it('filters buildNavItems by isDesktopOnlyPath when not desktop', () => {
    const src = read('app/composables/useNavMenu.ts')
    assert.match(src, /isDesktopOnlyPath/)
    assert.match(src, /useCapabilities\(\)/)
    assert.match(src, /allowedRoutes\.value[\s\S]*filter/)
  })
})

describe('route guard', () => {
  it('redirects only the non-notice desktop-only paths on web', () => {
    const src = read('app/middleware/auth.global.ts')
    assert.match(src, /useCapabilities\(\)/)
    assert.match(src, /isDesktopOnlyPath/)
    // A notice path must be rendered (so its alert shows), never redirected.
    assert.match(src, /isWebNoticePath/)
    assert.match(src, /navigateTo\('\/'\)/)
  })

  it('media pages render a "desktop only" notice when Electron is absent', () => {
    const video = read('app/pages/media/video.vue')
    const download = read('app/pages/media/download.vue')
    assert.match(video, /tools\.noElectron/)
    assert.match(download, /tools\.noElectron/)
  })

  it('media pages disable their controls when Electron is absent', () => {
    // Without this a button stays clickable on the web and silently does
    // nothing, because every action goes through the missing IPC bridge.
    const video = read('app/pages/media/video.vue')
    const download = read('app/pages/media/download.vue')
    assert.match(video, /controlsDisabled[^\n]*!\s*taskManager\.isElectron\.value/)
    assert.match(download, /controlsDisabled[^\n]*!\s*isElectron/)
  })
})
