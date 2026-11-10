// pdf-to-img renders through pdfjs-dist, which sets up a fake worker by
// importing `legacy/build/pdf.worker.mjs` next to `pdf.mjs` and dynamically
// requires `@napi-rs/canvas`. Nitro traces only the statically imported
// `pdf.mjs`, so the production tree lacks the worker, the font/cmap/wasm data
// and the canvas binary; every rasterize job then fails in milliseconds with
// "Setting up fake worker failed". Copy what the dev tree resolves into the
// built server before packaging.
'use strict'

const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')

const DATA_DIRS = ['standard_fonts', 'cmaps', 'wasm', 'iccs', 'image_decoders']

function projectRequire() {
  return createRequire(path.join(__dirname, '..', '..', 'package.json'))
}

function resolvePackageDir(req, specifier) {
  try {
    return path.dirname(req.resolve(`${specifier}/package.json`))
  } catch {
    // Package exports may hide package.json; walk up from the entry instead.
  }
  let dir = path.dirname(req.resolve(specifier))
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    dir = path.dirname(dir)
  }
  throw new Error(`cannot locate ${specifier}`)
}

function resolvePdfRuntime() {
  const fromProject = projectRequire()
  const pdfToImg = resolvePackageDir(fromProject, 'pdf-to-img')
  const fromPdfToImg = createRequire(path.join(pdfToImg, 'package.json'))
  const pdfjs = resolvePackageDir(fromPdfToImg, 'pdfjs-dist')

  const worker = path.join(pdfjs, 'legacy', 'build', 'pdf.worker.mjs')
  if (!fs.existsSync(worker)) throw new Error(`pdfjs worker not found: ${worker}`)

  const assets = DATA_DIRS
    .map(name => ({ name, path: path.join(pdfjs, name) }))
    .filter(asset => fs.existsSync(asset.path))

  // pdfjs imports @napi-rs/canvas lazily; the platform package holds the .node
  // binary and lives as a sibling of the JS wrapper.
  const fromPdfjs = createRequire(path.join(pdfjs, 'package.json'))
  const canvas = []
  const canvasDir = resolvePackageDir(fromPdfjs, '@napi-rs/canvas')
  canvas.push({ name: '@napi-rs/canvas', path: canvasDir })
  const canvasPkg = JSON.parse(fs.readFileSync(path.join(canvasDir, 'package.json'), 'utf8'))
  for (const name of Object.keys(canvasPkg.optionalDependencies || {})) {
    try {
      canvas.push({ name, path: resolvePackageDir(createRequire(path.join(canvasDir, 'package.json')), name) })
    } catch {
      // Only the current platform is installed; the rest are optional.
    }
  }

  return { pdfjs, worker, assets, canvas }
}

function copyPdfRuntime(outputDir) {
  const serverModules = path.join(path.resolve(outputDir), 'server', 'node_modules')
  if (!fs.existsSync(path.join(serverModules, 'pdf-to-img'))) {
    throw new Error(`output not built: ${serverModules} has no pdf-to-img`)
  }

  const runtime = resolvePdfRuntime()
  const pdfjsDest = path.join(serverModules, 'pdf-to-img', 'node_modules', 'pdfjs-dist')

  fs.mkdirSync(path.join(pdfjsDest, 'legacy', 'build'), { recursive: true })
  fs.copyFileSync(runtime.worker, path.join(pdfjsDest, 'legacy', 'build', 'pdf.worker.mjs'))
  for (const asset of runtime.assets) {
    fs.cpSync(asset.path, path.join(pdfjsDest, asset.name), { recursive: true, dereference: true })
  }

  const copiedCanvas = []
  for (const entry of runtime.canvas) {
    const dest = path.join(serverModules, entry.name)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.cpSync(entry.path, dest, { recursive: true, dereference: true })
    copiedCanvas.push(entry.name)
  }

  return { pdfjs: pdfjsDest, assets: runtime.assets.map(asset => asset.name), canvas: copiedCanvas }
}

module.exports = { copyPdfRuntime, resolvePdfRuntime }

if (require.main === module) {
  const output = path.resolve(process.argv[2] || '.output')
  const result = copyPdfRuntime(output)
  console.log(`[pdf-runtime] ${result.pdfjs}: worker + ${result.assets.join(', ')}; canvas ${result.canvas.join(', ')}`)
}
