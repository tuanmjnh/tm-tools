const { ipcMain, app } = require('electron')
const { existsSync, mkdirSync, statSync } = require('fs')
const { spawn, execSync } = require('child_process')
const path = require('path')
const { getToolsBinaries, verifyExecutable } = require('./paths.cjs')
const { TaskProcessManager } = require('./task-manager.cjs')
const sqlite = require('./sqlite.cjs')

const isImageFile = (filePath) => {
  if (!filePath) return false
  return /\.(gif|jpg|jpe?g|tiff|png|img|ico|jfif|webp|bmp|svg)$/i.test(filePath)
}

const moduleName = 'tools:ffmpeg'
let taskManager = new TaskProcessManager(1, 200, 2, 30 * 60 * 1000)
let binaries = getToolsBinaries()
const updateUI = { delay: 500, lastSend: 0 }

function send(event, channel, data) {
  try {
    event.sender.send(channel, JSON.parse(JSON.stringify(data)))
  } catch {
    // ignore
  }
}

function resolveExecutable() {
  binaries = getToolsBinaries()
  return binaries
}

function buildResponse(task) {
  const meta = task.meta || {}
  return {
    taskId: meta.taskId,
    taskKey: meta.taskKey,
    thread: meta.thread,
    input: meta.input,
    inputs: meta.inputs,
    output: meta.output,
    outPath: meta.outPath,
    duration: meta.duration
  }
}

function initTaskManager(event, args) {
  taskManager = new TaskProcessManager(
    args?.threads || 1,
    args?.delay || 200,
    args?.maxRetry ?? 2,
    args?.timeout || 30 * 60 * 1000
  )
  updateUI.delay = args?.delayUI || 500
  send(event, `${moduleName}:managerInitialized`, args)
}

function detectGpuSupport() {
  try {
    const ffmpegExe = resolveExecutable().ffmpeg
    const output = execSync(`"${ffmpegExe}" -hide_banner -encoders`, { encoding: 'utf8', stdio: 'pipe' })

    let gpus = []
    try {
      const cmd = 'powershell -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"'
      const gpuOutput = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' })
      gpus = gpuOutput.split('\n').map(line => line.trim()).filter(Boolean)
    } catch {
      // ignore
    }

    return {
      nvenc: output.includes('h264_nvenc'),
      amf: output.includes('h264_amf'),
      qsv: output.includes('h264_qsv'),
      gpus
    }
  } catch {
    return { nvenc: false, amf: false, qsv: false, gpus: [] }
  }
}

function getFileSizeSync(filePath) {
  try {
    if (filePath && existsSync(filePath)) {
      return statSync(filePath).size
    }
  } catch {
    // ignore
  }
  return 0
}

function substituteVariables(pattern, inputFile, configTitle, idx) {
  const ext = path.extname(inputFile).slice(1)
  const name = path.basename(inputFile, path.extname(inputFile))
  const fulldir = path.dirname(inputFile).replace(/\\/g, '/')
  const folder = path.basename(fulldir)

  const now = new Date()
  const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0')
  const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0')
  const datetimeStr = `${dateStr}_${timeStr}`

  let result = pattern
    .replace(/{name}/g, name)
    .replace(/{ext}/g, ext)
    .replace(/{dirname}/g, fulldir)
    .replace(/{fulldir}/g, fulldir)
    .replace(/{folder}/g, folder)
    .replace(/{date}/g, dateStr)
    .replace(/{datetime}/g, datetimeStr)
    .replace(/{config}/g, configTitle || 'default')
    .replace(/{idx}/g, String(idx + 1))

  return path.resolve(result).replace(/\\/g, '/')
}

function buildFfmpegArgs(input, output, config, gpuSupport, chosenEncoder) {
  const args = ['-y']

  // Parse sub-files first
  let subFiles = []
  if (config) {
    if (typeof config.files === 'string') {
      try {
        subFiles = JSON.parse(config.files)
      } catch {
        // ignore
      }
    } else if (Array.isArray(config.files)) {
      subFiles = config.files
    }
  }
  subFiles = subFiles.filter(f => f.hidden !== true)

  // Inputs
  args.push('-i', input)

  let inputCount = 1
  let bgInputIndex = -1
  let hasBgFile = false
  if (config && config.background_type === 'file' && config.background_file) {
    if (isImageFile(config.background_file)) {
      args.push('-loop', '1')
    } else {
      args.push('-stream_loop', '-1')
    }
    args.push('-i', config.background_file)
    bgInputIndex = inputCount
    inputCount++
    hasBgFile = true
  }

  const subFileInputIndices = []
  if (subFiles && subFiles.length > 0) {
    subFiles.forEach((file) => {
      if (isImageFile(file.path)) {
        args.push('-loop', '1')
      } else {
        args.push('-stream_loop', '-1')
      }
      args.push('-i', file.path)
      subFileInputIndices.push(inputCount)
      inputCount++
    })
  }

  // Video filter construction
  let filterComplex = ''
  let currentTag = '[0:v]'

  if (config) {
    // 1. Zoom (static center scale & crop to avoid zoompan errors)
    if (config.zoom_enable && config.zoom_ratio > 1) {
      const z = config.zoom_ratio
      filterComplex += `${currentTag}scale=w=iw*${z}:h=ih*${z},crop=w=iw:h=ih[vzoom];`
      currentTag = '[vzoom]'
    }

    // 2. Flips
    if (config.hflip_enable) {
      if (config.hflip_all) {
        filterComplex += `${currentTag}hflip[vhflip];`
        currentTag = '[vhflip]'
      } else {
        const start = config.hflip_time_start || 0
        const dur = config.hflip_time_duration || 0
        filterComplex += `${currentTag}hflip=enable='between(t,${start},${start + dur})'[vhflip];`
        currentTag = '[vhflip]'
      }
    }
    if (config.vflip_enable) {
      if (config.vflip_all) {
        filterComplex += `${currentTag}vflip[vvflip];`
        currentTag = '[vvflip]'
      } else {
        const start = config.vflip_time_start || 0
        const dur = config.vflip_time_duration || 0
        filterComplex += `${currentTag}vflip=enable='between(t,${start},${start + dur})'[vvflip];`
        currentTag = '[vvflip]'
      }
    }

    // 3. Aspect Ratio & Background
    if (config.aspect_ratio > 0) {
      let tw = 1920, th = 1080
      if (config.aspect_ratio === 2) {
        tw = 1080
        th = 1920
      } else if (config.aspect_ratio === 3) {
        tw = 1080
        th = 1080
      } else if (config.aspect_ratio === 4) {
        tw = 1440
        th = 1080
      }

      if (config.background_type === 'color') {
        const color = config.background_color || '#000000'
        filterComplex += `color=c=${color}:s=${tw}x${th}[vbg];`
        filterComplex += `${currentTag}scale=${tw}:${th}:force_original_aspect_ratio=decrease[vfg];`
        filterComplex += `[vbg][vfg]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2[vbgoverlay];`
        currentTag = '[vbgoverlay]'
      } else if (config.background_type === 'boxblur') {
        const blur = config.background_boxblur || 10
        filterComplex += `${currentTag}split[vsplit1][vsplit2];`
        filterComplex += `[vsplit1]scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},boxblur=${blur}[vbg];`
        filterComplex += `[vsplit2]scale=${tw}:${th}:force_original_aspect_ratio=decrease[vfg];`
        filterComplex += `[vbg][vfg]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2[vbgoverlay];`
        currentTag = '[vbgoverlay]'
      } else if (config.background_type === 'file' && hasBgFile) {
        filterComplex += `[${bgInputIndex}:v]scale=${tw}:${th}[vbg];`
        filterComplex += `${currentTag}scale=${tw}:${th}:force_original_aspect_ratio=decrease[vfg];`
        filterComplex += `[vbg][vfg]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2:shortest=1[vbgoverlay];`
        currentTag = '[vbgoverlay]'
      }
    }

    // 4. Scale
    if (config.scale_w > 0 && config.scale_h > 0) {
      const sw = Math.max(2, Math.floor(config.scale_w / 2) * 2)
      const sh = Math.max(2, Math.floor(config.scale_h / 2) * 2)
      filterComplex += `${currentTag}scale=${sw}:${sh}[vscale];`
      currentTag = '[vscale]'
    }

    // 4.5. Sub-files (Image & Video overlays)
    if (subFiles && subFiles.length > 0) {
      subFiles.forEach((file, idx) => {
        const inputIdx = subFileInputIndices[idx]
        const w = Math.max(2, Math.floor((file.w || 100) / 2) * 2)
        const h = Math.max(2, Math.floor((file.h || 100) / 2) * 2)
        const x = Math.round(file.x || 0)
        const y = Math.round(file.y || 0)
        const subTag = `vsubfile${idx}`
        const overlayTag = `vsuboverlay${idx}`

        filterComplex += `[${inputIdx}:v]scale=${w}:${h}[${subTag}];`
        filterComplex += `${currentTag}[${subTag}]overlay=${x}:${y}:shortest=1[${overlayTag}];`
        currentTag = `[${overlayTag}]`
      })
    }

    // 5. Labels (Text overlay)
    let labels = []
    if (typeof config.labels === 'string') {
      try {
        labels = JSON.parse(config.labels)
      } catch {
        // ignore
      }
    } else if (Array.isArray(config.labels)) {
      labels = config.labels
    }
    labels = labels.filter(l => l.hidden !== true)

    if (labels && labels.length > 0) {
      const isWin = process.platform === 'win32'
      labels.forEach((lbl, idx) => {
        const text = (lbl.text || '').replace(/'/g, '\'\\\\\'\'')
        const color = lbl.color || 'white'
        const resizeMode = lbl.resizeMode || 'scale'
        const scaleX = resizeMode === 'scale' ? (lbl.scaleX ?? 1) : 1
        const size = Math.max(8, Math.round((lbl.size || 24) * scaleX))
        const x = Math.round(lbl.x || 0)
        const y = Math.round(lbl.y || 0)

        let boxBorder = ''
        if (lbl.box) {
          const bColor = lbl.boxColor || '#A3A3A3'
          const bOpacity = lbl.boxOpacity ?? 0.5
          const bBorderW = Math.round((lbl.boxBorderW || 10) * scaleX)
          boxBorder = `:box=1:boxcolor=${bColor}@${bOpacity}:boxborderw=${bBorderW}`
        }

        const fontParam = isWin ? 'fontfile=\'C\\:/Windows/Fonts/arial.ttf\'' : 'font=\'Arial\''
        const tag = `vlabel${idx}`
        filterComplex += `${currentTag}drawtext=${fontParam}:text='${text}':fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}${boxBorder}[${tag}];`
        currentTag = `[${tag}]`
      })
    }

    // 6. Subtitles
    if (config.subtitle) {
      const escapedSubPath = config.subtitle.replace(/\\/g, '/').replace(/:/g, '\\:')
      filterComplex += `${currentTag}subtitles='${escapedSubPath}'[vsub];`
      currentTag = '[vsub]'
    }

    // 7. Speed
    if (config.speed && config.speed !== 1) {
      filterComplex += `${currentTag}setpts=1/${config.speed}*PTS[vspeed];`
      currentTag = '[vspeed]'
    }
  }

  // Ensure final output dimensions are always even numbers (divisible by 2) for H.264/H.265
  if (filterComplex) {
    filterComplex += `${currentTag}scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1[vout];`
    currentTag = '[vout]'

    if (filterComplex.endsWith(';')) {
      filterComplex = filterComplex.slice(0, -1)
    }
    args.push('-filter_complex', filterComplex, '-map', currentTag)
  } else {
    args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1')
  }

  // Audio filters
  let audioFilters = []
  if (config) {
    if (config.speed && config.speed !== 1) {
      let s = config.speed
      while (s > 2) {
        audioFilters.push('atempo=2.0')
        s /= 2
      }
      while (s < 0.5) {
        audioFilters.push('atempo=0.5')
        s /= 0.5
      }
      audioFilters.push(`atempo=${s}`)
    }
    if (config.volume !== undefined && config.volume !== 1) {
      audioFilters.push(`volume=${config.volume}`)
    }
  }

  if (audioFilters.length > 0) {
    args.push('-filter:a', audioFilters.join(','))
  } else {
    // Map default audio
    args.push('-map', '0:a?')
  }

  // Video and Audio Encoders
  let vEncoder = 'libx264'
  if (chosenEncoder) {
    if (chosenEncoder === 'nvenc' && gpuSupport.nvenc) vEncoder = 'h264_nvenc'
    else if (chosenEncoder === 'amf' && gpuSupport.amf) vEncoder = 'h264_amf'
    else if (chosenEncoder === 'qsv' && gpuSupport.qsv) vEncoder = 'h264_qsv'
  } else if (gpuSupport) {
    if (gpuSupport.nvenc) vEncoder = 'h264_nvenc'
    else if (gpuSupport.amf) vEncoder = 'h264_amf'
    else if (gpuSupport.qsv) vEncoder = 'h264_qsv'
  }

  if (vEncoder === 'libx264') {
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p')
  } else if (vEncoder === 'h264_nvenc') {
    args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23', '-pix_fmt', 'yuv420p')
  } else if (vEncoder === 'h264_amf') {
    args.push('-c:v', 'h264_amf', '-quality', 'balanced', '-pix_fmt', 'yuv420p')
  } else if (vEncoder === 'h264_qsv') {
    args.push('-c:v', 'h264_qsv', '-global_quality', '23', '-pix_fmt', 'nv12')
  } else {
    args.push('-c:v', vEncoder, '-pix_fmt', 'yuv420p')
  }

  args.push('-c:a', 'aac', '-b:a', '128k')
  args.push('-y', output)

  return args
}

function resolveTasks(args) {
  const gpuSupport = detectGpuSupport()
  const exe = resolveExecutable().ffmpeg

  return (args || []).map((task, i) => {
    const meta = task.meta || {}
    let finalArgs = task.args

    // Resolve output via variables substitution
    if (meta.outputPattern) {
      const substitutedOutput = substituteVariables(meta.outputPattern, meta.input, meta.configTitle, i)
      meta.output = substitutedOutput
    }

    const config = meta.config || (meta.configId ? sqlite.getFfmpegConfig(meta.configId) : null)
    if (config) {
      finalArgs = buildFfmpegArgs(meta.input, meta.output, config, gpuSupport, task.options?.encoder)
    }

    if (meta.output) {
      const outDir = path.dirname(meta.output)
      if (outDir && !existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true })
      }
    }

    return {
      ...task,
      command: exe,
      args: finalArgs,
      meta: { ...meta, taskKey: i, thread: i }
    }
  })
}

function setTasks(event, args) {
  const tasks = resolveTasks(args)
  taskManager.setTasks(tasks)
}

function setGroupTasks(event, args) {
  const exe = resolveExecutable().ffmpeg
  const gpuSupport = detectGpuSupport()
  const groups = (args || []).map((group, g) => group.map((task, j) => {
    const meta = task.meta || {}
    let finalArgs = task.args

    if (meta.outputPattern) {
      const substitutedOutput = substituteVariables(meta.outputPattern, meta.input, meta.configTitle, g)
      meta.output = substitutedOutput
    }

    const config = meta.config || (meta.configId ? sqlite.getFfmpegConfig(meta.configId) : null)
    if (config) {
      finalArgs = buildFfmpegArgs(meta.input, meta.output, config, gpuSupport)
    }

    if (meta.output) {
      const outDir = path.dirname(meta.output)
      if (outDir && !existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true })
      }
    }

    return {
      ...task,
      command: exe,
      args: finalArgs,
      meta: { ...meta, taskKey: j, thread: 0 }
    }
  }))
  taskManager.setGroupedTasks(groups)
}

function startTasks(event) {
  updateUI.lastSend = 0
  taskManager.beforeRunTask = (thread, idx, task) => {
    const response = { ...buildResponse(task), taskKey: idx, thread, percent: 0, done: false }
    send(event, `${moduleName}:beforeRunTask`, response)
  }

  taskManager.onTaskStderr = (thread, idx, task, data) => {
    const line = data.toString()

    // Extract duration from FFmpeg header if missing
    if (!task.meta) task.meta = {}
    if (!task.meta.duration) {
      const durMatch = line.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/)
      if (durMatch) {
        task.meta.duration = parseTimeToSeconds(durMatch[1])
      }
    }

    // Match current encoding time and speed
    const timeMatch = line.match(/time=(\d+:\d+:\d+(?:\.\d+)?)/)
    if (!timeMatch) return

    const currentSec = parseTimeToSeconds(timeMatch[1])
    const duration = task.meta.duration || 0
    const speedMatch = line.match(/speed=\s*([\d.]+)x/)

    let percent = 0
    if (duration > 0) {
      percent = Math.min(99, Math.round((currentSec / duration) * 100))
    }

    const now = Date.now()
    if (now - updateUI.lastSend < updateUI.delay) return
    updateUI.lastSend = now

    const response = {
      ...buildResponse(task),
      taskKey: idx,
      thread,
      percent,
      speed: speedMatch ? `${speedMatch[1]}x` : undefined,
      done: false
    }
    send(event, `${moduleName}:progressTask`, response)
  }

  taskManager.afterRunTask = (pid, thread, idx, task, code, signal, stdout, stderr) => {
    const meta = task.meta || {}
    const response = { ...buildResponse(task), taskKey: idx, thread, percent: 100, done: true, code }
    send(event, `${moduleName}:progressTask`, response)

    // Save to history SQLite
    sqlite.addFfmpegHistory({
      config_id: meta.configId || null,
      config_title: meta.configTitle || null,
      batch_config_id: meta.batchConfigId || null,
      batch_config_title: meta.batchConfigTitle || null,
      input_file: meta.input || null,
      input_files: meta.inputs ? JSON.stringify(meta.inputs) : null,
      output_file: meta.output || null,
      output_path: meta.outPath || (meta.output ? path.dirname(meta.output) : null),
      operation: meta.operation || 'render',
      duration: meta.duration || 0,
      file_size: code === 0 ? getFileSizeSync(meta.output) : 0,
      status: code === 0 ? 'completed' : 'failed',
      error_message: code === 0 ? null : stderr.slice(-500),
      threads: meta.threads || 1,
      started_at: meta.startedAt || new Date().toISOString(),
      completed_at: new Date().toISOString()
    })
  }

  taskManager.onAllTasksDone = (total) => {
    send(event, `${moduleName}:allTasksDone`, { total })
  }

  taskManager.onTaskError = (thread, idx, task, code, signal, stderr) => {
    const response = { ...buildResponse(task), taskKey: idx, thread, percent: 0, done: false, message: stderr, code }
    send(event, `${moduleName}:errorTask`, response)
  }

  taskManager.onTaskRetry = (idx, retryCount) => {
    send(event, `${moduleName}:taskRetry`, { taskKey: idx, retryCount })
  }

  taskManager.onTaskTimeout = (idx) => {
    send(event, `${moduleName}:taskTimeout`, { taskKey: idx })
  }

  taskManager.start().catch(() => { })
}

function parseTimeToSeconds(time) {
  const parts = String(time).split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

function getMediaInfo(event, args) {
  return new Promise((resolve) => {
    const exe = resolveExecutable().ffprobe
    const child = spawn(exe, args || [])
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    child.on('close', (code, signal) => {
      resolve({ pid: child.pid, code, signal, stdout, stderr })
    })
    child.on('error', (err) => {
      resolve({ pid: 0, code: -1, signal: null, stdout: '', stderr: err.message })
    })
  })
}

function globFiles(event, pattern) {
  try {
    const normalized = pattern.replace(/\\/g, '/')
    const lastSlash = normalized.lastIndexOf('/')
    if (lastSlash === -1) return []
    const dir = normalized.slice(0, lastSlash) || '.'
    const filePattern = normalized.slice(lastSlash + 1)

    if (!existsSync(dir)) return []

    const regexStr = '^' + filePattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.') + '$'
    const regex = new RegExp(regexStr, 'i')

    const files = require('fs').readdirSync(dir)
    return files
      .filter(f => regex.test(f))
      .map(f => path.join(dir, f).replace(/\\/g, '/'))
  } catch {
    return []
  }
}

function registerFfmpegController() {
  ipcMain.handle(`${moduleName}:globFiles`, (event, pattern) => globFiles(event, pattern))
  ipcMain.handle(`${moduleName}:checkExecutable`, async () => {
    const exe = resolveExecutable()
    const rs = {}
    for (const [key, value] of Object.entries(exe)) {
      if (key === 'ytDlp') continue
      const exists = existsSync(value)
      let isValid = false
      if (exists) {
        isValid = await verifyExecutable(value, key)
      }
      rs[key] = { path: value, exists, isValid }
    }
    return { data: rs, status: Object.values(rs).every(v => v.exists && v.isValid) }
  })

  ipcMain.handle(`${moduleName}:getStatus`, () => taskManager.getStatus())
  ipcMain.handle(`${moduleName}:getTasks`, () => {
    return taskManager.tasks.map((task, idx) => {
      const status = taskManager.taskStatus[idx] || 'waiting'
      const progress = status === 'completed' ? 100 : 0
      return {
        key: idx,
        task,
        status,
        retry: taskManager.retryCount[idx] || 0,
        progress,
        speed: '0',
        downloaded: ''
      }
    })
  })

  ipcMain.handle(`${moduleName}:initTaskManager`, (event, args) => initTaskManager(event, args))

  ipcMain.handle(`${moduleName}:setTasks`, (event, args) => setTasks(event, args))

  ipcMain.handle(`${moduleName}:setGroupTasks`, (event, args) => setGroupTasks(event, args))

  ipcMain.handle(`${moduleName}:startTasks`, event => startTasks(event))

  ipcMain.handle(`${moduleName}:pauseTasks`, async () => {
    await taskManager.pause()
    return taskManager.getStatus()
  })

  ipcMain.handle(`${moduleName}:continueTasks`, async () => {
    await taskManager.continue()
    return taskManager.getStatus()
  })

  ipcMain.handle(`${moduleName}:stopTask`, async (event, idx) => {
    await taskManager.stopTask(idx)
    send(event, `${moduleName}:stoppedTask`, true)
    return taskManager.getStatus()
  })

  ipcMain.handle(`${moduleName}:stopTasks`, async (event) => {
    await taskManager.stop()
    send(event, `${moduleName}:stoppedTasks`, true)
    return taskManager.getStatus()
  })

  ipcMain.handle(`${moduleName}:getMediaInfo`, (event, args) => getMediaInfo(event, args))

  // SQLite CRUD handlers
  ipcMain.handle(`${moduleName}:listFfmpegConfigs`, () => sqlite.listFfmpegConfigs())
  ipcMain.handle(`${moduleName}:createFfmpegConfig`, (event, data) => {
    const id = sqlite.createFfmpegConfig(data)
    return { status: true, data: { id } }
  })
  ipcMain.handle(`${moduleName}:updateFfmpegConfig`, (event, { id, data }) => {
    sqlite.updateFfmpegConfig(id, data)
    return { status: true }
  })
  ipcMain.handle(`${moduleName}:deleteFfmpegConfig`, (event, id) => {
    sqlite.deleteFfmpegConfig(id)
    return { status: true }
  })

  ipcMain.handle(`${moduleName}:listFfmpegBatchConfigs`, () => sqlite.listFfmpegBatchConfigs())
  ipcMain.handle(`${moduleName}:createFfmpegBatchConfig`, (event, data) => {
    const id = sqlite.createFfmpegBatchConfig(data)
    return { status: true, data: { id } }
  })
  ipcMain.handle(`${moduleName}:updateFfmpegBatchConfig`, (event, { id, data }) => {
    sqlite.updateFfmpegBatchConfig(id, data)
    return { status: true }
  })
  ipcMain.handle(`${moduleName}:deleteFfmpegBatchConfig`, (event, id) => {
    sqlite.deleteFfmpegBatchConfig(id)
    return { status: true }
  })

  ipcMain.handle(`${moduleName}:listFfmpegHistory`, (event, limit) => sqlite.listFfmpegHistory(limit))
  ipcMain.handle(`${moduleName}:deleteFfmpegHistory`, (event, id) => {
    sqlite.deleteFfmpegHistory(id)
    return { status: true }
  })
  ipcMain.handle(`${moduleName}:detectGpuSupport`, () => detectGpuSupport())

  app.on('will-quit', () => {
    taskManager.stop().catch(() => { })
  })
}

module.exports = {
  registerFfmpegController, ffmpegEvents: {
    managerInitialized: `${moduleName}:managerInitialized`,
    beforeRunTask: `${moduleName}:beforeRunTask`,
    progressTask: `${moduleName}:progressTask`,
    allTasksDone: `${moduleName}:allTasksDone`,
    stoppedTask: `${moduleName}:stoppedTask`,
    stoppedTasks: `${moduleName}:stoppedTasks`,
    errorTask: `${moduleName}:errorTask`,
    taskRetry: `${moduleName}:taskRetry`,
    taskTimeout: `${moduleName}:taskTimeout`
  }
}
