import { globalShortcut, BrowserWindow } from 'electron'

export function registerHotkeys(window: BrowserWindow): void {
  const modifier = process.platform === 'darwin' ? 'Command' : 'Control'

  // AI Suggestion: Cmd/Ctrl + Enter
  globalShortcut.register(`${modifier}+Return`, () => {
    window.webContents.send('hotkey:ai-suggestion')
  })

  // Toggle Overlay: Cmd/Ctrl + Shift + H
  globalShortcut.register(`${modifier}+Shift+H`, () => {
    if (window.isVisible()) {
      window.hide()
    } else {
      window.show()
      window.focus()
      window.setAlwaysOnTop(true, 'floating', 1)
    }
  })

  // Toggle Recording: Cmd/Ctrl + Shift + R
  globalShortcut.register(`${modifier}+Shift+R`, () => {
    window.webContents.send('hotkey:toggle-recording')
  })
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
