import { existsSync, readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'
import type { PDFDocument, PDFFont } from 'pdf-lib'
import { config } from '#server/config'

/**
 * Word→PDF draws text with pdf-lib, whose four built-in fonts are WinAnsi and
 * therefore cannot show Vietnamese. A real TrueType font has to be embedded, so
 * we look for one the host already ships instead of vendoring a 500 KB binary.
 */
const PLATFORM_CANDIDATES: Record<string, string[]> = {
  win32: [
    'C:/Windows/Fonts/segoeui.ttf',
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/tahoma.ttf',
    'C:/Windows/Fonts/calibri.ttf',
    'C:/Windows/Fonts/times.ttf'
  ],
  darwin: [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/Library/Fonts/Arial.ttf',
    '/System/Library/Fonts/Supplemental/Times New Roman.ttf'
  ],
  linux: [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'
  ]
}

/** Vietnamese glyph used to reject a font that renders tofu. */
const PROBE_TEXT = 'ế ộ ữ Đ'

let cachedPath: string | null = null
let cachedBytes: Buffer | null = null

function candidates(): string[] {
  const configured = config.pdf.fontPath.trim()
  const platform = PLATFORM_CANDIDATES[process.platform] ?? PLATFORM_CANDIDATES.linux ?? []
  return configured ? [configured, ...platform] : platform
}

export function resolveFont(): { path: string, bytes: Buffer } {
  if (cachedPath && cachedBytes) return { path: cachedPath, bytes: cachedBytes }

  for (const path of candidates()) {
    if (!path || !existsSync(path)) continue
    try {
      const bytes = readFileSync(path)
      cachedPath = path
      cachedBytes = bytes
      return { path, bytes }
    } catch {
      // Unreadable font (locked by another process, permissions) — keep looking.
    }
  }

  throw new Error('PDF_FONT_MISSING')
}

/**
 * Embeds the host font once per document. `subset` keeps the output small;
 * fontkit is required for both embedding and subsetting any custom font.
 */
export async function embedBodyFont(doc: PDFDocument): Promise<PDFFont> {
  doc.registerFontkit(fontkit)
  const { bytes } = resolveFont()

  const font = await doc.embedFont(bytes, { subset: true })
  // widthOfTextAtSize throws when the font has no glyph for the character, so
  // this doubles as a coverage check before we produce a page of tofu.
  font.widthOfTextAtSize(PROBE_TEXT, 10)
  return font
}
