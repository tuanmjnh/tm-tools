/**
 * Static i18n key audit (R148).
 *
 * Finds every FULLY LITERAL t('a.b.c') / $t('a.b.c') key in app/ + shared/
 * and reports the ones missing from en.json or vi.json, plus dynamic
 * `tmcut.effects.<type>Desc` keys the FxLibrary looks up per registry entry.
 *
 * Dynamic keys (template literals) cannot be resolved statically, so the
 * effects sweep is done against the registry itself rather than by grep.
 *
 *   node scratch/i18n-audit.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const en = JSON.parse(readFileSync('i18n/locales/en.json', 'utf8'))
const vi = JSON.parse(readFileSync('i18n/locales/vi.json', 'utf8'))

const has = (obj, key) => key.split('.').reduce((a, p) => (a && typeof a === 'object' ? a[p] : undefined), obj) !== undefined

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(vue|ts)$/.test(e.name)) out.push(p)
  }
  return out
}

const files = [...walk('app'), ...walk('shared')]
const staticRe = /(?:\bt|\$t)\(\s*'([A-Za-z][\w]*(?:\.[\w]+)+)'/g

let scanned = 0
const missingEn = []
const missingVi = []
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(staticRe)) {
    scanned++
    const key = m[1]
    if (!has(en, key)) missingEn.push(`${key}  @ ${file}`)
    else if (!has(vi, key)) missingVi.push(`${key}  @ ${file}`)
  }
}

// The tmcut surfaces are the ones this audit is FOR; the rest is context so a
// tmcut regression never hides inside a repo-wide number.
const isTmcut = p => /(pages[\\/]tmcut|components[\\/]tmcut|utils[\\/]tmcut|composables[\\/]useTmcut|useMcpRenderer|useVideoFactory|useTmcut)/.test(p)
const split = list => ({ tmcut: list.filter(l => isTmcut(l.split('  @ ').pop())), other: list.filter(l => !isTmcut(l.split('  @ ').pop())) })

console.log(`static keys scanned: ${scanned}`)
for (const [name, list] of Object.entries(split(missingEn))) {
  console.log(`\nmissing in en.json — ${name}: ${list.length}`)
  for (const m of list) console.log('  ' + m)
}
for (const [name, list] of Object.entries(split(missingVi))) {
  console.log(`\npresent in en but missing in vi.json — ${name}: ${list.length}`)
  for (const m of list) console.log('  ' + m)
}

// --- Effects descriptions: the FxLibrary builds `tmcut.effects.<type>Desc` ---
// The registry is the source of truth for which types can be looked up.
// Relative to THIS module, not to cwd: scratch/ -> repo sibling tmcut-core.
const { EFFECT_REGISTRY } = await import('../../tmcut-core/src/index.mjs')
const types = [...new Set(Object.values(EFFECT_REGISTRY || {}).map(e => e.type || e))]
const fx = en.tmcut?.effects || {}
const noDesc = types.filter(type => {
  const key = type === 'eq-grade' ? 'eqGradeDesc' : `${type}Desc`
  return !(key in fx)
})
console.log(`\neffect types: ${types.length} | without a bespoke *Desc key: ${noDesc.length}`)
console.log('  (these fall back to their category label by design — the warning, not the label, is the bug)')
