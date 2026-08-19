export const MAC_UPDATE_PROMPT_EVENT = 'raven:show-mac-update-prompt'

/** Re-open the Mac installer steps dialog (Settings → Download installer). */
export function requestMacUpdatePrompt(): void {
  window.dispatchEvent(new Event(MAC_UPDATE_PROMPT_EVENT))
}
