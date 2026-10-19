'use strict'
// R133 — shared IPC trust policy (docs §197).
//
// Two surfaces, one file, both PURE (no electron import at module top so
// unit specs can exercise the logic in plain Node — the electron objects
// are only ever received as arguments):
//
// 1) createSenderGate(): the app-origin check that lived privately in
//    main.cjs since the MCP audit (R124.5). Extracted so controllers that
//    touch the filesystem can apply the SAME rule — the audit's residual
//    risk list flagged tools:file-manager (44 channels of unrestricted
//    absolute-path FS access) as having NO sender validation at all.
//
// 2) PUSH_CHANNELS / OUTBOUND_CHANNELS: the allowlists for the preload
//    bridge's generic send()/on() pass-through. The sandboxed preload
//    (Electron >= 20 defaults sandbox:true) cannot require local files,
//    so it keeps INLINE copies of these arrays; the unit spec
//    tmcut_ipc_policy pins the copies against these originals so the two
//    can never drift apart silently.

// Channels main may PUSH to the renderer via the generic electronAPI.on.
// Derived from the actual webContents.send() call sites: EventBus
// (eventbus:event), app-updater (status-changed), tmcut renderDone,
// profiles statusChanged, and the two task-manager controllers' event
// families (youtube/ffmpeg share the TaskProcessManager event names).
const TASK_EVENT_NAMES = [
  'managerInitialized', 'beforeRunTask', 'progressTask', 'allTasksDone',
  'stoppedTask', 'stoppedTasks', 'errorTask', 'taskRetry', 'taskTimeout', 'updateProgress'
]

const PUSH_CHANNELS = [
  'eventbus:event',
  'app-updater:status-changed',
  'tmcut:renderDone',
  'tools:profiles:statusChanged',
  ...TASK_EVENT_NAMES.map(n => `tools:youtube:${n}`),
  ...TASK_EVENT_NAMES.map(n => `tools:ffmpeg:${n}`)
]

// Channels the renderer may send() into the main process through the
// generic bridge. Nothing legitimately uses ipcRenderer.send today (every
// handler in the app is ipcMain.handle/invoke; grep ipcMain.on = 0 hits),
// so the honest allowlist is EMPTY. A future fire-and-forget channel must
// be added here deliberately, not discovered implicitly.
const OUTBOUND_CHANNELS = []

const PUSH_SET = new Set(PUSH_CHANNELS)
const OUTBOUND_SET = new Set(OUTBOUND_CHANNELS)

function isAllowedPushChannel(channel) {
  return typeof channel === 'string' && PUSH_SET.has(channel)
}

function isAllowedOutboundChannel(channel) {
  return typeof channel === 'string' && OUTBOUND_SET.has(channel)
}

/**
 * Build the app-origin sender check. Semantics are byte-for-byte the ones
 * main.cjs used before the extraction (audit R124.5):
 *  - missing/blank frame URL, about:blank and devtools:// pass (Chromium
 *    injects them around trusted app navigations; frame-destroyed reads
 *    must not lock the app out of its own IPC);
 *  - dev accepts the Vite server origin only;
 *  - prod accepts the loopback Nitro server origin only.
 * `port` is the prod server port (string or number).
 */
function createSenderGate({ isDev, port }) {
  const p = String(port)
  return function isTrustedSender(event) {
    let url
    try {
      url = event.senderFrame ? event.senderFrame.url : ''
    } catch {
      return false
    }
    if (!url || url === 'about:blank' || url.startsWith('devtools://')) return true
    if (isDev) return url.startsWith('http://localhost:3000') || url.startsWith('http://127.0.0.1:3000')
    return url.startsWith(`http://127.0.0.1:${p}`) || url.startsWith(`http://localhost:${p}`)
  }
}

module.exports = {
  PUSH_CHANNELS,
  OUTBOUND_CHANNELS,
  TASK_EVENT_NAMES,
  isAllowedPushChannel,
  isAllowedOutboundChannel,
  createSenderGate
}
