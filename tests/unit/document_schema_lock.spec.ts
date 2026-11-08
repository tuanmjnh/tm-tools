import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Postgres repository and the migration are written by hand in two places.
 * These assertions read both and fail the moment a column, table or status
 * vocabulary drifts, which a connection-less test environment cannot catch any
 * other way.
 */

const root = join(import.meta.dirname, '..', '..')
const migration = readFileSync(join(root, 'migrations', 'postgres', '0001_document_studio.sql'), 'utf8')
const repository = readFileSync(join(root, 'server', 'modules', 'document', 'postgres-jobs.ts'), 'utf8')
const shared = readFileSync(join(root, 'shared', 'types', 'document', 'index.ts'), 'utf8')

function tableBody(name: string): string {
  const match = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\(([\\s\\S]*?)\\n\\);`))
  assert.ok(match, `migration must create ${name}`)
  return match[1]!
}

function columnsOf(name: string): Set<string> {
  const columns = new Set<string>()
  for (const line of tableBody(name).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('--') || /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/.test(trimmed)) continue
    const column = trimmed.match(/^([a-z_][a-z0-9_]*)\s+/)?.[1]
    if (column) columns.add(column)
  }
  return columns
}

/** Column list of every `INSERT INTO <table> ( … )` in the repository. */
function insertedColumns(table: string): Set<string> {
  const columns = new Set<string>()
  const pattern = new RegExp(`INSERT INTO ${table} \\(([\\s\\S]*?)\\)\\s*VALUES`, 'g')
  for (const match of repository.matchAll(pattern)) {
    for (const column of match[1]!.replace(/\s+/g, ' ').split(',')) {
      const name = column.trim()
      if (name) columns.add(name)
    }
  }
  return columns
}

/** `column = value` left-hand sides of every `UPDATE <table> SET … WHERE`. */
function updatedColumns(table: string): Set<string> {
  const columns = new Set<string>()
  const pattern = new RegExp(`UPDATE ${table} SET([\\s\\S]*?)WHERE`, 'g')
  for (const match of repository.matchAll(pattern)) {
    for (const line of match[1]!.split('\n')) {
      const name = line.trim().match(/^([a-z_][a-z0-9_]*)\s*=/)?.[1]
      if (name) columns.add(name)
    }
  }
  return columns
}

function checkValues(table: string, column: string): string[] {
  const match = tableBody(table).match(new RegExp(`${column} IN \\(([^)]*)\\)`))
  assert.ok(match, `${table}.${column} must carry a CHECK list`)
  return [...match[1]!.matchAll(/'([^']+)'/g)].map(entry => entry[1]!)
}

function sharedList(name: string): string[] {
  const match = shared.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`))
  assert.ok(match, `${name} must stay a const tuple so its values can be asserted`)
  return [...match[1]!.matchAll(/'([^']+)'/g)].map(entry => entry[1]!)
}

describe('postgres schema ↔ repository lock', () => {
  it('declares every column the job INSERT writes', () => {
    const declared = columnsOf('document_jobs')
    for (const column of insertedColumns('document_jobs')) {
      assert.ok(declared.has(column), `document_jobs is missing inserted column ${column}`)
    }
  })

  it('declares every column the job UPDATE writes', () => {
    const declared = columnsOf('document_jobs')
    for (const column of updatedColumns('document_jobs')) {
      assert.ok(declared.has(column), `document_jobs is missing updated column ${column}`)
    }
  })

  it('declares every column the input and artifact writes touch', () => {
    const inputColumns = columnsOf('document_job_inputs')
    for (const column of insertedColumns('document_job_inputs')) {
      assert.ok(inputColumns.has(column), `document_job_inputs is missing column ${column}`)
    }

    const artifactColumns = columnsOf('document_artifacts')
    for (const column of insertedColumns('document_artifacts')) {
      assert.ok(artifactColumns.has(column), `document_artifacts is missing column ${column}`)
    }
    for (const column of updatedColumns('document_artifacts')) {
      assert.ok(artifactColumns.has(column), `document_artifacts is missing updated column ${column}`)
    }
  })

  it('keeps the input status vocabulary identical on both sides', () => {
    assert.deepEqual(sharedList('DOCUMENT_INPUT_STATUSES'), checkValues('document_job_inputs', 'upload_status'))
  })

  it('keeps the artifact status vocabulary identical on both sides', () => {
    assert.deepEqual(sharedList('DOCUMENT_ARTIFACT_STATUSES'), checkValues('document_artifacts', 'artifact_status'))
  })

  it('keeps the job status vocabulary identical on both sides', () => {
    assert.deepEqual(sharedList('DOCUMENT_JOB_STATUSES'), checkValues('document_jobs', 'status'))
  })

  it('checks the runtime vocabulary against the shared type', () => {
    assert.deepEqual(sharedList('DOCUMENT_RUNTIMES'), checkValues('document_jobs', 'runtime'))
  })

  it('backs the idempotency insert with a real partial unique index', () => {
    assert.ok(repository.includes('ON CONFLICT (owner_id, idempotency_key)'), 'repository must rely on the unique index')
    assert.ok(
      /CREATE UNIQUE INDEX IF NOT EXISTS document_jobs_owner_idempotency_idx\s+ON document_jobs \(owner_id, idempotency_key\)\s+WHERE idempotency_key IS NOT NULL/.test(migration),
      'migration must keep the partial unique index the ON CONFLICT targets'
    )
  })

  it('isolates user data behind ON DELETE CASCADE', () => {
    for (const table of ['document_job_inputs', 'document_artifacts']) {
      assert.ok(
        tableBody(table).includes('REFERENCES document_jobs (id) ON DELETE CASCADE'),
        `${table} must cascade from document_jobs`
      )
    }
  })
})
