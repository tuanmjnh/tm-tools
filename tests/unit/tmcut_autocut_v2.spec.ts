import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectFillerWords,
  analyzeTranscriptSegment,
  scoreSegments,
  DEFAULT_FILLER_WORDS
} from '@tmcut-core'

describe('TMCut AutoCut v2 — Transcript & Vocabulary Analysis', () => {
  it('detects filler words and measures density across languages', () => {
    assert.ok(DEFAULT_FILLER_WORDS.includes('ừm'))
    assert.ok(DEFAULT_FILLER_WORDS.includes('um'))

    // Vietnamese test
    const viText = 'Hôm nay, ừm, mình sẽ kiểu như là hướng dẫn các bạn cách cắt video nhé'
    const viRes = detectFillerWords(viText)
    assert.ok(viRes.count >= 2)
    assert.ok(viRes.words.includes('ừm') || viRes.words.includes('kiểu như'))
    assert.ok(viRes.fillerRatio > 0.1)

    // English test
    const enText = 'So basically, um, you know, this feature is super awesome actually'
    const enRes = detectFillerWords(enText)
    assert.ok(enRes.count >= 3)
    assert.ok(enRes.words.includes('um'))
    assert.ok(enRes.words.includes('you know'))
    assert.ok(enRes.fillerRatio > 0.2)
  })

  it('classifies transcript segment as filler vs highlight with correct modifiers', () => {
    // Pure filler phrase
    const fillerSeg = analyzeTranscriptSegment('ừm ờ thì là...', { filterFillerWords: true })
    assert.equal(fillerSeg.isFiller, true)
    assert.equal(fillerSeg.isHighlight, false)
    assert.ok(fillerSeg.scoreModifier < 0)

    // Highlight keywords
    const highlightSeg = analyzeTranscriptSegment('Đây là bí quyết quan trọng nhất để tăng lượt xem', {
      keywords: ['bí quyết', 'quan trọng']
    })
    assert.equal(highlightSeg.isFiller, false)
    assert.equal(highlightSeg.isHighlight, true)
    assert.deepEqual(highlightSeg.matchedKeywords, ['bí quyết', 'quan trọng'])
    assert.ok(highlightSeg.scoreModifier > 0)

    // Clean normal speech
    const cleanSeg = analyzeTranscriptSegment('Xin chào và hẹn gặp lại các bạn trong video tới')
    assert.equal(cleanSeg.isFiller, false)
    assert.equal(cleanSeg.isHighlight, false)
    assert.equal(cleanSeg.scoreModifier, 0)
  })

  it('scores EDL segments using transcript v2 with penalization and boosting', () => {
    const scenes = [
      { start: 0, end: 4 },
      { start: 4, end: 10 },
      { start: 10, end: 16 }
    ]
    const transcript = [
      { start: 0, end: 4, text: 'ừm ờ kiểu như là...' },
      { start: 4, end: 10, text: 'Mẹo hay và bí quyết tối ưu hóa video ngắn' },
      { start: 10, end: 16, text: 'Hãy đăng ký kênh để nhận thông báo mới' }
    ]

    const edl = scoreSegments({
      assetId: 'asset_test_1',
      profile: 'viral-shorts',
      scenes,
      silences: [],
      transcript,
      keywords: ['mẹo hay', 'bí quyết'],
      filterFillerWords: true
    })

    assert.equal(edl.version, 1)
    assert.equal(edl.analyzerVersion, 'transcript-v2')
    assert.equal(edl.segments.length, 3)

    // Segment 0: filler words penalized
    assert.equal(edl.segments[0].reason, 'filler-word')
    assert.equal(edl.segments[0].hasFillerWords, true)
    assert.ok(edl.segments[0].detectedFillers && edl.segments[0].detectedFillers.length > 0)
    assert.ok(edl.segments[0].score <= 0.4)

    // Segment 1: highlight boosted
    assert.equal(edl.segments[1].reason, 'highlight')
    assert.equal(edl.segments[1].isHighlight, true)
    assert.deepEqual(edl.segments[1].matchedKeywords, ['mẹo hay', 'bí quyết'])
    assert.ok(edl.segments[1].score >= 0.7)

    // Segment 2: normal speech
    assert.equal(edl.segments[2].reason, 'speech')
    assert.equal(edl.segments[2].hasFillerWords, undefined)
    assert.equal(edl.segments[2].isHighlight, undefined)
  })

  it('honors filterFillerWords: false option', () => {
    const scenes = [{ start: 0, end: 4 }]
    const transcript = [{ start: 0, end: 4, text: 'ừm ờ kiểu như là...' }]

    const edl = scoreSegments({
      assetId: 'asset_test_2',
      profile: 'podcast-summary',
      scenes,
      silences: [],
      transcript,
      filterFillerWords: false
    })

    // Filler penalty disabled -> regular speech
    assert.equal(edl.segments[0].reason, 'speech')
    assert.equal(edl.segments[0].hasFillerWords, undefined)
  })
})
