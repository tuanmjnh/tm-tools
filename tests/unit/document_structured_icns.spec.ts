import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ICNS_PNG_TYPES,
  buildIcns,
  parseIcnsDirectory,
  icnsSizeForType
} from '../../server/modules/image/icns'
import {
  csvToRows,
  rowsToCsv,
  xmlToJsonValue,
  jsonValueToXml
} from '../../server/modules/document/structured'

function tinyPng(): Uint8Array {
  return new Uint8Array(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  ))
}

describe('ICNS container', () => {
  it('maps the PNG-backed type codes to their pixel sizes', () => {
    assert.equal(icnsSizeForType('icp4'), 16)
    assert.equal(icnsSizeForType('icp5'), 32)
    assert.equal(icnsSizeForType('ic07'), 128)
    assert.equal(icnsSizeForType('ic08'), 256)
    assert.equal(icnsSizeForType('ic09'), 512)
    assert.equal(icnsSizeForType('zzzz'), null)
    assert.deepEqual(ICNS_PNG_TYPES.slice().sort(), ['ic07', 'ic08', 'ic09', 'icp4', 'icp5', 'icp6'].sort())
  })

  it('packs PNG payloads into a valid ICNS with a byte-count header', () => {
    const png = tinyPng()
    const icns = buildIcns([{ size: 16, png }, { size: 512, png }])

    assert.equal(icns.subarray(0, 4).toString('latin1'), 'icns')
    assert.equal(icns.readUInt32BE(4), icns.length, 'header length covers the whole file')

    // First element: 4-byte type + 4-byte (length incl header) + payload.
    assert.equal(icns.subarray(8, 12).toString('latin1'), 'icp4')
    assert.equal(icns.readUInt32BE(12), 8 + png.length, 'element length includes its 8-byte header')
  })

  it('parses the directory back to the sizes that were stored', () => {
    const png = tinyPng()
    const icns = buildIcns([{ size: 16, png }, { size: 256, png }, { size: 512, png }])
    const entries = parseIcnsDirectory(icns)
    assert.deepEqual(entries.map(e => e.size), [16, 256, 512])
    assert.ok(entries.every(e => e.png === true))
  })

  it('rejects a size the format cannot store', () => {
    assert.throws(() => buildIcns([{ size: 100, png: tinyPng() }]), /ICNS_SIZE_UNSUPPORTED/)
  })

  it('rejects a non-icns buffer at parse time', () => {
    assert.throws(() => parseIcnsDirectory(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])), /ICNS_INVALID/)
  })

  it('requires at least one element', () => {
    assert.throws(() => buildIcns([]), /ICNS_NO_IMAGES/)
  })
})

describe('CSV <-> rows', () => {
  it('parses quoted fields, embedded commas, quotes and CRLF', () => {
    const rows = csvToRows('name,note\r\n"Smith, J.","He said ""hi"""\r\nplain,ok\r\n')
    assert.deepEqual(rows, [
      ['name', 'note'],
      ['Smith, J.', 'He said "hi"'],
      ['plain', 'ok']
    ])
  })

  it('round-trips a table through CSV', () => {
    const table = [['a', 'b'], ['1', 'x,y'], ['2', 'say "z"']]
    assert.deepEqual(csvToRows(rowsToCsv(table)), table)
  })

  it('pads ragged rows so the table is rectangular', () => {
    const rows = csvToRows('a,b,c\n1,2\n3\n')
    assert.deepEqual(rows, [['a', 'b', 'c'], ['1', '2', ''], ['3', '', '']])
  })
})

describe('XML <-> JSON', () => {
  it('reads a simple root with children and text', () => {
    const value = xmlToJsonValue('<root><name>Ada</name><age>36</age></root>')
    assert.deepEqual(value, { name: 'Ada', age: '36' })
  })

  it('keeps attributes under @ and text under #text', () => {
    const value = xmlToJsonValue('<item id="7" kind="book">Hello</item>')
    assert.deepEqual(value, { '@id': '7', '@kind': 'book', '#text': 'Hello' })
  })

  it('turns repeated siblings into arrays', () => {
    const value = xmlToJsonValue('<list><row>a</row><row>b</row></list>')
    assert.deepEqual(value, { row: ['a', 'b'] })
  })

  it('round-trips a small object through XML', () => {
    const xml = jsonValueToXml('root', { name: 'Ada', items: ['x', 'y'] })
    assert.match(xml, /<root>/)
    assert.match(xml, /<name>Ada<\/name>/)
    assert.equal(xmlToJsonValue(xml).name, 'Ada')
    assert.deepEqual(xmlToJsonValue(xml).items, ['x', 'y'])
  })

  it('rejects malformed XML instead of guessing', () => {
    assert.throws(() => xmlToJsonValue('<a><b></a>'), /XML_INVALID/)
  })
})
