import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { PDF_FILE_AREAS, PDF_OUTPUT_FOLDERS } from '../../shared/types/pdf'
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
  outputFolder,
  outputMapping,
  workspaceReport
} from '../../server/modules/pdf/workspace'

describe('area descriptors', () => {
  it('declares exactly the input and output roots', () => {
    assert.deepEqual([...PDF_FILE_AREAS], ['input', 'output'])
    const areas = areaDescriptors().map(descriptor => descriptor.area)
    assert.deepEqual(areas, ['input', 'output'])
  })

  it('lets both roots manage their own subfolders while the root stays fixed', () => {
    for (const area of PDF_FILE_AREAS) {
      assert.equal(areaDescriptor(area).writableFolders, true, `${area} must allow subfolder writes`)
      assert.equal(areaDescriptor(area).systemRoot, true, `${area} root must be fixed`)
      assert.doesNotThrow(() => assertFolderWritable(area))
    }
  })

  it('allows file writes in both roots', () => {
    for (const area of PDF_FILE_AREAS) {
      assert.equal(areaDescriptor(area).writableFiles, true, `${area} must allow file writes`)
      assert.doesNotThrow(() => assertFileWritable(area))
    }
  })

  it('rejects an unknown area for files and folders', () => {
    assert.throws(() => areaDescriptor('nope' as never), /PDF_FILE_NOT_FOUND/)
    assert.throws(() => assertFileWritable('nope' as never), /PDF_FILE_NOT_FOUND/)
    assert.throws(() => assertFolderWritable('nope' as never), /PDF_FILE_NOT_FOUND/)
  })
})

describe('area type source', () => {
  it('re-exports the shared area list instead of redeclaring it', () => {
    assert.equal(SERVER_FILE_AREAS, PDF_FILE_AREAS)
  })
})

describe('accept predicates', () => {
  it('accepts any file in either root', () => {
    const samples = ['price-list.pdf', 'page.png', 'sheet.xlsx', 'notes.docx', 'data.json', 'feed.xml']
    for (const area of PDF_FILE_AREAS) {
      const accept = areaAcceptPredicate(area)
      for (const name of samples) {
        assert.equal(accept(name), true, `${area} must accept ${name}`)
      }
    }
  })

  it('rejects an unknown area', () => {
    assert.throws(() => areaAcceptPredicate('bogus' as never), /PDF_FILE_NOT_FOUND/)
  })
})

describe('output mapping', () => {
  it('points every tool at a valid output subfolder', () => {
    for (const [tool, folder] of Object.entries(outputMapping)) {
      assert.ok((PDF_OUTPUT_FOLDERS as readonly string[]).includes(folder), `${tool} maps to unknown folder ${folder}`)
      assert.equal(outputArea(), 'output', `${tool} must write to output`)
      assert.equal(outputFolder(tool as keyof typeof outputMapping), folder)
    }
  })

  it('keeps pages and images in separate folders', () => {
    assert.equal(outputMapping.split, 'split')
    assert.equal(outputMapping.rasterize, 'images')
  })

  it('resolves a tool directory under the output root', () => {
    assert.equal(outputDir('split'), join(AREA_DIRS.output, 'split'))
    assert.equal(outputDir('rasterize'), join(AREA_DIRS.output, 'images'))
    assert.equal(outputDir('merge'), join(AREA_DIRS.output, 'merged'))
    assert.equal(outputDir('extract'), join(AREA_DIRS.output, 'products'))
    assert.equal(outputDir('export'), join(AREA_DIRS.output, 'office'))
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
  it('reports both roots with counts and the mapping', () => {
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
