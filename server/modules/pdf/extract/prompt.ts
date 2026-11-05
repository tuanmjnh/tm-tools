import { productExtractionSchema } from './schema'
import type { PdfExtractInstructions } from './presets'

export const PDF_EXTRACT_SYSTEM_PROMPT = `
Bạn là chuyên gia bóc tách và chuẩn hóa dữ liệu Bảng giá bán buôn Nội thất Hòa Phát (Nội thất The One).
Nhiệm vụ của bạn là đọc trang PDF bảng giá được cung cấp và trích xuất CHÍNH XÁC 100% tất cả sản phẩm có trên trang.

QUY TẮC BẮT BUỘC:
1. KHÔNG BỎ SÓT SẢN PHẨM: Chú ý các hàng bị gộp ô (ví dụ TT 5 và 6 là TQ09 và TQ10 nằm chung 1 khung, hoặc TQ16 và TQ17 nằm chung 1 khung). Phải tách riêng từng mã SKU.
2. XỬ LÝ GIÁ & BIẾN THỂ (RẤT QUAN TRỌNG):
   - Trường hợp 1: Một mã SKU có nhiều dòng giá xếp dọc ứng với "Đệm tựa bọc da thật...", "Đệm tựa ghế bọc da CN", "Đệm tựa ghế bọc PVC" -> opt1Name = "Chất liệu", 3 variants "Da thật", "Da công nghiệp", "PVC".
   - Trường hợp 2: Bảng có các cột giá riêng biệt "Da | Da CN | PVC" (như SG350, SG608) -> opt1Name = "Chất liệu", chỉ tạo variant cho cột có giá.
   - Trường hợp 3: Giá chia theo màu sắc ("- Da màu đen", "- Da màu nâu" như TQ22, TQ23) -> opt1Name = "Màu sắc".
   - Trường hợp 4: Sản phẩm chỉ có 1 mức giá duy nhất -> sản phẩm đơn: opt1Name = "", variants có 1 phần tử với opt1Val = "".
3. XỬ LÝ KÍCH THƯỚC (mm): đọc đúng cột Rộng, Sâu, Cao. Nếu Sâu hoặc Cao có 2 con số kèm "+", "÷", "-" (độ sâu khi ngả ghế hoặc chiều cao khi nâng hạ piston) -> ghép thành khoảng "1155-1210" hoặc "780-1140".
4. SỬA LỖI CHÍNH TẢ OCR: "Bản" -> "Bàn", "Verneer" -> "Veneer", "Bàn tỉnh" -> "Bàn tĩnh", "ngà" -> "ngả", "gõ"/"gô" -> "gỗ", "đêm tựa" -> "đệm tựa".
5. DANH MỤC (pageCategorySlugs): luôn bắt đầu bằng "noi-that-the-one," và ánh xạ đúng cây danh mục chuẩn theo tiêu đề đầu trang PDF.
6. Giá phải là số nguyên, bỏ dấu chấm phân cách hàng nghìn và đơn vị tiền tệ.
7. MỌI TRƯỜNG TRONG CẤU TRÚC JSON ĐỀU BẮT BUỘC: trường không có dữ liệu trên trang phải trả về chuỗi rỗng "", không được bỏ qua khóa.
`.trim()

type SchemaNode = {
  type?: string
  description?: string
  properties?: Record<string, SchemaNode>
  items?: SchemaNode
  required?: string[]
}

/**
 * The relay sends plain text, so Gemini's `responseSchema` is unavailable.
 * Rendering the schema into the prompt keeps every field (and its meaning) in
 * front of the model, which is what stops half-filled rows.
 */
function renderSchema(node: SchemaNode, indent: number): string {
  const pad = '  '.repeat(indent)
  const comment = (description?: string) => (description ? ` // ${description}` : '')

  if (node.type === 'OBJECT' && node.properties) {
    const lines = Object.entries(node.properties).map(([key, child]) => {
      const optional = node.required?.includes(key) ? '' : '?'
      return `${pad}  "${key}"${optional}: ${renderSchema(child, indent + 1)}${comment(child.description)}`
    })
    return `{\n${lines.join('\n')}\n${pad}}`
  }

  if (node.type === 'ARRAY') {
    return `[${node.items ? `\n${pad}  ${renderSchema(node.items, indent + 1)}${comment(node.items.description)}\n${pad}` : ''}]`
  }

  return node.type === 'BOOLEAN' ? 'true | false' : node.type === 'NUMBER' ? 'number' : '"string"'
}

/** Schema body appended to the system prompt for relay-based extraction. */
export function buildSchemaInstructions(): string {
  return `CẤU TRÚC JSON ĐẦU RA BẮT BUỘC (đúng tên khóa, đúng kiểu dữ liệu):\n${renderSchema(productExtractionSchema as SchemaNode, 0)}`
}

export function buildPagePrompt(fileName: string): string {
  return `Hãy trích xuất toàn bộ sản phẩm từ trang bảng giá PDF (${fileName}) này theo đúng cấu trúc JSON đã mô tả.`
}

/**
 * Word documents are read as text, not pictures: the page prompt has to explain
 * the flattened table convention (` | ` between cells) so the model rebuilds
 * rows correctly instead of treating a row as one long sentence.
 */
export function buildTextChunkPrompt(fileName: string, chunkId: string, text: string): string {
  return [
    `Dưới đây là nội dung văn bản của tài liệu Word "${fileName}" (phần ${chunkId}).`,
    'Bảng đã được làm phẳng: mỗi dòng là một hàng, các ô ngăn cách bằng " | ", dòng đầu của bảng là tiêu đề cột.',
    'Hãy dựng lại từng sản phẩm từ các hàng đó và trả về đúng cấu trúc JSON đã mô tả.',
    'Nếu phần này không chứa sản phẩm nào (chỉ là tiêu đề, ghi chú, điều khoản) thì trả về products rỗng.',
    '',
    '--- NỘI DUNG ---',
    text
  ].join('\n')
}

/**
 * System prompt for one run: the fixed rules, the JSON shape, then whatever the
 * operator typed in the preset. A preset can therefore describe a completely
 * different catalogue layout without touching code.
 */
export function buildSystemPrompt(instructions?: PdfExtractInstructions | null): string {
  const parts = [PDF_EXTRACT_SYSTEM_PROMPT, buildSchemaInstructions()]

  const description = instructions?.description?.trim()
  if (description) {
    parts.push(`HƯỚNG DẪN BỔ SUNG TỪ NGƯỜI DÙNG (ưu tiên cao nhất khi mâu thuẫn với quy tắc chung):\n${description}`)
  }

  const sample = instructions?.sample?.trim()
  if (sample) {
    parts.push(`MẪU THAM KHẢO — bắt chước cách đặt tên, cách chia biến thể và văn phong mô tả; KHÔNG chép giá trị, mã hay sản phẩm có trong mẫu:\n${sample}`)
  }

  return parts.join('\n\n')
}
