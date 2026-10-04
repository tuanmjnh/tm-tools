import { ref, computed } from 'vue'
import { useTmcutProject } from './useTmcutProject'

// Shared playback state across TMCut editor
const playhead = ref(0) // Playhead position in seconds
const isPlaying = ref(false)
const zoom = ref(50) // Pixels per second (zoom level)
const videoRef = ref<HTMLVideoElement | null>(null)

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
      videoRef.value.currentTime = activeVideoClip.value.mediaCurrentTime
    }
  }

  // Playback animation loop
  let lastTimestamp = 0
  let animId: number | null = null

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

    const newTime = playhead.value + delta
    if (newTime >= totalDuration.value) {
      playhead.value = totalDuration.value
      pause()
      return
    }

    playhead.value = newTime

    // Keep active video element in sync
    if (videoRef.value && activeVideoClip.value) {
      const targetTime = activeVideoClip.value.mediaCurrentTime
      if (Math.abs(videoRef.value.currentTime - targetTime) > 0.3) {
        videoRef.value.currentTime = targetTime
      }
    }

    animId = requestAnimationFrame(step)
  }

  function play() {
    if (totalDuration.value <= 0) return
    if (playhead.value >= totalDuration.value) {
      playhead.value = 0
    }
    isPlaying.value = true
    lastTimestamp = 0
    if (videoRef.value) {
      videoRef.value.play().catch(() => {})
    }
    animId = requestAnimationFrame(step)
  }

  function pause() {
    isPlaying.value = false
    lastTimestamp = 0
    if (animId) {
      cancelAnimationFrame(animId)
      animId = null
    }
    if (videoRef.value) {
      videoRef.value.pause()
    }
  }

  function togglePlayPause() {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }

  function stepForward(seconds = 1) {
    seek(playhead.value + seconds)
  }

  function stepBackward(seconds = 1) {
    seek(playhead.value - seconds)
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
    zoomIn,
    zoomOut
  }
}
