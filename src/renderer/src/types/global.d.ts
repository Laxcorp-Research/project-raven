interface TranscriptEntry {
  id: string;
  source: 'mic' | 'system';
  text: string;
  timestamp: number;
  isFinal: boolean;
  speakerName?: string | null;
}

interface AIResponse {
  id: string;
  action: string;
  userMessage: string;
  response: string;
  timestamp: number;
}

// Mode Types

export interface NotesSection {
  id: string;
  title: string;
  instructions: string;
}

export interface Mode {
  id: string;
  name: string;
  systemPrompt: string;
  icon: string;
  color: string;
  isDefault: boolean;
  isBuiltin: boolean;
  notesTemplate: NotesSection[] | null;
  createdAt: number;
  updatedAt: number;
}

interface Session {
  id: string;
  title: string;
  transcript: TranscriptEntry[];
  aiResponses: AIResponse[];
  summary: string | null;
  modeId: string | null;
  durationSeconds: number;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
}

interface SessionMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

declare global {
  interface Window {
    raven: {
      storeGetAll: () => Promise<Record<string, unknown>>;
      storeGet: (key: string) => Promise<unknown>;
      storeSet: (key: string, value: unknown) => Promise<boolean>;
      storeSaveMany: (settings: Record<string, unknown>) => Promise<boolean>;
      apiKeysSave: (deepgramKey: string, anthropicKey: string, openaiKey?: string) => Promise<boolean>;
      apiKeysHas: () => Promise<boolean>;
      apiKeysClear: () => Promise<boolean>;
      planIsFree: () => Promise<boolean>;
      planIsPro: () => Promise<boolean>;
      resetAll: () => Promise<boolean>;
      // Auth (pro mode)
      authIsBackendConfigured: () => Promise<boolean>;
      authIsAuthenticated: () => Promise<boolean>;
      authGetCurrentUser: () => Promise<{
        id: string;
        email: string;
        name: string | null;
        avatarUrl: string | null;
        plan: 'FREE' | 'PRO' | 'TEAM';
        subscriptionStatus: string;
      } | null>;
      authStartBrowserLogin: () => Promise<{ success: boolean; user?: { id: string; email: string; name: string | null }; error?: string }>;
      authCancelBrowserLogin: () => Promise<{ success: boolean }>;
      authLogin: (email: string, password: string) => Promise<{ success: boolean; user?: { id: string; email: string; name: string | null }; error?: string }>;
      authSignup: (email: string, password: string, name: string) => Promise<{ success: boolean; user?: { id: string; email: string; name: string | null }; error?: string }>;
      authStartGoogleLogin: () => Promise<{ success: boolean; user?: { id: string; email: string; name: string | null }; error?: string }>;
      authStartAppleLogin: () => Promise<{ success: boolean; user?: { id: string; email: string; name: string | null }; error?: string }>;
      authLogout: () => Promise<{ success: boolean }>;
      authDeleteAccount: () => Promise<{ success: boolean; error?: string }>;
      onAuthLoginCompleted: (callback: (data: { success: boolean; user?: unknown }) => void) => () => void;
      onAuthSessionExpired: (callback: (data: { reason: string }) => void) => () => void;
      onSubscriptionMayChange?: (callback: (event: unknown) => void) => void;
      offSubscriptionMayChange?: (callback: (event: unknown) => void) => void;
      authFetchProfile: () => Promise<{ success: boolean; user?: { id: string; email: string; name: string | null }; error?: string }>;
      authUpdateProfile: (updates: { name?: string; avatarUrl?: string; preferences?: Record<string, unknown> }) => Promise<{ success: boolean; user?: { id: string; email: string; name: string | null; avatarUrl: string | null; preferences?: Record<string, unknown> }; error?: string }>;
      authGetSubscription: () => Promise<{ plan: string; status: string; currentPeriodEnd: string | null }>;
      authGetManagedKeys: () => Promise<{ deepgram: string; plan: string } | null>;
      authOpenCheckout: (plan: 'PRO' | 'TEAM', interval?: 'monthly' | 'yearly') => Promise<{ success: boolean; error?: string }>;
      authOpenBillingPortal: () => Promise<{ success: boolean; error?: string }>;
      proxyGetUsage: () => Promise<{
        plan: string;
        used: number;
        limit: number | null;
        remaining: number | null;
        sessionsUsed: number;
        sessionLimit: number | null;
        sessionMaxSeconds: number | null;
        resetAt: string | null;
      }>;
      proxyCheckSession: () => Promise<{ allowed: boolean; plan: string; sessionMaxSeconds: number | null; sessionsUsed: number; sessionLimit: number | null; resetAt: string | null }>;
      onSessionLimit: (callback: (data: { type: string }) => void) => () => void;
      proxyAnalyzeSession: (params: { transcript: string; features: string[]; sessionId?: string }) => Promise<{
        sessionId?: string;
        summary?: string;
        actionItems?: string;
        topics?: string;
        sentiment?: string;
        keyPhrases?: string;
        error?: string;
      } | null>;
      validateApiKeys: (deepgramKey: string, anthropicKey: string) => Promise<{ valid: boolean; error?: string }>;
      validateKeys: (deepgramKey: string, aiProvider: 'anthropic' | 'openai', aiKey: string) => Promise<{ valid: boolean; error?: string; deepgramError?: string; aiError?: string }>;
      openExternal: (url: string) => Promise<boolean>;
      quitApp: () => Promise<void>;
      relaunchApp: () => Promise<void>;
      getAppVersion: () => Promise<string>;
      updateCheck: () => Promise<{ success: boolean; error?: string }>;
      updateDownload: () => Promise<{ success: boolean; error?: string }>;
      updateInstall: () => Promise<{ success: boolean }>;
      updateGetState: () => Promise<{ status: string; version?: string; error?: string; progress?: number }>;
      onUpdateStateChanged: (callback: (state: { status: string; version?: string; error?: string; progress?: number }) => void) => () => void;
      profileSelectPicture: () => Promise<string | null>;
      profileSelectPictureRaw: () => Promise<string | null>;
      profileSavePictureData: (dataUrl: string) => Promise<string | null>;
      profileGetPictureData: (filePath: string) => Promise<string | null>;
      profileRemovePicture: () => Promise<boolean>;
      windowToggleOverlay: () => Promise<boolean>;
      windowShowOverlay: () => Promise<boolean>;
      windowAutoSizeOverlay: (mode: 'compact' | 'expanded') => Promise<boolean>;
      windowMoveOverlay: (direction: 'up' | 'down' | 'left' | 'right') => Promise<boolean>;
      windowSetIgnoreMouseEvents: (ignore: boolean) => Promise<boolean>;
      windowShowDashboard: () => Promise<boolean>;
      windowResize: (width: number, height: number) => Promise<boolean>;
      windowGetOverlayBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
      windowGetCursorPoint: () => Promise<{ x: number; y: number }>;
      windowSetOverlayBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<boolean>;
      windowHideOverlay: () => Promise<boolean>;
      windowHide: () => Promise<boolean>;
      windowSetStealth: (enabled: boolean) => Promise<boolean>;
      windowGetType: () => Promise<'dashboard' | 'overlay' | 'unknown'>;
      desktopGetSources: () => Promise<Array<{ id: string; name: string; displayId: string }>>;
      systemAudioIsAvailable: () => Promise<boolean>;
      systemAudioHasPermission: () => Promise<boolean>;
      systemAudioRequestPermission: () => Promise<boolean>;
      sessions: {
        create: (session: Omit<Session, 'createdAt'>) => Promise<Session>;
        update: (id: string, updates: Partial<Session>) => Promise<boolean>;
        get: (id: string) => Promise<Session | null>;
        getAll: () => Promise<Session[]>;
        search: (query: string) => Promise<Session[]>;
        getMessages: (sessionId: string) => Promise<SessionMessage[]>;
        addMessage: (sessionId: string, role: 'user' | 'assistant', content: string) => Promise<SessionMessage>;
        delete: (id: string) => Promise<boolean>;
        regenerateSummary: (id: string) => Promise<boolean>;
        updateTitle: (id: string, title: string) => Promise<boolean>;
        getInProgress: () => Promise<Session | null>;
        getActive: () => Promise<Session | null>;
        hasActive: () => Promise<boolean>;
        regenerateTitle: (id: string) => Promise<string>;
        onListUpdated: (callback: () => void) => () => void;
        onSessionUpdated: (callback: (session: { id: string; title: string; startedAt: number } | null) => void) => () => void;
      };
      modes: {
        getAll: () => Promise<Mode[]>;
        get: (id: string) => Promise<Mode | null>;
        create: (mode: Omit<Mode, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Mode>;
        update: (id: string, updates: Partial<Omit<Mode, 'id' | 'isBuiltin' | 'createdAt'>>) => Promise<Mode | null>;
        delete: (id: string) => Promise<{ success: boolean; error?: string }>;
        duplicate: (id: string, newName: string) => Promise<Mode | null>;
        resetBuiltin: (id: string) => Promise<Mode | null>;
        getActive: () => Promise<Mode | null>;
        setActive: (id: string) => Promise<boolean>;
      };
      context: {
        selectFile: () => Promise<{ filePath: string; fileName: string; fileSize: number } | null>;
        uploadFile: (modeId: string, filePath: string, fileName: string, fileSize: number) => Promise<{
          success: boolean;
          file?: { id: string; modeId: string; fileName: string; fileSize: number; fileType: string; chunkCount: number; createdAt: number };
          error?: string;
        }>;
        getFiles: (modeId: string) => Promise<Array<{ id: string; modeId: string; fileName: string; fileSize: number; fileType: string; chunkCount: number; createdAt: number }>>;
        deleteFile: (modeId: string, fileId: string) => Promise<boolean>;
        onUploadProgress: (callback: (data: { stage: string; current: number; total: number }) => void) => () => void;
      };
      audioStartRecording: (deviceId?: string) => Promise<{ success: boolean }>;
      audioStopRecording: () => Promise<{ success: boolean; duration: number }>;
      audioGetState: () => Promise<{ isRecording: boolean; duration: number }>;
      onRecordingStateChanged: (callback: (state: { isRecording: boolean; endedSessionId?: string | null }) => void) => () => void;
      onTranscriptUpdate: (callback: (data: {
        text: string;
        isFinal: boolean;
        fullTranscript: string;
        speaker?: number;
        entries?: Array<{
          id: string;
          source: 'mic' | 'system';
          text: string;
          speaker: 'you' | 'them';
          timestamp: number;
          isFinal: boolean;
        }>;
        interims?: { mic: string; system: string };
      }) => void) => () => void;
      onTranscriptionStatus: (callback: (data: { status: string }) => void) => () => void;
      onTranscriptionConnectionState: (callback: (data: {
        phase: 'idle' | 'connecting' | 'retrying' | 'connected' | 'failed';
        provider?: 'recall' | 'assemblyai' | 'deepgram' | null;
        retryCount?: number;
        maxRetries?: number;
        nextRetryAt?: number | null;
        message?: string;
        error?: string;
      }) => void) => () => void;
      startTestTranscription: (deviceId: string) => Promise<{ success: boolean; error?: string }>;
      stopTestTranscription: () => Promise<{ success: boolean }>;
      sendTestAudio: (buffer: ArrayBuffer) => Promise<{ success: boolean }>;
      onTestTranscriptionUpdate: (callback: (data: { text: string; isFinal: boolean }) => void) => () => void;
      getTranscript: () => Promise<string>;
      clearTranscript: () => Promise<{ success: boolean }>;
      getTranscriptEntries: () => Promise<Array<{
        id: string;
        source: 'mic' | 'system';
        text: string;
        speaker: 'you' | 'them';
        timestamp: number;
        isFinal: boolean;
      }>>;
      claudeGetResponse: (params: {
        transcript: string;
        action: string;
        customPrompt?: string;
        modePrompt?: string;
        modeId?: string;
        includeScreenshot?: boolean;
      }) => Promise<void>;
      claudeGetHistory: () => Promise<{ id: string; role: 'user' | 'assistant'; content: string; action?: string; timestamp: number }[]>;
      claudeClearHistory: () => Promise<{ success: boolean }>;
      onClaudeResponse: (callback: (data: {
        type: 'start' | 'delta' | 'done' | 'error' | 'cleared';
        userMessage?: { id: string; role: 'user'; content: string; action?: string; timestamp: number };
        assistantMessage?: { id: string; role: 'assistant'; content: string; timestamp: number };
        messageId?: string;
        text?: string;
        fullText?: string;
        error?: string;
        limitInfo?: { used: number; limit: number; resetAt: string };
        requestMeta?: { includeScreenshot: boolean; screenshotPreviewData?: string };
      }) => void) => () => void;
      syncGetStatus: () => Promise<{ lastSyncAt: string | null; queueSize: number; consecutiveFailures: number }>;
      syncTrigger: () => Promise<{ lastSyncAt: string | null; queueSize: number; consecutiveFailures: number; merged: number }>;
      syncGetLog: () => Promise<Array<{ timestamp: string; status: string; sessionsSynced: number; durationMs: number }>>;
      onSyncProgress: (callback: (data: { phase: string; synced: number; total: number; done: boolean }) => void) => () => void;
      permissionsGetStatus: () => Promise<{ microphone: string; screen: string; accessibility: string }>;
      permissionsRequestMicrophone: () => Promise<boolean>;
      permissionsOpenScreenRecording: () => Promise<boolean>;
      permissionsOpenMicrophone: () => Promise<boolean>;
      permissionsRequestAccessibility: () => Promise<boolean>;
      permissionsOpenAccessibility: () => Promise<boolean>;
      sendOnboardingCompleted: () => void;
      sendHotkeyToggleRecording: () => void;
      onStealthChanged: (callback: (enabled: boolean) => void) => () => void;
      onHotkeyToggleRecording: (callback: () => void) => () => void;
      onHotkeyAiSuggestion: (callback: () => void) => () => void;
      onHotkeyClearConversation: (callback: () => void) => () => void;
      onHotkeyScrollUp: (callback: () => void) => () => void;
      onHotkeyScrollDown: (callback: () => void) => () => void;
      onHotkeyMove: (callback: (direction: 'up' | 'down' | 'left' | 'right') => void) => () => void;
      analyticsTrack: (name: string, properties?: Record<string, unknown>) => Promise<void>;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;

      // Legacy overlay API (used by Settings.tsx, TitleBar.tsx, InputBar.tsx)
      getAiSuggestion: (apiKey: string, transcript: string, question?: string) => Promise<{ success: boolean; text: string; error?: string }>;
      saveSettings: (settings: Record<string, unknown>) => Promise<unknown>;
      toggleStealth: (enabled: boolean) => Promise<unknown>;
      hideWindow: () => void;
      minimizeWindow: () => void;
    };
  }
}

export {};
