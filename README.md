# Electron + Nuxt 4 Desktop Application

Desktop application built with **Electron** + **Nuxt 4** + **Nuxt UI v4** (Tailwind CSS v4). Includes authentication (JWT), role-based access control with a dynamic menu system, MongoDB/Supabase database support, and an Electron packaging pipeline.

## Features

- **Electron shell** with Nuxt 4 frontend (`electron/main.cjs` + `electron/preload.cjs`)
- **Authentication**: register/login, JWT access token + refresh token rotation, session management, logout
- **RBAC**: roles with module-level permissions (`read/write/delete/manage`)
- **Dynamic menu system**:
  - Route tree stored in the database (`system_routes` collection/table)
  - Roles hold an `allowedRoutes` list (or `*` for full access) — selectable via a tree component on the Roles page
  - Sidebar, command palette and client-side route guard are generated from the current user's allowed routes
  - Hiding a menu in the sidebar only affects navigation; the path stays reachable if the user has permission
- **Pages**: Dashboard, Inbox, Customers, Admin (Users & Roles), Settings (General, Members, Notifications, Security), System (Config, Seed)
- **Rich text editor** (Tiptap), image upload (Cloudinary), charts (Unovis), notifications (Web Push), translations (i18n EN/VI)

## Stack

| Area        | Technology                                |
| ----------- | ----------------------------------------- |
| Framework   | Nuxt 4, Vue 3, TypeScript                 |
| UI          | Nuxt UI v4, Tailwind CSS v4               |
| Desktop     | Electron, electron-builder                |
| Database    | MongoDB (default) or Supabase (Postgres)  |
| Auth        | bcryptjs (password), jose (JWT)           |
| Misc        | Cloudinary, Firebase Admin, web-push, Tiptap, Unovis |

## Project structure

```
app/                 Nuxt application (pages, layouts, components, composables)
electron/            Electron main + preload scripts
i18n/                Locale files (en, vi)
scripts/             Seed scripts
server/
  api/               Nitro API routes (auth, rbac, users, system, routes...)
  config/            Environment-driven configuration
  modules/           Auth, RBAC, routes, database adapters
supabase/            SQL migrations for the Supabase provider
types/               Shared TypeScript types (auth, rbac)
```

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Configure environment — copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

Key variables:

- `AUTH_PROVIDER` — `mongodb` or `supabase`
- `AUTH_ACCESS_TOKEN_SECRET` / `AUTH_REFRESH_TOKEN_SECRET` — JWT secrets (min 32 chars)
- `MONGODB_URI` / `MONGODB_DB_NAME` — required when using MongoDB
- `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` — required when using Supabase

### Supabase only: apply migrations

If `AUTH_PROVIDER=supabase`, run the SQL migrations in the Supabase SQL Editor first (e.g. `supabase/migrations/20260731_dynamic_menu.sql`), which creates the `system_routes` table and adds the `allowed_routes` column to `roles`.

### Seed the database

Seed creates the route tree, system roles (`root`, `admin`, `moderator`, `user`) and demo users:

```bash
# Create missing data (idempotent)
pnpm seed

# Wipe and re-seed
pnpm seed:reset
```

Demo users:

| Email             | Password   | Role  |
| ----------------- | ---------- | ----- |
| root@example.com  | root123    | root  |
| admin@example.com | admin123   | admin |
| test@example.com  | test123    | user  |

## Development

Start the Nuxt dev server at `http://localhost:4002`:

```bash
pnpm dev
```

Run the app inside Electron (starts Nuxt dev server, waits for port 4002, then launches Electron):

```bash
pnpm dev:electron
```

## Quality checks

```bash
pnpm typecheck   # nuxt typecheck
pnpm lint        # eslint
```

## Production

Build the Nuxt application:

```bash
pnpm build
```

Build the Windows desktop application (Nuxt build + electron-builder):

```bash
pnpm build:electron
```

Locally preview the production build:

```bash
pnpm preview
```

## Generate VAPID keys

For Web Push notifications:

```bash
pnpm generate:vapid
```
