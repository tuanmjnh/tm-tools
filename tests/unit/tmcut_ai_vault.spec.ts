/**
 * R140 specs — AI key vault dashboard contract (docs §204).
 * The page itself is Electron-only; these specs pin the CONTRACTS that
 * make it honest: the IPC channel exists at every layer (main registers,
 * preload exposes, types describe), the handler returns COUNTS ONLY
 * (never a value), and the page keeps its read-only promise (no
 * set-config anywhere — editing stays in the AI connect panel).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('TMCut AI key vault — channel contract (R140)', () => {
  const main = read('electron/main.cjs')
  const preload = read('electron/preload.cjs')

  it('the IPC channel is registered by main and exposed by preload', () => {
    assert.ok(main.includes('ipcMain.handle(\'ai-key-status\''), 'main must register ai-key-status')
    assert.ok(preload.includes('aiKeyStatus: () => ipcRenderer.invoke(\'ai-key-status\')'), 'preload must expose aiKeyStatus()')
  })

  it('the handler counts secret slots through the SAME closed regex (no ad-hoc key lists)', () => {
    const handler = main.slice(main.indexOf('ipcMain.handle(\'ai-key-status\''))
    const body = handler.slice(0, handler.indexOf('ipcMain.handle(', 10))
    assert.ok(body.includes('SECRET_SLOT_RE'), 'counts must flow through SECRET_SLOT_RE')
    assert.ok(body.includes('isEncryptionAvailable()'), 'availability must be reported')
    // Counts only: the handler must not stringify or return stored values.
    assert.ok(!/--return\s*cfg|return cfg\b|JSON\.stringify\(cfg\)/.test(body), 'handler must never return config values')
  })

  it('the trusted-sender gate covers the handler (it is registered like every privileged one)', () => {
    const handler = main.slice(main.indexOf('ipcMain.handle(\'ai-key-status\''))
    const body = handler.slice(0, 400)
    assert.ok(body.includes('isTrustedSender(event)'), 'ai-key-status must check the sender')
  })
})

describe('TMCut AI key vault — page contract (R140)', () => {
  const page = read('app/pages/system/ai-keys.vue')

  it('stays READ-ONLY: the page never writes config', () => {
    assert.ok(!page.includes('setConfig'), 'vault page must not write config (single writer = AI connect panel)')
  })

  it('reads the vault through the typed IPC call only', () => {
    assert.ok(page.includes('window.electronAPI?.aiKeyStatus?.()'), 'page must fetch vault status via preload')
  })

  it('tests go through the task-aware listModels (saved-key path), never a typed key', () => {
    assert.ok(page.includes('listModels(task === \'global\' ? {} : { task })'), 'tests must use saved-slot resolution')
    assert.ok(!page.includes('AI_API_KEY'), 'the page must not touch raw key slots')
    assert.ok(!/apiKey\s*[:=]/.test(page), 'the page holds no field that could carry a key')
  })

  it('the nav route exists for every system-group sibling pattern (hub seed)', () => {
    // Cross-repo check: the sibling checkout exists on dev machines;
    // on an isolated tm-tools clone the seed lives in tm-hub and this
    // spec skips (contract is re-checked where the seed lives).
    let seed: string
    try {
      seed = readFileSync(join(ROOT, '..', 'tm-hub', 'scripts', 'seed', 'data.ts'), 'utf8')
    } catch {
      return
    }
    assert.ok(seed.includes('path: \'/system/ai-keys\''), 'hub seed must register the route')
    assert.ok(seed.includes('label: \'nav.ai_keys\''), 'route label key must match the i18n patch')
  })
})
