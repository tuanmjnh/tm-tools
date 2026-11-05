import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  pdfConvertOutputName,
  pdfDocumentStem,
  pdfImagesToPdfOutputName,
  pdfMergeOutputName,
  pdfPageFileName,
  pdfProductsStem
} from '../../app/utils/pdfOperations'
import { documentStem, safeStem } from '../../server/modules/pdf/security'

const PREFIX = 'page_'
const PAD = 4

describe('client output names match the server formulas', () => {
  it('documentStem drops the same extensions as the server', () => {
    for (const name of ['bang-gia.pdf', 'bang-gia.DOCX', 'bang-gia.doc', 'bang-gia.csv', 'bang-gia']) {
      assert.equal(pdfDocumentStem(name), documentStem(name), name)
    }
  })

  it('documentStem ignores a folder prefix', () => {
    assert.equal(pdfDocumentStem('hoa-phat/bang-gia.pdf'), 'bang-gia')
    assert.equal(pdfDocumentStem('hoa-phat/bang-gia.pdf'), documentStem('hoa-phat/bang-gia.pdf'))
  })

  it('pageFileName matches page_ + zero padding', () => {
    assert.equal(pdfPageFileName(1, PREFIX, PAD), `${PREFIX}0001`)
    assert.equal(pdfPageFileName(42, PREFIX, PAD), `${PREFIX}0042`)
    assert.equal(pdfPageFileName(1234, PREFIX, PAD), `${PREFIX}1234`)
  })

  it('merge output is <folder>_merged.pdf', () => {
    assert.equal(pdfMergeOutputName('bang-gia'), 'bang-gia_merged.pdf')
    assert.equal(pdfMergeOutputName('nested/bang-gia'), 'bang-gia_merged.pdf')
  })

  it('images-to-PDF output is <folder>_from_images.pdf', () => {
    assert.equal(pdfImagesToPdfOutputName('bang-gia'), 'bang-gia_from_images.pdf')
  })

  it('convert output is <safeStem(input)>.pdf', () => {
    for (const name of ['bang-gia.docx', 'bang-gia.xlsx', 'bang-gia.csv', 'bang-gia.png']) {
      assert.equal(pdfConvertOutputName(name), `${safeStem(name)}.pdf`, name)
    }
  })

  it('products files are <stem>_products.<ext>', () => {
    const stem = pdfProductsStem(pdfDocumentStem('bang-gia.pdf'))
    assert.equal(stem, 'bang-gia_products')
    for (const extension of ['csv', 'json', 'xlsx', 'docx', 'xml']) {
      assert.equal(`${stem}.${extension}`, `bang-gia_products.${extension}`)
    }
  })
})
