import { isDesktopRuntime } from '~/utils/desktop'

export type AppPlatform = 'desktop' | 'web'

/**
 * Routes that need Electron IPC (browser profiles, ffmpeg/yt-dlp media). They
 * have no server route, so on the web build they must not be reachable at all.
 */
export const DESKTOP_ONLY_PREFIXES: readonly string[] = ['/browser-hub', '/media/video', '/media/download']

export function isDesktopOnlyPath(path: string): boolean {
  return DESKTOP_ONLY_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * One place that answers "may this surface show desktop-only features". The
 * client has no build flag: it is the desktop build exactly when Electron's
 * preload bridge is present.
 */
export function useCapabilities() {
  const platform = computed<AppPlatform>(() => (isDesktopRuntime() ? 'desktop' : 'web'))
  const isDesktop = computed(() => platform.value === 'desktop')
  return { platform, isDesktop, isDesktopOnlyPath }
}
