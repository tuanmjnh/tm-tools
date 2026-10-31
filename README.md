# TM Tools

Desktop utility app of the TM platform: **Electron + Nuxt 4 + Nuxt UI v4**.

TM Tools manages anti-detect browser profiles, YouTube downloads and FFmpeg
processing, the media/utility workspace, and a read-only console for the AI
providers that live in **TM Hub**. The TMCut video editor lives in the separate
**tm-studio** repository (port 4003).

## Features

- **Electron shell** with Nuxt 4 renderer (`electron/main.cjs` + `electron/preload.cjs`)
- **Browser Hub**: isolated anti-detect profiles, groups and proxies
  (`/profiles`, `/profiles/groups`, `/profiles/proxies`)
- **Downloader**: `yt-dlp` queue with progress, retry and timeouts (`/tools/download`)
- **FFmpeg tools**: encode/convert/trim/concat with presets (`/tools/video`)
- **Media workspace**: Cloudinary library, inbox, notifications, connections
- **AI console**: hub-owned providers, connections and models (`/system/ai-keys`)
- **Hub satellite**: identity, RBAC routes, configs and AI credentials come from
  TM Hub (`useHub()` + `X-App-Id`)
- **Desktop-only capabilities**: keychain-encrypted config, native dialogs,
  file manager bridge, auto-update through GitHub releases
- Utilities (text, icons, encode, random, rich-text editor), i18n EN/VI

## Stack

| Area | Technology |
| --- | --- |
| Framework | Nuxt 4, Vue 3, TypeScript |
| UI | Nuxt UI v4, Tailwind CSS v4 |
| Desktop | Electron, electron-builder, electron-updater |
| Media | FFmpeg/FFprobe, yt-dlp (bundled, git-ignored), Cloudinary |
| Auth | TM Hub JWT (jose, shared `AUTH_JWT_SECRET`) |
| Misc | MongoDB/Supabase adapters, Firebase Admin, Tiptap, Unovis, i18n |

## Project structure

```
app/                 Nuxt app (pages, layouts, components, composables)
electron/            Electron main process, preload, platform layer (src/)
i18n/                Locale files (en, vi)
server/              Nitro API routes (hub proxy, health, chat, system)
shared/              Types and utils shared by app and server
resources/           Bundled binaries (ffmpeg, ffprobe, ffplay, yt-dlp)
docs/                Living documentation (v2); TMCut-era docs in docs/archive/
```

## Setup

1. Install dependencies (pnpm 12):

```bash
pnpm install
```

2. Configure `.env`:

```env
PORT=4002
APP_PORT=3456
AUTH_PROVIDER=hub
NUXT_PUBLIC_HUB_URL=http://localhost:4000
NUXT_PUBLIC_HUB_APP_ID=tm-tools_bbx58v
AUTH_JWT_SECRET=<same value as tm-hub/.env>
```

3. Start TM Hub (`pnpm dev` in `tm-hub`), then this app:

```bash
pnpm dev            # Nuxt only → http://localhost:4002
pnpm dev:electron   # Nuxt + Electron
```

Demo accounts and seeding live in TM Hub (`pnpm seed --app=tools`).

## Commands

```bash
pnpm dev             # dev server on 4002
pnpm dev:electron    # dev server + Electron window
pnpm build           # Nuxt production build
pnpm build:electron  # platform layer + Nuxt + Windows installer
pnpm typecheck       # vue-tsc
pnpm test:unit       # tests/unit/run-all.mts
pnpm lint            # ESLint
```

## Documentation

Start at [`docs/README.md`](./docs/README.md). The pre-extraction TMCut docs are
frozen in [`docs/archive/2026-10-31-v1-pre-tmcut-extraction/`](./docs/archive/2026-10-31-v1-pre-tmcut-extraction/).
