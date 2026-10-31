# TM Tools — User Guide

TM Tools is the desktop utility app of the TM platform. It runs on port **4002**
and signs in through **TM Hub** (port 4000), which also stores every AI
credential. Video editing moved to **TM Studio** (port 4003) — this app prepares,
downloads and processes media, it does not edit timelines.

## First run

1. Start TM Hub (`pnpm dev` in `tm-hub`), then TM Tools (`pnpm dev:electron`).
2. Sign in with your Hub account. The sidebar is built from the routes and roles
   your account is allowed to see.
3. Open **System → Tools** once and confirm `ffmpeg`/`yt-dlp` are detected; open
   **System → Browsers** once and confirm a Chromium build is available.

## Browser Hub (anti-detect profiles)

| Screen | What it does |
| --- | --- |
| `/profiles` | Create, launch and stop isolated browser profiles. Each profile keeps its own cookies, storage and fingerprint. |
| `/profiles/groups` | Group profiles by project or client; launch a whole group at once. |
| `/profiles/proxies` | Manage proxies and assign them to profiles; test latency and geo before use. |

Launching a profile starts a real browser process (Oxide/Chromium/Firefox
adapters). Closing the profile window stops the process; the profile state is
persisted in the local SQLite database.

## Tools & automation

| Screen | What it does |
| --- | --- |
| `/tools/download` | Bulk download from YouTube and other supported sites via `yt-dlp`. Queue, retry, and choose format/quality. |
| `/tools/video` | FFmpeg processing: encode, convert, trim, concat, apply presets. Presets are managed by `useFfmpegPresets`. |

Both screens share the task manager: tasks queue, report progress, can be
stopped, retried and time out. Binaries live in `resources/` (git-ignored) and
are verified before use.

## Media & workspace

| Screen | What it does |
| --- | --- |
| `/resources/media` | Media library backed by Cloudinary: browse, upload, preview, copy links. |
| `/resources/inbox` | Shared inbox synced with Hub. |
| `/resources/notifications` | In-app notifications; from here you can send push notifications to devices. |
| `/resources/connections` | Hub connection wizard (provider credentials are stored by the Hub, not here). |

## Utilities

`/utilities/text` (case/format transforms), `/utilities/icons` (icon finder),
`/utilities/encode` (base64/URL/hex), `/utilities/random` (tokens, UUIDs),
`/utilities/editor` (Markdown/rich text).

## AI console

Open **System → AI Keys** (`/system/ai-keys`). It is a read-only window into what
TM Hub knows: provider definitions, this app's connections and models, health and
model discovery. Keys are never displayed or stored by tm-tools. To add or edit a
provider, use the Hub connection wizard. See
[`../ai-and-hub-connections.md`](../ai-and-hub-connections.md).

## Settings & system

- **System → Settings** — language (English/Vietnamese), theme, accent colour.
- **System → Settings → System** — local runtime health: version, database,
  uptime, default port.
- **System → Tools** — binary paths and update checks for FFmpeg/yt-dlp.
- **System → Browsers** — Chromium build location and browser updates.
- **System → Downloads** — download folder and queue defaults.
- **System → Docs** — documentation loaded from Hub with a bundled fallback.
- **System → Hub Integration** — connection status and the `.env` snippet to
  pair this app with Hub.

## Updates

The desktop app checks GitHub releases through `electron-updater` and shows
progress in the app-update banner. Keep **System → Downloads** writable for
update staging.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl + Shift + I` | Toggle DevTools |
| `F5` | Reload the renderer |

## Troubleshooting

- **Everything is empty / sidebar missing** — Hub is offline or the JWT expired.
  Start Hub, then sign out and back in.
- **AI screens show no models** — the connection has no models discovered yet;
  run model discovery from `/system/ai-keys`.
- **Download/encode fails immediately** — open **System → Tools** and check that
  the binary path resolves and the file is executable.
- **Profile will not launch** — verify the browser build in **System → Browsers**
  and that the assigned proxy answers.
