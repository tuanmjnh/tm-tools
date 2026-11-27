import type { PdfCategoryMatchMode, PdfCategoryNode, PdfExportRow, PdfExtractPage, PdfExtractProduct } from '#shared/types/pdf'
import { buildCategoryPathMap, matchCategoryBySystem, resolveCategoryPath } from '#shared/utils/pdfCategoryTree'

const ROOT_SLUG = 'noi-that-the-one'
const DEFAULT_CATEGORIES = 'noi-that-the-one,noi-that-van-phong,ghe-van-phong,ghe-lanh-dao-cao-cap'

export function makeVariantSuffix(optVal: string): string {
  if (!optVal) return ''

  const lower = optVal.toLowerCase().trim()
  if (lower === 'da công nghiệp' || lower === 'da cn') return 'da-cn'
  if (lower === 'da thật' || lower === 'da') return 'da-that'
  if (lower === 'pvc') return 'pvc'

  return lower
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
}

function digits(value: string): string {
  return String(value ?? '').replace(/\D/g, '')
}

function minPrice(product: PdfExtractProduct): string {
  const prices = product.variants
    .map(variant => Number.parseInt(digits(variant.price), 10))
    .filter(price => Number.isFinite(price) && price > 0)

  return prices.length > 0 ? String(Math.min(...prices)) : '0'
}

export function categoryTags(categories: string): string {
  const parts = categories
    .split(',')
    .map(part => part.trim())
    .filter(part => part && part !== ROOT_SLUG)

  return [...parts, 'hoa-phat', 'the-one'].join(',')
}

export interface NormalizeCategoryOptions {
  categoryMode?: PdfCategoryMatchMode
  categories?: PdfCategoryNode[]
}

export function normalizeTo25Columns(pages: PdfExtractPage[], options?: NormalizeCategoryOptions | null): PdfExportRow[] {
  const rows: PdfExportRow[] = []
  let rowNo = 1

  const tree = options?.categories?.length ? options.categories : null
  const mode: PdfCategoryMatchMode = options?.categoryMode ?? (tree ? 'auto' : 'ai')
  const pathMap = tree ? buildCategoryPathMap(tree) : null

  for (const page of pages) {
    const aiResolved = pathMap
      ? resolveCategoryPath(page.pageCategorySlugs, pathMap)
      : (page.pageCategorySlugs?.trim() || null)
    const pageCategories = aiResolved || DEFAULT_CATEGORIES

    for (const product of page.products || []) {
      let categories = pageCategories
      if (tree && pathMap) {
        const productText = `${product.title} ${product.shortDesc} ${product.description}`
        const aiProductResolved = resolveCategoryPath(product.categorySlug, pathMap)
        if (mode === 'system') {
          categories = matchCategoryBySystem(productText, product.sku, tree, pathMap) || aiProductResolved || aiResolved || DEFAULT_CATEGORIES
        } else if (mode === 'ai') {
          categories = aiProductResolved || aiResolved || DEFAULT_CATEGORIES
        } else {
          // Hybrid ('auto'): trust AI's per-product / page classification first,
          // and fall back to system keyword/SKU matching if AI returned nothing valid.
          categories = aiProductResolved || matchCategoryBySystem(productText, product.sku, tree, pathMap) || aiResolved || DEFAULT_CATEGORIES
        }
      }
      const baseTags = categoryTags(categories)
      const basePrice = minPrice(product)
      const tags = product.isNewProduct ? `${baseTags},san-pham-moi` : baseTags
      const sku = product.sku.trim()
      const keywords = `${tags},${sku.toLowerCase()}`
      const attributes = `Rộng: ${product.width}mm | Sâu: ${product.depth}mm | Cao: ${product.height}mm`

      const variants = product.variants.length > 0
        ? product.variants
        : [{ opt1Val: '', price: '' }]
      const isVariable = Boolean(product.opt1Name && variants.length > 1)

      for (const variant of variants) {
        rows.push({
          no: String(rowNo++),
          sku,
          title: product.title.trim(),
          barcode: '',
          basePrice,
          salePrice: basePrice,
          prices: '',
          stock: '0',
          manageStock: '1',
          categories,
          tags,
          keywords,
          status: 'published',
          description: product.description.trim(),
          shortDesc: product.shortDesc.trim(),
          attributes,
          opt1_name: isVariable ? product.opt1Name : '',
          opt1_val: isVariable ? variant.opt1Val : '',
          opt2_name: '',
          opt2_val: '',
          v_sku: isVariable ? `${sku.toLowerCase()}-${makeVariantSuffix(variant.opt1Val)}` : '',
          v_barcode: '',
          v_basePrice: isVariable ? digits(variant.price) : '',
          v_salePrice: '',
          v_stock: isVariable ? '0' : ''
        })
      }
    }
  }

  return rows
}
