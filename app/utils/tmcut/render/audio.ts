import type { RenderClip } from './clip'
import type { CompileOptions, CompileResult, TmcutCompileRange } from './types'
import { volumeExpr, keyframeExpr } from '@tmcut-core'

/**
 * Fade envelope for one clip's audio chain (roadmap R5, core C12).
 */
export function fadeFilter(clip: {
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
 * Audio-only compile path (design #3 "Audio only" mode): renders the audio
 * of every video clip plus background audio clips at a uniform 48 kHz,
 * honoring the In/Out range. Output codec follows the file extension
 * (.wav → PCM, anything else → MP3). C16-R2: RenderClip views.
 */
export function compileAudioOnly(
  outputPath: string,
  videoClips: RenderClip[],
  audioClips: RenderClip[],
  options: CompileOptions,
  outputDuration: number,
  range: TmcutCompileRange | null
): CompileResult {
  if (videoClips.length === 0 && audioClips.length === 0) {
    throw new Error('Timeline has no audio to export')
  }

  const args: string[] = []
  const chains: string[] = []
  let inputIdx = 0
  const busStreams: string[] = []

  // Video track audio clips
  for (const clip of videoClips) {
    args.push('-i', clip.footagePath!)
    const idx = inputIdx++
    const out = `[a_v_${idx}]`
    const delayMs = Math.round(clip.offsetSec * 1000)
    const kfVol = keyframeExpr(clip.raw, 'volume', 't')
    const volFilter = kfVol ? `volume='(${kfVol})/100':eval=frame` : `volume=${clip.volumePct / 100}`
    const aSpeed = clip.speed
    const aSetpts = aSpeed !== 1 ? `asetpts=(PTS-STARTPTS)/${aSpeed}` : 'asetpts=PTS-STARTPTS'
    const aReverse = clip.raw.reverse ? 'areverse,' : ''

    chains.push(
      `[${idx}:a]atrim=start=${clip.inSec}:end=${clip.outSec},${aReverse}${aSetpts}${fadeFilter(clip.raw)},aresample=48000,${volFilter},adelay=${delayMs}|${delayMs}${out}`
    )
    busStreams.push(out)
  }

  // Audio track background clips
  for (const clip of audioClips) {
    args.push('-i', clip.footagePath!)
    const idx = inputIdx++
    const out = `[a_bg_${idx}]`
    const delayMs = Math.round(clip.offsetSec * 1000)
    const kfVol = keyframeExpr(clip.raw, 'volume', 't')
    const volFilter = kfVol ? `volume='(${kfVol})/100':eval=frame` : `volume=${clip.volumePct / 100}`
    const aSpeed = clip.speed
    const aSetpts = aSpeed !== 1 ? `asetpts=(PTS-STARTPTS)/${aSpeed}` : 'asetpts=PTS-STARTPTS'
    const aReverse = clip.raw.reverse ? 'areverse,' : ''

    chains.push(
      `[${idx}:a]atrim=start=${clip.inSec}:end=${clip.outSec},${aReverse}${aSetpts}${fadeFilter(clip.raw)},aresample=48000,${volFilter},adelay=${delayMs}|${delayMs}${out}`
    )
    busStreams.push(out)
  }

  let current = busStreams[0]!
  if (busStreams.length > 1) {
    chains.push(
      `${busStreams.join('')}amix=inputs=${busStreams.length}:duration=longest:dropout_transition=2[a_mixed]`
    )
    current = '[a_mixed]'
  }

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
 * Mixes timeline background audio clips with the current video audio bus.
 */
export function compileBackgroundAudio(
  graph: import('./graph').RenderGraph,
  currentAudioStream: string,
  audioClips: RenderClip[]
): string {
  if (audioClips.length === 0) return currentAudioStream

  const audioMixStreams = [currentAudioStream]
  for (let i = 0; i < audioClips.length; i++) {
    const aClip = audioClips[i]!
    const aInputIdx = graph.addInput(aClip.footagePath!)
    const aProcessed = `[bgm_${i}]`
    const delayMs = Math.round(aClip.offsetSec * 1000)
    const kfVol = keyframeExpr(aClip.raw, 'volume', 't')
    const volFilter = kfVol ? `volume='(${kfVol})/100':eval=frame` : `volume=${aClip.volumePct / 100}`
    const aSpeed = aClip.speed
    const aSetpts = aSpeed !== 1 ? `asetpts=(PTS-STARTPTS)/${aSpeed}` : 'asetpts=PTS-STARTPTS'
    const aReverse = aClip.raw.reverse ? 'areverse,' : ''

    graph.addFilterChain(
      `[${aInputIdx}:a]atrim=start=${aClip.inSec}:end=${aClip.outSec},${aReverse}${aSetpts}${fadeFilter(aClip.raw)},aresample=48000,${volFilter},adelay=${delayMs}|${delayMs}${aProcessed}`
    )
    audioMixStreams.push(aProcessed)
  }

  const mixInputs = audioMixStreams.join('')
  graph.addFilterChain(`${mixInputs}amix=inputs=${audioMixStreams.length}:duration=longest:dropout_transition=2[a_mixed]`)
  return '[a_mixed]'
}
