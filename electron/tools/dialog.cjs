const { ipcMain, dialog } = require('electron')

const moduleName = 'tools:dialog'

function normalizePath(p) {
  return String(p).replace(/\\/g, '/')
}

function buildOptions(defaults, args) {
  const options = { ...defaults }
  const properties = [...(defaults.properties || [])]

  if (args?.title) options.title = args.title
  if (args?.filters && args.filters.length > 0) options.filters = args.filters
  if (args?.defaultPath) options.defaultPath = args.defaultPath

  if (args?.multiSelections) properties.push('multiSelections')
  if (args?.showHiddenFiles) properties.push('showHiddenFiles')
  if (args?.createDirectory) properties.push('createDirectory')
  if (args?.treatPackageAsDirectory) properties.push('treatPackageAsDirectory')
  if (args?.showOverwriteConfirmation) properties.push('showOverwriteConfirmation')
  if (args?.dontAddToRecent) properties.push('dontAddToRecent')

  if (properties.length) options.properties = properties
  return options
}

async function handleOpenFile(args) {
  const defaults = {
    title: 'Open file',
    filters: [{ name: 'All Files', extensions: ['*'] }],
    properties: ['openFile']
  }
  const options = buildOptions(defaults, args)
  if (args?.sync) {
    const result = dialog.showOpenDialogSync(options)
    return result ? result.map(normalizePath) : null
  }
  const result = await dialog.showOpenDialog(options)
  return result.canceled ? null : result.filePaths.map(normalizePath)
}

async function handleOpenFolder(args) {
  const defaults = {
    title: 'Open folder',
    properties: ['openDirectory']
  }
  const options = buildOptions(defaults, args)
  if (args?.sync) {
    const result = dialog.showOpenDialogSync(options)
    return result ? result.map(normalizePath) : null
  }
  const result = await dialog.showOpenDialog(options)
  return result.canceled ? null : result.filePaths.map(normalizePath)
}

async function handleSaveFile(args) {
  const defaults = {
    title: 'Save file',
    filters: [{ name: 'All Files', extensions: ['*'] }]
  }
  const options = buildOptions(defaults, args)
  if (args?.sync) {
    const result = dialog.showSaveDialogSync(options)
    return result ? normalizePath(result) : null
  }
  const result = await dialog.showSaveDialog(options)
  return result.canceled || !result.filePath ? null : normalizePath(result.filePath)
}

function registerDialogController() {
  ipcMain.handle(`${moduleName}:openFile`, (_event, args) => handleOpenFile(args))
  ipcMain.handle(`${moduleName}:openFolder`, (_event, args) => handleOpenFolder(args))
  ipcMain.handle(`${moduleName}:saveFile`, (_event, args) => handleSaveFile(args))
}

module.exports = { registerDialogController, dialogEvents: {} }
