import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_LAST_STEP,
  ONBOARDING_STEP,
  onboardingPermissionsReady,
  parseOnboardingStep,
} from '../../shared/onboardingFlow'

describe('onboardingFlow', () => {
  it('asks for macOS permissions before API keys so a TCC restart cannot wipe unsaved keys', () => {
    expect(ONBOARDING_STEP.permissions).toBeLessThan(ONBOARDING_STEP.keys)
    expect(ONBOARDING_STEP.welcome).toBe(1)
    expect(ONBOARDING_LAST_STEP).toBe(6)
  })

  it('Continue requires microphone, screen, and accessibility on every platform', () => {
    expect(onboardingPermissionsReady({
      microphone: 'granted',
      screen: 'unknown',
      accessibility: 'unknown',
    })).toBe(false)
    expect(onboardingPermissionsReady({
      microphone: 'unknown',
      screen: 'granted',
      accessibility: 'granted',
    })).toBe(false)
    expect(onboardingPermissionsReady({
      microphone: 'granted',
      screen: 'granted',
      accessibility: 'granted',
    })).toBe(true)
  })

  it('parseOnboardingStep keeps a stored wizard index and falls back to welcome', () => {
    expect(parseOnboardingStep(2)).toBe(ONBOARDING_STEP.permissions)
    expect(parseOnboardingStep('3')).toBe(ONBOARDING_STEP.keys)
    expect(parseOnboardingStep(0)).toBe(ONBOARDING_STEP.welcome)
    expect(parseOnboardingStep(99)).toBe(ONBOARDING_STEP.welcome)
    expect(parseOnboardingStep(undefined)).toBe(ONBOARDING_STEP.welcome)
  })
})
