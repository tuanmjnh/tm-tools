# TM Tools Documentation Hub

**TM Tools** is the desktop utility app of the TM platform (Nuxt 4 + Electron,
port 4002). It manages anti-detect browser profiles, YouTube downloads and FFmpeg
processing, the media/utility workspace, and a read-only view of the AI
providers that live in **TM Hub**.

> The TMCut video editor moved to its own repository, **tm-studio** (port 4003),
> on 2026-10-31. Its documentation is frozen in
> [`docs/archive/2026-10-31-v1-pre-tmcut-extraction/`](./archive/2026-10-31-v1-pre-tmcut-extraction/).

---

## Guides

1. 📖 **[User Guide](./guides/user-guide.md)** — Browser Hub, downloader,
   FFmpeg tools, media library, utilities, AI console, settings and
   troubleshooting.
2. ⚙️ **[System Setup & Configuration](./guides/system-setup-and-configuration-guide.md)** —
   ports for the four apps, `.env` wiring between tm-hub / tm-tools / tm-studio,
   seeding and run commands.

## Architecture & contracts

- 🔐 **[AI & Hub Connections](./ai-and-hub-connections.md)** — tm-tools holds no
  AI keys; the hub owns credentials, catalog and relay.
- 🌐 **[Browser Platform](./browser-platform/)** —
  [ARCHITECTURE](./browser-platform/ARCHITECTURE.md),
  [BROWSER_ADAPTER](./browser-platform/BROWSER_ADAPTER.md),
  [DATABASE_SCHEMA](./browser-platform/DATABASE_SCHEMA.md),
  [IPC_CONTRACTS](./browser-platform/IPC_CONTRACTS.md),
  [SECURITY](./browser-platform/SECURITY.md),
  [DEVELOPMENT_PLAN](./browser-platform/DEVELOPMENT_PLAN.md).
- 🏛️ **[IAM & Auth Service](./iam-auth-service-architecture.md)** — the shared
  JWT / refresh / RBAC model used by every satellite.

## Plans & implementation notes

- 🎬 **[Downloader & FFmpeg plan](./PLAN.md)** — the original task-manager and
  binary design for `/tools/download` and `/tools/video`.
- 🧰 **[Video tool suite plan](./implementation_plan_20260908.md)** — panel split
  and preset composables for the video tool.
- 💬 **[AI chat module plan](./implementation_plan_202608011211.md)** — historic
  multi-provider chat plan (chat now runs through the hub).
- 🖼️ **[Media manager port](./plan-port-media-inputs.md)** — Cloudinary media
  manager and input components.
- 🔄 **[Auto-update: plan](./AutoUpdate_implementation_plan.md)** and
  **[walkthrough](./AutoUpdate_walkthrough.md)** — `electron-updater` pipeline.

## Rebuild status

| Area | State |
| --- | --- |
| TMCut editor / templates / autocut / HTML studio | moved to `tm-studio` |
| Playlist MCP server & AI gateway | removed from tm-tools |
| AI keys vault | hub-only (`/system/ai-keys` is read-only) |
| Browser Hub, downloader, FFmpeg, utilities, media | alive in this repo |

## Verification

```bash
pnpm typecheck
pnpm test:unit
pnpm lint
pnpm dev            # http://localhost:4002
```
