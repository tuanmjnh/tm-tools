import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const root = mkdtempSync(join(tmpdir(), 'pdf-audit-'))
process.env.PDF_DATA_DIR = join(root, 'pdf')

const { appendAudit, readAudit, auditPath } = await import('../../server/modules/pdf/audit')

before(() => {
  writeFileSync(join(root, 'placeholder.txt'), 'x')
})

after(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('pdf audit log', () => {
  it('records one JSON line per event, oldest first', () => {
    appendAudit({ action: 'upload', area: 'sources', target: 'price.pdf' })
    appendAudit({ action: 'delete', area: 'sources', target: 'price.pdf' })

    const events = readAudit()
    assert.equal(events.length, 2)
    assert.equal(events[0]?.action, 'upload')
    assert.equal(events[1]?.action, 'delete')
  })

  it('stamps every event with an ISO timestamp and the fields given', () => {
    const [event] = readAudit()
    assert.match(String(event?.at), /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(event?.area, 'sources')
    assert.equal(event?.target, 'price.pdf')
  })

  it('keeps the newest events when the cap is reached', () => {
    for (let index = 0; index < 12; index++) {
      appendAudit({ action: 'rename', target: `file-${index}.pdf` }, { limit: 5 })
    }

    const events = readAudit()
    assert.equal(events.length, 5)
    assert.equal(events.at(-1)?.target, 'file-11.pdf')
  })

  it('never stores a payload or binary body', () => {
    appendAudit({ action: 'upload', target: 'big.pdf', bytes: 2048 })
    const raw = readFileSync(auditPath(), 'utf8')
    const last = JSON.parse(raw.trim().split('\n').at(-1)!)

    assert.equal('body' in last, false)
    assert.equal('data' in last, false)
    assert.equal(last.bytes, 2048)
  })

  it('survives a corrupt log file instead of throwing', () => {
    writeFileSync(auditPath(), 'not json\n', 'utf8')

    assert.deepEqual(readAudit(), [])
    appendAudit({ action: 'repair' })
    assert.equal(readAudit().length, 1)
  })
})
