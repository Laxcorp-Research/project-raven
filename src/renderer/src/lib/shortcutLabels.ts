/**
 * UI labels for global accelerators registered in src/main/index.ts
 * `registerGlobalHotkeys`. Keep these in lockstep with that function.
 */

export type ShortcutAction = 'visibility' | 'assist' | 'recording' | 'clear'

export function isMacPlatform(platform: string): boolean {
  return platform.toUpperCase().includes('MAC')
}

export function detectMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && isMacPlatform(navigator.platform)
}

export function modifierLabel(isMac: boolean): '⌘' | 'Ctrl' {
  return isMac ? '⌘' : 'Ctrl'
}

export function shortcutKeycaps(action: ShortcutAction, isMac: boolean): string[] {
  const mod = modifierLabel(isMac)
  switch (action) {
    case 'visibility':
      return [mod, '\\']
    case 'assist':
      return [mod, '↵']
    case 'recording':
      return [mod, '⇧', 'Space']
    case 'clear':
      return [mod, '⇧', isMac ? '⌫' : 'Backspace']
  }
}
