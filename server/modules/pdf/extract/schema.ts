const variantSchema = {
  type: 'OBJECT',
  properties: {
    opt1Val: {
      type: 'STRING',
      description: 'Variant value such as "Da thật", "Da công nghiệp", "PVC", "Da màu đen". Empty string for single-price products.'
    },
    price: {
      type: 'STRING',
      description: 'Selling price as an integer with no thousand separators, e.g. "5160000".'
    }
  },
  required: ['opt1Val', 'price']
}

const productSchema = {
  type: 'OBJECT',
  properties: {
    sku: {
      type: 'STRING',
      description: 'Uppercase product code (TQ01, SG350B, HR120SC7) without any "(sản phẩm mới)" suffix.'
    },
    title: {
      type: 'STRING',
      description: 'Full product name combining the category label and the SKU, e.g. "Ghế lãnh đạo cao cấp TQ01".'
    },
    isNewProduct: {
      type: 'BOOLEAN',
      description: 'True when the source page marks the product as "(sản phẩm mới)".'
    },
    width: {
      type: 'STRING',
      description: 'Width in millimetres, digits or a range such as "1155-1210".'
    },
    depth: {
      type: 'STRING',
      description: 'Depth in millimetres, digits or a range such as "780-1140".'
    },
    height: {
      type: 'STRING',
      description: 'Height in millimetres, digits or a range such as "1155-1210".'
    },
    description: {
      type: 'STRING',
      description: 'Detailed description with OCR typos corrected and the Rộng x Sâu x Cao sentence appended at the end.'
    },
    shortDesc: {
      type: 'STRING',
      description: 'One-sentence summary stating product name, material and key feature.'
    },
    opt1Name: {
      type: 'STRING',
      description: 'Variant attribute name ("Chất liệu", "Màu sắc", "Kích thước"). Empty string when the product has one price.'
    },
    variants: {
      type: 'ARRAY',
      description: 'Every price tier of the product. A single-price product still has one entry with opt1Val "".',
      items: variantSchema
    }
  },
  required: [
    'sku',
    'title',
    'isNewProduct',
    'width',
    'depth',
    'height',
    'description',
    'shortDesc',
    'opt1Name',
    'variants'
  ]
}

export const productExtractionSchema = {
  type: 'OBJECT',
  properties: {
    pageCategorySlugs: {
      type: 'STRING',
      description: 'Comma-separated category slug path from root to leaf, e.g. "noi-that-the-one,noi-that-van-phong,ghe-van-phong,ghe-lanh-dao-cao-cap".'
    },
    products: {
      type: 'ARRAY',
      description: 'Every product code printed on this PDF page.',
      items: productSchema
    }
  },
  required: ['pageCategorySlugs', 'products']
}
