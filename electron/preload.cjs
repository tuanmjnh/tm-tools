const { contextBridge, ipcRenderer, webUtils } = require('electron')

// R133 (§197) — generic send()/on() are a narrow, EXPLICIT bridge, not a
// raw ipcRenderer pass-through. The sandboxed preload cannot require local
// files, so these arrays are inline copies of electron/ipcPolicy.cjs; the
// tmcut_ipc_policy unit spec pins the copies against the originals so
// neither side can drift silently.
const PUSH_CHANNELS = [
  'eventbus:event',
  'app-updater:status-changed',
  'tmcut:renderDone',
  'tmcut:assetCenter:progress',
  'tmcut:downloadProgress',
  'tools:profiles:statusChanged',
  // MCP server channels (Phase 2)
  'mcp:server:tool:invoke',
  'mcp:server:session:init',
  'mcp:server:session:close',
  'mcp:server:event:proposal_changed',
  'mcp:server:event:project_changed',
  'mcp:server:event:job_status',
  'tools:youtube:managerInitialized', 'tools:youtube:beforeRunTask', 'tools:youtube:progressTask', 'tools:youtube:allTasksDone',
  'tools:youtube:stoppedTask', 'tools:youtube:stoppedTasks', 'tools:youtube:errorTask', 'tools:youtube:taskRetry', 'tools:youtube:taskTimeout', 'tools:youtube:updateProgress',
  'tools:ffmpeg:managerInitialized', 'tools:ffmpeg:beforeRunTask', 'tools:ffmpeg:progressTask', 'tools:ffmpeg:allTasksDone',
  'tools:ffmpeg:stoppedTask', 'tools:ffmpeg:stoppedTasks', 'tools:ffmpeg:errorTask', 'tools:ffmpeg:taskRetry', 'tools:ffmpeg:taskTimeout', 'tools:ffmpeg:updateProgress'
]
// Nothing legitimately uses ipcRenderer.send today (all handlers are
// invoke-based; grep ipcMain.on = 0 hits). Adding a channel here is a
// deliberate act, reviewed like any other IPC surface change.
const OUTBOUND_CHANNELS = [
  // MCP server channels (Phase 3)
  'mcp:server:tool:invoke',
  'mcp:server:session:init',
  'mcp:server:session:close',
  'mcp:server:event:proposal_changed',
  'mcp:server:event:project_changed',
  'mcp:server:event:job_status',
  // MCP server response channels (Phase 3): renderer -> main
  'mcp:forward',
  'mcp:forward:respond'
]
const PUSH_SET = new Set(PUSH_CHANNELS)
const OUTBOUND_SET = new Set(OUTBOUND_CHANNELS)

function exposeNamespace(namespace, channels) {
  const api = {}
  for (const method of channels.invoke) {
    api[method] = (...args) => ipcRenderer.invoke(`${namespace}:${method}`, ...args)
  }
  for (const method of channels.on) {
    api[`on${capitalize(method)}`] = (callback) => {
      const listener = (_event, ...args) => callback(...args)
      ipcRenderer.on(`${namespace}:${method}`, listener)
      return () => ipcRenderer.removeListener(`${namespace}:${method}`, listener)
    }
  }
  return api
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

const youtube = exposeNamespace('tools:youtube', {
  invoke: [
    'checkExecutable', 'getStatus', 'getTasks', 'initTaskManager', 'setTasks', 'startTasks',
    'pauseTasks', 'continueTasks', 'stopTask', 'stopTasks',
    'crawlPlaylist', 'getFormats', 'listFormats', 'createFormat', 'updateFormat', 'deleteFormat',
    'listConfigs', 'createConfig', 'updateConfig', 'deleteConfig', 'listHistory', 'listHistoryCursor', 'getVersion', 'deleteHistory',
    'checkUpdate', 'performUpdate'
  ],
  on: [
    'managerInitialized', 'beforeRunTask', 'progressTask', 'allTasksDone',
    'stoppedTask', 'stoppedTasks', 'errorTask', 'taskRetry', 'taskTimeout', 'updateProgress'
  ]
})

const ffmpeg = exposeNamespace('tools:ffmpeg', {
  invoke: [
    'checkExecutable', 'getStatus', 'getTasks', 'initTaskManager', 'setTasks', 'setGroupTasks',
    'startTasks', 'pauseTasks', 'continueTasks', 'stopTask', 'stopTasks', 'getMediaInfo',
    'listFfmpegConfigs', 'createFfmpegConfig', 'updateFfmpegConfig', 'deleteFfmpegConfig',
    'listFfmpegBatchConfigs', 'createFfmpegBatchConfig', 'updateFfmpegBatchConfig', 'deleteFfmpegBatchConfig',
    'listFfmpegHistory', 'deleteFfmpegHistory', 'detectGpuSupport', 'globFiles', 'scanImageSubfolders',
    'probeMedia', 'scanJoinFolders', 'getVersion', 'checkUpdate', 'performUpdate'
  ],
  on: [
    'managerInitialized', 'beforeRunTask', 'progressTask', 'allTasksDone',
    'stoppedTask', 'stoppedTasks', 'errorTask', 'taskRetry', 'taskTimeout', 'updateProgress'
  ]
})

const profiles = exposeNamespace('tools:profiles', {
  invoke: [
    'listProfiles', 'getProfile', 'createProfile', 'updateProfile', 'deleteProfiles',
    'cloneProfile', 'listGroups', 'saveGroup', 'deleteGroup', 'listProxies',
    'saveProxy', 'deleteProxy', 'checkProxy', 'launchBrowser', 'stopBrowser',
    'getRunningProfiles', 'openProfileFolder', 'clearProfileCache', 'detectBrowserExecutable'
  ],
  on: [
    'statusChanged'
  ]
})

const aiGateway = exposeNamespace('tools:ai-gateway', {
  invoke: ['complete', 'transcribe', 'getStatus', 'models', 'presets', 'tasks'],
  on: []
})

const videoGeneration = exposeNamespace('tools:video-generation', {
  invoke: [
    'providers',
    'provider:capabilities',
    'estimate',
    'submit',
    'poll',
    'cancel',
    'download',
    'jobs:list',
    'jobs:get',
    'jobs:retry',
    'jobs:delete',
    'usage-ledger',
    'provider:health'
  ],
  on: []
})

const dialog = exposeNamespace('tools:dialog', {
  invoke: ['openFile', 'openFolder', 'saveFile'],
  on: []
})

const tmcut = exposeNamespace('tmcut', {
  invoke: [
    'getPaths', 'readAssetsFile', 'writeAssetsFile',
    'readProject', 'writeProject', 'listProjectFiles', 'readProjectMeta',
    'writeRecovery', 'readRecovery', 'deleteRecovery', 'deleteProject',
    'listSnapshots', 'saveSnapshot', 'readSnapshot', 'deleteSnapshot',
    'statFiles', 'extractThumbnail', 'extractFrame', 'extractAudio', 'saveRecording', 'extractWaveform', 'generateProxy', 'stabilizeVideo', 'analyzeAsset', 'downloadMedia', 'cancelDownload',
    'analyzeScenes', 'analyzeSilence', 'listFonts',
    'watchOutput', 'unwatchOutput'
  ],
  on: ['renderDone', 'downloadProgress']
})

// Roadmap v3 PART A: on-demand Asset Center I/O (registry + verified
// downloads). The queue/state machine lives renderer-side in @tmcut/core;
// these channels are thin path-pinned primitives (see asset-center.controller).
const tmcutAssetCenter = exposeNamespace('tmcut:assetCenter', {
  invoke: [
    'getDirs', 'readRegistry', 'writeRegistry',
    'readCatalogCache', 'writeCatalogCache', 'readStarterCatalog', 'getSamplePath',
    'downloadPackage', 'cancelDownload', 'installLocal', 'removePackageDir', 'verifyFile'
  ],
  on: ['progress']
})

const fileManager = exposeNamespace('tools:file-manager', {
  invoke: [
    'read', 'write', 'append', 'exists', 'delete', 'readJSON', 'writeJSON',
    'createFolder', 'rename', 'copyFile', 'copyFolder',
    'getTree', 'listFlat', 'listFiles', 'listFolders', 'listAll',
    'listFileNames', 'listFolderNames', 'listAllNames',
    'readAsync', 'writeAsync', 'appendAsync', 'existsAsync', 'deleteAsync',
    'readJSONAsync', 'writeJSONAsync', 'createFolderAsync', 'renameAsync',
    'copyFileAsync', 'copyFolderAsync',
    'getTreeAsync', 'listFlatAsync', 'listFilesAsync', 'listFoldersAsync', 'listAllAsync',
    'listFileNamesAsync', 'listFolderNamesAsync', 'listAllNamesAsync',
    'imageToDataUrl'
  ],
  on: []
})

const appUpdater = {
  getStatus: () => ipcRenderer.invoke('app-updater:getStatus'),
  checkForUpdates: () => ipcRenderer.invoke('app-updater:checkForUpdates'),
  downloadUpdate: () => ipcRenderer.invoke('app-updater:downloadUpdate'),
  quitAndInstall: () => ipcRenderer.invoke('app-updater:quitAndInstall'),
  onStatusChanged: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('app-updater:status-changed', listener)
    return () => ipcRenderer.removeListener('app-updater:status-changed', listener)
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },
  isElectron: true,
  // External Explorer/Finder drop (roadmap G-2): resolve a dropped File
  // to its absolute path (File.path was removed in Electron 32).
  getPathForFile: file => webUtils.getPathForFile(file),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: values => ipcRenderer.invoke('set-config', values),
  // R140: at-rest key vault status (counts only — never tokens/values).
  aiKeyStatus: () => ipcRenderer.invoke('ai-key-status'),
  // R143: re-run the idempotent at-rest migration ("Encrypt now").
  aiMigrateKeys: () => ipcRenderer.invoke('ai-migrate-keys'),
  verifyPath: (filePath, type) => ipcRenderer.invoke('verify-path', { filePath, type }),
  openPath: fullPath => ipcRenderer.invoke('open-path', fullPath),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  showItemInFolder: fullPath => ipcRenderer.invoke('show-item-in-folder', fullPath),
  // R133: allow-listed generic bridge. send() refuses unknown channels;
  // on() refuses unknown channels and now returns an unsubscribe function
  // (the old listener leaked permanently — no way to remove it).
  send: (channel, data) => {
    if (!OUTBOUND_SET.has(channel)) {
      console.warn('[preload] refused send on non-allow-listed channel:', channel)
      return
    }
    ipcRenderer.send(channel, data)
  },
  on: (channel, callback) => {
    if (!PUSH_SET.has(channel)) {
      console.warn('[preload] refused on() for non-allow-listed channel:', channel)
      return () => {}
    }
    const listener = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  tools: { youtube, ffmpeg, profiles, aiGateway, videoGeneration },
  dialog,
  fileManager,
  tmcut: { ...tmcut, assetCenter: tmcutAssetCenter },
  appUpdater,
  system: {
    getInfo: () => ipcRenderer.invoke('system:getInfo'),
    openDirectory: input => ipcRenderer.invoke('system:openDirectory', input),
    getStorageUsage: () => ipcRenderer.invoke('system:getStorageUsage'),
    showNotification: options => ipcRenderer.invoke('system:showNotification', options)
  },
  browser: {
    list: () => ipcRenderer.invoke('browser:list'),
    detect: () => ipcRenderer.invoke('browser:detect'),
    addCustom: input => ipcRenderer.invoke('browser:addCustom', input),
    remove: id => ipcRenderer.invoke('browser:remove', { id }),
    testExecutable: input => ipcRenderer.invoke('browser:testExecutable', input)
  },
  events: {
    on: (event, callback) => {
      const listener = (_e, data) => {
        if (data && data.event === event) {
          callback(data.payload)
        }
      }
      ipcRenderer.on('eventbus:event', listener)
      return () => ipcRenderer.removeListener('eventbus:event', listener)
    }
  },
  mcp: {
    onToolInvoke: (callback) => {
      const listener = (_event, { tool, params, requestId, projectId }) => callback({ tool, params, requestId, projectId })
      ipcRenderer.on('mcp:forward', listener)
      return () => ipcRenderer.removeListener('mcp:forward', listener)
    },
    respond: (requestId, result) => ipcRenderer.send('mcp:forward:respond', { requestId, result })
  }
})
