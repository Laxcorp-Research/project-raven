/**
 * Mac Accessibility Grant.
 *
 * `systemPreferences.isTrustedAccessibilityClient(true)` shows the
 * system TCC dialog and returns false immediately — it does not wait
 * for the user. That dialog already has “Open System Settings”.
 * Opening the Accessibility pane as well stacks a second settings UI
 * on top of the prompt.
 */
export function shouldOpenAccessibilitySettingsAfterPrompt(_granted: boolean): boolean {
  return false
}
