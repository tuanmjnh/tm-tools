const { ipcMain } = require('electron')
const { existsSync, mkdirSync } = require('fs')
const { spawn } = require('child_process')
const path = require('path')
const { getToolsBinaries } = require('./paths.cjs')
const { TaskProcessManager } = require('./task-manager.cjs')
const sqlite = require('./sqlite.cjs')

const moduleName = 'tools:youtube'
let taskManager = new TaskProcessManager(4, 200, 2, 10 * 60 * 1000)
let binaries = getToolsBinaries()
const updateUI = { delay: 500, lastSend: 0 }

function send(event, channel, data) {
  try {
    event.sender.send(channel, JSON.parse(JSON.stringify(data)))
  } catch {
    return
  }
}

function resolveExecutable() {
  binaries = getToolsBinaries()
  return binaries.ytDlp
}

function buildResponse(task) {
  const meta = task.meta || {}
  return {
    taskId: meta.taskId,
    taskKey: meta.taskKey,
    thread: meta.thread,
    input: meta.input,
    output: meta.output,
    outPath: meta.outPath,
    fileName: meta.fileName
  }
}

function initTaskManager(event, args) {
  taskManager = new TaskProcessManager(
    args?.threads || 4,
    args?.delay || 200,
    args?.maxRetry ?? 2,
    args?.timeout || 10 * 60 * 1000
  )
  updateUI.delay = args?.delayUI || 500
  send(event, `${moduleName}:managerInitialized`, args)
}

function setTasks(event, args) {
  const exe = resolveExecutable()
  const tasks = (args || []).map((task, i) => {
    const meta = task.meta || {}
    if (meta.outPath) mkdirSync(meta.outPath, { recursive: true })

    // Ensure yt-dlp writes into the selected output folder
    const baseArgs = [...(task.args || [])]
    let argsNoUrl = baseArgs
    let url = ''
    if (baseArgs.length > 1 && typeof baseArgs[baseArgs.length - 1] === 'string' && !baseArgs[baseArgs.length - 1].startsWith('-')) {
      url = baseArgs[baseArgs.length - 1]
      argsNoUrl = baseArgs.slice(0, -1)
    }
    if (meta.outPath) {
      const fileNameTemplate = meta.fileName || '%(title)s.%(ext)s'
      argsNoUrl.push('-o', path.join(meta.outPath, fileNameTemplate).replace(/\\/g, '/'))
      argsNoUrl.push('--continue')
    }
    if (url) argsNoUrl.push(url)

    return { ...task, command: exe, args: argsNoUrl, meta: { ...meta, taskKey: i, thread: i } }
  })
  taskManager.setTasks(tasks)
}

function startTasks(event) {
  updateUI.lastSend = 0
  taskManager.beforeRunTask = (thread, idx, task) => {
    const meta = { ...task.meta, taskKey: idx, thread }
    const response = { ...buildResponse({ meta }), taskKey: idx, thread, speed: '0KiB/s', percent: 0, downloaded: '0KiB', done: false }
    send(event, `${moduleName}:beforeRunTask`, response)
  }

  taskManager.onTaskStdout = (thread, idx, task, data) => {
    const line = data.toString()
    const match = line.match(/\[download\]\s+(\d+\.\d+)%\s+of\s+([\d.]+[KMG]iB)\s+at\s+([\d.]+[KMG]iB\/s)/)
    if (!match) return
    const now = Date.now()
    if (now - updateUI.lastSend < updateUI.delay) return
    updateUI.lastSend = now
    const response = {
      ...buildResponse(task),
      taskKey: idx,
      thread,
      speed: match[3],
      percent: parseFloat(match[1]),
      downloaded: match[2],
      done: false
    }
    send(event, `${moduleName}:progressTask`, response)
  }

  taskManager.afterRunTask = (pid, thread, idx, task, code, signal, stdout, stderr) => {
    const meta = task.meta || {}

    if (code === 0) {
      const fileSize = extractFileSize(stdout) || extractFileSize(stderr)
      const fileName = extractFileName(stdout) || extractFileName(stderr) || meta.fileName || ''
      const title = meta.title || (fileName ? fileName.substring(0, fileName.lastIndexOf('.')) || fileName : '')
      task.meta = { ...meta, fileName, output: meta.outPath ? path.join(meta.outPath, fileName).replace(/\\/g, '/') : fileName }
      sqlite.addHistory({
        url: meta.input,
        title: title,
        format_id: meta.formatId,
        format_title: meta.formatTitle,
        out_path: meta.outPath,
        file_name: fileName,
        file_size: fileSize,
        duration: meta.duration || 0,
        status: 'completed',
        config_id: meta.configId,
        config_title: meta.configTitle,
        threads: meta.threads,
        started_at: meta.startedAt,
        completed_at: new Date().toISOString()
      })
    } else {
      task.meta = { ...meta, fileName: meta.fileName || '', output: meta.output || '' }
      sqlite.addHistory({
        url: meta.input,
        title: meta.title || '',
        format_id: meta.formatId,
        format_title: meta.formatTitle,
        out_path: meta.outPath,
        file_name: meta.fileName || '',
        file_size: 0,
        duration: meta.duration || 0,
        status: 'failed',
        error_message: stderr.slice(-500),
        config_id: meta.configId,
        config_title: meta.configTitle,
        threads: meta.threads,
        started_at: meta.startedAt,
        completed_at: new Date().toISOString()
      })
    }

    const response = { ...buildResponse(task), taskKey: idx, thread, speed: '0KiB/s', percent: code === 0 ? 100 : 0, downloaded: '0KiB', done: true, code, fileName: task.meta.fileName, output: task.meta.output }
    send(event, `${moduleName}:progressTask`, response)
  }

  taskManager.onAllTasksDone = (total) => {
    send(event, `${moduleName}:allTasksDone`, { total })
  }

  taskManager.onTaskError = (thread, idx, task, code, signal, stderr) => {
    const response = { ...buildResponse(task), taskKey: idx, thread, done: false, message: stderr, code }
    send(event, `${moduleName}:errorTask`, response)
  }

  taskManager.onTaskRetry = (idx, retryCount) => {
    send(event, `${moduleName}:taskRetry`, { taskKey: idx, retryCount })
  }

  taskManager.onTaskTimeout = (idx) => {
    send(event, `${moduleName}:taskTimeout`, { taskKey: idx })
  }

  taskManager.start().catch(() => {})
}

function extractFileSize(output) {
  const match = output?.match(/\[download\]\s+Destination:\s+.+\.(\w+)\s+\[.*?\]\s+([\d.]+)([KMG]iB)/)
  if (match) {
    const num = parseFloat(match[2])
    const unit = match[3]
    const mult = unit === 'KiB' ? 1024 : unit === 'MiB' ? 1024 * 1024 : 1024 * 1024 * 1024
    return Math.round(num * mult)
  }
  return null
}

function extractFileName(output) {
  if (!output) return null
  let match = output.match(/\[download\]\s+Destination:\s+(.+)/)
  if (match) {
    const p = match[1].trim()
    const path = require('path')
    return path.basename(p)
  }
  match = output.match(/\[download\]\s+(.+)\s+has\s+already\s+been\s+downloaded/)
  if (match) {
    const p = match[1].trim()
    const path = require('path')
    return path.basename(p)
  }
  match = output.match(/Destination:\s+(.+)/)
  if (match) {
    const p = match[1].trim()
    const path = require('path')
    return path.basename(p)
  }
  return null
}

function crawlPlaylist(url) {
  return new Promise((resolve, reject) => {
    const exe = resolveExecutable()
    const child = spawn(exe, ['--flat-playlist', '--print', '%(id)s|%(title)s|%(duration)s|%(uploader)s|%(view_count)s|%(upload_date)s', url])
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => stdout += d.toString())
    child.stderr.on('data', d => stderr += d.toString())
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr))
      const lines = stdout.trim().split('\n').filter(Boolean)
      const videos = lines.map((line) => {
        const [id, title, duration, uploader, viewCount, uploadDate] = line.split('|')
        return { id, title, duration: parseInt(duration) || 0, uploader, viewCount: parseInt(viewCount) || 0, uploadDate, url: `https://www.youtube.com/watch?v=${id}` }
      })
      resolve(videos)
    })
    child.on('error', reject)
  })
}

function getFormats(url) {
  return new Promise((resolve, reject) => {
    const exe = resolveExecutable()
    const child = spawn(exe, ['-J', '--no-playlist', url])
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => stdout += d.toString())
    child.stderr.on('data', d => stderr += d.toString())
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || 'Failed to fetch formats'))
      try {
        const metadata = JSON.parse(stdout)
        const rawFormats = metadata.formats || []
        const formatted = rawFormats.map((f) => {
          let sizeStr = ''
          const bytes = f.filesize || f.filesize_approx
          if (bytes) {
            if (bytes < 1024 * 1024) sizeStr = `${(bytes / 1024).toFixed(1)} KB`
            else if (bytes < 1024 * 1024 * 1024) sizeStr = `${(bytes / 1024 / 1024).toFixed(1)} MB`
            else sizeStr = `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
          }
          const res = f.resolution || `${f.width || '?'}x${f.height || '?'}`
          const fpsStr = f.fps ? ` (${f.fps}fps)` : ''
          const title = `[${f.ext}] ${res}${fpsStr}${sizeStr ? ' - ' + sizeStr : ''}`
          return {
            id: f.format_id,
            title,
            opt: JSON.stringify(['-f', f.format_id]),
            w: f.width || 0,
            h: f.height || 0,
            sort: f.tbr || 0,
            flag: 1
          }
        })
        resolve({
          title: metadata.title || '',
          duration: metadata.duration || 0,
          formats: formatted
        })
      } catch (e) {
        reject(e)
      }
    })
    child.on('error', reject)
  })
}

function getVersion() {
  return new Promise((resolve, reject) => {
    const exe = resolveExecutable()
    const child = spawn(exe, ['--version'])
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => stdout += d.toString())
    child.stderr.on('data', d => stderr += d.toString())
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || 'Failed to get version'))
      resolve(stdout.trim())
    })
    child.on('error', reject)
  })
}

function registerYoutubeController() {
  ipcMain.handle(`${moduleName}:checkExecutable`, () => {
    const exe = resolveExecutable()
    return { data: exe, status: existsSync(exe) }
  })

  ipcMain.handle(`${moduleName}:getVersion`, async (event) => {
    try {
      const version = await getVersion()
      return { status: true, data: version }
    } catch (e) {
      return { status: false, message: e.message }
    }
  })

  ipcMain.handle(`${moduleName}:getStatus`, () => taskManager.getStatus())

  ipcMain.handle(`${moduleName}:initTaskManager`, (event, args) => initTaskManager(event, args))

  ipcMain.handle(`${moduleName}:setTasks`, (event, args) => setTasks(event, args))

  ipcMain.handle(`${moduleName}:startTasks`, event => startTasks(event))

  ipcMain.handle(`${moduleName}:pauseTasks`, async () => {
    await taskManager.pause()
    return taskManager.getStatus()
  })

  ipcMain.handle(`${moduleName}:continueTasks`, async () => {
    await taskManager.continue()
    return taskManager.getStatus()
  })

  ipcMain.handle(`${moduleName}:stopTask`, (event, idx) => {
    taskManager.stopTask(idx)
    send(event, `${moduleName}:stoppedTask`, true)
    return taskManager.getStatus()
  })

  ipcMain.handle(`${moduleName}:stopTasks`, async (event) => {
    await taskManager.stop()
    send(event, `${moduleName}:stoppedTasks`, true)
    return taskManager.getStatus()
  })

  ipcMain.handle(`${moduleName}:crawlPlaylist`, async (event, url) => {
    try {
      const videos = await crawlPlaylist(url)
      return { status: true, data: videos }
    } catch (e) {
      return { status: false, message: e.message }
    }
  })

  ipcMain.handle(`${moduleName}:getFormats`, async (event, url) => {
    try {
      const formats = await getFormats(url)
      return { status: true, data: formats }
    } catch (e) {
      return { status: false, message: e.message }
    }
  })

  ipcMain.handle(`${moduleName}:listFormats`, () => sqlite.listFormats())
  ipcMain.handle(`${moduleName}:createFormat`, (event, data) => {
    const id = sqlite.createFormat(data)
    return { status: true, data: { id } }
  })
  ipcMain.handle(`${moduleName}:updateFormat`, (event, { id, data }) => {
    sqlite.updateFormat(id, data)
    return { status: true }
  })
  ipcMain.handle(`${moduleName}:deleteFormat`, (event, id) => {
    sqlite.deleteFormat(id)
    return { status: true }
  })

  ipcMain.handle(`${moduleName}:listConfigs`, () => sqlite.listConfigs())
  ipcMain.handle(`${moduleName}:createConfig`, (event, data) => {
    const id = sqlite.createConfig(data)
    return { status: true, data: { id } }
  })
  ipcMain.handle(`${moduleName}:updateConfig`, (event, { id, data }) => {
    sqlite.updateConfig(id, data)
    return { status: true }
  })
  ipcMain.handle(`${moduleName}:deleteConfig`, (event, id) => {
    sqlite.deleteConfig(id)
    return { status: true }
  })

  ipcMain.handle(`${moduleName}:listHistory`, (event, limit) => sqlite.listHistory(limit))
  ipcMain.handle(`${moduleName}:deleteHistory`, () => {
    sqlite.deleteHistory()
    return { status: true }
  })
}

module.exports = { registerYoutubeController, youtubeEvents: {
  managerInitialized: `${moduleName}:managerInitialized`,
  beforeRunTask: `${moduleName}:beforeRunTask`,
  progressTask: `${moduleName}:progressTask`,
  allTasksDone: `${moduleName}:allTasksDone`,
  stoppedTask: `${moduleName}:stoppedTask`,
  stoppedTasks: `${moduleName}:stoppedTasks`,
  errorTask: `${moduleName}:errorTask`,
  taskRetry: `${moduleName}:taskRetry`,
  taskTimeout: `${moduleName}:taskTimeout`
} }
