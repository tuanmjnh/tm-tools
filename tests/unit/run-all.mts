/**
 * Unit spec runner — every tests/unit/*.spec.ts in one command
 * (`pnpm test:unit`). Each spec is a standalone script (some install
 * global shims and import module-level singletons, so one process per spec
 * keeps them independent), and the runner fails on the first non-zero exit.
 */
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const unit = join(here)

const specs = readdirSync(unit)
  .filter(f => f.endsWith('.spec.ts'))
  .sort()

let failed = 0
for (const spec of specs) {
  const t0 = Date.now()
  const res = spawnSync(
    process.execPath,
    [join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), '--tsconfig', join(root, 'tsconfig.test.json'), join(unit, spec)],
    { cwd: root, encoding: 'utf8' }
  )
  const ok = res.status === 0
  if (!ok) failed++
  const tail = (res.stdout || '').trim().split('\n').filter(l => l.includes('passed') || l.includes('FAILED')).at(-1) || ''
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${spec}  (${Date.now() - t0}ms)  ${tail}`)
  if (!ok) console.log((res.stdout || '') + (res.stderr || ''))
}

console.log(`\n${specs.length - failed}/${specs.length} specs passed`)
process.exit(failed === 0 ? 0 : 1)
