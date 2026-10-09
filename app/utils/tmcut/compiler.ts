import type { TmcutProject } from '~/composables/useTmcutProject'
import { buildFfmpegFitFilters } from '~/utils/tmcut/canvas'

export type TmcutCompileMode = 'video' | 'audio' | 'gif'

export interface TmcutCompileRange {
  start: number
  end: number
}

export interface CompileOptions {
  encoder?: string
  crf?: number
  bitrate?: number
  /** Output mode: full video (default), audio-only export, or animated GIF. */
  mode?: TmcutCompileMode
  /** In/Out render zone (design #3). Clamped to the timeline; out > in required. */
  range?: TmcutCompileRange | null
  /** Output resolution multiplier relative to the canvas (1 = native). */
  outScale?: number
  /** Output frame rate (defaults to the canvas fps). */
  outFps?: number
  /** MP3 bitrate in kbps (audio mode only). */
  audioBitrate?: number
}

export interface CompileResult {
  args: string[]
  duration: number
  summary: string
}

/**
 * Escapes text for FFmpeg drawtext filter
 */
function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\'\\\'\'')
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
}

/**
 * Converts a CSS hex color (#RRGGBB) into an FFmpeg color value (0xRRGGBB)
 */
function ffmpegColor(color: string | undefined): string {
  if (!color) return 'black'
  const hex = color.replace('#', '')
  if (/^[0-9a-fA-F]{6}$/.test(hex) || /^[0-9a-fA-F]{8}$/.test(hex)) {
    return `0x${hex}`
  }
  return color
}

/**
 * Audio-only compile path (design #3 "Audio only" mode): renders the audio
 * of every video clip plus background audio clips at a uniform 48 kHz,
 * honoring the In/Out range. Output codec follows the file extension
 * (.wav → PCM, anything else → MP3).
 */
function compileAudioOnly(
  outputPath: string,
  videoClips: Array<{ src?: string, in: number, out: number, volume?: number }>,
  audioClips: Array<{ src?: string, in: number, out: number, offset?: number, volume?: number }>,
  options: CompileOptions,
  outputDuration: number,
  range: TmcutCompileRange | null
): CompileResult {
  if (videoClips.length === 0 && audioClips.length === 0) {
    throw new Error('Timeline has no audio to export')
  }

  const args: string[] = []
  const chains: string[] = []
  const trackAuds: string[] = []
  let inputIdx = 0

  // Track audio (from video clips), resampled to a uniform 48 kHz so the
  // concat and the MP3 encoder always get a supported layout.
  for (const clip of videoClips) {
    args.push('-i', clip.src!)
    const out = `[aud_${inputIdx}]`
    const vol = (clip.volume ?? 100) / 100
    chains.push(
      `[${inputIdx}:a]atrim=start=${clip.in}:end=${clip.out},asetpts=PTS-STARTPTS,aresample=48000,volume=${vol}${out}`
    )
    trackAuds.push(out)
    inputIdx++
  }

  let current = ''
  if (trackAuds.length > 1) {
    chains.push(`${trackAuds.join('')}concat=n=${trackAuds.length}:v=0:a=1[a_cat]`)
    current = '[a_cat]'
  } else if (trackAuds.length === 1) {
    current = trackAuds[0]!
  }

  // Background audio clips, delayed to their timeline offset
  const bgmAuds: string[] = []
  for (const aClip of audioClips) {
    args.push('-i', aClip.src!)
    const out = `[bgm_${inputIdx}]`
    const delayMs = Math.round((aClip.offset || 0) * 1000)
    const vol = (aClip.volume ?? 100) / 100
    chains.push(
      `[${inputIdx}:a]atrim=start=${aClip.in}:end=${aClip.out},asetpts=PTS-STARTPTS,aresample=48000,adelay=${delayMs}|${delayMs},volume=${vol}${out}`
    )
    bgmAuds.push(out)
    inputIdx++
  }

  if (bgmAuds.length > 0) {
    const mixInputs = current ? [current, ...bgmAuds] : bgmAuds
    if (mixInputs.length > 1) {
      chains.push(
        `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=2[a_mix]`
      )
      current = '[a_mix]'
    } else {
      current = mixInputs[0]!
    }
  }

  if (!current) {
    throw new Error('Timeline has no audio to export')
  }

  if (range) {
    chains.push(
      `${current}atrim=start=${range.start}:end=${range.end},asetpts=PTS-STARTPTS[a_ranged]`
    )
    current = '[a_ranged]'
  }

  const isWav = outputPath.toLowerCase().endsWith('.wav')
  args.push('-filter_complex', chains.join('; '), '-map', current)
  if (isWav) {
    args.push('-c:a', 'pcm_s16le')
  } else {
    args.push('-c:a', 'libmp3lame', '-b:a', `${options.audioBitrate || 320}k`)
  }
  args.push('-y', outputPath)

  return {
    args,
    duration: outputDuration,
    summary: `Render audio only (${outputDuration.toFixed(1)}s, ${isWav ? 'WAV' : 'MP3'})`
  }
}

/**
 * Compiles a TMCut project timeline into an FFmpeg command argument array.
 * Defaults (video mode, full range, native scale/fps) reproduce the original
 * single-mode compiler output exactly.
 */
export function compileTimelineToFfmpeg(
  project: TmcutProject,
  outputPath: string,
  options: CompileOptions = {}
): CompileResult {
  const canvasW = project.canvas?.width || 1920
  const canvasH = project.canvas?.height || 1080
  const fps = project.canvas?.fps || 30
  const mode: TmcutCompileMode = options.mode || 'video'

  const videoTrack = project.timeline.tracks.find(t => t.type === 'video')
  const textTrack = project.timeline.tracks.find(t => t.type === 'text')
  const audioTrack = project.timeline.tracks.find(t => t.type === 'audio')

  const videoClips = (videoTrack?.items || []).filter(c => !!c.src).sort((a, b) => a.offset - b.offset)
  const textClips = (textTrack?.items || []).filter(c => !!c.text)
  const audioClips = (audioTrack?.items || []).filter(c => !!c.src)

  // Calculate total duration in seconds
  let totalDuration = 0
  for (const clip of videoClips) {
    const dur = (clip.out - clip.in) / (clip.speed || 1)
    totalDuration = Math.max(totalDuration, clip.offset + dur)
  }
  for (const clip of audioClips) {
    const dur = (clip.out - clip.in) / (clip.speed || 1)
    totalDuration = Math.max(totalDuration, clip.offset + dur)
  }
  totalDuration = Math.max(1, totalDuration)

  // Clamp the In/Out render zone to the timeline (design #3 range selector)
  let range: TmcutCompileRange | null = null
  if (options.range) {
    const s = Math.max(0, Math.min(totalDuration, options.range.start))
    const e = Math.max(0, Math.min(totalDuration, options.range.end))
    if (e - s >= 0.05) range = { start: s, end: e }
  }
  const outputDuration = range ? range.end - range.start : totalDuration

  const outScale = options.outScale && options.outScale > 0 ? options.outScale : 1
  const outFps = options.outFps && options.outFps > 0 ? options.outFps : fps

  if (mode === 'audio') {
    return compileAudioOnly(outputPath, videoClips, audioClips, options, outputDuration, range)
  }

  const args: string[] = []
  const filterChains: string[] = []

  const bgColor = ffmpegColor(
    project.canvas?.background?.type === 'color' ? project.canvas?.background?.value : undefined
  )

  const isColorSource = videoClips.length === 0
  // GIF output carries no audio: skip every audio chain so no filter output
  // is left unconnected when nothing maps it.
  const hasAudio = mode !== 'gif'
  let currentVideoStream: string
  let currentAudioStream: string | null = null

  // Case 1: No video clips provided - generate a colored canvas video
  if (isColorSource) {
    filterChains.push(`color=c=${bgColor}:s=${canvasW}x${canvasH}:d=${totalDuration}:r=${fps}[v_base]`)
    currentVideoStream = '[v_base]'
    if (hasAudio) {
      filterChains.push(`anullsrc=r=44100:cl=stereo,atrim=end=${totalDuration}[a_base]`)
      currentAudioStream = '[a_base]'
    }

    // Apply text overlays if any
    for (let i = 0; i < textClips.length; i++) {
      const textClip = textClips[i]!
      const escaped = escapeDrawText(textClip.text || '')
      const fontSize = textClip.fontSize || 36
      const fontColor = textClip.color || 'white'
      const xOffset = textClip.x || 0
      const yOffset = textClip.y || 0
      const tStart = textClip.offset || 0
      const tEnd = tStart + (textClip.out - textClip.in) / (textClip.speed || 1)
      const nextVideoStream = `[v_txt_${i}]`

      filterChains.push(
        `${currentVideoStream}drawtext=text='${escaped}':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2+(${xOffset}):y=(h-text_h)/2+(${yOffset}):enable='between(t,${tStart},${tEnd})'${nextVideoStream}`
      )
      currentVideoStream = nextVideoStream
    }
  } else {
    // Case 2: Normal project with video clips — add each video input
    let inputIdx = 0
    const vStreams: string[] = []
    const aStreams: string[] = []

    for (const clip of videoClips) {
      args.push('-i', clip.src!)
      const currentInputIdx = inputIdx++

      const speed = clip.speed || 1
      const setpts = speed !== 1 ? `setpts=(PTS-STARTPTS)/${speed}` : 'setpts=PTS-STARTPTS'

      // Video stream processing (trim, setpts, fit mode filters, setsar)
      const fitFilters = buildFfmpegFitFilters(clip.fit || 'fit', canvasW, canvasH, {
        focusX: clip.focusX ?? 0.5,
        focusY: clip.focusY ?? 0.5,
        cropRect: clip.cropRect,
        padColor: bgColor
      })
      const vScaled = `[v_scaled_${currentInputIdx}]`
      filterChains.push(
        `[${currentInputIdx}:v]trim=start=${clip.in}:end=${clip.out},${setpts},${fitFilters.join(',')},setsar=1${vScaled}`
      )
      vStreams.push(vScaled)

      // Audio stream processing (atrim, asetpts, volume)
      if (hasAudio) {
        const vol = (clip.volume ?? 100) / 100
        const aTrimmed = `[a_trim_${currentInputIdx}]`
        filterChains.push(
          `[${currentInputIdx}:a]atrim=start=${clip.in}:end=${clip.out},asetpts=PTS-STARTPTS,volume=${vol}${aTrimmed}`
        )
        aStreams.push(aTrimmed)
      }
    }

    // Concatenate video clips (GIF output concatenates video only)
    if (hasAudio) {
      const concatInputs = vStreams.map((v, i) => `${v}${aStreams[i]}`).join('')
      filterChains.push(`${concatInputs}concat=n=${vStreams.length}:v=1:a=1[v_concat][a_concat]`)
      currentAudioStream = '[a_concat]'
    } else {
      filterChains.push(`${vStreams.join('')}concat=n=${vStreams.length}:v=1:a=0[v_concat]`)
    }
    currentVideoStream = '[v_concat]'

    // Apply text overlays if any
    for (let i = 0; i < textClips.length; i++) {
      const textClip = textClips[i]!
      const escaped = escapeDrawText(textClip.text || '')
      const fontSize = textClip.fontSize || 36
      const fontColor = textClip.color || 'white'
      const xOffset = textClip.x || 0
      const yOffset = textClip.y || 0
      const tStart = textClip.offset || 0
      const tEnd = tStart + (textClip.out - textClip.in) / (textClip.speed || 1)
      const nextVideoStream = `[v_txt_${i}]`

      filterChains.push(
        `${currentVideoStream}drawtext=text='${escaped}':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2+(${xOffset}):y=(h-text_h)/2+(${yOffset}):enable='between(t,${tStart},${tEnd})'${nextVideoStream}`
      )
      currentVideoStream = nextVideoStream
    }

    // Apply background audio clips if any
    if (hasAudio && audioClips.length > 0) {
      const audioMixStreams = [currentAudioStream]
      for (let i = 0; i < audioClips.length; i++) {
        const aClip = audioClips[i]!
        args.push('-i', aClip.src!)
        const aInputIdx = inputIdx++
        const aProcessed = `[bgm_${i}]`
        const delayMs = Math.round((aClip.offset || 0) * 1000)
        const vol = (aClip.volume ?? 100) / 100

        filterChains.push(
          `[${aInputIdx}:a]atrim=start=${aClip.in}:end=${aClip.out},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${vol}${aProcessed}`
        )
        audioMixStreams.push(aProcessed)
      }

      const mixInputs = audioMixStreams.join('')
      filterChains.push(`${mixInputs}amix=inputs=${audioMixStreams.length}:duration=longest:dropout_transition=2[a_mixed]`)
      currentAudioStream = '[a_mixed]'
    }
  }

  // ---- Shared tail (video & GIF): output scale, In/Out range, terminal ----

  // Output resolution multiplier (design #3 resolution picker), applied after
  // drawtext so text positions stay in canvas coordinates.
  if (outScale !== 1) {
    filterChains.push(
      `${currentVideoStream}scale=trunc(iw*${outScale}/2)*2:trunc(ih*${outScale}/2)*2[v_out_scaled]`
    )
    currentVideoStream = '[v_out_scaled]'
  }

  // In/Out render zone: trim is the LAST step so drawtext enable windows
  // keep using absolute timeline seconds.
  if (range) {
    filterChains.push(
      `${currentVideoStream}trim=start=${range.start}:end=${range.end},setpts=PTS-STARTPTS[v_ranged]`
    )
    currentVideoStream = '[v_ranged]'
    if (currentAudioStream) {
      filterChains.push(
        `${currentAudioStream}atrim=start=${range.start}:end=${range.end},asetpts=PTS-STARTPTS[a_ranged]`
      )
      currentAudioStream = '[a_ranged]'
    }
  }

  // GIF terminal: 15 fps, max 1280 px wide, optimized palette (single pass)
  if (mode === 'gif') {
    const gifW = Math.min(1280, Math.max(160, Math.floor(canvasW * outScale / 2) * 2))
    filterChains.push(`${currentVideoStream}fps=15,scale=${gifW}:-2[gif_in]`)
    filterChains.push('[gif_in]split[gif_pre_a][gif_pre_b]')
    filterChains.push('[gif_pre_a]palettegen=stats_mode=diff[gif_pal]')
    filterChains.push('[gif_pre_b][gif_pal]paletteuse=dither=bayer:bayer_scale=4[gif_out]')

    // No `-f lavfi`: the color source lives inside filter_complex, and
    // "lavfi" is an input demuxer — not a muxer — so it must never be
    // passed as an output format.
    args.push(
      '-filter_complex', filterChains.join('; '),
      '-map', '[gif_out]',
      '-loop', '0',
      '-y',
      outputPath
    )
    return {
      args,
      duration: outputDuration,
      summary: `Render GIF ${gifW}px (${outputDuration.toFixed(1)}s, 15fps)`
    }
  }

  const filterComplex = filterChains.join('; ')
  args.push(
    '-filter_complex', filterComplex,
    '-map', currentVideoStream,
    '-map', currentAudioStream!,
    '-c:v', options.encoder || 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', String(options.crf || 22),
    '-r', String(outFps),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-y',
    outputPath
  )

  return {
    args,
    duration: outputDuration,
    summary: `Render ${videoClips.length} clips to ${canvasW}x${canvasH} (${outputDuration.toFixed(1)}s)`
  }
}
