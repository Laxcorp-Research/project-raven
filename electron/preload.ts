import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Settings (persisted)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Record<string, any>) => ipcRenderer.invoke('save-settings', settings),

  // Stealth
  toggleStealth: (enabled: boolean) => ipcRenderer.invoke('toggle-stealth', enabled),

  // Window
  hideWindow: () => ipcRenderer.send('hide-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),

  // AI
  getAiSuggestion: (apiKey: string, transcript: string, question?: string) =>
    ipcRenderer.invoke('get-ai-suggestion', apiKey, transcript, question),

  // Hotkey events from main
  onHotkeyAiSuggestion: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('hotkey:ai-suggestion', handler)
    return () => {
      ipcRenderer.removeListener('hotkey:ai-suggestion', handler)
    }
  },
  onHotkeyToggleRecording: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('hotkey:toggle-recording', handler)
    return () => {
      ipcRenderer.removeListener('hotkey:toggle-recording', handler)
    }
  },
}

contextBridge.exposeInMainWorld('raven', api)
