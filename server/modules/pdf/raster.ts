import { basename, join } from 'node:path'
import { pdf } from 'pdf-to-img'
import { recordAudit } from './audit'
import { ensureDir, writeFileAtomic } from './paths'
import { pageFileName } from './document'

export async function rasterizePdf(
  inputPath: string,
  outputDir: string,
  scale: number
): Promise<{ pages: number, dir: string }> {
  ensureDir(outputDir)

  const document = await pdf(inputPath, { scale })
  let pages = 0

  for await (const image of document) {
    pages++
    writeFileAtomic(join(outputDir, `${pageFileName(pages)}.png`), image)
  }

  recordAudit({ action: 'output', area: 'images', target: basename(outputDir), tool: 'rasterize' })

  return { pages, dir: outputDir }
}
