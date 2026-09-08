const { contextBridge, ipcRenderer } = require('electron')

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
    'listConfigs', 'createConfig', 'updateConfig', 'deleteConfig', 'listHistory', 'listHistoryCursor', 'getVersion', 'deleteHistory'
  ],
  on: [
    'managerInitialized', 'beforeRunTask', 'progressTask', 'allTasksDone',
    'stoppedTask', 'stoppedTasks', 'errorTask', 'taskRetry', 'taskTimeout'
  ]
})

const ffmpeg = exposeNamespace('tools:ffmpeg', {
  invoke: [
    'checkExecutable', 'getStatus', 'getTasks', 'initTaskManager', 'setTasks', 'setGroupTasks',
    'startTasks', 'pauseTasks', 'continueTasks', 'stopTask', 'stopTasks', 'getMediaInfo',
    'listFfmpegConfigs', 'createFfmpegConfig', 'updateFfmpegConfig', 'deleteFfmpegConfig',
    'listFfmpegBatchConfigs', 'createFfmpegBatchConfig', 'updateFfmpegBatchConfig', 'deleteFfmpegBatchConfig',
    'listFfmpegHistory', 'deleteFfmpegHistory', 'detectGpuSupport', 'globFiles', 'scanImageSubfolders',
    'probeMedia', 'scanJoinFolders'
  ],
  on: [
    'managerInitialized', 'beforeRunTask', 'progressTask', 'allTasksDone',
    'stoppedTask', 'stoppedTasks', 'errorTask', 'taskRetry', 'taskTimeout'
  ]
})

const dialog = exposeNamespace('tools:dialog', {
  invoke: ['openFile', 'openFolder', 'saveFile'],
  on: []
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

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },
  isElectron: true,
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: values => ipcRenderer.invoke('set-config', values),
  verifyPath: (filePath, type) => ipcRenderer.invoke('verify-path', { filePath, type }),
  openPath: fullPath => ipcRenderer.invoke('open-path', fullPath),
  showItemInFolder: fullPath => ipcRenderer.invoke('show-item-in-folder', fullPath),
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args))
  },
  tools: { youtube, ffmpeg },
  dialog,
  fileManager
})
