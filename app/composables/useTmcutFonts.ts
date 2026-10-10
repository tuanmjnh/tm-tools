/**
 * System font enumeration (roadmap C-1): one IPC call pulls every font
 * face (family + file path) from the main process, which loads the
 * bundled font-scanner addon. The renderer keeps ONE choice per family
 * (the regular upright face wins) — the preview applies the CSS family
 * while export maps the paired file to drawtext fontfile=, so both ends
 * render the same face.
 *
 * Web sessions have no IPC: `choices` stays empty and the picker hides
 * instead of offering fonts it could neither enumerate nor export.
 */

import type { TmcutFontEntry } from '~~/types/electron'

function tmcutIpc() {
  return typeof window !== 'undefined' ? window.electronAPI?.tmcut : undefined
}

export interface TmcutFontChoice {
  family: string
  /** Absolute file path of the preferred face — pairs with the family. */
  file: string
}

// Session-level single flight: every Inspector mount reuses one IPC call.
let facesPromise: Promise<TmcutFontEntry[]> | null = null

/** Lower is better: Regular 400 upright is what a bare family pick means. */
function faceRank(f: TmcutFontEntry): number {
  return (f.italic ? 4 : 0) + (f.style !== 'Regular' ? 2 : 0) + (f.weight !== 400 ? 1 : 0)
}

function pickFamilies(faces: TmcutFontEntry[]): TmcutFontChoice[] {
  const best = new Map<string, { file: string, rank: number }>()
  for (const f of faces) {
    if (!f.family || !f.path) continue
    const current = best.get(f.family)
    const rank = faceRank(f)
    if (!current || rank < current.rank) best.set(f.family, { file: f.path, rank })
  }
  return [...best.entries()]
    .map(([family, entry]) => ({ family, file: entry.file }))
    .sort((a, b) => a.family.localeCompare(b.family))
}

export function useTmcutFonts() {
  const available = computed(() => !!tmcutIpc())
  const choices = ref<TmcutFontChoice[]>([])
  const loaded = ref(false)

  /** Idempotent: concurrent mounts share one promise; failures cache as []. */
  async function ensureFonts(): Promise<void> {
    const ipc = tmcutIpc()
    if (!ipc || loaded.value) return
    facesPromise ??= ipc.listFonts().catch(() => [] as TmcutFontEntry[])
    try {
      const faces = await facesPromise
      choices.value = pickFamilies(faces)
    } catch {
      choices.value = []
    } finally {
      loaded.value = true
    }
  }

  return { available, choices, loaded, ensureFonts }
}
