import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeHtml } from '../../app/utils/sanitizeHtml'

describe('sanitizeHtml', () => {
  it('removes script elements and their content', () => {
    const out = sanitizeHtml('<p>ok</p><script>alert(1)</script>')
    assert.equal(out.includes('<script'), false)
    assert.equal(out.includes('alert(1)'), false)
    assert.equal(out.includes('<p>ok</p>'), true)
  })

  it('strips inline event handlers', () => {
    const out = sanitizeHtml('<img src="x.png" onerror="alert(1)">')
    assert.equal(/onerror/i.test(out), false)
    assert.equal(out.includes('src="x.png"'), true)
  })

  it('neutralises javascript: and data:text/html URLs', () => {
    assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>').includes('javascript:'), false)
    assert.equal(sanitizeHtml('<img src="data:text/html;base64,xx">').includes('data:text/html'), false)
  })

  it('drops embedding elements', () => {
    const out = sanitizeHtml('<iframe src="https://evil.test"></iframe><embed src="x"><object></object>')
    for (const tag of ['<iframe', '<embed', '<object']) {
      assert.equal(out.includes(tag), false, `${tag} should be removed`)
    }
  })

  it('keeps ordinary formatting intact', () => {
    const html = '<h1>Title</h1><p><strong>bold</strong> and <em>italic</em></p>'
    assert.equal(sanitizeHtml(html), html)
  })

  it('returns an empty string for empty input', () => {
    assert.equal(sanitizeHtml(''), '')
  })
})
