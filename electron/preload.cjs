const { contextBridge, ipcRenderer, webUtils } = require('electron')

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
  invoke: ['complete', 'transcribe', 'getStatus'],
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
    'statFiles', 'extractThumbnail', 'extractFrame', 'extractAudio', 'saveRecording', 'extractWaveform', 'generateProxy', 'stabilizeVideo', 'analyzeAsset',
    'analyzeScenes', 'analyzeSilence', 'listFonts',
    'watchOutput', 'unwatchOutput'
  ],
  on: ['renderDone']
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
  verifyPath: (filePath, type) => ipcRenderer.invoke('verify-path', { filePath, type }),
  openPath: fullPath => ipcRenderer.invoke('open-path', fullPath),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  showItemInFolder: fullPath => ipcRenderer.invoke('show-item-in-folder', fullPath),
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args))
  },
  tools: { youtube, ffmpeg, profiles, aiGateway },
  dialog,
  fileManager,
  tmcut,
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
  }
})
