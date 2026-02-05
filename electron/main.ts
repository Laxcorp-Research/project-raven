import { app, BrowserWindow, ipcMain, shell, screen } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { getSettings, saveSettings } from './settings'
import { registerHotkeys, unregisterHotkeys } from './globalHotkeys'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const settings = getSettings()
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  const defaultWidth = 480
  const defaultHeight = 380
  const bounds = settings.windowBounds || {
    x: screenWidth - defaultWidth - 20,
    y: screenHeight - defaultHeight - 20,
    width: defaultWidth,
    height: defaultHeight,
  }

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 400,
    minHeight: 300,
    maxWidth: 800,
    maxHeight: 600,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: true,
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.setAlwaysOnTop(true, 'floating', 1)
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  mainWindow.setContentProtection(settings.stealthEnabled)

  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Save window position on move/resize
  mainWindow.on('moved', () => {
    if (mainWindow) saveSettings({ windowBounds: mainWindow.getBounds() })
  })
  mainWindow.on('resized', () => {
    if (mainWindow) saveSettings({ windowBounds: mainWindow.getBounds() })
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Register global hotkeys
  registerHotkeys(mainWindow)
}

function registerIpcHandlers(): void {
  // Settings
  ipcMain.handle('get-settings', () => {
    return getSettings()
  })

  ipcMain.handle('save-settings', (_event, settings: Record<string, any>) => {
    saveSettings(settings)
    // Apply stealth change immediately
    if (settings.stealthEnabled !== undefined && mainWindow) {
      mainWindow.setContentProtection(settings.stealthEnabled)
      if (process.platform === 'darwin') {
        const bounds = mainWindow.getBounds()
        mainWindow.hide()
        setTimeout(() => {
          if (!mainWindow) return
          mainWindow.setBounds(bounds)
          mainWindow.show()
          mainWindow.setAlwaysOnTop(true, 'floating', 1)
        }, 100)
      }
    }
    return { success: true }
  })

  ipcMain.handle('toggle-stealth', (_event, enabled: boolean) => {
    if (!mainWindow) return
    mainWindow.setContentProtection(enabled)
    saveSettings({ stealthEnabled: enabled })

    if (process.platform === 'darwin') {
      const bounds = mainWindow.getBounds()
      mainWindow.hide()
      setTimeout(() => {
        if (!mainWindow) return
        mainWindow.setBounds(bounds)
        mainWindow.show()
        mainWindow.setAlwaysOnTop(true, 'floating', 1)
      }, 100)
    }
  })

  ipcMain.on('hide-window', () => mainWindow?.hide())
  ipcMain.on('close-window', () => mainWindow?.close())
  ipcMain.on('minimize-window', () => mainWindow?.minimize())

  // Claude AI
  ipcMain.handle('get-ai-suggestion', async (_event, apiKey: string, transcript: string, question?: string) => {
    const SYSTEM_PROMPT = `You are an AI assistant helping during a live meeting, interview, or call.
Your job is to provide helpful, concise suggestions based on what's being discussed.

Guidelines:
- Keep responses concise (2-4 sentences unless more detail is needed)
- Be direct and actionable
- If a question is asked in the conversation, help formulate a good answer
- For job interviews: help with behavioral answers, technical explanations
- For sales calls: suggest talking points, handle objections
- For meetings: summarize key points, suggest action items
- Focus on what would be immediately useful right now`

    let userMessage = `Here's the conversation transcript so far:\n\n${transcript}`
    if (question) {
      userMessage += `\n\nUser's specific question: ${question}`
    } else {
      userMessage += `\n\nBased on this conversation, provide a helpful suggestion or insight.`
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Invalid Anthropic API key. Check your key in Settings.' }
        }
        if (response.status === 429) {
          return { success: false, error: 'Rate limited. Please wait a moment and try again.' }
        }
        const errData = await response.json().catch(() => ({}))
        return { success: false, error: `API error (${response.status}): ${errData.error?.message || 'Unknown'}` }
      }

      const data = await response.json()
      const text = data.content?.find((b: any) => b.type === 'text')?.text || 'No response generated.'
      return { success: true, text }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  unregisterHotkeys()
})
