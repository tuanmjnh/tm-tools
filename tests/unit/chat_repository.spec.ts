/**
 * Backend selection for /chat. A hosted runtime (Vercel/Lambda) has no writable
 * disk and cannot load a native sqlite binding, so the repository must become
 * Mongo there; desktop keeps SQLite so history survives offline. This spec pins
 * the selection rule and the async wrapper contract.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const source = readFileSync(join(root, 'server/modules/chat/repository.ts'), 'utf8')

// The runtime signal is the same one the document engine uses.
assert.match(source, /detectRuntime\(\)/, 'repository must key off detectRuntime()')
assert.match(source, /'vercel'/, 'repository must special-case the vercel runtime')
assert.match(source, /createMongoChatStore/, 'repository must fall back to the Mongo store')
assert.match(source, /getChatStore/, 'repository must keep the SQLite store for desktop')

// A single async accessor keeps every route backend-agnostic.
assert.match(source, /export (async )?function getChatRepository/, 'repository must expose getChatRepository')

// Mobile/desktop copy must not claim SQLite on the web build.
const en = JSON.parse(readFileSync(join(root, 'i18n/locales/en.json'), 'utf8')) as { chat: Record<string, string> }
const vi = JSON.parse(readFileSync(join(root, 'i18n/locales/vi.json'), 'utf8')) as { chat: Record<string, string> }
assert.ok(!/sqlite/i.test(en.chat.storageBadge ?? ''), 'en storage badge must not name a single backend')
assert.ok(!/sqlite/i.test(vi.chat.storageBadge ?? ''), 'vi storage badge must not name a single backend')
assert.ok((en.chat.storageBadge ?? '').length > 0, 'en storage badge must exist')
assert.ok((vi.chat.storageBadge ?? '').length > 0, 'vi storage badge must exist')

console.log('chat_repository.spec: all assertions passed')
