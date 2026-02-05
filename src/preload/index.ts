import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('raven', {
  storeGetAll: () => ipcRenderer.invoke('store:get-all'),
  storeGet: (key: string) => ipcRenderer.invoke('store:get', key),
  storeSet: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  storeSaveMany: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke('store:save-many', settings),
  apiKeysSave: (deepgramKey: string, anthropicKey: string) =>
    ipcRenderer.invoke('store:save-api-keys', deepgramKey, anthropicKey),
  apiKeysHas: () => ipcRenderer.invoke('store:has-api-keys'),
  apiKeysClear: () => ipcRenderer.invoke('store:clear-api-keys'),
  planIsFree: () => ipcRenderer.invoke('store:is-free-mode'),
  planIsPro: () => ipcRenderer.invoke('store:is-pro-mode'),
  resetAll: () => ipcRenderer.invoke('store:reset-all'),
  validateApiKeys: (deepgramKey: string, anthropicKey: string) =>
    ipcRenderer.invoke('validate-api-keys', deepgramKey, anthropicKey),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  windowToggleOverlay: () => ipcRenderer.invoke('window:toggle-overlay'),
  windowShowOverlay: () => ipcRenderer.invoke('window:show-overlay'),
  windowHideOverlay: () => ipcRenderer.invoke('window:hide-overlay'),
  windowHide: () => ipcRenderer.invoke('window:hide-overlay'),
  windowSetStealth: (enabled: boolean) => ipcRenderer.invoke('window:set-stealth', enabled),
  windowGetType: () => ipcRenderer.invoke('window:get-type'),
  // ---- Audio ----
  audioStartRecording: (deviceId?: string) => ipcRenderer.invoke('audio:start-recording', deviceId),
  audioStopRecording: () => ipcRenderer.invoke('audio:stop-recording'),
  audioSendChunk: (buffer: ArrayBuffer) => ipcRenderer.send('audio:chunk', buffer),
  audioGetState: () => ipcRenderer.invoke('audio:get-state'),
  onRecordingStateChanged: (callback: (state: { isRecording: boolean }) => void) => {
    const handler = (_event: unknown, state: { isRecording: boolean }) => callback(state)
    ipcRenderer.on('audio:recording-state-changed', handler)
    return () => {
      ipcRenderer.removeListener('audio:recording-state-changed', handler)
    }
  },
  onTranscriptUpdate: (
    callback: (data: { text: string; isFinal: boolean; fullTranscript: string; speaker?: number }) => void
  ) => {
    const handler = (_event: unknown, data: { text: string; isFinal: boolean; fullTranscript: string; speaker?: number }) =>
      callback(data)
    ipcRenderer.on('transcription:update', handler)
    return () => {
      ipcRenderer.removeListener('transcription:update', handler)
    }
  },
  onTranscriptionStatus: (callback: (data: { status: string }) => void) => {
    const handler = (_event: unknown, data: { status: string }) => callback(data)
    ipcRenderer.on('transcription:status', handler)
    return () => {
      ipcRenderer.removeListener('transcription:status', handler)
    }
  },
  getTranscript: () => ipcRenderer.invoke('audio:get-transcript'),
  clearTranscript: () => ipcRenderer.invoke('audio:clear-transcript'),
  // Claude AI
  claudeGetResponse: (params: { transcript: string; action: string; customPrompt?: string }) =>
    ipcRenderer.invoke('claude:get-response', params),
  onClaudeResponse: (callback: (data: {
    type: 'start' | 'delta' | 'done' | 'error'
    action?: string
    text?: string
    fullText?: string
    error?: string
  }) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data as {
      type: 'start' | 'delta' | 'done' | 'error'
      action?: string
      text?: string
      fullText?: string
      error?: string
    })
    ipcRenderer.on('claude:response', handler)
    return () => { ipcRenderer.removeListener('claude:response', handler) }
  },
  sendHotkeyToggleRecording: () => ipcRenderer.send('hotkey:toggle-recording-from-dashboard'),
  onStealthChanged: (callback: (enabled: boolean) => void) => {
    const handler = (_event: unknown, enabled: boolean) => callback(enabled)
    ipcRenderer.on('stealth-changed', handler)
    return () => ipcRenderer.removeListener('stealth-changed', handler)
  },
  onHotkeyToggleRecording: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('hotkey:toggle-recording', handler)
    return () => ipcRenderer.removeListener('hotkey:toggle-recording', handler)
  },
  onHotkeyAiSuggestion: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('hotkey:ai-suggestion', handler)
    return () => ipcRenderer.removeListener('hotkey:ai-suggestion', handler)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const handler = (_event: unknown, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
})
