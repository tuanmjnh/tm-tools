// Nitro emits `.output/server/node_modules/<pkg>` as symlinks into
// `.nitro/<pkg>@<ver>`. @electron/asar stores those as root-relative `link`
// records that Electron's archive reader cannot resolve, so the packaged
// server throws `ENOENT ... not found in app.asar` for every route that
// imports an executor. Run this after `nuxt build` and before
// electron-builder so the shipped tree contains real directories only.
'use strict'

const fs = require('fs')
const path = require('path')

function findLinks(root) {
  const found = []
  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      let stat
      try {
        stat = fs.lstatSync(full)
      } catch {
        continue
      }
      if (stat.isSymbolicLink()) found.push(full)
      else if (stat.isDirectory()) walk(full)
    }
  }
  walk(root)
  return found
}

function isInside(root, target) {
  const rel = path.relative(root, target)
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function dereferenceLinks(root) {
  const links = findLinks(root)
  const targets = new Set()
  let replaced = 0

  for (const link of links) {
    let real
    try {
      real = fs.realpathSync(link)
    } catch {
      fs.rmSync(link, { force: true })
      continue
    }
    if (isInside(root, real)) targets.add(real)
    const stat = fs.lstatSync(real)
    fs.rmSync(link, { force: true })
    if (stat.isDirectory()) {
      fs.cpSync(real, link, { recursive: true, dereference: true })
    } else {
      fs.copyFileSync(real, link)
    }
    replaced++
  }

  // The `.nitro` originals are only reachable through the links just
  // replaced; keeping them would duplicate every package in the installer.
  let removed = 0
  for (const target of targets) {
    if (!fs.existsSync(target)) continue
    fs.rmSync(target, { recursive: true, force: true })
    removed++
  }

  return { replaced, removed }
}

module.exports = { dereferenceLinks, findLinks }

if (require.main === module) {
  const root = path.resolve(process.argv[2] || '.output')
  const result = dereferenceLinks(root)
  console.log(`[dereference] ${root}: ${result.replaced} links replaced, ${result.removed} targets removed`)
  const remaining = findLinks(root).length
  if (remaining) {
    console.error(`[dereference] ${remaining} symlinks remain — the archive would be unreadable`)
    process.exit(1)
  }
}
