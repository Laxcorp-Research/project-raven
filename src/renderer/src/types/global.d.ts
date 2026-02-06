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
      onSystemAudioForDeepgram: (callback: (chunk: { data: number[]; timestamp: number }) => void) => () => void;
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
      claudeGetResponse: (params: { transcript: string; action: string; customPrompt?: string; modePrompt?: string }) => Promise<void>;
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
      }) => void) => () => void;
      sendHotkeyToggleRecording: () => void;
      onStealthChanged: (callback: (enabled: boolean) => void) => () => void;
      onHotkeyToggleRecording: (callback: () => void) => () => void;
      onHotkeyAiSuggestion: (callback: () => void) => () => void;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
    };
  }
}

export {};
