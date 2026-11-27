import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Document, Packer, Paragraph, Table, TableCell, TableRow } from 'docx'
import {
  blocksToMarkdown,
  extractLegacyDocBlocks,
  jsonValueToSheets,
  markdownToBlocks,
  parseAiDocxPlan,
  parseAiXlsxPlan,
  readWorkbookSheets,
  resolveOfficeTarget,
  sheetsToDocxBuffer,
  sheetsToJsonValue,
  sheetsToMarkdown,
  wordBlocksToXlsxBuffer
} from '../../server/modules/document/office-convert-executor'
import { jsonValueToXml, xmlToJsonValue } from '../../server/modules/document/structured'
import { docxToBlocks } from '../../server/modules/pdf/office/docxParse'

describe('office.convert (Word ↔ Excel / CSV / MD / JSON / XML)', () => {
  it('resolves auto and explicit target formats', () => {
    assert.equal(resolveOfficeTarget('docx', 'auto'), 'xlsx')
    assert.equal(resolveOfficeTarget('doc', 'auto'), 'xlsx')
    assert.equal(resolveOfficeTarget('md', 'auto'), 'xlsx')
    assert.equal(resolveOfficeTarget('xlsx', 'auto'), 'docx')
    assert.equal(resolveOfficeTarget('csv', 'auto'), 'docx')
    assert.equal(resolveOfficeTarget('docx', 'md'), 'md')
    assert.equal(resolveOfficeTarget('xlsx', 'json'), 'json')
    assert.equal(resolveOfficeTarget('xlsx', 'xml'), 'xml')
    assert.throws(() => resolveOfficeTarget('pdf', 'xlsx'))
  })

  it('converts a Word table (.docx) to Excel (.xlsx) and back to Word (.docx)', async () => {
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: 'Bảng giá sản phẩm' }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('SKU')] }),
                  new TableCell({ children: [new Paragraph('Tên sản phẩm')] }),
                  new TableCell({ children: [new Paragraph('Giá')] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('HS2')] }),
                  new TableCell({ children: [new Paragraph('Hộc sắt di động')] }),
                  new TableCell({ children: [new Paragraph('1760000')] })
                ]
              })
            ]
          })
        ]
      }]
    })

    const docxBuffer = await Packer.toBuffer(doc)
    const blocks = await docxToBlocks(docxBuffer)
    const xlsxBuffer = await wordBlocksToXlsxBuffer(blocks)
    const sheets = await readWorkbookSheets(new Uint8Array(xlsxBuffer))

    assert.equal(sheets.length, 1)
    assert.deepEqual(sheets[0]!.rows[0], ['SKU', 'Tên sản phẩm', 'Giá'])
    assert.deepEqual(sheets[0]!.rows[1], ['HS2', 'Hộc sắt di động', '1760000'])

    const roundTripDocx = await sheetsToDocxBuffer(sheets, 'Bang gia')
    const roundTripBlocks = await docxToBlocks(roundTripDocx)
    const tables = roundTripBlocks.filter(b => b.type === 'table')
    assert.equal(tables.length, 1)
    assert.deepEqual(tables[0]!.rows[1], ['HS2', 'Hộc sắt di động', '1760000'])
  })

  it('converts narrative Word paragraphs (no tables) into structured Excel rows', async () => {
    const blocks = [
      { type: 'heading' as const, level: 1, text: 'Giới thiệu' },
      { type: 'paragraph' as const, text: 'Nội thất văn phòng cao cấp.' }
    ]
    const xlsxBuffer = await wordBlocksToXlsxBuffer(blocks)
    const sheets = await readWorkbookSheets(new Uint8Array(xlsxBuffer))
    assert.equal(sheets[0]!.name, 'Document')
    assert.deepEqual(sheets[0]!.rows[0], ['Section', 'Type', 'Content'])
    assert.deepEqual(sheets[0]!.rows[2], ['Giới thiệu', 'Paragraph', 'Nội thất văn phòng cao cấp.'])
  })

  it('extracts UTF-16LE text runs from legacy .doc buffers', () => {
    const fakeDoc = Buffer.concat([
      Buffer.from([0xD0, 0xCF, 0x11, 0xE0]),
      Buffer.from('Báo giá thiết bị văn phòng 2026', 'utf16le'),
      Buffer.from([0x00, 0x00]),
      Buffer.from('Mã sản phẩm HS2 - 1.760.000 VND', 'utf16le')
    ])
    const blocks = extractLegacyDocBlocks(fakeDoc)
    assert.ok(blocks.some(b => b.type === 'paragraph' && b.text.includes('Báo giá thiết bị')))
    assert.ok(blocks.some(b => b.type === 'paragraph' && b.text.includes('HS2')))
  })

  it('parses AI JSON plans for Word→Excel and Excel→Word', () => {
    const xlsxPlan = parseAiXlsxPlan('```json\n{"sheets":[{"name":"Products","columns":["SKU","Price"],"rows":[["TQ01","5160000"]]}]}\n```')
    assert.equal(xlsxPlan[0]!.name, 'Products')
    assert.deepEqual(xlsxPlan[0]!.rows, [['SKU', 'Price'], ['TQ01', '5160000']])

    const docxPlan = parseAiDocxPlan('{"title":"Báo cáo","sections":[{"heading":"Tổng quan","paragraphs":["Tóm tắt"],"table":{"headers":["Mã"],"rows":[["HS2"]]}}]}')
    assert.equal(docxPlan.title, 'Báo cáo')
    assert.equal(docxPlan.sections[0]!.heading, 'Tổng quan')
    assert.deepEqual(docxPlan.sections[0]!.table?.rows, [['HS2']])
  })

  it('converts between Markdown, Excel sheets, JSON, and XML', () => {
    const md = '# Báo giá\n\n| SKU | Giá |\n| --- | --- |\n| HS2 | 1760000 |\n'
    const blocks = markdownToBlocks(md)
    assert.equal(blocks[0]!.type, 'heading')
    assert.equal(blocks[1]!.type, 'table')

    const renderedMd = blocksToMarkdown(blocks)
    assert.ok(renderedMd.includes('# Báo giá'))
    assert.ok(renderedMd.includes('| HS2 | 1760000 |'))

    const sheets = [{ name: 'Data', rows: [['SKU', 'Giá'], ['HS2', '1760000']] }]
    assert.ok(sheetsToMarkdown(sheets).includes('## Data'))

    const jsonVal = sheetsToJsonValue(sheets)
    assert.deepEqual(jsonVal, [{ SKU: 'HS2', Giá: '1760000' }])
    assert.deepEqual(jsonValueToSheets(jsonVal)[0]!.rows, [['SKU', 'Giá'], ['HS2', '1760000']])

    const xml = jsonValueToXml('document', { item: jsonVal })
    assert.ok(xml.includes('<SKU>HS2</SKU>'))
    const back = xmlToJsonValue(xml) as { item: { SKU?: string } }
    assert.equal(back.item.SKU, 'HS2')
  })
})
