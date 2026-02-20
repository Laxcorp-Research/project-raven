import { Tray, Menu, nativeImage, app } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getDashboardWindow, getOverlayWindow } from './windowManager'
import { createLogger } from './logger'

const log = createLogger('Tray')
const __dirname = dirname(fileURLToPath(import.meta.url))

let tray: Tray | null = null
let isRecordingState = false
let isOnboarding = false

function getTrayIconPath(recording: boolean): string {
  const iconName = recording ? 'iconActiveTemplate.png' : 'iconTemplate.png'
  if (app.isPackaged) {
    return join(process.resourcesPath, 'tray', iconName)
  }
  return join(__dirname, '../../resources/tray', iconName)
}

function showDashboard(action?: string): void {
  const dashboard = getDashboardWindow()
  if (dashboard && !dashboard.isDestroyed()) {
    dashboard.show()
    dashboard.focus()
    if (action) {
      dashboard.webContents.send(`tray:${action}`)
    }
  }
}

function buildContextMenu(): Menu {
  if (isOnboarding) {
    return Menu.buildFromTemplate([
      {
        label: 'Quit Raven',
        click: () => app.quit(),
      },
    ])
  }

  return Menu.buildFromTemplate([
    {
      label: isRecordingState ? 'Stop Listening' : 'Start Listening',
      click: () => {
        const overlay = getOverlayWindow()
        if (overlay && !overlay.isDestroyed()) {
          overlay.webContents.send('hotkey:toggle-recording')
        }
      },
    },
    { type: 'separator' },
    {
      label: 'View Sessions',
      click: () => showDashboard(),
    },
    {
      label: 'Settings',
      click: () => showDashboard('open-settings'),
    },
    { type: 'separator' },
    {
      label: 'Quit Raven',
      click: () => app.quit(),
    },
  ])
}

export function createTray(): void {
  if (tray) return

  try {
    const iconPath = getTrayIconPath(false)
    const icon = nativeImage.createFromPath(iconPath)

    if (icon.isEmpty()) {
      log.warn('Tray icon not found at', iconPath, '— creating from default')
      tray = new Tray(nativeImage.createEmpty())
    } else {
      tray = new Tray(icon)
    }

    tray.setToolTip('Raven')
    tray.setContextMenu(buildContextMenu())

    log.info('Tray icon created')
  } catch (err) {
    log.error('Failed to create tray:', err)
  }
}

export function updateTrayRecordingState(recording: boolean): void {
  isRecordingState = recording
  if (!tray) return

  try {
    const iconPath = getTrayIconPath(recording)
    const icon = nativeImage.createFromPath(iconPath)
    if (!icon.isEmpty()) {
      tray.setImage(icon)
    }
    tray.setContextMenu(buildContextMenu())
    tray.setToolTip(recording ? 'Raven (Recording)' : 'Raven')
  } catch (err) {
    log.error('Failed to update tray state:', err)
  }
}

export function setTrayVisibility(visible: boolean): void {
  if (!tray) return

  if (!visible) {
    tray.destroy()
    tray = null
  }
}

export function setTrayOnboarding(onboarding: boolean): void {
  isOnboarding = onboarding
  if (tray) {
    tray.setContextMenu(buildContextMenu())
  }
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
