import { globalShortcut, BrowserWindow, screen } from 'electron'

let overlayWindow: BrowserWindow | null = null

export function registerHotkeys(overlay: BrowserWindow): void {
  overlayWindow = overlay
  const modifier = process.platform === 'darwin' ? 'Command' : 'Control'

  // Toggle Visibility: Cmd/Ctrl + \
  globalShortcut.register(`${modifier}+\\`, () => {
    if (!overlayWindow) return
    if (overlayWindow.isVisible()) {
      overlayWindow.hide()
    } else {
      overlayWindow.show()
      overlayWindow.focus()
      overlayWindow.setAlwaysOnTop(true, 'floating', 1)
    }
  })

  // Ask Raven (AI Suggestion): Cmd/Ctrl + Enter
  globalShortcut.register(`${modifier}+Return`, () => {
    if (!overlayWindow) return
    overlayWindow.webContents.send('hotkey:ai-suggestion')
    // Make sure overlay is visible when asking for help
    if (!overlayWindow.isVisible()) {
      overlayWindow.show()
      overlayWindow.focus()
    }
  })

  // Toggle Recording: Cmd/Ctrl + R
  globalShortcut.register(`${modifier}+R`, () => {
    if (!overlayWindow) return
    overlayWindow.webContents.send('hotkey:toggle-recording')
  })

  // Clear Conversation: Cmd/Ctrl + Shift + R
  globalShortcut.register(`${modifier}+Shift+R`, () => {
    if (!overlayWindow) return
    overlayWindow.webContents.send('hotkey:clear-conversation')
  })

  // Move Window Up: Cmd/Ctrl + Up
  globalShortcut.register(`${modifier}+Up`, () => {
    moveWindow('up')
  })

  // Move Window Down: Cmd/Ctrl + Down
  globalShortcut.register(`${modifier}+Down`, () => {
    moveWindow('down')
  })

  // Move Window Left: Cmd/Ctrl + Left
  globalShortcut.register(`${modifier}+Left`, () => {
    moveWindow('left')
  })

  // Move Window Right: Cmd/Ctrl + Right
  globalShortcut.register(`${modifier}+Right`, () => {
    moveWindow('right')
  })

  // Scroll Up: Cmd/Ctrl + Shift + Up
  globalShortcut.register(`${modifier}+Shift+Up`, () => {
    if (!overlayWindow) return
    overlayWindow.webContents.send('hotkey:scroll-up')
  })

  // Scroll Down: Cmd/Ctrl + Shift + Down
  globalShortcut.register(`${modifier}+Shift+Down`, () => {
    if (!overlayWindow) return
    overlayWindow.webContents.send('hotkey:scroll-down')
  })

  console.log('[Hotkeys] Registered all global shortcuts')
}

function moveWindow(direction: 'up' | 'down' | 'left' | 'right'): void {
  if (!overlayWindow) return

  const bounds = overlayWindow.getBounds()
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y })
  const workArea = display.workArea
  const step = 50 // pixels to move

  let newX = bounds.x
  let newY = bounds.y

  switch (direction) {
    case 'up':
      newY = Math.max(workArea.y, bounds.y - step)
      break
    case 'down':
      newY = Math.min(workArea.y + workArea.height - bounds.height, bounds.y + step)
      break
    case 'left':
      newX = Math.max(workArea.x, bounds.x - step)
      break
    case 'right':
      newX = Math.min(workArea.x + workArea.width - bounds.width, bounds.x + step)
      break
  }

  overlayWindow.setBounds({ ...bounds, x: newX, y: newY })
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
  overlayWindow = null
  console.log('[Hotkeys] Unregistered all global shortcuts')
}
