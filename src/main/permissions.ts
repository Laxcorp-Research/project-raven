import { systemPreferences, ipcMain, shell } from 'electron'
import { createLogger } from './logger'

const log = createLogger('Permissions')

const isMac = process.platform === 'darwin'

export interface PermissionStatus {
  microphone: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
  screen: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
  accessibility: 'granted' | 'denied'
}

export function getPermissionStatus(): PermissionStatus {
  if (!isMac) {
    return { microphone: 'granted', screen: 'granted', accessibility: 'granted' }
  }

  return {
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    screen: systemPreferences.getMediaAccessStatus('screen'),
    accessibility: systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied',
  }
}

export function requestAccessibilityAccess(): boolean {
  if (!isMac) return true
  log.info('Requesting Accessibility permission...')
  const granted = systemPreferences.isTrustedAccessibilityClient(true)
  log.info(`Accessibility permission ${granted ? 'granted' : 'prompt shown'}`)
  return granted
}

export async function requestMicrophoneAccess(): Promise<boolean> {
  if (!isMac) return true

  const status = systemPreferences.getMediaAccessStatus('microphone')
  if (status === 'granted') return true

  log.info('Requesting microphone permission...')
  const granted = await systemPreferences.askForMediaAccess('microphone')
  log.info(`Microphone permission ${granted ? 'granted' : 'denied'}`)
  return granted
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
  if (!isMac) return
  log.info('Opening Screen Recording preferences pane...')
  shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
  )
}

export function openMicrophonePreferences(): void {
  if (!isMac) return
  log.info('Opening Microphone preferences pane...')
  shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
  )
}

export function openAccessibilityPreferences(): void {
  if (!isMac) return
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
