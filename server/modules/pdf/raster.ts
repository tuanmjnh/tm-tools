import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pdf } from 'pdf-to-img'
import { ensureDir } from './paths'
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
    writeFileSync(join(outputDir, `${pageFileName(pages)}.png`), image)
  }

  return { pages, dir: outputDir }
}
