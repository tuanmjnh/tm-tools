import postgres from 'postgres'
import { config } from '#server/config'
import { DocumentError } from './operations'

export type DocumentSql = ReturnType<typeof postgres>

/**
 * One pooled client per process. `prepare: false` is required for Neon's
 * transaction-mode pooler, which cannot hold server-side prepared statements
 * across connections.
 */
let client: DocumentSql | null = null

export function documentDatabase(): DocumentSql {
  const url = config.document.databaseUrl.trim()
  if (!url) throw new DocumentError('DOCUMENT_DATABASE_NOT_CONFIGURED')
  client ??= postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false
  })
  return client
}

export function isDatabaseConfigured(): boolean {
  return Boolean(config.document.databaseUrl.trim())
}

/** Health check for the deployment checklist: reports a version, never a DSN. */
export async function databaseHealth(): Promise<{ ok: boolean, version?: string }> {
  try {
    const sql = documentDatabase()
    const [row] = await sql<{ version: string }[]>`SELECT version() AS version`
    return { ok: true, version: row?.version?.split(' ').slice(0, 2).join(' ') }
  } catch {
    return { ok: false }
  }
}
