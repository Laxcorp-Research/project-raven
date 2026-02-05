import Store from 'electron-store'

interface Settings {
  deepgramApiKey: string
  anthropicApiKey: string
  stealthEnabled: boolean
  windowBounds: { x: number; y: number; width: number; height: number } | null
  onboardingComplete: boolean
}

// electron-store with defaults
const store = new Store<Settings>({
  defaults: {
    deepgramApiKey: '',
    anthropicApiKey: '',
    stealthEnabled: true,
    windowBounds: null,
    onboardingComplete: false,
  },
})

export function getSettings(): Settings {
  return {
    deepgramApiKey: store.get('deepgramApiKey'),
    anthropicApiKey: store.get('anthropicApiKey'),
    stealthEnabled: store.get('stealthEnabled'),
    windowBounds: store.get('windowBounds'),
    onboardingComplete: store.get('onboardingComplete'),
  }
}

export function saveSettings(settings: Partial<Settings>): void {
  Object.entries(settings).forEach(([key, value]) => {
    store.set(key as keyof Settings, value)
  })
}

export function hasApiKeys(): boolean {
  return !!store.get('deepgramApiKey') && !!store.get('anthropicApiKey')
}
