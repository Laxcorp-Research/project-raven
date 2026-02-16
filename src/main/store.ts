import Store from 'electron-store';

export interface LocalSettings {
  // Plan mode
  mode: 'free' | 'pro';

  // API Keys (free tier only)
  deepgramApiKey: string;
  anthropicApiKey: string;
  apiKeysConfigured: boolean;

  // Onboarding
  onboardingComplete: boolean;

  // Window state
  dashboardBounds: { x: number; y: number; width: number; height: number } | null;
  overlayBounds: { x: number; y: number; width: number; height: number } | null;

  // Preferences
  stealthEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
  openOnLogin: boolean;
  transcriptionLanguage: string;
  outputLanguage: string;

  // AI Provider
  aiProvider: 'anthropic' | 'openai';
  aiModel: string;
  openaiApiKey: string;

  // Active mode
  activeModeId: string | null;

  // Auth (pro tier only)
  accessToken: string | null;
  refreshToken: string | null;
}

const store = new Store<LocalSettings>({
  name: 'raven-config',
  defaults: {
    mode: 'free',
    deepgramApiKey: '',
    anthropicApiKey: '',
    apiKeysConfigured: false,
    onboardingComplete: false,
    dashboardBounds: null,
    overlayBounds: null,
    stealthEnabled: true,
    theme: 'system',
    openOnLogin: false,
    transcriptionLanguage: 'en',
    outputLanguage: 'en',
    aiProvider: 'anthropic',
    aiModel: 'claude-sonnet-4-20250514',
    openaiApiKey: '',
    activeModeId: null,
    accessToken: null,
    refreshToken: null,
  },
  encryptionKey: 'raven-local-encryption-key-v1',
});

// ---- Getters ----

export function getStore(): Store<LocalSettings> {
  return store;
}

export function getAllSettings(): LocalSettings {
  return {
    mode: store.get('mode'),
    deepgramApiKey: store.get('deepgramApiKey'),
    anthropicApiKey: store.get('anthropicApiKey'),
    apiKeysConfigured: store.get('apiKeysConfigured'),
    onboardingComplete: store.get('onboardingComplete'),
    dashboardBounds: store.get('dashboardBounds'),
    overlayBounds: store.get('overlayBounds'),
    stealthEnabled: store.get('stealthEnabled'),
    theme: store.get('theme'),
    openOnLogin: store.get('openOnLogin'),
    transcriptionLanguage: store.get('transcriptionLanguage'),
    outputLanguage: store.get('outputLanguage'),
    aiProvider: store.get('aiProvider'),
    aiModel: store.get('aiModel'),
    openaiApiKey: store.get('openaiApiKey'),
    activeModeId: store.get('activeModeId'),
    accessToken: store.get('accessToken'),
    refreshToken: store.get('refreshToken'),
  };
}

export function getSetting<K extends keyof LocalSettings>(key: K): LocalSettings[K] {
  return store.get(key);
}

// ---- Setters ----

export function saveSetting<K extends keyof LocalSettings>(
  key: K,
  value: LocalSettings[K]
): void {
  store.set(key, value);
}

export function saveSettings(settings: Partial<LocalSettings>): void {
  Object.entries(settings).forEach(([key, value]) => {
    store.set(key as keyof LocalSettings, value);
  });
}

// ---- API Key Helpers ----

export function saveApiKeys(deepgramKey: string, anthropicKey: string): void {
  store.set('deepgramApiKey', deepgramKey);
  store.set('anthropicApiKey', anthropicKey);
  store.set('apiKeysConfigured', true);
}

export function hasApiKeys(): boolean {
  return !!(store.get('deepgramApiKey') && store.get('anthropicApiKey'));
}

export function clearApiKeys(): void {
  store.set('deepgramApiKey', '');
  store.set('anthropicApiKey', '');
  store.set('apiKeysConfigured', false);
}

// ---- Plan Helpers ----

export function isFreeMode(): boolean {
  return store.get('mode') === 'free';
}

export function isProMode(): boolean {
  return store.get('mode') === 'pro';
}

// ---- Reset ----

export function resetAll(): void {
  store.clear();
}
