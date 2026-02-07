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
  desktopGetSources: () => ipcRenderer.invoke('desktop:get-sources'),
  systemAudioIsAvailable: () => ipcRenderer.invoke('system-audio:is-available'),
  systemAudioHasPermission: () => ipcRenderer.invoke('system-audio:has-permission'),
  systemAudioRequestPermission: () => ipcRenderer.invoke('system-audio:request-permission'),
  systemAudioStart: () => ipcRenderer.invoke('system-audio:start'),
  systemAudioStop: () => ipcRenderer.invoke('system-audio:stop'),
  sendSystemAudioToDeepgram: (chunk: { data: number[]; timestamp: number }) => {
    ipcRenderer.send('system-audio:to-deepgram', chunk)
  },
  onSystemAudioChunk: (callback: (data: {
    data: ArrayBuffer | Buffer;
    sampleRate: number;
    channels: number;
    timestamp: number;
  }) => void) => {
    const handler = (_event: unknown, data: {
      data: ArrayBuffer | Buffer;
      sampleRate: number;
      channels: number;
      timestamp: number;
    }) => callback(data)
    ipcRenderer.on('system-audio:chunk', handler)
    return () => {
      ipcRenderer.removeListener('system-audio:chunk', handler)
    }
  },
  onNativeMicChunk: (callback: (data: {
    data: ArrayBuffer | Buffer;
    sampleRate: number;
    channels: number;
    timestamp: number;
  }) => void) => {
    const handler = (_event: unknown, data: {
      data: ArrayBuffer | Buffer;
      sampleRate: number;
      channels: number;
      timestamp: number;
    }) => callback(data)
    ipcRenderer.on('native-mic:chunk', handler)
    return () => {
      ipcRenderer.removeListener('native-mic:chunk', handler)
    }
  },
  onSystemAudioForDeepgram: (callback: (chunk: { data: number[]; timestamp: number }) => void) => {
    const handler = (_event: unknown, chunk: { data: number[]; timestamp: number }) => callback(chunk)
    ipcRenderer.on('system-audio:for-deepgram', handler)
    return () => {
      ipcRenderer.removeListener('system-audio:for-deepgram', handler)
    }
  },
  sessions: {
    create: (session: unknown) => ipcRenderer.invoke('sessions:create', session),
    update: (id: string, updates: unknown) => ipcRenderer.invoke('sessions:update', id, updates),
    get: (id: string) => ipcRenderer.invoke('sessions:get', id),
    getAll: () => ipcRenderer.invoke('sessions:getAll'),
    search: (query: string) => ipcRenderer.invoke('sessions:search', query),
    delete: (id: string) => ipcRenderer.invoke('sessions:delete', id),
    getInProgress: () => ipcRenderer.invoke('sessions:getInProgress'),
    getActive: () => ipcRenderer.invoke('session:getActive'),
    hasActive: () => ipcRenderer.invoke('session:hasActive'),
    regenerateTitle: (id: string) => ipcRenderer.invoke('session:regenerateTitle', id),
    onListUpdated: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('sessions:list-updated', handler)
      return () => ipcRenderer.removeListener('sessions:list-updated', handler)
    },
    onSessionUpdated: (callback: (session: unknown) => void) => {
      const handler = (_event: unknown, session: unknown) => callback(session)
      ipcRenderer.on('session:updated', handler)
      return () => ipcRenderer.removeListener('session:updated', handler)
    },
  },
  // ---- Audio ----
  audioStartRecording: (deviceId?: string) => ipcRenderer.invoke('audio:start-recording', deviceId),
  audioStopRecording: () => ipcRenderer.invoke('audio:stop-recording'),
  audioSendChunk: (buffer: ArrayBuffer, source: 'mic' | 'system') =>
    ipcRenderer.send('audio:chunk', buffer, source),
  audioGetState: () => ipcRenderer.invoke('audio:get-state'),
  onRecordingStateChanged: (callback: (state: { isRecording: boolean }) => void) => {
    const handler = (_event: unknown, state: { isRecording: boolean }) => callback(state)
    ipcRenderer.on('audio:recording-state-changed', handler)
    return () => {
      ipcRenderer.removeListener('audio:recording-state-changed', handler)
    }
  },
  onTranscriptUpdate: (
    callback: (data: {
      text: string
      isFinal: boolean
      fullTranscript: string
      speaker?: number
      entries?: Array<{
        id: string
        source: 'mic' | 'system'
        text: string
        speaker: 'you' | 'them'
        timestamp: number
        isFinal: boolean
      }>
      interims?: { mic: string; system: string }
    }) => void
  ) => {
    const handler = (
      _event: unknown,
      data: {
        text: string
        isFinal: boolean
        fullTranscript: string
        speaker?: number
        entries?: Array<{
          id: string
          source: 'mic' | 'system'
          text: string
          speaker: 'you' | 'them'
          timestamp: number
          isFinal: boolean
        }>
        interims?: { mic: string; system: string }
      }
    ) => callback(data)
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
  getTranscriptEntries: () => ipcRenderer.invoke('audio:get-transcript-entries'),
  // Claude AI
  claudeGetResponse: (params: { transcript: string; action: string; customPrompt?: string; modePrompt?: string }) =>
    ipcRenderer.invoke('claude:get-response', params),
  claudeGetHistory: () => ipcRenderer.invoke('claude:get-history'),
  claudeClearHistory: () => ipcRenderer.invoke('claude:clear-history'),
  onClaudeResponse: (callback: (data: {
    type: 'start' | 'delta' | 'done' | 'error' | 'cleared'
    userMessage?: { id: string; role: 'user'; content: string; action?: string; timestamp: number }
    assistantMessage?: { id: string; role: 'assistant'; content: string; timestamp: number }
    messageId?: string
    text?: string
    fullText?: string
    error?: string
  }) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data as {
      type: 'start' | 'delta' | 'done' | 'error' | 'cleared'
      userMessage?: { id: string; role: 'user'; content: string; action?: string; timestamp: number }
      assistantMessage?: { id: string; role: 'assistant'; content: string; timestamp: number }
      messageId?: string
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
