import type { RenderGraph } from './graph'
import type { RenderClip } from './clip'
import { renderClipDuration } from './clip'
import { opacityAlpha } from './graph'
import { fadeFilter } from './audio'
import { buildFfmpegFitFilters, buildFfmpegTransform } from '../canvas'
import { keyframeExpr, buildFfmpegEffectFilters, ticksToSec } from '@tmcut-core'

/**
 * Maps a TMCut transition type into an FFmpeg xfade transition name (roadmap R3, core C5).
 */
export function mapXfadeTransition(type: string | undefined): string {
  switch (type) {
    case 'dissolve':
      return 'dissolve'
    case 'wipe-left':
      return 'wipeleft'
    case 'wipe-right':
      return 'wiperight'
    case 'slide-left':
      return 'slideleft'
    case 'zoom-in':
      return 'zoomin'
    case 'fade':
    default:
      return 'fade'
  }
}

export interface VideoPipelineContext {
  canvasW: number
  canvasH: number
  fps: number
  bgColor: string
  hasAudio: boolean
  /** Base background stream label for image backgrounds (Phase 4). */
  bgBase?: string
}

/**
 * Compiles normal video clips, fitting, effects, transform/opacity, and
 * concatenates them with transitions. C16-R2: consumes RenderClip —
 * the render canonical view — never app-model v1 fields directly.
 */
export function compileVideoPipeline(
  graph: RenderGraph,
  videoClips: RenderClip[],
  ctx: VideoPipelineContext
): { videoStream: string, audioStream: string | null } {
  const vStreams: string[] = []
  const aStreams: string[] = []

  for (const clip of videoClips) {
    const currentInputIdx = graph.addInput(clip.footagePath!)

    const speed = clip.speed
    const setpts = speed !== 1 ? `setpts=(PTS-STARTPTS)/${speed}` : 'setpts=PTS-STARTPTS'
    const reverseStep = clip.raw.reverse ? ',reverse' : ''

    const fitFilters = buildFfmpegFitFilters(clip.fit, ctx.canvasW, ctx.canvasH, {
      focusX: clip.focusX,
      focusY: clip.focusY,
      cropRect: clip.raw.cropRect,
      padColor: ctx.bgColor,
      rotation: clip.rotation
    })
    const clipDuration = renderClipDuration(clip)

    const kfScale = keyframeExpr(clip.raw, 'scale', 't')
    const kfX = keyframeExpr(clip.raw, 'x', 't')
    const kfY = keyframeExpr(clip.raw, 'y', 't')
    const transform = buildFfmpegTransform({
      canvasW: ctx.canvasW,
      canvasH: ctx.canvasH,
      scale: clip.scalePct,
      x: clip.x,
      y: clip.y,
      scaleExpr: kfScale,
      xExpr: kfX,
      yExpr: kfY,
      fps: ctx.fps,
      duration: clipDuration,
      bgColor: ctx.bgColor,
      bgInput: ctx.bgBase
    })

    const kfOpacity = keyframeExpr(clip.raw, 'opacity', 'T')
    const opacityPct = clip.opacityPct
    const faded = opacityPct < 100
    let alphaArg = ''
    if (kfOpacity) {
      alphaArg = `,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*((${kfOpacity})/100)'`
    } else if (faded) {
      alphaArg = `,format=rgba,colorchannelmixer=aa=${opacityAlpha(opacityPct)}`
    }

    const effectFilters = buildFfmpegEffectFilters(clip.raw.effects)
    const effectChain = effectFilters.length > 0 ? `,${effectFilters.join(',')}` : ''
    const vOut = `[v_scaled_${currentInputIdx}]`
    const clipChain = `[${currentInputIdx}:v]trim=start=${clip.inSec}:end=${clip.outSec},${setpts}${reverseStep},${fitFilters.join(',')}${effectChain},setsar=1`

    if (transform) {
      const vFg = `[v_fg_${currentInputIdx}]`
      let vBg: string
      if (transform.bg) {
        vBg = `[v_bg_${currentInputIdx}]`
        graph.addFilterChain(`${transform.bg}${vBg}`)
      } else if (ctx.bgBase) {
        // Re-use the shared image background for this clip's transform.
        // R79 (real-FFmpeg verified): the base label attaches DIRECTLY to
        // the filter (`[v_bg]trim=…`) — `[v_bg],trim` parses as an EMPTY
        // filter ("No such filter: ''"), and a bare `[in][out]` relabel
        // chain has no filter either; both fail graph parsing.
        vBg = `[v_bg_trim_${currentInputIdx}]`
        graph.addFilterChain(`${ctx.bgBase}trim=start=${clip.inSec}:end=${clip.outSec + 2},setpts=PTS-STARTPTS${vBg}`)
      } else {
        // Fallback: emit empty node to keep the graph valid.
        vBg = `[v_bg_null_${currentInputIdx}]`
        graph.addFilterChain(`[${currentInputIdx}:v]null${vBg}`)
      }
      // With a shared looping-image base the overlay pads negotiate the
      // SOURCE image size at graph-config time, so concat later rejects the
      // stream ("Input link … do not match"). An explicit scale locks every
      // per-clip stream to the canvas size (real-FFmpeg verified, R79).
      const sizeLock = ctx.bgBase ? `,scale=${ctx.canvasW}:${ctx.canvasH},setsar=1` : ''
      graph.addFilterChain(`${clipChain},${transform.tail}${alphaArg}${vFg}`)
      graph.addFilterChain(`${vBg}${vFg}${transform.overlay}${sizeLock}${vOut}`)
    } else if (faded || kfOpacity) {
      const vBg = `[v_obg_${currentInputIdx}]`
      const vFg = `[v_ofg_${currentInputIdx}]`
      const bgSrc = ctx.bgBase
        ? `${ctx.bgBase}trim=start=${clip.inSec}:end=${clip.outSec + 2},setpts=PTS-STARTPTS${vBg}`
        : `color=c=${ctx.bgColor}:s=${ctx.canvasW}x${ctx.canvasH}:r=${ctx.fps}:d=${(clipDuration + 2).toFixed(3)}${vBg}`
      graph.addFilterChain(bgSrc)
      graph.addFilterChain(`${clipChain}${alphaArg}${vFg}`)
      const sizeLock = ctx.bgBase ? `,scale=${ctx.canvasW}:${ctx.canvasH},setsar=1` : ''
      graph.addFilterChain(`${vBg}${vFg}overlay=shortest=1${sizeLock}${vOut}`)
    } else {
      graph.addFilterChain(`${clipChain}${vOut}`)
    }
    vStreams.push(vOut)

    if (ctx.hasAudio) {
      const kfVol = keyframeExpr(clip.raw, 'volume', 't')
      const volFilter = kfVol ? `volume='(${kfVol})/100':eval=frame` : `volume=${(clip.volumePct) / 100}`
      const aSetpts = speed !== 1 ? `asetpts=(PTS-STARTPTS)/${speed}` : 'asetpts=PTS-STARTPTS'
      const aReverse = clip.raw.reverse ? 'areverse,' : ''
      const aTrimmed = `[a_trim_${currentInputIdx}]`
      graph.addFilterChain(
        `[${currentInputIdx}:a]atrim=start=${clip.inSec}:end=${clip.outSec},${aReverse}${aSetpts},${volFilter}${fadeFilter(clip)}${aTrimmed}`
      )
      aStreams.push(aTrimmed)
    }
  }

  // Concatenate video clips (roadmap R3: xfade & acrossfade when transitions exist)
  const hasTransitions = videoClips.some((c, i) => i > 0 && (c.transitionIn?.duration ?? 0) > 0)
  let currentVideoStream: string
  let currentAudioStream: string | null = null

  if (!hasTransitions || videoClips.length === 1) {
    if (ctx.hasAudio) {
      const concatInputs = vStreams.map((v, i) => `${v}${aStreams[i]}`).join('')
      graph.addFilterChain(`${concatInputs}concat=n=${vStreams.length}:v=1:a=1[v_concat][a_concat]`)
      currentAudioStream = '[a_concat]'
    } else {
      graph.addFilterChain(`${vStreams.join('')}concat=n=${vStreams.length}:v=1:a=0[v_concat]`)
    }
    currentVideoStream = '[v_concat]'
  } else {
    graph.addFilterChain(`${vStreams[0]}settb=1/${ctx.fps},fps=${ctx.fps}[v_chain_0]`)
    let currentV = '[v_chain_0]'
    let currentA = ctx.hasAudio ? aStreams[0]! : ''
    let runningDuration = renderClipDuration(videoClips[0]!)

    for (let i = 1; i < videoClips.length; i++) {
      const prevClip = videoClips[i - 1]!
      const currClip = videoClips[i]!
      const prevDur = renderClipDuration(prevClip)
      const currDur = renderClipDuration(currClip)
      const ti = currClip.transitionIn
      // transitionIn.duration always lived in ticks (v1compat passes it
      // through untouched) — C16-R3 drops the old >1000 guess: decode is
      // a plain ticksToSec now.
      const transSec = ticksToSec(ti?.duration ?? 0)
      const prevEnd = prevClip.offsetSec + prevDur
      const isIntact = (ti?.duration ?? 0) > 0
        && Math.abs(prevEnd - (currClip.offsetSec + transSec)) < 0.05
        && transSec <= Math.min(prevDur, currDur)

      const nextV = `[v_in_${i}]`
      graph.addFilterChain(`${vStreams[i]}settb=1/${ctx.fps},fps=${ctx.fps}${nextV}`)

      if (isIntact) {
        const transType = mapXfadeTransition(ti?.type)
        const offset = Math.max(0, runningDuration - transSec)
        const vOut = `[v_chain_${i}]`
        graph.addFilterChain(
          `${currentV}${nextV}xfade=transition=${transType}:duration=${transSec.toFixed(3)}:offset=${offset.toFixed(3)},settb=1/${ctx.fps},fps=${ctx.fps}${vOut}`
        )
        currentV = vOut

        if (ctx.hasAudio) {
          const aOut = `[a_chain_${i}]`
          graph.addFilterChain(
            `${currentA}${aStreams[i]}acrossfade=d=${transSec.toFixed(3)}:c1=tri:c2=tri${aOut}`
          )
          currentA = aOut
        }
        runningDuration = runningDuration + currDur - transSec
      } else {
        const vOut = `[v_chain_${i}]`
        graph.addFilterChain(
          `${currentV}${nextV}concat=n=2:v=1:a=0,settb=1/${ctx.fps},fps=${ctx.fps}${vOut}`
        )
        currentV = vOut

        if (ctx.hasAudio) {
          const aOut = `[a_chain_${i}]`
          graph.addFilterChain(
            `${currentA}${aStreams[i]}concat=n=2:v=0:a=1${aOut}`
          )
          currentA = aOut
        }
        runningDuration = runningDuration + currDur
      }
    }

    currentVideoStream = currentV
    if (ctx.hasAudio) {
      currentAudioStream = currentA
    }
  }

  return {
    videoStream: currentVideoStream,
    audioStream: currentAudioStream
  }
}
