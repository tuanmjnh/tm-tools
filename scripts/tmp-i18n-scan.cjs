// One-shot R146 i18n coverage scan — delete after use.
const fs = require('fs')
const path = require('path')

function collect(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collect(p, out)
    else if (/\.(vue|ts)$/.test(e.name)) out.push(p)
  }
  return out
}

const pages = process.argv.slice(2)
const files = []
for (const rel of pages) {
  const p = path.join(__dirname, '..', rel)
  if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p)
  else if (fs.existsSync(p)) files.push(...collect(p))
}

const keys = new Set()
const perFile = {}
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const re = /\bt\(\s*['"`]([^'"`]+)['"`]|v-(?:if|else-if|show|for|bind|model|on|slot|text|html|class|style)=['"][^'"]*\$t\(\s*['"`]([^'"`]+)/g
  const local = new Set()
  let m
  while ((m = re.exec(src)) !== null) {
    const k = (m[1] || m[2]).trim()
    if (k.includes('.') || /^[a-z_]+$/.test(k)) {
      keys.add(k)
      local.add(k)
    }
  }
  perFile[f] = [...local]
}

const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n/locales/en.json'), 'utf8'))
const vi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n/locales/vi.json'), 'utf8'))
const get = (obj, p) => p.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj)

// Also pick up keys referenced from components used by these pages? Keep it simple: direct keys only.
const missingEn = []
const missingVi = []
for (const k of [...keys].sort()) {
  if (get(en, k) === undefined) missingEn.push(k)
  if (get(vi, k) === undefined) missingVi.push(k)
}
console.log('files-scanned:', files.length)
console.log('unique-keys:', keys.size)
console.log('MISSING-EN (' + missingEn.length + '):')
missingEn.forEach(k => console.log('  EN-MISSING', k))
console.log('MISSING-VI (' + missingVi.length + '):')
missingVi.forEach(k => console.log('  VI-MISSING', k))

// Per-file listing so the fixer knows which keys each page needs
console.log('PER-FILE:')
for (const [f, ks] of Object.entries(perFile)) {
  console.log('  ' + f.replace(/\\/g, '/'), '->', ks.length, 'keys')
}
