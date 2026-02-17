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
  validateKeys: (deepgramKey: string, aiProvider: 'anthropic' | 'openai', aiKey: string) =>
    ipcRenderer.invoke('validate-keys', deepgramKey, aiProvider, aiKey),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  profileSelectPicture: () => ipcRenderer.invoke('profile:select-picture'),
  profileGetPictureData: (filePath: string) => ipcRenderer.invoke('profile:get-picture-data', filePath),
  profileRemovePicture: () => ipcRenderer.invoke('profile:remove-picture'),
  windowToggleOverlay: () => ipcRenderer.invoke('window:toggle-overlay'),
  windowShowOverlay: () => ipcRenderer.invoke('window:show-overlay'),
  windowAutoSizeOverlay: (mode: 'compact' | 'expanded') =>
    ipcRenderer.invoke('window:auto-size-overlay', mode),
  windowSetIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.invoke('window:set-ignore-mouse-events', ignore),
  windowShowDashboard: () => ipcRenderer.invoke('window:show-dashboard'),
  windowResize: (width: number, height: number) => ipcRenderer.invoke('window:resize', width, height),
  windowGetOverlayBounds: () => ipcRenderer.invoke('window:get-overlay-bounds'),
  windowGetCursorPoint: () => ipcRenderer.invoke('window:get-cursor-point'),
  windowSetOverlayBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('window:set-overlay-bounds', bounds),
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
    getMessages: (sessionId: string) => ipcRenderer.invoke('sessions:get-messages', sessionId),
    addMessage: (sessionId: string, role: 'user' | 'assistant', content: string) =>
      ipcRenderer.invoke('sessions:add-message', sessionId, role, content),
    delete: (id: string) => ipcRenderer.invoke('sessions:delete', id),
    regenerateSummary: (id: string) => ipcRenderer.invoke('sessions:regenerate-summary', id),
    updateTitle: (id: string, title: string) => ipcRenderer.invoke('sessions:update-title', id, title),
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
  modes: {
    getAll: () => ipcRenderer.invoke('modes:get-all'),
    get: (id: string) => ipcRenderer.invoke('modes:get', id),
    create: (mode: unknown) => ipcRenderer.invoke('modes:create', mode),
    update: (id: string, updates: unknown) => ipcRenderer.invoke('modes:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('modes:delete', id),
    duplicate: (id: string, newName: string) => ipcRenderer.invoke('modes:duplicate', id, newName),
    resetBuiltin: (id: string) => ipcRenderer.invoke('modes:reset-builtin', id),
    getActive: () => ipcRenderer.invoke('modes:get-active'),
    setActive: (id: string) => ipcRenderer.invoke('modes:set-active', id),
  },
  // ---- Context / RAG ----
  context: {
    selectFile: () => ipcRenderer.invoke('context:select-file'),
    uploadFile: (modeId: string, filePath: string, fileName: string, fileSize: number) =>
      ipcRenderer.invoke('context:upload-file', modeId, filePath, fileName, fileSize),
    getFiles: (modeId: string) => ipcRenderer.invoke('context:get-files', modeId),
    deleteFile: (fileId: string) => ipcRenderer.invoke('context:delete-file', fileId),
    onUploadProgress: (callback: (data: { stage: string; current: number; total: number }) => void) => {
      const handler = (_event: unknown, data: { stage: string; current: number; total: number }) => callback(data)
      ipcRenderer.on('context:upload-progress', handler)
      return () => ipcRenderer.removeListener('context:upload-progress', handler)
    },
  },
  // ---- Audio ----
  audioStartRecording: (deviceId?: string) => ipcRenderer.invoke('audio:start-recording', deviceId),
  audioStopRecording: () => ipcRenderer.invoke('audio:stop-recording'),
  audioSendChunk: (buffer: ArrayBuffer, source: 'mic' | 'system') =>
    ipcRenderer.send('audio:chunk', buffer, source),
  audioGetState: () => ipcRenderer.invoke('audio:get-state'),
  onRecordingStateChanged: (callback: (state: { isRecording: boolean; endedSessionId?: string | null }) => void) => {
    const handler = (_event: unknown, state: { isRecording: boolean; endedSessionId?: string | null }) => callback(state)
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
  startTestTranscription: (deviceId: string) => ipcRenderer.invoke('transcription:start-test', deviceId),
  stopTestTranscription: () => ipcRenderer.invoke('transcription:stop-test'),
  sendTestAudio: (buffer: ArrayBuffer) => ipcRenderer.invoke('transcription:send-test-audio', buffer),
  onTestTranscriptionUpdate: (callback: (data: { text: string; isFinal: boolean }) => void) => {
    const handler = (_event: unknown, data: { text: string; isFinal: boolean }) => callback(data)
    ipcRenderer.on('transcription:test-update', handler)
    return () => ipcRenderer.removeListener('transcription:test-update', handler)
  },
  getTranscript: () => ipcRenderer.invoke('audio:get-transcript'),
  clearTranscript: () => ipcRenderer.invoke('audio:clear-transcript'),
  getTranscriptEntries: () => ipcRenderer.invoke('audio:get-transcript-entries'),
  // Claude AI
  claudeGetResponse: (params: {
    transcript: string;
    action: string;
    customPrompt?: string;
    modePrompt?: string;
    modeId?: string;
    includeScreenshot?: boolean;
  }) =>
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
    requestMeta?: { includeScreenshot: boolean; screenshotPreviewData?: string }
  }) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data as {
      type: 'start' | 'delta' | 'done' | 'error' | 'cleared'
      userMessage?: { id: string; role: 'user'; content: string; action?: string; timestamp: number }
      assistantMessage?: { id: string; role: 'assistant'; content: string; timestamp: number }
      messageId?: string
      text?: string
      fullText?: string
      error?: string
      requestMeta?: { includeScreenshot: boolean; screenshotPreviewData?: string }
    })
    ipcRenderer.on('claude:response', handler)
    return () => { ipcRenderer.removeListener('claude:response', handler) }
  },
  sendOnboardingCompleted: () => ipcRenderer.send('onboarding:completed'),
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
  onHotkeyClearConversation: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('hotkey:clear-conversation', handler)
    return () => ipcRenderer.removeListener('hotkey:clear-conversation', handler)
  },
  onHotkeyScrollUp: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('hotkey:scroll-up', handler)
    return () => ipcRenderer.removeListener('hotkey:scroll-up', handler)
  },
  onHotkeyScrollDown: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('hotkey:scroll-down', handler)
    return () => ipcRenderer.removeListener('hotkey:scroll-down', handler)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const handler = (_event: unknown, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
})
