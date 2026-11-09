/** Desktop-only helpers; they no-op in the browser build unless on local server. */
export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron)
}

function normalizeLocalPath(path: string): string {
  return window.electronAPI?.platform === 'win32' ? path.replace(/\//g, '\\') : path
}

/** Opens a file or folder with the OS default handler. In Electron, invokes IPC; in local web, delegates to API. */
export function openLocalPath(path?: string | null): void {
  if (!path) return
  if (isDesktopRuntime() && window.electronAPI?.openPath) {
    void window.electronAPI.openPath(normalizeLocalPath(path)).catch(() => undefined)
    return
  }
  // Local Web fallback: call server endpoint to open on local host
  void $fetch('/api/v1/documents/open-local', {
    method: 'POST',
    body: { path }
  }).catch(() => undefined)
}

/** Reveals a file (or opens its folder) in Explorer/Finder. */
export function revealLocalPath(path?: string | null): void {
  if (!path) return
  if (isDesktopRuntime()) {
    const normalized = normalizeLocalPath(path)
    if (window.electronAPI?.showItemInFolder) {
      void window.electronAPI.showItemInFolder(normalized).catch(() => undefined)
      return
    }
    void window.electronAPI?.openPath(normalized).catch(() => undefined)
    return
  }
  // Local Web fallback: call server endpoint to reveal on local host
  void $fetch('/api/v1/documents/open-local', {
    method: 'POST',
    body: { path, reveal: true }
  }).catch(() => undefined)
}

/** Authenticated route plus the flag that lets the preview tab render in place. */
export function inlinePreviewPath(downloadPath: string): string {
  return `${downloadPath}${downloadPath.includes('?') ? '&' : '?'}inline=1`
}

/** Click-through download; the route answers with `content-disposition: attachment`. */
export function triggerDownload(href?: string | null): void {
  if (typeof document === 'undefined' || !href) return
  const link = document.createElement('a')
  link.href = href
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export async function copyToClipboard(value: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}
