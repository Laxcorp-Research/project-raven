/**
 * Windows-only helper to exclude the overlay window from the taskbar AND the
 * Alt-Tab switcher via the WS_EX_TOOLWINDOW extended style.
 *
 * Background: the overlay is created `focusable: true` on Windows so that
 * setIgnoreMouseEvents(forward:true) mouse-move forwarding survives a
 * hide -> re-show (issue D). The side effect is that a focusable top-level
 * window appears in Alt-Tab, and Electron's `skipTaskbar` only removes the
 * taskbar button - not the Alt-Tab entry. WS_EX_TOOLWINDOW removes it from
 * both while keeping the window focusable. There is no Electron API for this
 * style, so we call into the existing Windows native module (the same .node
 * that does WASAPI capture) which exposes `setWindowToolWindow`.
 *
 * Everything here is best-effort: on non-Windows, on an older native build
 * that predates `setWindowToolWindow`, or if the handle can't be read, it is
 * a silent no-op and never throws - it must never block overlay creation.
 */
import type { BrowserWindow } from 'electron'
import { join } from 'path'
import { createRequire } from 'module'
import { createLogger } from './logger'

const log = createLogger('WindowsOverlayStyle')
const require = createRequire(import.meta.url)

interface WindowsNativeModule {
  setWindowToolWindow?: (handle: Buffer) => boolean
}

let cachedModule: WindowsNativeModule | null = null
let attemptedLoad = false

function loadWindowsNativeModule(): WindowsNativeModule | null {
  if (attemptedLoad) return cachedModule
  attemptedLoad = true

  // Same artifact + resolution order as systemAudioNative.loadWindowsModule().
  // require() caches by resolved path, so this does not double-load it.
  const devPath = join(
    process.cwd(),
    'src',
    'native',
    'windows',
    'raven-windows-audio.win32-x64-msvc.node'
  )
  const packagedPath = join(process.resourcesPath, 'raven-windows-audio.win32-x64-msvc.node')

  try {
    cachedModule = require(devPath) as WindowsNativeModule
    return cachedModule
  } catch {
    try {
      cachedModule = require(packagedPath) as WindowsNativeModule
      return cachedModule
    } catch (err) {
      log.warn('Windows native module unavailable for overlay tool-window style:', err)
      return null
    }
  }
}

/**
 * Apply WS_EX_TOOLWINDOW to the overlay so it drops out of the taskbar and
 * Alt-Tab. Call while the window is still hidden so the style is in effect
 * before its first show. Returns whether the style was applied.
 */
export function applyOverlayToolWindowStyle(win: BrowserWindow): boolean {
  if (process.platform !== 'win32') return false
  try {
    const mod = loadWindowsNativeModule()
    if (!mod || typeof mod.setWindowToolWindow !== 'function') {
      log.warn('setWindowToolWindow not present in native module (rebuild required)')
      return false
    }
    const ok = mod.setWindowToolWindow(win.getNativeWindowHandle())
    log.info(`Overlay excluded from taskbar/Alt-Tab: ${ok}`)
    return ok
  } catch (err) {
    log.warn('Failed to apply overlay tool-window style:', err)
    return false
  }
}
