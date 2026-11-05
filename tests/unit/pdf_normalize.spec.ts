import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { PdfExtractPage, PdfExtractProduct } from '../../shared/types/pdf'
import { PDF_EXPORT_COLUMNS } from '../../shared/types/pdf'
import { categoryTags, makeVariantSuffix, normalizeTo25Columns } from '../../server/modules/pdf/extract/normalize'

function product(overrides: Partial<PdfExtractProduct> = {}): PdfExtractProduct {
  return {
    sku: 'TQ01',
    title: 'Ghế lãnh đạo cao cấp TQ01',
    isNewProduct: false,
    width: '700',
    depth: '780-1140',
    height: '1155-1210',
    description: 'Đệm tựa bọc da thật.',
    shortDesc: 'Ghế da cao cấp.',
    opt1Name: '',
    variants: [{ opt1Val: '', price: '5160000' }],
    ...overrides
  }
}

function page(products: PdfExtractProduct[], slugs = 'noi-that-the-one,noi-that-van-phong,ghe-van-phong'): PdfExtractPage {
  return { pageId: 'page_0005', pageCategorySlugs: slugs, products }
}

describe('makeVariantSuffix', () => {
  it('maps the known leather variants to their short slug', () => {
    assert.equal(makeVariantSuffix('Da thật'), 'da-that')
    assert.equal(makeVariantSuffix('Da công nghiệp'), 'da-cn')
    assert.equal(makeVariantSuffix('Da CN'), 'da-cn')
    assert.equal(makeVariantSuffix('PVC'), 'pvc')
  })

  it('slugifies unknown Vietnamese values and keeps them unique-friendly', () => {
    assert.equal(makeVariantSuffix('Da màu đen'), 'da-mau-den')
    assert.equal(makeVariantSuffix('  Khóa điện tử  '), 'khoa-dien-tu')
  })

  it('returns an empty suffix for a simple product', () => {
    assert.equal(makeVariantSuffix(''), '')
  })
})

describe('categoryTags', () => {
  it('drops the root slug and appends the brand tags', () => {
    assert.equal(
      categoryTags('noi-that-the-one,noi-that-van-phong,ghe-van-phong'),
      'noi-that-van-phong,ghe-van-phong,hoa-phat,the-one'
    )
  })
})

describe('normalizeTo25Columns', () => {
  it('emits exactly the 25 export columns, in order', () => {
    const [row] = normalizeTo25Columns([page([product()])])
    assert.equal(PDF_EXPORT_COLUMNS.length, 25)
    assert.deepEqual(Object.keys(row), [...PDF_EXPORT_COLUMNS])
  })

  it('keeps a single-price product simple (no variant fields)', () => {
    const [row] = normalizeTo25Columns([page([product()])])
    assert.equal(row.basePrice, '5160000')
    assert.equal(row.salePrice, '5160000')
    assert.equal(row.opt1_name, '')
    assert.equal(row.opt1_val, '')
    assert.equal(row.v_sku, '')
    assert.equal(row.v_basePrice, '')
    assert.equal(row.v_stock, '')
    assert.equal(row.attributes, 'Rộng: 700mm | Sâu: 780-1140mm | Cao: 1155-1210mm')
  })

  it('expands multi-price products into variants sharing one SKU and the lowest base price', () => {
    const rows = normalizeTo25Columns([page([product({
      opt1Name: 'Chất liệu',
      variants: [
        { opt1Val: 'Da thật', price: '5.160.000' },
        { opt1Val: 'Da công nghiệp', price: '4.180.000' },
        { opt1Val: 'PVC', price: '4.050.000' }
      ]
    })])])

    assert.equal(rows.length, 3)
    assert.equal(new Set(rows.map(row => row.sku)).size, 1)
    assert.equal(rows[0].basePrice, '4050000')
    assert.deepEqual(rows.map(row => row.opt1_name), ['Chất liệu', 'Chất liệu', 'Chất liệu'])
    assert.deepEqual(rows.map(row => row.opt1_val), ['Da thật', 'Da công nghiệp', 'PVC'])
    assert.deepEqual(rows.map(row => row.v_sku), ['tq01-da-that', 'tq01-da-cn', 'tq01-pvc'])
    assert.deepEqual(rows.map(row => row.v_basePrice), ['5160000', '4180000', '4050000'])
    assert.deepEqual(rows.map(row => row.v_stock), ['0', '0', '0'])
  })

  it('numbers rows consecutively across pages and products', () => {
    const rows = normalizeTo25Columns([
      page([product()]),
      page([product({ sku: 'TQ02' })])
    ])
    assert.deepEqual(rows.map(row => row.no), ['1', '2'])
  })

  it('adds the new-product tag and lower-case SKU keyword', () => {
    const [row] = normalizeTo25Columns([page([product({ isNewProduct: true })])])
    assert.match(row.tags, /,san-pham-moi$/)
    assert.match(row.keywords, /,tq01$/)
  })

  it('falls back to the default category path when the page has none', () => {
    const [row] = normalizeTo25Columns([page([product()], '')])
    assert.equal(
      row.categories,
      'noi-that-the-one,noi-that-van-phong,ghe-van-phong,ghe-lanh-dao-cao-cap'
    )
  })

  it('strips thousands separators from every price column', () => {
    const [row] = normalizeTo25Columns([page([product({ variants: [{ opt1Val: '', price: '7.250.000 đ' }] })])])
    assert.equal(row.basePrice, '7250000')
    assert.equal(row.v_basePrice, '')
  })
})
