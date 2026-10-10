import type { TmcutProject, TmcutTimelineItem } from '~/composables/useTmcutProject'
import { buildFfmpegFitFilters, buildFfmpegTransform } from '~/utils/tmcut/canvas'
import { volumeExpr } from '@tmcut-core'

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
  /** Export-time noise reduction: ONE global afftdn on the final audio bus (roadmap D-3). */
  denoise?: boolean
  /** Color LUT: absolute path of a .cube file graded onto the footage before drawtext (roadmap E-4). */
  lut3dPath?: string
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
 * Fade envelope for one clip's audio chain (roadmap R5, core C12):
 * `volumeExpr` builds a clip-LOCAL expression (t = seconds since clip
 * start), so the filter must run while timestamps still begin at 0 —
 * BEFORE any adelay positions background audio on the timeline. No
 * fades -> '1' -> the chain stays byte-identical to before. The static
 * volume percent remains its own `volume=` filter (core contract).
 * `eval=frame` is REQUIRED: the volume filter defaults to eval=once,
 * which freezes the expression at init (verified against ffmpeg — a
 * constant-1 evaluation left the fade completely silent-less).
 */
function fadeFilter(clip: {
  in: number
  out: number
  speed?: number
  volume?: number
  fade?: { in: number, out: number }
}): string {
  const expr = volumeExpr(clip)
  return expr === '1' ? '' : `,volume='${expr}':eval=frame`
}

/**
 * lut3d file argument (roadmap E-4). Two parse levels, verified against
 * ffmpeg: the filtergraph scan honors single quotes only while SPLITTING
 * (protecting , ; [ ] and spaces from the chain split) and then STRIPS
 * them, so the option parser below would die on a drive-letter ':' — the
 * colons must be backslash-escaped (backslashes inside level-1 quotes
 * pass through literally). Forward slashes keep the path portable and
 * dodge Windows backslash rules entirely. Apostrophes cannot survive the
 * two-level quoting at all: reject loudly instead of emitting a filter
 * FFmpeg would choke on mid-export.
 */
function filterPathArg(filePath: string): string {
  if (filePath.includes('\'')) {
    throw new Error('File path cannot contain an apostrophe')
  }
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:')
}

function lutFileFilter(filePath: string): string {
  return `lut3d=file='${filterPathArg(filePath)}'`
}

/** Structural fields a text overlay reads — shared by both compile paths. */
type TextOverlayClip = Pick<TmcutTimelineItem, 'text' | 'fontSize' | 'color' | 'x' | 'y' | 'offset' | 'in' | 'out' | 'speed' | 'fontFile'>

/**
 * drawtext filter for ONE text clip (roadmap C-1): the color-source path
 * and the footage path used to duplicate this string verbatim — it lives
 * here so the two can never drift. `fontFile` is the very file the
 * preview's fontFamily points at (same face on both ends) and goes
 * through the shared two-level filtergraph escaping documented above.
 */
function textOverlayFilter(clip: TextOverlayClip): string {
  const escaped = escapeDrawText(clip.text || '')
  const fontSize = clip.fontSize || 36
  const fontColor = clip.color || 'white'
  const xOffset = clip.x || 0
  const yOffset = clip.y || 0
  const tStart = clip.offset || 0
  const tEnd = tStart + (clip.out - clip.in) / (clip.speed || 1)
  const fontFileArg = clip.fontFile ? `fontfile='${filterPathArg(clip.fontFile)}':` : ''
  return `drawtext=${fontFileArg}text='${escaped}':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2+(${xOffset}):y=(h-text_h)/2+(${yOffset}):enable='between(t,${tStart},${tEnd})'`
}

/**
 * Audio-only compile path (design #3 "Audio only" mode): renders the audio
 * of every video clip plus background audio clips at a uniform 48 kHz,
 * honoring the In/Out range. Output codec follows the file extension
 * (.wav → PCM, anything else → MP3).
 */
function compileAudioOnly(
  outputPath: string,
  videoClips: Array<{ src?: string, in: number, out: number, volume?: number, speed?: number, reverse?: boolean, fade?: { in: number, out: number } }>,
  audioClips: Array<{ src?: string, in: number, out: number, offset?: number, volume?: number, speed?: number, reverse?: boolean, fade?: { in: number, out: number } }>,
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
  // concat and the MP3 encoder always get a supported layout. Speed and
  // reverse retime each clip like the video path (roadmap R1) so the
  // audio-only export keeps the timeline's real durations.
  for (const clip of videoClips) {
    args.push('-i', clip.src!)
    const out = `[aud_${inputIdx}]`
    const vol = (clip.volume ?? 100) / 100
    const speed = clip.speed || 1
    const aSetpts = speed !== 1 ? `asetpts=(PTS-STARTPTS)/${speed}` : 'asetpts=PTS-STARTPTS'
    const aReverse = clip.reverse ? 'areverse,' : ''
    chains.push(
      `[${inputIdx}:a]atrim=start=${clip.in}:end=${clip.out},${aReverse}${aSetpts},aresample=48000,volume=${vol}${fadeFilter(clip)}${out}`
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

  // Background audio clips, delayed to their timeline offset (retime
  // first, position second — same order as the video-mode BGM path).
  const bgmAuds: string[] = []
  for (const aClip of audioClips) {
    args.push('-i', aClip.src!)
    const out = `[bgm_${inputIdx}]`
    const delayMs = Math.round((aClip.offset || 0) * 1000)
    const vol = (aClip.volume ?? 100) / 100
    const speed = aClip.speed || 1
    const aSetpts = speed !== 1 ? `asetpts=(PTS-STARTPTS)/${speed}` : 'asetpts=PTS-STARTPTS'
    const aReverse = aClip.reverse ? 'areverse,' : ''
    chains.push(
      `[${inputIdx}:a]atrim=start=${aClip.in}:end=${aClip.out},${aReverse}${aSetpts}${fadeFilter(aClip)},aresample=48000,adelay=${delayMs}|${delayMs},volume=${vol}${out}`
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

  // Noise reduction (roadmap D-3): ONE global afftdn on the mixed bus —
  // denoising per clip would rebuild the noise profile N times for no
  // audible gain over a single pass on the summed result.
  if (options.denoise) {
    chains.push(`${current}afftdn=nr=12[a_denoised]`)
    current = '[a_denoised]'
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
      const nextVideoStream = `[v_txt_${i}]`
      filterChains.push(`${currentVideoStream}${textOverlayFilter(textClip)}${nextVideoStream}`)
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
      // Reverse playback (roadmap R1/C4): the frame sequence flips after
      // retiming — setpts and reverse commute, so placement here only
      // needs to stay before the fit chain. Audio mirrors it with areverse.
      const reverseStep = clip.reverse ? ',reverse' : ''

      // Video stream processing (trim, setpts/reverse, fit mode filters,
      // setsar). rotation (roadmap C7) appends a `rotate` step after the
      // fit chain.
      const fitFilters = buildFfmpegFitFilters(clip.fit || 'fit', canvasW, canvasH, {
        focusX: clip.focusX ?? 0.5,
        focusY: clip.focusY ?? 0.5,
        cropRect: clip.cropRect,
        padColor: bgColor,
        rotation: clip.rotation
      })
      const clipDuration = (clip.out - clip.in) / speed
      // Clip transform (x/y/scale, roadmap R10): non-identity transforms
      // compose the canvas-sized stream over a solid background so scaled
      // content larger than the canvas (or gaps below 100%) render like the
      // preview. Identity clips keep the plain chain.
      const transform = buildFfmpegTransform({
        canvasW,
        canvasH,
        scale: clip.scale,
        x: clip.x,
        y: clip.y,
        fps,
        duration: clipDuration,
        bgColor
      })
      const vOut = `[v_scaled_${currentInputIdx}]`
      const clipChain = `[${currentInputIdx}:v]trim=start=${clip.in}:end=${clip.out},${setpts}${reverseStep},${fitFilters.join(',')},setsar=1`
      if (transform) {
        const vBg = `[v_bg_${currentInputIdx}]`
        const vFg = `[v_fg_${currentInputIdx}]`
        filterChains.push(`${transform.bg}${vBg}`)
        filterChains.push(`${clipChain},${transform.tail}${vFg}`)
        filterChains.push(`${vBg}${vFg}${transform.overlay}${vOut}`)
      } else {
        filterChains.push(`${clipChain}${vOut}`)
      }
      vStreams.push(vOut)

      // Audio stream processing (atrim, reverse, speed retime, volume).
      // ORDER MATTERS (verified against ffmpeg): areverse rebuilds its
      // output at the nominal sample rate, so it must run BEFORE the
      // speed asetpts — the other order silently undoes the retime.
      // Audio must retime exactly like video (roadmap R1) or the concat
      // segments drift out of sync.
      if (hasAudio) {
        const vol = (clip.volume ?? 100) / 100
        const aSetpts = speed !== 1 ? `asetpts=(PTS-STARTPTS)/${speed}` : 'asetpts=PTS-STARTPTS'
        const aReverse = clip.reverse ? 'areverse,' : ''
        const aTrimmed = `[a_trim_${currentInputIdx}]`
        filterChains.push(
          `[${currentInputIdx}:a]atrim=start=${clip.in}:end=${clip.out},${aReverse}${aSetpts},volume=${vol}${fadeFilter(clip)}${aTrimmed}`
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

    // Color LUT (roadmap E-4): grade the FOOTAGE before drawtext so
    // titles/graphics keep their authored colors (grading graphics is a
    // classic "why is my white title yellow" bug). Also before outScale,
    // so the LUT samples the full-resolution signal.
    if (options.lut3dPath) {
      filterChains.push(`${currentVideoStream}${lutFileFilter(options.lut3dPath)}[v_graded]`)
      currentVideoStream = '[v_graded]'
    }

    // Apply text overlays if any
    for (let i = 0; i < textClips.length; i++) {
      const textClip = textClips[i]!
      const nextVideoStream = `[v_txt_${i}]`
      filterChains.push(`${currentVideoStream}${textOverlayFilter(textClip)}${nextVideoStream}`)
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
        // Retime before positioning: reverse/speed the clip content first,
        // then adelay places the result at its timeline offset (R1). The
        // areverse-before-asetpts order is required — see the clip audio
        // chain comment above.
        const aSpeed = aClip.speed || 1
        const aSetpts = aSpeed !== 1 ? `asetpts=(PTS-STARTPTS)/${aSpeed}` : 'asetpts=PTS-STARTPTS'
        const aReverse = aClip.reverse ? 'areverse,' : ''

        filterChains.push(
          `[${aInputIdx}:a]atrim=start=${aClip.in}:end=${aClip.out},${aReverse}${aSetpts}${fadeFilter(aClip)},adelay=${delayMs}|${delayMs},volume=${vol}${aProcessed}`
        )
        audioMixStreams.push(aProcessed)
      }

      const mixInputs = audioMixStreams.join('')
      filterChains.push(`${mixInputs}amix=inputs=${audioMixStreams.length}:duration=longest:dropout_transition=2[a_mixed]`)
      currentAudioStream = '[a_mixed]'
    }
  }

  // Noise reduction (roadmap D-3): one global afftdn on the final audio
  // bus — after concat/mix and BEFORE the range trim below, so a ranged
  // export still feeds the noise profile warmed-up audio. GIF never
  // builds an audio stream (null), so this doubles as the mode gate.
  if (currentAudioStream && options.denoise) {
    filterChains.push(`${currentAudioStream}afftdn=nr=12[a_denoised]`)
    currentAudioStream = '[a_denoised]'
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
