import { systemPreferences, ipcMain } from 'electron'
import { createLogger } from './logger'

const log = createLogger('Permissions')

const isMac = process.platform === 'darwin'

export interface PermissionStatus {
  microphone: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
  screen: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
}

export function getPermissionStatus(): PermissionStatus {
  if (!isMac) {
    return { microphone: 'granted', screen: 'granted' }
  }

  return {
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    screen: systemPreferences.getMediaAccessStatus('screen'),
  }
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

export function registerPermissionHandlers(): void {
  ipcMain.handle('permissions:get-status', () => {
    return getPermissionStatus()
  })

  ipcMain.handle('permissions:request-microphone', async () => {
    return requestMicrophoneAccess()
  })
}
