import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCategoryMapping,
  buildCategoryPathMap,
  guessCategoryColumns,
  matchCategoryBySystem,
  parseCategoryImport,
  resolveCategoryPath
} from '../../shared/utils/pdfCategoryTree'
import { normalizeTo25Columns } from '../../server/modules/pdf/extract/normalize'
import { buildSystemPrompt } from '../../server/modules/pdf/extract/prompt'
import type { PdfCategoryNode, PdfExtractPage } from '../../shared/types/pdf'

const sampleTree: PdfCategoryNode[] = [
  { title: 'Nội thất The one', slug: 'noi-that-the-one' },
  { title: 'NỘI THẤT VĂN PHÒNG', slug: 'noi-that-van-phong', pid: 'noi-that-the-one' },
  { title: 'Ghế văn phòng', slug: 'ghe-van-phong', pid: 'noi-that-van-phong' },
  { title: 'Ghế lãnh đạo cao cấp', slug: 'ghe-lanh-dao-cao-cap', pid: 'ghe-van-phong', matchers: ['TQ'] },
  { title: 'Hộc và tủ phụ', slug: 'hoc-va-tu-phu', pid: 'noi-that-van-phong' },
  { title: 'Hộc bàn', slug: 'hoc-ban', pid: 'hoc-va-tu-phu', matchers: ['HS', 'Hộc sắt'] }
]

describe('pdfCategoryTree', () => {
  it('parses CSV with quoted fields and auto-maps columns', () => {
    const csv = [
      'no,title,slug,pid,description',
      '0,Nội thất The one,noi-that-the-one,,',
      '1,"Ghế gấp, ghế tĩnh",ghe-gap,noi-that-the-one,"Mô tả, có phẩy"'
    ].join('\n')

    const table = parseCategoryImport(csv)
    assert.ok(table)
    assert.equal(table.rows.length, 2)
    const mapping = guessCategoryColumns(table.headers)
    assert.equal(mapping.title, 'title')
    assert.equal(mapping.slug, 'slug')
    assert.equal(mapping.pid, 'pid')

    const nodes = applyCategoryMapping(table, mapping)
    assert.equal(nodes.length, 2)
    assert.equal(nodes[1]!.title, 'Ghế gấp, ghế tĩnh')
    assert.equal(nodes[1]!.pid, 'noi-that-the-one')
  })

  it('builds full root-to-leaf paths and guards cycles', () => {
    const cyclic: PdfCategoryNode[] = [
      ...sampleTree,
      { title: 'Cycle A', slug: 'cyc-a', pid: 'cyc-b' },
      { title: 'Cycle B', slug: 'cyc-b', pid: 'cyc-a' }
    ]
    const map = buildCategoryPathMap(cyclic)
    assert.equal(
      map.get('hoc-ban'),
      'noi-that-the-one,noi-that-van-phong,hoc-va-tu-phu,hoc-ban'
    )
    assert.equal(
      resolveCategoryPath('hoc-ban', map),
      'noi-that-the-one,noi-that-van-phong,hoc-va-tu-phu,hoc-ban'
    )
    assert.equal(resolveCategoryPath('unknown-slug', map), null)
    assert.ok(map.get('cyc-a'))
  })

  it('matches categories deterministically by SKU prefix, keyword, and title', () => {
    const map = buildCategoryPathMap(sampleTree)
    assert.equal(
      matchCategoryBySystem('Hộc di động 3 ngăn kéo', 'HS2', sampleTree, map),
      'noi-that-the-one,noi-that-van-phong,hoc-va-tu-phu,hoc-ban'
    )
    assert.equal(
      matchCategoryBySystem('Ghế lãnh đạo cao cấp chân gỗ', 'SG99', sampleTree, map),
      'noi-that-the-one,noi-that-van-phong,ghe-van-phong,ghe-lanh-dao-cao-cap'
    )
  })
})

describe('preset category mode integration', () => {
  const page: PdfExtractPage = {
    pageId: 'page_0048',
    pageCategorySlugs: 'ghe-lanh-dao-cao-cap',
    products: [{
      sku: 'HS2',
      title: 'Hộc sắt di động HS2',
      isNewProduct: false,
      width: '396',
      depth: '545',
      height: '655',
      description: 'Hộc sắt di động 3 ngăn kéo',
      shortDesc: 'Hộc sắt di động HS2',
      opt1Name: '',
      variants: [{ opt1Val: '', price: '1760000' }]
    }]
  }

  it('system mode resolves per-product category without AI list in prompt', () => {
    const prompt = buildSystemPrompt({ categoryMode: 'system', categories: sampleTree })
    assert.ok(!prompt.includes('DANH MỤC HỢP LỆ'))

    const [row] = normalizeTo25Columns([page], { categoryMode: 'system', categories: sampleTree })
    assert.equal(row!.categories, 'noi-that-the-one,noi-that-van-phong,hoc-va-tu-phu,hoc-ban')
  })

  it('ai mode includes compact list in prompt and resolves per-product categorySlug when a page mixes categories', () => {
    const prompt = buildSystemPrompt({ categoryMode: 'ai', categories: sampleTree })
    assert.ok(prompt.includes('DANH MỤC HỢP LỆ'))
    assert.ok(prompt.includes('Hộc bàn => hoc-ban'))

    const mixedPage: PdfExtractPage = {
      pageId: 'page_0038',
      pageCategorySlugs: 'ghe-lanh-dao-cao-cap',
      products: [
        {
          sku: 'TQ01',
          title: 'Ghế lãnh đạo TQ01',
          categorySlug: 'ghe-lanh-dao-cao-cap',
          isNewProduct: false,
          width: '700',
          depth: '810',
          height: '1155',
          description: 'Ghế lãnh đạo',
          shortDesc: 'Ghế lãnh đạo',
          opt1Name: '',
          variants: [{ opt1Val: '', price: '5000000' }]
        },
        {
          sku: 'HS2',
          title: 'Hộc sắt HS2',
          categorySlug: 'hoc-ban',
          isNewProduct: false,
          width: '396',
          depth: '545',
          height: '655',
          description: 'Hộc sắt',
          shortDesc: 'Hộc sắt',
          opt1Name: '',
          variants: [{ opt1Val: '', price: '1760000' }]
        }
      ]
    }

    const rows = normalizeTo25Columns([mixedPage], { categoryMode: 'ai', categories: sampleTree })
    assert.equal(rows[0]!.categories, 'noi-that-the-one,noi-that-van-phong,ghe-van-phong,ghe-lanh-dao-cao-cap')
    assert.equal(rows[1]!.categories, 'noi-that-the-one,noi-that-van-phong,hoc-va-tu-phu,hoc-ban')
  })

  it('auto mode prefers system match and falls back to AI slug', () => {
    const unknownPage: PdfExtractPage = {
      pageId: 'page_0099',
      pageCategorySlugs: 'ghe-van-phong',
      products: [{
        sku: 'ZZ99',
        title: 'Sản phẩm đặc biệt ZZ99',
        isNewProduct: false,
        width: '500',
        depth: '500',
        height: '500',
        description: 'Mô tả khác biệt',
        shortDesc: 'Sản phẩm ZZ99',
        opt1Name: '',
        variants: [{ opt1Val: '', price: '1000000' }]
      }]
    }

    const [hsRow] = normalizeTo25Columns([page], { categoryMode: 'auto', categories: sampleTree })
    assert.equal(hsRow!.categories, 'noi-that-the-one,noi-that-van-phong,hoc-va-tu-phu,hoc-ban')

    const [zzRow] = normalizeTo25Columns([unknownPage], { categoryMode: 'auto', categories: sampleTree })
    assert.equal(zzRow!.categories, 'noi-that-the-one,noi-that-van-phong,ghe-van-phong')
  })
})
