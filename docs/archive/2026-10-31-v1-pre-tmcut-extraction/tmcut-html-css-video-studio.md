# TM Cut HTML/CSS Video Studio

## Overview

The HTML/CSS Studio is available as a tab in **TM Cut → Templates**. It lets you edit a self-contained HTML composition and CSS, preview/scrub animation, save the composition as HTML, and render a silent H.264 MP4 in the Electron desktop app.

The rendering flow is inspired by the public HyperFrames approach: Chromium is explicitly seeked to each composition timestamp, captures a frame, and FFmpeg encodes the frame stream. This is deterministic with respect to the requested timeline rather than dependent on realtime screen recording. TM Tools has its own minimal implementation and does not embed HyperFrames.

## Usage

1. Open **TM Cut → Templates → HTML/CSS Studio**.
2. Edit the HTML and CSS in their respective editor tabs. CSS animations are seeked by setting the Web Animations current time from the preview timeline.
3. Set even output dimensions, a frame rate from 15 to 60 FPS, and a duration from 1 to 120 seconds.
4. Scrub the preview or step by frame to inspect timing.
5. Use **Save HTML** to export the self-contained composition, or **Render MP4** in the desktop app to write an H.264 MP4.

The current renderer supports up to 1,800 frames per export and caps HTML input at 2 MiB. It does not include audio or a visual asset picker; compositions can use inline HTML/CSS, data URLs, and local media URLs accepted by the isolated Chromium renderer. Remote connections are blocked by Content Security Policy.

## Safety and reliability

- Preview runs in an iframe with `sandbox="allow-scripts"`, no same-origin grant, and a restrictive CSP. User scripts, event-handler attributes, refresh directives, and `javascript:` links are stripped before preview.
- The Electron render window is hidden, sandboxed, context-isolated, and has Node integration disabled. It applies a nonce-only script policy to its seek helper and blocks network connections, navigation, popups, forms, and nested frames.
- Renderer-side HTML is also sanitized before loading. CSS animation timing and video/SVG time are advanced explicitly for each captured frame.
- FFmpeg input is streamed through a pipe with backpressure handling. Output is encoded to a unique temporary MP4 and atomically renamed into place only after successful encoding, so a failed export does not delete or overwrite an existing output file.
- The renderer validates the frame limit and output parameters before opening Chromium or spawning FFmpeg.

## Implementation files

- `app/components/tmcut/TmcutHtmlVideoStudio.vue` — code editor, preview, timeline scrub, composition save, render UI.
- `app/pages/tmcut/templates.vue` — Studio tab entry.
- `electron/tools/html-video-renderer.cjs` — isolated Chromium capture, validation, and FFmpeg encoding.
- `electron/preload.cjs`, `electron/ipcPolicy.cjs`, `electron/main.cjs`, `shared/types/electron.ts` — explicit IPC bridge and registration.
- `tests/unit/html-video-renderer.test.mjs` — renderer and encoding contract tests.

## Verification log

- `node --test tests/unit/html-video-renderer.test.mjs` — **7/7 passed**, covering validation, sanitization, frame-seek behavior, FFmpeg arguments, cleanup, and preservation of an existing output after encoder failure.
- `pnpm exec tsx --tsconfig tsconfig.test.json tests/unit/tmcut_ipc_policy.spec.ts` — **9/9 checks passed** after removing a duplicate `tmcut:htmlVideoProgress` entry from the preload push allowlist.
- `pnpm exec tsx --tsconfig tsconfig.test.json tests/unit/tmcut_i18n_keys.spec.ts` — **4/4 passed** after completing the save-dialog localization keys and removing duplicate locale entries.
- `pnpm exec eslint app/components/tmcut/TmcutHtmlVideoStudio.vue app/pages/tmcut/templates.vue electron/tools/html-video-renderer.cjs electron/preload.cjs electron/ipcPolicy.cjs tests/unit/html-video-renderer.test.mjs` — **passed**.
- `pnpm typecheck` — **passed**, 0 errors.
- Electron runtime smoke test — **passed**: rendered a real 1-second, 320×240, 15 FPS MP4 using the installed Electron Chromium and `resources/ffmpeg.exe`; `resources/ffprobe.exe` confirmed H.264, 320×240, 15/1 FPS, and 1.000000-second duration. The file is `.smoke-render/html-studio-smoke.mp4`.
- `pnpm dev:electron` was started and Nuxt/Electron initialized successfully, but the existing dev session then shut down cleanly shortly after launch. The login route redirected the browser check to sign-in, so the authenticated TMCut UI was not interactively checked during this pass.
