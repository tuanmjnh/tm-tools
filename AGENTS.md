# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project overview

Electron + Nuxt 4 desktop application using Nuxt UI v4 (Tailwind CSS v4). It is a dashboard app with:

- JWT authentication (access + refresh token rotation)
- Role-based access control (RBAC) with module-level permissions
- **Dynamic menu system**: the sidebar navigation is generated at runtime from a `system_routes` table (DB-stored route tree, fetched from tm-hub API via `GET /api/v1/apps/:appId/routes`) **filtered by the user's `isVisible` flag** (root AND children). Role `allowedRoutes` does **not** affect the tm-tools client menu (it only controls UI display + hub `/auth/routes`). Route labels are i18n keys like `nav.*` — resolved via `t()`.
- MongoDB (default) or Supabase (Postgres) database backends
- i18n (EN/VI), Web Push notifications, Tiptap rich text editor, Cloudinary uploads, Unovis charts

## Commands

```bash
pnpm install        # install dependencies (pnpm is the package manager)
pnpm dev            # Nuxt dev server on http://localhost:3000
pnpm dev:electron   # Nuxt dev + Electron together
pnpm typecheck      # nuxt typecheck (vue-tsc) — always run after type changes
pnpm lint           # eslint (run on files you modify)
pnpm build          # nuxt build
pnpm build:electron # nuxt build + electron-builder (Windows)
pnpm seed           # idempotent DB seed (route tree, roles, demo users)
pnpm seed:reset     # wipe + re-seed
pnpm generate:vapid # generate Web Push VAPID keys
```

## Project structure

```
app/                 Nuxt app (pages, layouts, components, composables, middleware)
app/pages/           Route pages (index, chat, media, login, register, settings, system, administration/*, utilities/*, profiles/*, tools/*)
app/composables/     useAuth, useNavMenu, etc.
app/layouts/         default.vue (sidebar + UNavigationMenu)
app/middleware/      auth.global.ts (client route guard)
electron/            Electron main + preload (main.cjs, preload.cjs)
i18n/                Locale files (en.json, vi.json)
scripts/             seed.ts CLI (tsx)
server/api/          Nitro API routes
server/config/       index.ts — environment-driven config (see below)
server/modules/      auth/, rbac/, database/
supabase/            SQL migrations for Supabase provider
types/               Shared types (auth.ts, rbac.ts) — imported from both app/ and server/
```

## Architecture notes

### Database abstraction

- `server/modules/database/index.ts` defines `DatabaseAdapter` interface. `getDatabase()` returns either `MongoDBAdapter` (`mongodb.ts`) or `SupabaseAdapter` (`supabase.ts`) based on `AUTH_PROVIDER`.
- `getAppDatabase()` is a separate MongoDB-only adapter (`database/app.ts`) for app data.
- **When adding new data operations: add the method to the `DatabaseAdapter` interface AND implement it in BOTH `mongodb.ts` and `supabase.ts`.** The Supabase adapter maps snake_case columns (`parent_id`, `is_visible`, `allowed_routes`, `allowed_routes`).

### Dynamic menu system (important)

- Route tree is stored flat in `system_routes`: `id, path, name, label, icon, sort, isVisible, parentId, isDeleted`.
- Routes are fetched at runtime from tm-hub API (`GET /api/v1/apps/:appId/routes`) → `useHub().routes.list()` → flat tree → `buildTree` (sorted by `sort`).
- `app/composables/useNavMenu.ts` builds `NavigationMenuItem[]` for the sidebar; **`buildNavItems` hard-filters out routes named `settings`** (hidden from sidebar, still reachable by URL) **and filters `isVisible !== false` at root AND children**.
- Role `allowedRoutes` does **not** affect the tm-tools client menu — it only controls UI display + hub `/auth/routes`. The Roles page (`app/pages/administration/roles.vue`) uses `SharedHeTreeMenu` (ported `@he-tree/vue` component) for tree selection; selecting a node auto-selects its parents and children.
- Client guard: `app/middleware/auth.global.ts` fetches all app routes via `nav.fetchRoutes()` and redirects to the first allowed path when access is denied. Root (`/`) bypass is: `user.role === 'root' || user.permissions?.includes('*')`.

### Auth & RBAC

- `server/modules/auth/` — login/register/refresh logic, JWT via `jose`, bcrypt password hashing. Login flow goes through hub API (`POST /api/v1/auth/login` with `X-App-Id` header). Credentials: `root@example.com`/`root123` (TOTP root disabled).
- `server/modules/rbac/service.ts` — `getUserAccess()` builds permissions + allowedRoutes for a user; both auth providers use it.
- `server/middleware/rbac.ts` — server-side API guard using a `permissionMap` (currently `{}` — all `/api/*` except `publicRoutes` are open). Auth middleware wraps all `/api/*` routes.
- Demo users (from seed): `root@example.com/root123`, `admin@example.com/admin123`, `test@example.com/test123`.

### Config

- `server/config/index.ts` reads env vars with hardcoded fallbacks (Supabase/Cloudinary/Firebase dev credentials are committed as defaults). Create `.env` from `.env.example` to override. `AUTH_PROVIDER` = `mongodb` or `supabase`. Ports: `HUB_PORT` (tm-hub, default 4000), `TOOLS_PORT` (tm-tools, default 3000). Create `.env` files in each app root to set custom ports.

### i18n

- Locale keys live in `i18n/locales/{en,vi}.json`. Any new user-facing string must be added to BOTH files. Menu/route labels use `nav.*` keys; admin/role UI uses `admin.*` keys.

## Conventions

- TypeScript everywhere (`@typescript-eslint/no-explicit-any` is an error — avoid `any` in new code; note some pre-existing `any` casts remain in seed code and are exempted by repo style).
- No code comments unless asked.
- Nuxt auto-imports: `app/components/**` become `<XxxYyy>` components (e.g. `app/components/shared/HeTreeMenu.vue` → `<SharedHeTreeMenu>`).
- `pnpm` is the package manager — never introduce `npm`/`yarn`/`pnpm`-incompatible tooling.
- Use Nuxt UI v4 components (`UButton`, `UModal`, `UForm`, etc.) with `:ui` prop / variants API — do not use Tailwind `@apply` overrides or old `:ui="{ width }"` patterns (removed in v4).
- Always run `pnpm typecheck` after touching types; run `pnpm lint` on modified files.
- **GridList & Batch Deletion Conventions**:
  - **GridList Usage**: Prefer `LazyGridList` over `BaseTable` for list views. Always provide a `#mobile-content` slot to design custom card layouts for mobile viewports.
  - **Batch Deletion API**: DELETE API endpoints (e.g., `/api/users`, `/api/rbac/roles`) must support batch deletion by splitting a comma-separated `id` query parameter (e.g. `query.id.split(',')`).
  - **Batch Deletion UI**: Show a batch delete button (`i-lucide-trash`, `error` color, `subtle` variant) next to the add action in the `template #right` of `BasePage` when items are selected. Use `LazyBaseConfirmModal` for verification and list names of targeted items. Protect items like the active user or system roles from deletion.

## Testing

No test suite is configured. Verification is manual via `pnpm dev` (or `pnpm dev:electron`) + `pnpm typecheck` + `pnpm lint`.