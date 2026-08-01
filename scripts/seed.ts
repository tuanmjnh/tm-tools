import { config } from '../server/config/index'
import { getDatabase } from '../server/modules/database/index'

async function main() {
  const reset = process.argv.includes('--reset')

  console.log(`[Seed] Provider: ${config.auth.provider}`)
  console.log(`[Seed] Mode: ${reset ? 'RESET (wipe + reseed)' : 'idempotent (create missing)'}`)

  try {
    const db = await getDatabase()
    await db.seed({ reset })
    console.log('[Seed] Done')
    process.exit(0)
  } catch (err: any) {
    console.error('[Seed] Failed:', err)
    process.exit(1)
  }
}

main()
