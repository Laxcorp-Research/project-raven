import { useState, useEffect, lazy, Suspense } from 'react'
import { createLogger } from './lib/logger'
import { Onboarding } from './components/Onboarding'
import { Dashboard } from './components/dashboard/Dashboard'
import { OverlayWindow } from './components/overlay/OverlayWindow'
import { PermissionsGate } from './components/PermissionsGate'

const log = createLogger('App')

type AppView = 'loading' | 'overlay' | 'onboarding-free' | 'onboarding-pro' | 'permissions-gate' | 'dashboard'

/**
 * Runtime permission check: all three macOS permissions must be granted
 * before the user can reach the main app. Onboarding already handles
 * the first-install flow; this catches the revoked-in-system-settings
 * case for returning users. Non-darwin platforms always pass.
 */
async function permissionsAllGranted(): Promise<boolean> {
  try {
    const status = await window.raven.permissionsGetStatus()
    return (
      status.microphone === 'granted' &&
      status.screen === 'granted' &&
      status.accessibility === 'granted'
    )
  } catch {
    // If the IPC fails we can't know, but it's safer to NOT gate - the
    // IPC not being registered would trap an OSS user with no escape.
    // The audio pipeline will surface its own errors if perms are bad.
    return true
  }
}

type ProOnboardingProps = { alreadyAuthenticated: boolean; onComplete: () => void }

function ProOnboardingFallback(_props: ProOnboardingProps): JSX.Element {
  return <div />
}

const proOnboardingLoaders = import.meta.glob('../../pro/renderer/onboarding/ProOnboarding.tsx')
const loadProOnboarding = Object.values(proOnboardingLoaders)[0] as
  | (() => Promise<{ ProOnboarding: React.ComponentType<ProOnboardingProps> }>) | undefined

const ProOnboarding = lazy<React.ComponentType<ProOnboardingProps>>(async () => {
  if (loadProOnboarding) {
    try {
      const mod = await loadProOnboarding()
      return { default: mod.ProOnboarding }
    } catch {
      return { default: ProOnboardingFallback }
    }
  }
  return { default: ProOnboardingFallback }
})

interface UserProfile {
  name: string
  email: string
  avatarUrl: string | null
}

interface CachedSubscription {
  plan: string
  status: string
  currentPeriodEnd: string | null
}

function App(): JSX.Element {
  const [view, setView] = useState<AppView>('loading')
  const [proAuthenticated, setProAuthenticated] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [cachedSubscription, setCachedSubscription] = useState<CachedSubscription | null>(null)

  const [windowType, setWindowType] = useState<'dashboard' | 'overlay' | 'unknown' | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const type = await window.raven.windowGetType()
        setWindowType(type)

        if (type === 'overlay') {
          setView('overlay')
          return
        }

        const isPro = await window.raven.planIsPro()
        const settings = await window.raven.storeGetAll()
        const onboarded = isPro
          ? (settings.proOnboardingComplete || settings.onboardingComplete) as boolean
          : settings.onboardingComplete as boolean

        log.info('App init:', {
          isPro,
          proOnboardingComplete: settings.proOnboardingComplete,
          onboardingComplete: settings.onboardingComplete,
          onboarded,
          proOnboardingStep: settings.proOnboardingStep,
        })

        if (isPro) {
          let authenticated = false
          try {
            authenticated = await window.raven.authIsAuthenticated()
          } catch {
            // Auth IPC not registered (shouldn't happen in pro mode)
          }

          log.info('Auth check:', { authenticated, onboarded })

          if (!authenticated) {
            setProAuthenticated(false)
            setView('onboarding-pro')
          } else if (!onboarded) {
            setProAuthenticated(true)
            setView('onboarding-pro')
          } else {
            const cachedProfile = settings.cachedUserProfile as UserProfile | undefined
            const cachedSub = settings.cachedSubscription as CachedSubscription | undefined
            if (cachedProfile) setUserProfile(cachedProfile)
            if (cachedSub) setCachedSubscription(cachedSub)

            // Runtime permission check - bar the dashboard if any of the
            // three required macOS permissions has been revoked since
            // onboarding completed. The gate polls and auto-transitions
            // to the dashboard once everything is granted again.
            const allGranted = await permissionsAllGranted()
            setView(allGranted ? 'dashboard' : 'permissions-gate')

            Promise.all([
              window.raven.authGetCurrentUser().catch(() => null),
              window.raven.authGetSubscription().catch(() => null),
            ]).then(([authUser, sub]) => {
              if (authUser) {
                const profile = { name: authUser.name || '', email: authUser.email || '', avatarUrl: authUser.avatarUrl || null }
                setUserProfile(profile)
                window.raven.storeSet('cachedUserProfile', profile)
              }
              if (sub) {
                setCachedSubscription(sub)
                window.raven.storeSet('cachedSubscription', sub)
              }
            })
          }
        } else {
          const hasKeys = await window.raven.apiKeysHas()
          if (!onboarded || !hasKeys) {
            setView('onboarding-free')
          } else {
            // Same runtime gate for OSS / free-tier users.
            const allGranted = await permissionsAllGranted()
            setView(allGranted ? 'dashboard' : 'permissions-gate')
          }
        }
      } catch (err) {
        log.error('Failed to initialize:', err)
        setView('onboarding-free')
      }
    }
    init()

    const cleanups: Array<() => void> = []

    try {
      cleanups.push(window.raven.onAuthLoginCompleted((data) => {
        if (data.success) {
          log.info('Auth login completed via deep link - updating state')
          setProAuthenticated(true)
          setView('onboarding-pro')
        }
      }))
    } catch {
      // not in pro mode
    }

    try {
      const subChangeHandler = (_event: unknown) => {
        let polls = 0
        const pollInterval = setInterval(async () => {
          polls++
          if (polls > 6) { clearInterval(pollInterval); return }
          try {
            const sub = await window.raven.authGetSubscription()
            if (sub) {
              setCachedSubscription(sub)
              window.raven.storeSet('cachedSubscription', sub)
            }
          } catch { /* ignore */ }
        }, 10000)
      }
      window.raven.onSubscriptionMayChange?.(subChangeHandler)
      cleanups.push(() => window.raven.offSubscriptionMayChange?.(subChangeHandler))
    } catch { /* not in pro mode */ }

    try {
      cleanups.push(window.raven.onAuthSessionExpired?.(() => {
        // Only redirect to login from the dashboard - the overlay handles
        // auth expiry by showing a card, not by replacing its UI.
        if (windowType !== 'overlay') {
          log.warn('Auth session expired - redirecting to login')
          setProAuthenticated(false)
          setView('onboarding-pro')
        }
      }) ?? (() => {}))
    } catch {
      // not in pro mode
    }

    return () => cleanups.forEach((fn) => fn())
  }, [windowType])

  // Re-check permissions when the dashboard regains focus. If the user
  // revoked a permission in System Settings and then came back to
  // Raven, we want to push them into the gate immediately instead of
  // letting them interact with a dashboard that can't record. Only
  // fires for the dashboard window - overlay is not a permissions
  // surface, onboarding has its own polling.
  //
  // Also re-fetch subscription on focus when the cached copy is non-
  // ACTIVE. Recovery flow: user clicks "Resume Pro" -> Dodo customer
  // portal opens in browser -> user updates payment method -> Dodo
  // auto-charges + flips the subscription to ACTIVE -> user alt-tabs
  // back to Raven. The customer portal doesn't redirect through our
  // raven://billing-success deep link, and our polling after
  // authOpenBillingPortal is capped at 60s, so without this focus-
  // refresh the top-level "Resume Pro" banner can stay visible until
  // the user restarts the app. Skipping the fetch when subscription
  // is already ACTIVE to avoid a network call on every window focus.
  useEffect(() => {
    if (windowType !== 'dashboard') return
    if (view !== 'dashboard') return

    const onFocus = async () => {
      const ok = await permissionsAllGranted()
      if (!ok) {
        log.warn('Permission revoked while app running - routing to gate')
        setView('permissions-gate')
        return
      }

      if (cachedSubscription && cachedSubscription.status !== 'ACTIVE') {
        try {
          const sub = await window.raven.authGetSubscription?.()
          if (sub && (sub.status !== cachedSubscription.status
              || sub.plan !== cachedSubscription.plan
              || sub.currentPeriodEnd !== cachedSubscription.currentPeriodEnd)) {
            log.info('Subscription changed on focus refresh')
            setCachedSubscription(sub)
            window.raven.storeSet('cachedSubscription', sub)
          }
        } catch { /* backend unreachable - keep the cached value */ }
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [windowType, view, cachedSubscription])

  if (view === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  if (view === 'overlay') {
    return <OverlayWindow />
  }

  if (view === 'permissions-gate') {
    return <PermissionsGate onAllGranted={() => setView('dashboard')} />
  }

  if (view === 'onboarding-pro') {
    return (
      <Suspense fallback={
        <div className="flex items-center justify-center h-screen bg-white">
          <div className="text-gray-400">Loading...</div>
        </div>
      }>
        <ProOnboarding
          alreadyAuthenticated={proAuthenticated}
          onComplete={() => {
            setView('dashboard')
            window.raven.sendOnboardingCompleted()
            Promise.all([
              window.raven.authGetCurrentUser().catch(() => null),
              window.raven.authGetSubscription().catch(() => null),
            ]).then(([authUser, sub]) => {
              if (authUser) {
                const profile = { name: authUser.name || '', email: authUser.email || '', avatarUrl: authUser.avatarUrl || null }
                setUserProfile(profile)
                window.raven.storeSet('cachedUserProfile', profile)
              }
              if (sub) {
                setCachedSubscription(sub)
                window.raven.storeSet('cachedSubscription', sub)
              }
            })
          }}
        />
      </Suspense>
    )
  }

  if (view === 'onboarding-free') {
    return (
      <Onboarding
        onComplete={() => {
          setView('dashboard')
          window.raven.sendOnboardingCompleted()
        }}
      />
    )
  }

  return <Dashboard initialUserProfile={userProfile} initialSubscription={cachedSubscription} />
}

export default App
