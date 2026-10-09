import { ref, computed } from 'vue'
import { useTmcutProject } from './useTmcutProject'

// Shared playback state across TMCut editor
const playhead = ref(0) // Playhead position in seconds
const isPlaying = ref(false)
const zoom = ref(50) // Pixels per second (zoom level)
const videoRef = ref<HTMLVideoElement | null>(null)
// J-K-L shuttle rate: 1 = normal, 2/4/8 = fast forward, -1/-2/-4/-8 = reverse.
// Forward shuttle rides the native video playbackRate; reverse is seek-driven
// because HTMLVideoElement does not decode backwards reliably.
const shuttleRate = ref(1)
// In/Out render marks (export zone, design #3): null = unset. Valid range
// requires both marks with out > in — validated by renderRange.
const renderIn = ref<number | null>(null)
const renderOut = ref<number | null>(null)
// Loop playback (design #2 transport): wraps at the In/Out zone end when
// both marks are set, otherwise at the end of the timeline.
const loopPlayback = ref(false)
// Master preview volume/mute for the program monitor — the per-clip
// volume stays a separate factor applied on top of these.
const previewVolume = ref(1)
const previewMuted = ref(false)

export function useTmcutPlayback() {
  const { currentProject, totalDuration } = useTmcutProject()

  // Format seconds to HH:MM:SS.ff or MM:SS.ff
  function formatTimecode(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) seconds = 0
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const frames = Math.floor((seconds % 1) * 30) // assume 30fps frames

    const m = String(mins).padStart(2, '0')
    const s = String(secs).padStart(2, '0')
    const f = String(frames).padStart(2, '0')

    if (hrs > 0) {
      const h = String(hrs).padStart(2, '0')
      return `${h}:${m}:${s}.${f}`
    }
    return `${m}:${s}.${f}`
  }

  // Active video clip at current playhead
  const activeVideoClip = computed(() => {
    if (!currentProject.value?.timeline?.tracks) return null
    const videoTrack = currentProject.value.timeline.tracks.find(t => t.type === 'video')
    if (!videoTrack) return null

    for (const clip of videoTrack.items || []) {
      const clipDuration = (clip.out - clip.in) / (clip.speed || 1)
      const clipStart = clip.offset || 0
      const clipEnd = clipStart + clipDuration
      if (playhead.value >= clipStart && playhead.value < clipEnd) {
        return {
          clip,
          // Time within the source media
          mediaCurrentTime: clip.in + (playhead.value - clipStart) * (clip.speed || 1)
        }
      }
    }
    return null
  })

  // Active text overlays at current playhead
  const activeTextClips = computed(() => {
    if (!currentProject.value?.timeline?.tracks) return []
    const textTrack = currentProject.value.timeline.tracks.find(t => t.type === 'text')
    if (!textTrack) return []

    return textTrack.items.filter((clip) => {
      const clipDuration = (clip.out - clip.in) / (clip.speed || 1)
      const clipStart = clip.offset || 0
      const clipEnd = clipStart + clipDuration
      return playhead.value >= clipStart && playhead.value <= clipEnd
    })
  })

  // Seek playhead to specific time in seconds
  function seek(timeInSec: number) {
    const clamped = Math.max(0, Math.min(totalDuration.value, timeInSec))
    playhead.value = clamped

    if (videoRef.value && activeVideoClip.value) {
      try {
        videoRef.value.currentTime = activeVideoClip.value.mediaCurrentTime
      } catch {
        // ignore seeks on unloaded metadata; the playback
        // loop self-heals the frame position while playing
      }
    }
  }

  // Playback animation loop
  let lastTimestamp = 0
  let animId: number | null = null

  // Loop wrap bounds: the In/Out zone when valid, else the full timeline.
  function loopBounds(): { start: number, end: number } {
    const hasRange = renderIn.value !== null && renderOut.value !== null &&
      renderOut.value - renderIn.value >= 0.05
    return hasRange
      ? { start: renderIn.value!, end: renderOut.value! }
      : { start: 0, end: totalDuration.value }
  }

  function step(timestamp: number) {
    if (!isPlaying.value) {
      animId = null
      return
    }

    if (lastTimestamp === 0) {
      lastTimestamp = timestamp
    }

    const delta = (timestamp - lastTimestamp) / 1000 // seconds
    lastTimestamp = timestamp

    // Reverse shuttle: rewind the playhead and seek the video frame whenever
    // it drifts too far behind (the element stays paused in this mode).
    if (shuttleRate.value < 0) {
      const newTime = playhead.value + delta * shuttleRate.value
      if (loopPlayback.value) {
        const { start, end } = loopBounds()
        if (newTime <= start) {
          // Wrap backwards to the zone end, carrying the overshoot
          const span = Math.max(0.05, end - start)
          const wrapped = end - ((start - newTime) % span)
          seek(wrapped > start ? wrapped : end)
        } else {
          playhead.value = newTime
        }
      } else if (newTime <= 0) {
        playhead.value = 0
        pause()
        return
      } else {
        playhead.value = newTime
      }
      if (videoRef.value) {
        if (!videoRef.value.paused) videoRef.value.pause()
        const clip = activeVideoClip.value
        if (clip) {
          const targetTime = clip.mediaCurrentTime
          if (Math.abs(videoRef.value.currentTime - targetTime) > 0.25) {
            try {
              videoRef.value.currentTime = targetTime
            } catch {
              // ignore seeks on unloaded metadata; retried next frame
            }
          }
        }
      }
      animId = requestAnimationFrame(step)
      return
    }

    const newTime = playhead.value + delta * shuttleRate.value
    if (loopPlayback.value) {
      const { start, end } = loopBounds()
      if (newTime >= end) {
        // Wrap inside the loop zone, carrying the overshoot
        const span = Math.max(0.05, end - start)
        seek(start + ((newTime - start) % span))
      } else {
        playhead.value = newTime
      }
    } else if (newTime >= totalDuration.value) {
      playhead.value = totalDuration.value
      pause()
      return
    } else {
      playhead.value = newTime
    }

    // Keep active video element in sync + self-heal: resume the element if
    // it stalled (gap exit with unchanged src, autoplay race, slow metadata)
    // so the frame counter and the picture can never drift apart.
    if (videoRef.value) {
      if (activeVideoClip.value) {
        const targetTime = activeVideoClip.value.mediaCurrentTime
        if (Math.abs(videoRef.value.currentTime - targetTime) > 0.3) {
          try {
            videoRef.value.currentTime = targetTime
          } catch {
            // ignore seeks on unloaded metadata; retried next frame
          }
        }
        if (videoRef.value.paused) {
          videoRef.value.play().catch(() => {})
        }
      } else if (!videoRef.value.paused) {
        videoRef.value.pause()
      }
    }

    animId = requestAnimationFrame(step)
  }

  function play() {
    if (totalDuration.value <= 0) return
    // Do not animate the playhead when the timeline has no clips
    const hasClips = currentProject.value?.timeline?.tracks?.some(t => (t.items?.length || 0) > 0)
    if (!hasClips) return
    if (playhead.value >= totalDuration.value) {
      playhead.value = 0
    } else if (loopPlayback.value && playhead.value >= loopBounds().end) {
      // Loop zone is over: restart from the zone start
      playhead.value = loopBounds().start
    }
    isPlaying.value = true
    lastTimestamp = 0
    if (videoRef.value) {
      videoRef.value.playbackRate = Math.max(0.1, Math.abs(shuttleRate.value))
      videoRef.value.play().catch(() => {})
    }
    animId = requestAnimationFrame(step)
  }

  function pause() {
    isPlaying.value = false
    lastTimestamp = 0
    shuttleRate.value = 1 // K / pause always returns to normal speed
    if (animId) {
      cancelAnimationFrame(animId)
      animId = null
    }
    if (videoRef.value) {
      videoRef.value.pause()
      videoRef.value.playbackRate = 1
    }
  }

  function togglePlayPause() {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }

  // Guards shared by the J/K/L shuttle: same conditions as play()
  function canShuttle(): boolean {
    if (totalDuration.value <= 0) return false
    return !!currentProject.value?.timeline?.tracks?.some(t => (t.items?.length || 0) > 0)
  }

  // L — start fast forward, each press doubles the speed up to 8x
  function shuttleForward() {
    if (!canShuttle()) return
    if (!isPlaying.value) {
      shuttleRate.value = 1
      play()
      return
    }
    shuttleRate.value = shuttleRate.value < 1 ? 1 : Math.min(8, shuttleRate.value * 2)
    if (videoRef.value) {
      videoRef.value.playbackRate = shuttleRate.value
    }
  }

  // J — start reverse, each press doubles the reverse speed up to -8x
  function shuttleBackward() {
    if (!canShuttle() || playhead.value <= 0) return
    if (!isPlaying.value || shuttleRate.value > 0) {
      shuttleRate.value = -1
      if (videoRef.value) {
        videoRef.value.pause()
        videoRef.value.playbackRate = 1
      }
      if (!isPlaying.value) {
        isPlaying.value = true
        lastTimestamp = 0
        animId = requestAnimationFrame(step)
      }
      return
    }
    shuttleRate.value = Math.max(-8, shuttleRate.value * 2)
  }

  // K — stop (pause and reset the shuttle rate)
  function shuttleStop() {
    pause()
  }

  function stepForward(seconds = 1) {
    seek(playhead.value + seconds)
  }

  function stepBackward(seconds = 1) {
    seek(playhead.value - seconds)
  }

  // Valid export zone: both marks present and out > in (min 50ms)
  const renderRange = computed(() => {
    const a = renderIn.value
    const b = renderOut.value
    if (a === null || b === null || b - a < 0.05) return null
    return { start: a, end: b }
  })

  // Toggle-style mark setter: pressing the same key near the existing mark
  // clears it, otherwise the mark moves to the playhead (design #3 I/O).
  function setRenderMark(which: 'in' | 'out') {
    const pos = playhead.value
    const current = which === 'in' ? renderIn.value : renderOut.value
    if (current !== null && Math.abs(pos - current) < 0.05) {
      if (which === 'in') renderIn.value = null
      else renderOut.value = null
      return
    }
    if (which === 'in') renderIn.value = pos
    else renderOut.value = pos
  }

  function clearRenderMarks() {
    renderIn.value = null
    renderOut.value = null
  }

  function zoomIn() {
    zoom.value = Math.min(200, zoom.value + 10)
  }

  function zoomOut() {
    zoom.value = Math.max(15, zoom.value - 10)
  }

  return {
    playhead,
    isPlaying,
    zoom,
    videoRef,
    activeVideoClip,
    activeTextClips,
    formatTimecode,
    seek,
    play,
    pause,
    togglePlayPause,
    stepForward,
    stepBackward,
    shuttleForward,
    shuttleBackward,
    shuttleStop,
    renderIn,
    renderOut,
    renderRange,
    setRenderMark,
    clearRenderMarks,
    loopPlayback,
    previewVolume,
    previewMuted,
    zoomIn,
    zoomOut
  }
}
