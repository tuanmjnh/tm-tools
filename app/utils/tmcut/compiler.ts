import type { TmcutProject } from '~/composables/useTmcutProject'
import { buildFfmpegFitFilters } from '~/utils/tmcut/canvas'

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
 * Compiles a TMCut project timeline into an FFmpeg command argument array
 */
export function compileTimelineToFfmpeg(
  project: TmcutProject,
  outputPath: string,
  options: { encoder?: string, crf?: number, bitrate?: number } = {}
): CompileResult {
  const canvasW = project.canvas?.width || 1920
  const canvasH = project.canvas?.height || 1080
  const fps = project.canvas?.fps || 30

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

  const args: string[] = []
  const filterChains: string[] = []

  const bgColor = ffmpegColor(
    project.canvas?.background?.type === 'color' ? project.canvas?.background?.value : undefined
  )

  // Case 1: No video clips provided - generate a colored canvas video
  if (videoClips.length === 0) {
    filterChains.push(`color=c=${bgColor}:s=${canvasW}x${canvasH}:d=${totalDuration}:r=${fps}[v_base]`)
    filterChains.push(`anullsrc=r=44100:cl=stereo,atrim=end=${totalDuration}[a_base]`)

    let currentVideoStream = '[v_base]'

    // Apply text overlays if any
    if (textClips.length > 0) {
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
    }

    const filterComplex = filterChains.join('; ')
    args.push(
      '-f', 'lavfi',
      '-filter_complex', filterComplex,
      '-map', currentVideoStream,
      '-map', '[a_base]',
      '-c:v', options.encoder || 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', String(options.crf || 22),
      '-r', String(fps),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-y',
      outputPath
    )

    return {
      args,
      duration: totalDuration,
      summary: `Render black canvas ${canvasW}x${canvasH} (${totalDuration.toFixed(1)}s)`
    }
  }

  // Case 2: Normal project with video clips
  // Add each video input
  let inputIdx = 0
  const clipStreamMap: Array<{ vStream: string, aStream: string }> = []

  for (const clip of videoClips) {
    args.push('-i', clip.src!)
    const currentInputIdx = inputIdx++
    const aTrimmed = `[a_trim_${currentInputIdx}]`
    const vScaled = `[v_scaled_${currentInputIdx}]`

    const speed = clip.speed || 1
    const setpts = speed !== 1 ? `setpts=(PTS-STARTPTS)/${speed}` : 'setpts=PTS-STARTPTS'

    // Video stream processing (trim, setpts, fit mode filters, setsar)
    const fitFilters = buildFfmpegFitFilters(clip.fit || 'fit', canvasW, canvasH, {
      focusX: clip.focusX ?? 0.5,
      focusY: clip.focusY ?? 0.5,
      cropRect: clip.cropRect,
      padColor: bgColor
    })
    filterChains.push(
      `[${currentInputIdx}:v]trim=start=${clip.in}:end=${clip.out},${setpts},${fitFilters.join(',')},setsar=1${vScaled}`
    )

    // Audio stream processing (atrim, asetpts, volume)
    const vol = (clip.volume ?? 100) / 100
    filterChains.push(
      `[${currentInputIdx}:a]atrim=start=${clip.in}:end=${clip.out},asetpts=PTS-STARTPTS,volume=${vol}${aTrimmed}`
    )

    clipStreamMap.push({ vStream: vScaled, aStream: aTrimmed })
  }

  // Concatenate video clips
  const concatInputs = clipStreamMap.map(c => `${c.vStream}${c.aStream}`).join('')
  filterChains.push(`${concatInputs}concat=n=${clipStreamMap.length}:v=1:a=1[v_concat][a_concat]`)

  let currentVideoStream = '[v_concat]'
  let currentAudioStream = '[a_concat]'

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
  if (audioClips.length > 0) {
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

  const filterComplex = filterChains.join('; ')
  args.push(
    '-filter_complex', filterComplex,
    '-map', currentVideoStream,
    '-map', currentAudioStream,
    '-c:v', options.encoder || 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', String(options.crf || 22),
    '-r', String(fps),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-y',
    outputPath
  )

  return {
    args,
    duration: totalDuration,
    summary: `Render ${videoClips.length} clips to ${canvasW}x${canvasH} (${totalDuration.toFixed(1)}s)`
  }
}
