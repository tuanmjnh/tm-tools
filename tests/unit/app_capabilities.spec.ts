import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDesktopOnlyPath, DESKTOP_ONLY_PREFIXES } from '../../app/composables/useCapabilities'

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

describe('sidebar hides desktop-only routes on web', () => {
  it('filters buildNavItems by isDesktopOnlyPath when not desktop', () => {
    const src = read('app/composables/useNavMenu.ts')
    assert.match(src, /isDesktopOnlyPath/)
    assert.match(src, /useCapabilities\(\)/)
    assert.match(src, /allowedRoutes\.value[\s\S]*filter/)
  })
})

describe('route guard refuses desktop-only paths on web', () => {
  it('uses useCapabilities and redirects desktop-only paths', () => {
    const src = read('app/middleware/auth.global.ts')
    assert.match(src, /useCapabilities\(\)/)
    assert.match(src, /isDesktopOnlyPath/)
    assert.match(src, /navigateTo\('\/'\)/)
  })
})
