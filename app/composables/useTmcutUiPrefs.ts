import { ref, watch } from 'vue'

// Session-level TMCut UI preferences, persisted in localStorage so the
// choice survives reloads (single editor instance — module-level state
// mirrors the pattern used by useTmcutPlayback).
const STORAGE_KEY = 'tmcut.shortcutTips'
const shortcutTips = ref(true)
// Shared shortcuts-help modal state: opened from the timeline toolbar,
// the editor header button, or Ctrl+K / ? — one instance everywhere.
const shortcutsOpen = ref(false)

if (import.meta.client && typeof window !== 'undefined') {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored !== null) shortcutTips.value = stored === '1'

  watch(shortcutTips, (value) => {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  })
}

export function useTmcutUiPrefs() {
  // Appends "(Keys)" to a toolbar tooltip when shortcut tips are enabled.
  function tip(label: string, keys: string): string {
    return shortcutTips.value ? `${label} (${keys})` : label
  }

  return { shortcutTips, shortcutsOpen, tip }
}
