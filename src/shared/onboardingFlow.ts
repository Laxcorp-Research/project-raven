/**
 * First-launch wizard. Same step order on every platform: permissions
 * before API keys so a relaunch (macOS Screen Recording TCC) cannot
 * wipe keys that only lived in React state.
 *
 * Continue still waits for mic + screen + accessibility. On Windows the
 * main process already reports screen/accessibility as granted — there
 * is no equivalent privacy toggle — so the user only actually grants
 * the microphone.
 */
export const ONBOARDING_STEP = {
  welcome: 1,
  permissions: 2,
  keys: 3,
  tour: 4,
  shortcuts: 5,
  ready: 6,
} as const

export type OnboardingStep = (typeof ONBOARDING_STEP)[keyof typeof ONBOARDING_STEP]

export const ONBOARDING_LAST_STEP = ONBOARDING_STEP.ready

export function onboardingPermissionsReady(opts: {
  microphone: string
  screen: string
  accessibility: string
}): boolean {
  return (
    opts.microphone === 'granted' &&
    opts.screen === 'granted' &&
    opts.accessibility === 'granted'
  )
}

export function parseOnboardingStep(raw: unknown): OnboardingStep {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN
  if (
    n >= ONBOARDING_STEP.welcome
    && n <= ONBOARDING_LAST_STEP
    && Number.isInteger(n)
  ) {
    return n as OnboardingStep
  }
  return ONBOARDING_STEP.welcome
}
