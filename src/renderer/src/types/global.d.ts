interface TranscriptEntry {
  id: string;
  source: 'mic' | 'system';
  text: string;
  timestamp: number;
  isFinal: boolean;
}

interface AIResponse {
  id: string;
  action: string;
  userMessage: string;
  response: string;
  timestamp: number;
}

// Mode Types
export interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  icon?: string;
}

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
  quickActions: QuickAction[];
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
      apiKeysSave: (deepgramKey: string, anthropicKey: string) => Promise<boolean>;
      apiKeysHas: () => Promise<boolean>;
      apiKeysClear: () => Promise<boolean>;
      planIsFree: () => Promise<boolean>;
      planIsPro: () => Promise<boolean>;
      resetAll: () => Promise<boolean>;
      validateApiKeys: (deepgramKey: string, anthropicKey: string) => Promise<{ valid: boolean; error?: string }>;
      openExternal: (url: string) => Promise<boolean>;
      windowToggleOverlay: () => Promise<boolean>;
      windowShowOverlay: () => Promise<boolean>;
      windowAutoSizeOverlay: (mode: 'compact' | 'expanded') => Promise<boolean>;
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
      systemAudioStart: () => Promise<boolean>;
      systemAudioStop: () => Promise<boolean>;
      sendSystemAudioToDeepgram: (chunk: { data: number[]; timestamp: number }) => void;
      onSystemAudioChunk: (callback: (data: {
        data: ArrayBuffer | Uint8Array;
        sampleRate: number;
        channels: number;
        timestamp: number;
      }) => void) => () => void;
      onNativeMicChunk: (callback: (data: {
        data: ArrayBuffer | Uint8Array;
        sampleRate: number;
        channels: number;
        timestamp: number;
      }) => void) => () => void;
      onSystemAudioForDeepgram: (callback: (chunk: { data: number[]; timestamp: number }) => void) => () => void;
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
        delete: (id: string) => Promise<boolean>;
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
        deleteFile: (fileId: string) => Promise<boolean>;
        onUploadProgress: (callback: (data: { stage: string; current: number; total: number }) => void) => () => void;
      };
      audioStartRecording: (deviceId?: string) => Promise<{ success: boolean }>;
      audioStopRecording: () => Promise<{ success: boolean; duration: number }>;
      audioSendChunk: (buffer: ArrayBuffer, source: 'mic' | 'system') => void;
      audioGetState: () => Promise<{ isRecording: boolean; duration: number }>;
      onRecordingStateChanged: (callback: (state: { isRecording: boolean }) => void) => () => void;
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
        requestMeta?: { includeScreenshot: boolean; screenshotPreviewData?: string };
      }) => void) => () => void;
      sendHotkeyToggleRecording: () => void;
      onStealthChanged: (callback: (enabled: boolean) => void) => () => void;
      onHotkeyToggleRecording: (callback: () => void) => () => void;
      onHotkeyAiSuggestion: (callback: () => void) => () => void;
      onHotkeyClearConversation: (callback: () => void) => () => void;
      onHotkeyScrollUp: (callback: () => void) => () => void;
      onHotkeyScrollDown: (callback: () => void) => () => void;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
    };
  }
}

export {};
