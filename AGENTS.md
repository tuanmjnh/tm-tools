# AGENTS.md — TM Tools Desktop

Guidance for AI coding agents working in this repository.

## Project Overview

**TM Tools** is an Electron + Nuxt 4 desktop automation, media production, and multi-profile workspace application powered by Nuxt UI v4 (Tailwind CSS v4).

- **Technology Stack**: Electron + Nuxt 4 running on Port 4002 (`TOOLS_PORT`).
- **UI Framework**: Nuxt UI v4 (Tailwind CSS v4).
- **Control Plane Integration**:
  - Connects to **TM Hub** (`http://localhost:4000`) as a satellite app via `useHub()` with `X-App-Id: tm-tools_4e2ygb`.
  - Identity, authentication, user sessions, role-based access control, routes, and configs are centrally managed by TM Hub.
- **Dynamic Menu System**:
  - Sidebar navigation is built dynamically from `system_routes` fetched from TM Hub via `GET /api/v1/apps/:appId/routes`.
  - Filtered by `isVisible !== false` at root and children.
  - Route labels are resolved via i18n keys (`nav.*`).
- **Core Modules**:
  - **TMCut Video Studio**: Timeline editor (`/tmcut/editor`), template library (`/tmcut/templates`), and automated video splitter/generator (`/tmcut/autocut`).
  - **Profiles / Browser Hub**: Anti-detect browser profiles (`/profiles`), group tagging (`/profiles/groups`), and proxy manager (`/profiles/proxies`).
  - **Tools & Automation**: Bulk downloader (`/tools/download`), video processing tools (`/tools/video`).
  - **Utilities**: Text utilities (`/utilities/text`), Icon finder (`/utilities/icons`), Encoder/Decoder (`/utilities/encode`), Randomizer (`/utilities/random`), Markdown/Rich editor (`/utilities/editor`).
  - **Resources**: Media library (`/media`), Inbox (`/inbox`).
  - **Administration**: Centrally-governed admin views for Users (`/administration/users`), Roles (`/administration/roles`), Configs (`/administration/configs`), Audit Logs (`/administration/logs`), Import (`/administration/import`), Export (`/administration/export`).
  - **Settings & System**: Settings (`/settings/tools`, `/settings/browsers`, `/settings/connections`, `/settings/security`, `/settings/notifications`), System (`/system/config`, `/system/seed`).
- **Push Notifications**:
  - Unified Firebase FCM & VAPID Web Push via `app/composables/useWebPush.ts` synchronized with Service Worker (`public/push-sw.js`).

## Commands

```bash
pnpm install        # Install dependencies (pnpm is the package manager)
pnpm dev            # Nuxt dev server on http://localhost:4002 (--port 4002)
pnpm dev:electron   # Nuxt dev + Electron together
pnpm typecheck      # Run typecheck (vue-tsc) — always run after type changes
pnpm lint           # ESLint check on modified files
pnpm build          # Nuxt production build
pnpm build:electron # Electron production build (Windows installer)

# Central Seeding via tm-hub:
# cd ../tm-hub && pnpm seed --app=tools        # update routes, roles, & configs
# cd ../tm-hub && pnpm seed:reset --app=tools  # reset and recreate tools data
```

## Project Structure

```
app/                 Nuxt 4 app (pages, layouts, components, composables, middleware)
app/pages/           Route pages (/index, /chat, /tmcut/*, /profiles/*, /tools/*, /utilities/*, /administration/*, /settings/*)
app/composables/     Client composables (useAuth, useHub, useWebPush, useNavMenu)
app/layouts/         Layouts (default.vue with sidebar navigation)
app/middleware/      Client route guards (auth.global.ts)
electron/            Electron main process & preload scripts (main.cjs, preload.cjs)
i18n/locales/        i18n files (en.json, vi.json)
server/api/          Local Nitro API endpoints
server/config/       Local runtime environment config
types/               Shared types (auth.ts, rbac.ts, etc.)
```

## Architecture & Integration Notes

### Satellite Connection to TM Hub
- Satellite requests to TM Hub are handled via `useHub()`, using `hubFetch` which automatically attaches JWT bearer tokens and `X-App-Id`.
- Login, registration, token refresh, and user profile updates go directly to TM Hub.
- Routes are fetched at runtime via `nav.fetchRoutes()`, mapped into `NavigationMenuItem[]` by `useNavMenu.ts`.

### Page & Layout Conventions
- **Open Source First**: Đối với những chức năng chưa quen thuộc, đừng viết từ con số 0, hãy tìm kiếm các dự án mã nguồn mở trên GitHub để so sánh ý tưởng trước khi bắt tay vào làm.
- **BasePage Mandatory**:
  - All new pages/modules MUST wrap their content in `<BasePage :title="..." :description="...">` (`app/components/base/Page.vue`).
  - Left slot: Displays title and optional description.
  - Right slot: Secondary action buttons belong in `template #right`. Overflow options should be grouped in `UDropdownMenu` with `i-lucide-ellipsis-vertical`.
- **Page Padding**:
  - Standard dashboard pages keep default padding.
  - Studio & editor pages (such as `/tmcut/editor`) MUST pass the `flush` prop (`<BasePage flush ...>`) to remove padding and gap, giving 100% of the viewport to canvas, timelines, and inspectors.
- **Button Variants**:
  - Primary action buttons (save, create, run, confirm, launch, export, …) use `color="primary" variant="soft"` — exactly one per surface.
  - Dismissal / secondary buttons (cancel, back, close, skip, dismiss, …) use `variant="ghost"` (usually `color="neutral"`) — they must never compete visually with the primary action.
  - Destructive confirmations use `color="error"`; their cancel counterpart stays `variant="ghost"`.
- **Form Controls & Inputs**:
  - Always add class `w-full` for inputs (`UInput`, `USelect`, `USelectMenu`, `UTextarea`, etc.) to ensure consistent responsive layout across all forms.
- **GridList & Batch Operations**:
  - Prefer `LazyGridList` over `BaseTable`. Always provide `#mobile-content` slot.
- **Animation, Status & Icons (optimized surfaces)**:
  - **Motion budget**: subtle and purposeful only — 150–200 ms ease transitions for hover/focus/press (`transition-colors`, `duration-200`); entrance motion is owned by Nuxt UI (modal/sheet/drawer built-ins). Never hand-roll `animate-*` for decoration: the only legitimate loops are skeleton `pulse`, live-recording pulse, and canvas/WebGPU scenes (use the `threejs-*` skills for those, never for hover feedback).
  - **Triple state rule**: every async surface (lists, panels, dialogs) renders ALL of loading (skeleton/`pulse`, ≥1 line), empty (dashed card + one icon + one-line hint + CTA), and error (inline banner + retry) — a surface must never flash raw "No data" or a permanently blank box while wiring resolves.
  - **Status language**: one lucide icon + ≤2-word label in `UBadge variant="subtle"` — `i-lucide-circle-check` (emerald) / `i-lucide-triangle-alert` (amber) / `i-lucide-circle-alert` or `i-lucide-circle-x` (red) / `i-lucide-info` (primary) / `i-lucide-clock` (neutral pending). Color must never be the only signal; a "connected/online/OK" badge without its icon is a bug. Progress states show the measurable value (`{done}/{total}`, `{ms}`) instead of repeating "loading…".
  - **Icon economy**: single family (`i-lucide-*`). Decorative icons ride text (`size-3.5`–`size-4` in labels, `size-5`–`size-6` in headers). One icon per verb/button; an icon that duplicates the adjacent word is redundant — drop the icon or shorten the label, not both. Icon-only controls MUST carry `:title`/`:aria-label`. Misaligned leading icons (e.g. `size-3` inside a `size-6` header box) is a layout bug, fix the container not the icon.
  - **Redundancy check (text)**: a header's `description` must add information the title doesn't already say; card sections must not echo the page description; unit chips like "1920×1080 · 30fps" appear at most once per card. When a list state already explains itself ("2 projects"), don't repeat a counter badge next to it.
- **Lazy components (code splitting)**:
  - Any component that mounts on demand (modals, slidesovers, drawers, heavy panels, tab content) MUST be referenced with the Nuxt `Lazy` prefix (e.g. `<LazyBaseResponsiveModal>`, `<LazyBaseConfirmModal>`). The Lazy prefix puts the component in its own chunk and defers loading until it is actually rendered.
  - Direct (non-lazy) references are reserved for always-visible, above-the-fold chrome (BasePage, nav, grid list).
- **Type placement (Nuxt 4 standard)**:
  - Types used by BOTH the Vue app and the Nitro server live in `shared/types/` (import via the built-in `#shared/types/<file>` alias).
  - App-only types live in `app/types/`; server-only types live in `server/types/`. There is NO root-level `types/` folder.
  - One canonical definition per type name across the auto-imported surfaces (`app/types`, `server/types`, `shared/types`) — duplicated interface names across those folders trip the unimport "Duplicated imports" warnings.
  - Values (type guards, status consts) belong in `shared/utils/` or `app/utils/`, not in types folders.
- **Tailwind CSS Conventions**:
  - Explicit pixel values using arbitrary brackets (e.g. max-h-[200px], w-[320px]) are acceptable for clarity. Shorthand scale enforcement (	ailwindcss/enforces-shorthand) and canonical class warnings are disabled.

### i18n & Language Conventions
- All user-facing text MUST reside in `i18n/locales/en.json` and `i18n/locales/vi.json` and be accessed via `t()`.
- **No Inline i18n Fallbacks**: NEVER pass fallback text as a second string argument to `t()` (e.g. `t('key', 'Fallback text')` is strictly forbidden). Always define keys directly in both `i18n/locales/en.json` and `i18n/locales/vi.json`, and invoke `t('key')` without inline fallback string arguments.
- Source code comments, technical logs, constants, and commit messages MUST ALWAYS be written in English.

## Testing & Verification

Verification is manual: `pnpm typecheck` + `pnpm lint` + `pnpm dev` (or `pnpm dev:electron`).
