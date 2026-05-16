import { systemPreferences, ipcMain, shell } from 'electron'
import { createLogger } from './logger'

const log = createLogger('Permissions')

export interface PermissionStatus {
  microphone: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
  screen: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
  accessibility: 'granted' | 'denied'
}

export function getPermissionStatus(): PermissionStatus {
  if (process.platform === 'darwin') {
    return {
      microphone: systemPreferences.getMediaAccessStatus('microphone'),
      screen: systemPreferences.getMediaAccessStatus('screen'),
      accessibility: systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied',
    }
  }

  // Windows 10 (1903+) and Windows 11 expose the microphone permission
  // via the same Electron systemPreferences.getMediaAccessStatus API.
  // Pre-2026-05-06 this whole branch returned hardcoded 'granted' for
  // every non-darwin platform - which silently lied about the state on
  // Windows when the user had toggled "Microphone access" off in
  // Settings -> Privacy -> Microphone, leaving them with a recording
  // session that opened mic-less and produced no transcripts. Screen
  // recording and Accessibility are NOT gated by Windows privacy
  // settings the same way (no equivalent toggle exists), so they stay
  // 'granted' on Windows.
  if (process.platform === 'win32') {
    return {
      microphone: systemPreferences.getMediaAccessStatus('microphone'),
      screen: 'granted',
      accessibility: 'granted',
    }
  }

  // Linux and other platforms - no OS-level permission gating at all.
  return { microphone: 'granted', screen: 'granted', accessibility: 'granted' }
}

export function requestAccessibilityAccess(): boolean {
  if (process.platform !== 'darwin') return true
  log.info('Requesting Accessibility permission...')
  const granted = systemPreferences.isTrustedAccessibilityClient(true)
  log.info(`Accessibility permission ${granted ? 'granted' : 'prompt shown'}`)
  return granted
}

export async function requestMicrophoneAccess(): Promise<boolean> {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') return true

    log.info('Requesting microphone permission...')
    const granted = await systemPreferences.askForMediaAccess('microphone')
    log.info(`Microphone permission ${granted ? 'granted' : 'denied'}`)
    return granted
  }

  // Windows has NO programmatic prompt API (no equivalent of
  // askForMediaAccess). The OS shows the permission dialog the first
  // time the app actually tries to open a microphone stream via
  // WASAPI / MediaFoundation. The right UX here is: report whether
  // mic is already allowed; let the recording attempt itself trigger
  // the OS prompt for not-determined state. 'denied' returns false
  // so the caller can short-circuit and surface the
  // openMicrophonePreferences() deep link to ms-settings:privacy-
  // microphone instead of attempting a stream that will fail.
  if (process.platform === 'win32') {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') return true
    if (status === 'denied') {
      log.warn('Microphone access denied at OS level - user must toggle in Settings -> Privacy -> Microphone')
      return false
    }
    // 'not-determined' / 'restricted' / 'unknown' - let the OS prompt
    // fire when the stream actually opens. Caller proceeds.
    log.info(`Microphone status on Windows is "${status}" - OS will prompt at first stream open`)
    return true
  }

  // Linux + other platforms - no permission gating, always proceed.
  return true
}

export function checkPermissionsForRecording(): { ok: boolean; missing: string[] } {
  const status = getPermissionStatus()
  const missing: string[] = []

  if (status.microphone !== 'granted') {
    missing.push('microphone')
  }
  if (status.screen !== 'granted') {
    missing.push('screen')
  }

  return { ok: missing.length === 0, missing }
}

export function openScreenRecordingPreferences(): void {
  if (process.platform !== 'darwin') return
  log.info('Opening Screen Recording preferences pane...')
  shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
  )
}

export function openMicrophonePreferences(): void {
  if (process.platform === 'darwin') {
    log.info('Opening Microphone preferences pane (macOS)...')
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
    )
    return
  }
  // Pre-2026-05-06 this silently no-op'd on Windows - so the
  // renderer's "Open Microphone Settings" button (wired through
  // permissions:open-microphone IPC) did literally nothing for a
  // Windows user who had denied mic access. Plan item #43 / W10
  // calls this out explicitly. The Win10/11 deep-link URI for
  // Settings -> Privacy & security -> Microphone is the
  // ms-settings:privacy-microphone scheme.
  if (process.platform === 'win32') {
    log.info('Opening Microphone privacy settings (Windows)...')
    shell.openExternal('ms-settings:privacy-microphone')
    return
  }
}

export function openAccessibilityPreferences(): void {
  if (process.platform !== 'darwin') return
  log.info('Opening Accessibility preferences pane...')
  shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
  )
}

export function registerPermissionHandlers(): void {
  ipcMain.handle('permissions:get-status', () => {
    return getPermissionStatus()
  })

  ipcMain.handle('permissions:request-microphone', async () => {
    return requestMicrophoneAccess()
  })

  ipcMain.handle('permissions:open-screen-recording', () => {
    openScreenRecordingPreferences()
    return true
  })

  ipcMain.handle('permissions:open-microphone', () => {
    openMicrophonePreferences()
    return true
  })

  ipcMain.handle('permissions:request-accessibility', () => {
    return requestAccessibilityAccess()
  })

  ipcMain.handle('permissions:open-accessibility', () => {
    openAccessibilityPreferences()
    return true
  })
}
