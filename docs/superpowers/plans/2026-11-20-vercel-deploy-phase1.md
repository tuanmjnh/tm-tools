# Vercel Deployment (Phase 1: Web Gate + Document Studio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tm-tools deployable on Vercel by hiding/refusing desktop-only features on the web and letting Document Studio's pure-JS operations run against Hub storage + Supabase.

**Architecture:** One codebase, gated at runtime. The client decides web-vs-desktop from `isDesktopRuntime()` (already exists); the server from `detectRuntime()` (already returns `'vercel'`). Phase C adds a single `useCapabilities()` source, filters the sidebar, redirects desktop-only routes, and refuses the model-install route on Vercel. Phase A makes tool pages honour the catalogue's existing `available` flag and turns on the Vercel deployment.

**Tech Stack:** Nuxt 4 (`ssr:false`) + Nitro; Vue 3; Nuxt UI v4; `node:test` + source-regex specs; `@napi-rs/canvas` (desktop only); Supabase Postgres + TM Hub Storage.

**Spec:** `docs/superpowers/specs/2026-11-20-vercel-deploy-design.md`

## Global Constraints

- Do NOT change desktop (Electron) behaviour. Every gate keys off client `isDesktopRuntime()` or server `detectRuntime()`; the desktop path must remain identical.
- No new dependency. No new build flag; the runtime is already observable on both sides.
- i18n: any user-facing string goes in BOTH `i18n/locales/en.json` and `i18n/locales/vi.json`, called via `t('key')` with no inline fallback.
- Comments, logs, commit messages in English.
- Do not run `pnpm seed`, do not touch `.env`, do not deploy. Deployment is the owner's act.
- Verification order (gate ladder): `nuxt typecheck` → eslint on touched files AFTER `.nuxt/eslint.config.mjs` regen → `pnpm test`. A lint result before regen is not evidence.
- Desktop-only prefixes are exactly: `/browser-hub`, `/media/video`, `/media/download`.

---

### Task 1: `useCapabilities` composable (single source of platform)

**Files:**
- Create: `app/composables/useCapabilities.ts`
- Test: `tests/unit/app_capabilities.spec.ts`

**Interfaces:**
- Consumes: `isDesktopRuntime()` from `~/utils/desktop` (returns `true` only under Electron).
- Produces:
  - `DESKTOP_ONLY_PREFIXES: readonly string[]` = `['/browser-hub', '/media/video', '/media/download']`
  - `isDesktopOnlyPath(path: string): boolean` — true when path equals a prefix or starts with `prefix + '/'`
  - `useCapabilities(): { platform: ComputedRef<'desktop'|'web'>, isDesktop: ComputedRef<boolean>, isDesktopOnlyPath: (path: string) => boolean }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/app_capabilities.spec.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isDesktopOnlyPath, DESKTOP_ONLY_PREFIXES } from '../../app/composables/useCapabilities'

describe('desktop-only path gate', () => {
  it('lists exactly the three desktop-only prefixes', () => {
    assert.deepEqual([...DESKTOP_ONLY_PREFIXES], ['/browser-hub', '/media/video', '/media/download'])
  })

  it('matches the prefix root and any child', () => {
    assert.equal(isDesktopOnlyPath('/browser-hub'), true)
    assert.equal(isDesktopOnlyPath('/browser-hub/groups'), true)
    assert.equal(isDesktopOnlyPath('/media/video'), true)
    assert.equal(isDesktopOnlyPath('/media/download'), true)
  })

  it('does not match unrelated or lookalike paths', () => {
    assert.equal(isDesktopOnlyPath('/media'), false)
    assert.equal(isDesktopOnlyPath('/media/videos'), false)
    assert.equal(isDesktopOnlyPath('/document-studio/tools/split'), false)
    assert.equal(isDesktopOnlyPath('/'), false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/app_capabilities.spec.ts`
Expected: FAIL — `Cannot find module '.../app/composables/useCapabilities'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/composables/useCapabilities.ts
import { isDesktopRuntime } from '~/utils/desktop'

export type AppPlatform = 'desktop' | 'web'

/**
 * Routes that need Electron IPC (browser profiles, ffmpeg/yt-dlp media). They
 * have no server route, so on the web build they must not be reachable at all.
 */
export const DESKTOP_ONLY_PREFIXES: readonly string[] = ['/browser-hub', '/media/video', '/media/download']

export function isDesktopOnlyPath(path: string): boolean {
  return DESKTOP_ONLY_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * One place that answers "may this surface show desktop-only features". The
 * client has no build flag: it is the desktop build exactly when Electron's
 * preload bridge is present.
 */
export function useCapabilities() {
  const platform = computed<AppPlatform>(() => (isDesktopRuntime() ? 'desktop' : 'web'))
  const isDesktop = computed(() => platform.value === 'desktop')
  return { platform, isDesktop, isDesktopOnlyPath }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/app_capabilities.spec.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add app/composables/useCapabilities.ts tests/unit/app_capabilities.spec.ts
git commit -m "feat(capabilities): add desktop-only path gate composable"
```

---

### Task 2: Hide desktop-only routes from the sidebar on web

**Files:**
- Modify: `app/composables/useNavMenu.ts` (the `buildNavItems` function, around lines 127-133)
- Test: `tests/unit/app_capabilities.spec.ts` (append a describe block)

**Interfaces:**
- Consumes: `isDesktopOnlyPath` + `useCapabilities().isDesktop` from Task 1.
- Produces: `buildNavItems` drops any `RouteTreeNode` whose `path` is desktop-only when `!isDesktop.value`. Signature unchanged: `buildNavItems(open: Ref<boolean>): NavigationMenuItem[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/app_capabilities.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('sidebar hides desktop-only routes on web', () => {
  it('filters buildNavItems by isDesktopOnlyPath when not desktop', () => {
    const src = read('app/composables/useNavMenu.ts')
    assert.match(src, /isDesktopOnlyPath/)
    assert.match(src, /useCapabilities\(\)/)
    // The filter must be applied where allowedRoutes is turned into items.
    assert.match(src, /allowedRoutes\.value[\s\S]*filter/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/app_capabilities.spec.ts`
Expected: FAIL — `useNavMenu.ts` does not yet reference `isDesktopOnlyPath` / `useCapabilities`.

- [ ] **Step 3: Write minimal implementation**

In `app/composables/useNavMenu.ts`, add the import near the top:

```ts
import { useCapabilities } from './useCapabilities'
```

Inside `useNavMenu()`, just after `const { routes } = useHub()`:

```ts
  const { isDesktop, isDesktopOnlyPath } = useCapabilities()
```

Replace `buildNavItems` with:

```ts
  function buildNavItems(open: Ref<boolean>): NavigationMenuItem[] {
    const hidden = new Set(['settings'])
    const items = allowedRoutes.value
      .filter((node: RouteTreeNode) => !hidden.has(node.name) && node.isVisible !== false)
      // Desktop-only sections have no web backend; hide them rather than render
      // a menu entry that would immediately redirect.
      .filter((node: RouteTreeNode) => isDesktop.value || !isDesktopOnlyPath(normalizePath(node.path)))
    const shadowed = shadowedPaths(items)
    return items.map(node => mapRouteToNav(node, open, shadowed))
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/app_capabilities.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useNavMenu.ts tests/unit/app_capabilities.spec.ts
git commit -m "feat(nav): hide desktop-only routes from the web sidebar"
```

---

### Task 3: Redirect desktop-only routes to `/` on web

**Files:**
- Modify: `app/middleware/auth.global.ts` (insert after the auth guard, before the RBAC block at line ~42)
- Test: append to `tests/unit/app_capabilities.spec.ts`

**Interfaces:**
- Consumes: `useCapabilities()` + `isDesktopOnlyPath` (Task 1).
- Produces: a direct navigation to a desktop-only path on web returns a redirect to `/`. On desktop the middleware is unchanged.

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('route guard refuses desktop-only paths on web', () => {
  it('uses useCapabilities and redirects desktop-only paths', () => {
    const src = read('app/middleware/auth.global.ts')
    assert.match(src, /useCapabilities\(\)/)
    assert.match(src, /isDesktopOnlyPath/)
    assert.match(src, /navigateTo\('\/'\)/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/app_capabilities.spec.ts`
Expected: FAIL — middleware does not reference the capability gate.

- [ ] **Step 3: Write minimal implementation**

In `app/middleware/auth.global.ts`, immediately after the unauthenticated redirect block (after line 36) and before `const auth = useAuth()` at line 38, insert:

```ts
  // Desktop-only sections (browser profiles, media) have no web backend; a direct
  // visit on the web must not open a page whose IPC calls do not exist.
  const capabilities = useCapabilities()
  if (!capabilities.isDesktop.value && capabilities.isDesktopOnlyPath(to.path)) {
    return navigateTo('/')
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/app_capabilities.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/middleware/auth.global.ts tests/unit/app_capabilities.spec.ts
git commit -m "feat(guard): redirect desktop-only routes to home on web"
```

---

### Task 4: Refuse the model-install/status routes on Vercel

**Files:**
- Modify: `server/api/v1/documents/image-model/install.post.ts`
- Modify: `server/api/v1/documents/image-model/status.get.ts`
- Test: `tests/unit/image_model_web_guard.spec.ts`

**Interfaces:**
- Consumes: `detectRuntime()` from `#server/modules/document/runtime` (returns `'vercel'` when `process.env.VERCEL`).
- Produces: both handlers throw `DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED')` when `detectRuntime() === 'vercel'`, before any filesystem work.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/image_model_web_guard.spec.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const ROUTES = [
  'server/api/v1/documents/image-model/install.post.ts',
  'server/api/v1/documents/image-model/status.get.ts'
]

describe('image-model routes refuse the cloud runtime', () => {
  for (const route of ROUTES) {
    it(`${route} guards on detectRuntime vercel`, () => {
      const src = read(route)
      assert.match(src, /detectRuntime/)
      assert.match(src, /'vercel'/)
      assert.match(src, /DOCUMENT_OPERATION_NOT_SUPPORTED/)
    })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/image_model_web_guard.spec.ts`
Expected: FAIL — handlers have no runtime guard.

- [ ] **Step 3: Write minimal implementation**

In `server/api/v1/documents/image-model/install.post.ts`, add the import:

```ts
import { detectRuntime } from '#server/modules/document/runtime'
```

and make the first line inside `runDocument(async () => { … })`:

```ts
    // A serverless host has no writable install dir and cannot serve the AI mode.
    if (detectRuntime() === 'vercel') throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED')
```

Do the same in `server/api/v1/documents/image-model/status.get.ts` (add the two imports it lacks — `detectRuntime` and `DocumentError` from `#server/modules/document/operations`), and make the first line inside its `runDocument(async () => { … })`:

```ts
    if (detectRuntime() === 'vercel') throw new DocumentError('DOCUMENT_OPERATION_NOT_SUPPORTED')
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/image_model_web_guard.spec.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add server/api/v1/documents/image-model/install.post.ts server/api/v1/documents/image-model/status.get.ts tests/unit/image_model_web_guard.spec.ts
git commit -m "feat(image-model): refuse install/status on the vercel runtime"
```

---

### Task 5: Tool pages render an "unavailable" panel when `available === false`

**Files:**
- Modify: `app/components/document-studio/OperationPageShell.vue` (add `available` + `unavailableReason` props and an early panel)
- Modify: each tool page to pass `:available` + `:unavailable-reason`:
  `app/pages/document-studio/tools/{split,merge,convert,export,images,images-to-pdf,extract,watermark,remove-bg,image-convert,structured-convert}.vue`
- Test: `tests/unit/document_unavailable_panel.spec.ts`

**Interfaces:**
- Consumes: the operation catalogue's `available` and `runtimeSupport.reasonDisabled` (already returned by `/api/v1/documents/operations`; `document-studio/index.vue` already reads `available`).
- Produces: `OperationPageShell` gains props `available?: boolean` (default `true`) and `unavailableReason?: string | null` (default `null`). When `available === false` and not loading, it renders a full-height panel (icon + title + reason) instead of the upload/run UI.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/document_unavailable_panel.spec.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('tool shell unavailable panel', () => {
  const shell = read('app/components/document-studio/OperationPageShell.vue')
  it('declares the availability props', () => {
    assert.match(shell, /available\??:\s*boolean/)
    assert.match(shell, /unavailableReason\??:/)
  })
  it('renders a panel gated on !available', () => {
    assert.match(shell, /!available|available === false/)
    assert.match(shell, /document\.unavailable/)
  })

  const PAGES = [
    'split', 'merge', 'convert', 'export', 'images', 'images-to-pdf',
    'extract', 'watermark', 'remove-bg', 'image-convert', 'structured-convert'
  ]
  for (const page of PAGES) {
    it(`${page}.vue passes availability to the shell`, () => {
      const src = read(`app/pages/document-studio/tools/${page}.vue`)
      assert.match(src, /:available=/)
      assert.match(src, /unavailable-reason=/)
    })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/document_unavailable_panel.spec.ts`
Expected: FAIL — shell lacks the props; pages don't pass them.

- [ ] **Step 3: Write minimal implementation**

In `OperationPageShell.vue`, add to the `defineProps` type (after `batch?: BatchViewModel | null`):

```ts
  /** False when this operation cannot run on the current runtime (e.g. native ops on web). */
  available?: boolean
  /** Localized reason shown in the unavailable panel. */
  unavailableReason?: string | null
```

and to `withDefaults(...)` add:

```ts
  available: true,
  unavailableReason: null,
```

At the top of the template (the first child of the root `<div class="flex min-h-0 flex-1 flex-col gap-3">`), before `DocumentStudioOperationStepHeader`, insert:

```vue
    <div
      v-if="!available && !loadingDefinition"
      class="flex min-h-40 flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-default/70 p-8 text-center"
    >
      <UIcon name="i-lucide-circle-slash" class="size-8 text-dimmed" />
      <p class="text-sm font-medium">
        {{ t('document.unavailable.title') }}
      </p>
      <p class="text-xs text-muted">
        {{ unavailableReason || t('document.unavailable.default') }}
      </p>
    </div>
    <template v-else>
      <!-- existing header + grid stay inside this wrapper -->
```

and close the `<template v-else>` immediately before the final two modals' parent close (i.e. wrap the existing header + grid in `<template v-else>…</template>`; the `BaseConfirmModal` / output-folder modal can stay outside the `v-else`).

In each tool page, add two bindings to `<DocumentStudioOperationPageShell …>`:

```vue
        :available="page.entry.available"
        :unavailable-reason="page.entry.unavailableReason"
```

`page.entry` is added in Task 6 (it reads the catalogue entry for this op). Do Task 6 before running the pages' tests if typecheck complains; the source-regex test only needs the two attributes present.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/document_unavailable_panel.spec.ts`
Expected: PASS (all sub-tests).

- [ ] **Step 5: Commit**

```bash
git add app/components/document-studio/OperationPageShell.vue app/pages/document-studio/tools/*.vue tests/unit/document_unavailable_panel.spec.ts
git commit -m "feat(document): show an unavailable panel when an operation cannot run here"
```

---

### Task 6: Expose `entry` (available + reason) from the operation page funnel

**Files:**
- Modify: `app/composables/useDocumentOperationPage.ts` (add `entry` computed + return it)
- Test: append to `tests/unit/document_unavailable_panel.spec.ts`

**Interfaces:**
- Consumes: `definition` (the `DocumentOperationDefinition` loaded from the catalogue) and the catalogue's `available`/`runtimeSupport`. The catalogue response maps to `definition` only today; add the availability read.
- Produces: `useDocumentOperationPage(...)` returns `entry: ComputedRef<{ available: boolean, unavailableReason: string | null }>`.

The cleanest way to get `available` without a second request: `loadDefinition()` already calls `api.operations()`; keep the matched entry with its `available`/`runtimeSupport` fields.

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('operation funnel exposes availability entry', () => {
  it('returns entry with available and unavailableReason', () => {
    const src = read('app/composables/useDocumentOperationPage.ts')
    assert.match(src, /entry/)
    assert.match(src, /available/)
    assert.match(src, /unavailableReason/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/document_unavailable_panel.spec.ts`
Expected: FAIL — funnel has no `entry`.

- [ ] **Step 3: Write minimal implementation**

In `app/composables/useDocumentOperationPage.ts`, add state next to `definition`:

```ts
  const entry = ref<{ available: boolean, unavailableReason: string | null }>({ available: true, unavailableReason: null })
```

In `loadDefinition()`, inside the `try`, after `definition.value = catalog.operations.find(...)`:

```ts
      const matched = catalog.operations.find(operation => operation.id === operationId)
      definition.value = matched ?? null
      entry.value = matched
        ? { available: matched.available, unavailableReason: matched.runtimeSupport?.reasonDisabled ?? null }
        : { available: true, unavailableReason: null }
```

(Replace the existing single `definition.value = catalog.operations.find(...)` line with the three lines above.)

In the `return { … }` object, add:

```ts
    entry: computed(() => entry.value),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/document_unavailable_panel.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useDocumentOperationPage.ts tests/unit/document_unavailable_panel.spec.ts
git commit -m "feat(document): expose operation availability through the funnel"
```

---

### Task 7: i18n for the unavailable panel

**Files:**
- Modify: `i18n/locales/en.json`, `i18n/locales/vi.json` (add a `document.unavailable` block)
- Test: `tests/unit/document_unavailable_panel.spec.ts` (append the i18n check)

**Interfaces:**
- Consumes: nothing.
- Produces: `document.unavailable.title`, `document.unavailable.default` in both locales.

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('unavailable-panel i18n', () => {
  for (const loc of ['en', 'vi']) {
    it(`has document.unavailable in ${loc}`, () => {
      const json = JSON.parse(read(`i18n/locales/${loc}.json`))
      assert.equal(typeof json.document.unavailable?.title, 'string')
      assert.equal(typeof json.document.unavailable?.default, 'string')
    })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/document_unavailable_panel.spec.ts`
Expected: FAIL — keys missing.

- [ ] **Step 3: Write minimal implementation**

Add to `i18n/locales/en.json` under `document`:

```json
"unavailable": {
  "title": "Not available on this runtime",
  "default": "This tool needs the desktop app. Open TM Tools on your computer to use it."
}
```

Add to `i18n/locales/vi.json` under `document`:

```json
"unavailable": {
  "title": "Không khả dụng trên môi trường này",
  "default": "Công cụ này cần ứng dụng desktop. Mở TM Tools trên máy tính để sử dụng."
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/document_unavailable_panel.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add i18n/locales/en.json i18n/locales/vi.json tests/unit/document_unavailable_panel.spec.ts
git commit -m "feat(i18n): add unavailable-panel copy in en and vi"
```

---

### Task 8: Enable the Vercel deployment

**Files:**
- Modify: `vercel.json` (`git.deploymentEnabled` → `true`)
- Test: `tests/unit/vercel_config.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a valid `vercel.json` with deployment enabled; the default Vercel Nitro preset makes `detectRuntime()` return `'vercel'` at runtime with no extra config.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/vercel_config.spec.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))

describe('vercel config', () => {
  it('enables git deployment', () => {
    assert.equal(config.git?.deploymentEnabled, true)
  })
  it('keeps a schema reference', () => {
    assert.ok(config.$schema)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/vercel_config.spec.ts`
Expected: FAIL — `deploymentEnabled` is currently `false`.

- [ ] **Step 3: Write minimal implementation**

Replace `vercel.json` with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": {
    "deploymentEnabled": true
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/tsx --tsconfig tsconfig.test.json tests/unit/vercel_config.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vercel.json tests/unit/vercel_config.spec.ts
git commit -m "build(vercel): enable git deployment"
```

---

### Task 9: Full gate ladder + docs

**Files:**
- Modify: `docs/superpowers/specs/2026-11-20-vercel-deploy-design.md` (§8 mark implemented evidence) or add a short section to `docs/document-studio/V5-IMPLEMENTATION-STATUS.md`
- No source changes beyond fixes the gates surface.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a green gate record.

- [ ] **Step 1: Regenerate the Nuxt ESLint config, then typecheck**

Run: `./node_modules/.bin/nuxt typecheck > .gate-typecheck.txt 2>&1; echo "TC_EXIT=$?"; grep -c "error TS" .gate-typecheck.txt`
Expected: `TC_EXIT=0`, `0`. Record the `.nuxt/eslint.config.mjs` mtime.

- [ ] **Step 2: Lint the touched files AFTER regen**

Run: `./node_modules/.bin/eslint app/composables/useCapabilities.ts app/composables/useNavMenu.ts app/middleware/auth.global.ts app/composables/useDocumentOperationPage.ts app/components/document-studio/OperationPageShell.vue server/api/v1/documents/image-model/install.post.ts server/api/v1/documents/image-model/status.get.ts tests/unit/app_capabilities.spec.ts tests/unit/document_unavailable_panel.spec.ts tests/unit/image_model_web_guard.spec.ts tests/unit/vercel_config.spec.ts > .gate-eslint.txt 2>&1; echo "LINT_EXIT=$?"`
Expected: `LINT_EXIT=0`. If nonzero, fix the touched files only (never repo-wide).

- [ ] **Step 3: Run the full unit suite**

Run: `./node_modules/.bin/tsx tests/unit/run-all.mts > .gate-unit.txt 2>&1; echo "UNIT_EXIT=$?"; tail -2 .gate-unit.txt`
Expected: `UNIT_EXIT=0`, all specs passed.

- [ ] **Step 4: Sanity-check desktop paths are untouched**

Run: `grep -n "isDesktop" app/composables/useNavMenu.ts app/middleware/auth.global.ts`
Expected: the gate is guarded by `isDesktop.value` so desktop keeps every route; no unconditional filter.

- [ ] **Step 5: Record evidence in docs and commit**

Append an "Phase 1 implemented" note to the spec §8 with the actual numbers (typecheck exit, lint exit, `n/ n specs`), then:

```bash
git add docs/superpowers/specs/2026-11-20-vercel-deploy-design.md
git commit -m "docs(deploy): record Phase 1 gate evidence"
```

---

## Self-Review

**Spec coverage:**
- §4.1 useCapabilities → Task 1.
- §4.2 sidebar filter → Task 2.
- §4.3 route redirect → Task 3.
- §4.4 model-install 501 → Task 4.
- §4.5 Hub allowedOrigins → owner/config action, recorded in spec (no code; not a task by design).
- §5.2 tool pages honour `available` → Tasks 5 + 6.
- §5.3 infra (Supabase + Hub storage) → owner/config action, recorded in spec (deployment env, not code).
- §5.4 vercel.json → Task 8.
- §8 verification → Task 9.
- Desktop-unchanged invariant → enforced in Tasks 2/3 (guarded by `isDesktop.value`) and checked in Task 9 Step 4.

**Placeholder scan:** none — every code step shows the exact snippet; every test step shows the exact command.

**Type consistency:** `isDesktopOnlyPath(path)` and `DESKTOP_ONLY_PREFIXES` defined in Task 1 and consumed verbatim in Tasks 2/3. `entry: { available, unavailableReason }` defined in Task 6 and consumed in Task 5's page bindings. `OperationPageShell` props `available`/`unavailableReason` defined in Task 5 and fed by Task 6.
