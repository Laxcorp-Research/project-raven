import Store from 'electron-store';
import { app, safeStorage } from 'electron';
import { createHash } from 'crypto';
import { hostname, userInfo } from 'os';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

function getEncryptionKey(): string {
  // Derive a deterministic per-machine key from OS-level identifiers.
  // This is obfuscation (not true security) since the derivation is deterministic,
  // but it prevents trivial decryption by someone who just reads the source code.
  // We intentionally avoid safeStorage here because:
  //   - safeStorage.encryptString() is non-deterministic (random IV each call)
  //   - It changes across Electron major versions, breaking existing configs
  //   - It triggers macOS Keychain permission prompts on upgrade
  const machineId = `${hostname()}-${userInfo().username}-raven-v1`;
  return createHash('sha256').update(machineId).digest('hex').slice(0, 32);
}

export interface LocalSettings {
  // Plan mode
  mode: 'free' | 'pro';

  // API Keys (free tier only)
  deepgramApiKey: string;
  anthropicApiKey: string;
  apiKeysConfigured: boolean;

  // Onboarding
  onboardingComplete: boolean;
  proOnboardingComplete: boolean;
  proOnboardingStep: string;

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

  // User profile
  displayName: string;
  profilePicturePath: string;

  // Pro extensions store arbitrary keys via saveSetting()
  // (e.g. auth_tokens, auth_user, sync_queue, backendUrl)
  [key: string]: unknown;
}

const STORE_DEFAULTS: LocalSettings = {
  mode: 'free',
  deepgramApiKey: '',
  anthropicApiKey: '',
  apiKeysConfigured: false,
  onboardingComplete: false,
  proOnboardingComplete: false,
  proOnboardingStep: '',
  dashboardBounds: null,
  overlayBounds: null,
  stealthEnabled: true,
  theme: 'system',
  openOnLogin: false,
  transcriptionLanguage: 'en',
  outputLanguage: 'en',
  aiProvider: 'anthropic',
  aiModel: 'claude-haiku-4-5',
  openaiApiKey: '',
  activeModeId: null,
  displayName: '',
  profilePicturePath: '',
};

function createStore(): Store<LocalSettings> {
  const encryptionKey = getEncryptionKey();
  try {
    const s = new Store<LocalSettings>({
      name: 'raven-config',
      defaults: STORE_DEFAULTS,
      encryptionKey,
    });
    // Verify we can read (triggers decryption)
    s.get('mode');
    return s;
  } catch {
    // Decryption failed (e.g. encryption key changed).
    // Delete the corrupted config file and start fresh.
    try {
      const configPath = join(app.getPath('userData'), 'raven-config.json');
      if (existsSync(configPath)) unlinkSync(configPath);
    } catch {
      // ignore - file may not exist or be locked
    }
    return new Store<LocalSettings>({
      name: 'raven-config',
      defaults: STORE_DEFAULTS,
      encryptionKey,
    });
  }
}

const store = createStore();

// Clean up stale unencrypted config.json left by a previous bug
// where `new Store()` was used without the encryption key.
// This file contains plaintext API keys and must be removed.
try {
  const legacyConfigPath = join(app.getPath('userData'), 'config.json');
  if (existsSync(legacyConfigPath)) {
    unlinkSync(legacyConfigPath);
  }
} catch {
  // ignore - file may not exist or be locked
}

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
    displayName: store.get('displayName'),
    profilePicturePath: store.get('profilePicturePath'),
    proOnboardingComplete: store.get('proOnboardingComplete'),
    proOnboardingStep: store.get('proOnboardingStep'),
    cachedUserProfile: store.get('cachedUserProfile' as keyof LocalSettings) || null,
    cachedSubscription: store.get('cachedSubscription' as keyof LocalSettings) || null,
  };
}

export function getSetting<K extends keyof LocalSettings>(key: K): LocalSettings[K] {
  if ((API_KEY_FIELDS as readonly string[]).includes(key)) {
    return getApiKey(key as typeof API_KEY_FIELDS[number]) as LocalSettings[K];
  }
  return store.get(key);
}

// ---- Setters ----

export function saveSetting<K extends keyof LocalSettings>(
  key: K,
  value: LocalSettings[K]
): void {
  if ((API_KEY_FIELDS as readonly string[]).includes(key) && typeof value === 'string') {
    store.set(key, encryptValue(value));
    return;
  }
  store.set(key, value);
}

export function saveSettings(settings: Partial<LocalSettings>): void {
  Object.entries(settings).forEach(([key, value]) => {
    store.set(key as keyof LocalSettings, value);
  });
}

// ---- Secure storage helpers for API keys ----

const API_KEY_FIELDS = ['deepgramApiKey', 'anthropicApiKey', 'openaiApiKey'] as const;

function encryptValue(value: string): string {
  if (!value) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(value).toString('base64');
    }
  } catch { /* fall through */ }
  return value;
}

function decryptValue(stored: string): string {
  if (!stored) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    }
  } catch { /* fall through — may be an unencrypted legacy value */ }
  return stored;
}

export function getApiKey(key: typeof API_KEY_FIELDS[number]): string {
  const raw = store.get(key) as string;
  return decryptValue(raw);
}

// ---- API Key Helpers ----

export function saveApiKeys(deepgramKey: string, anthropicKey: string, openaiKey?: string): void {
  store.set('deepgramApiKey', encryptValue(deepgramKey));
  store.set('anthropicApiKey', encryptValue(anthropicKey));
  if (openaiKey !== undefined) {
    store.set('openaiApiKey', encryptValue(openaiKey));
  }
  store.set('apiKeysConfigured', true);
}

export function hasApiKeys(): boolean {
  const hasDeepgram = !!getApiKey('deepgramApiKey');
  const provider = store.get('aiProvider') || 'anthropic';
  const hasAiKey = provider === 'openai'
    ? !!getApiKey('openaiApiKey')
    : !!getApiKey('anthropicApiKey');
  return hasDeepgram && hasAiKey;
}

export function clearApiKeys(): void {
  store.set('deepgramApiKey', '');
  store.set('anthropicApiKey', '');
  store.set('openaiApiKey', '');
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
