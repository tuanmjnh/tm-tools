import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PDF_FILE_AREAS } from '../../shared/types/pdf'
import { AREA_DIRS, PDF_FILE_AREAS as SERVER_FILE_AREAS } from '../../server/modules/pdf/inspect'
import {
  areaAcceptPredicate,
  areaDescriptor,
  areaDescriptors,
  areaDir,
  assertFileWritable,
  assertFolderWritable,
  outputArea,
  outputDir,
  outputMapping,
  workspaceReport
} from '../../server/modules/pdf/workspace'

describe('area descriptors', () => {
  it('covers every declared area exactly once', () => {
    const areas = areaDescriptors().map(descriptor => descriptor.area)
    assert.deepEqual(areas.slice().sort(), [...PDF_FILE_AREAS].sort())
    assert.equal(new Set(areas).size, areas.length)
  })

  it('lets the source folder own its subfolder structure', () => {
    assert.equal(areaDescriptor('sources').writableFolders, true)
    assert.equal(areaDescriptor('inputs').writableFolders, true)
    assert.doesNotThrow(() => assertFolderWritable('sources'))
  })

  it('lets every generated area manage its own subfolders', () => {
    const managed = ['split', 'images', 'merged', 'products', 'office'] as const
    for (const area of managed) {
      assert.equal(areaDescriptor(area).writableFolders, true, `${area} must allow subfolder writes`)
      assert.equal(areaDescriptor(area).systemRoot, true, `${area} root must be fixed`)
      assert.doesNotThrow(() => assertFolderWritable(area))
    }
  })

  it('keeps the legacy word folder read-only', () => {
    assert.equal(areaDescriptor('word').writableFiles, false)
    assert.equal(areaDescriptor('word').writableFolders, false)
    assert.throws(() => assertFolderWritable('word'), /PDF_FOLDER_IMMUTABLE/)
    assert.throws(() => assertFileWritable('word'), /PDF_FILE_IMMUTABLE/)
  })

  it('allows file writes in every writable area', () => {
    const writable = ['sources', 'inputs', 'split', 'images', 'merged', 'products', 'office'] as const
    for (const area of writable) {
      assert.equal(areaDescriptor(area).writableFiles, true, `${area} must allow file writes`)
      assert.doesNotThrow(() => assertFileWritable(area))
    }
  })

  it('rejects an unknown area', () => {
    assert.throws(() => areaDescriptor('nope' as never), /PDF_FILE_NOT_FOUND/)
    assert.throws(() => assertFileWritable('nope' as never), /PDF_FILE_NOT_FOUND/)
  })
})

describe('area type source', () => {
  it('re-exports the shared area list instead of redeclaring it', () => {
    assert.equal(SERVER_FILE_AREAS, PDF_FILE_AREAS)
  })
})

describe('accept predicates', () => {
  it('accepts only PDFs in the sources area', () => {
    const accept = areaAcceptPredicate('sources')
    assert.equal(accept('price-list.pdf'), true)
    assert.equal(accept('price-list.docx'), false)
  })

  it('accepts mixed inputs in the inputs area', () => {
    const accept = areaAcceptPredicate('inputs')
    assert.equal(accept('sheet.xlsx'), true)
    assert.equal(accept('page.png'), true)
    assert.equal(accept('page.pdf'), false)
  })

  it('accepts anything inside generated output areas', () => {
    assert.equal(areaAcceptPredicate('split')('page_0001.pdf'), true)
    assert.equal(areaAcceptPredicate('images')('page_0001.png'), true)
  })
})

describe('output mapping', () => {
  it('points every tool at a valid, non-source area', () => {
    for (const [tool, area] of Object.entries(outputMapping)) {
      assert.ok(PDF_FILE_AREAS.includes(area), `${tool} maps to unknown area ${area}`)
      assert.ok(area !== 'sources' && area !== 'inputs' && area !== 'word', `${tool} must not write to ${area}`)
      assert.equal(outputArea(tool as keyof typeof outputMapping), area)
    }
  })

  it('keeps pages and images in separate folders', () => {
    assert.equal(outputMapping.split, 'split')
    assert.equal(outputMapping.rasterize, 'images')
  })

  it('resolves a tool directory from the same mapping', () => {
    for (const tool of Object.keys(outputMapping) as Array<keyof typeof outputMapping>) {
      assert.equal(outputDir(tool), AREA_DIRS[outputArea(tool)])
    }
    assert.equal(outputDir('split'), AREA_DIRS.split)
    assert.equal(outputDir('rasterize'), AREA_DIRS.images)
  })
})

describe('area dirs', () => {
  it('returns the registry directory for a known area', () => {
    for (const area of PDF_FILE_AREAS) {
      assert.equal(areaDir(area), AREA_DIRS[area])
    }
  })

  it('rejects an unknown area', () => {
    assert.throws(() => areaDir('nope' as never), /PDF_FILE_NOT_FOUND/)
  })
})

describe('workspace report', () => {
  it('reports every area with counts and the mapping', () => {
    const report = workspaceReport()
    assert.equal(report.areas.length, PDF_FILE_AREAS.length)
    assert.equal(typeof report.needsRepair, 'boolean')
    assert.deepEqual(report.outputMapping, { ...outputMapping })
    for (const area of report.areas) {
      assert.equal(typeof area.fileCount, 'number')
      assert.equal(typeof area.folderCount, 'number')
      assert.equal(typeof area.exists, 'boolean')
    }
  })
})
