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

          // Server-side onboarding flag: when the user is
          // authenticated, the cached `getCurrentUser()` returns
          // their user record which now includes `onboardedAt`. A
          // truthy onboardedAt means the user has finished
          // onboarding on at least one device for this account, so
          // we treat them as onboarded regardless of what the
          // local electron-store `proOnboardingComplete` flag says
          // (which it wouldn't if the user wiped %APPDATA% or moved
          // to a new device). See backend migration
          // 0018_add_user_onboarded_at + auth route POST
          // /api/auth/me/onboarded.
          //
          // We OR with the local flag for backwards compat:
          //   * Older clients that completed onboarding before the
          //     migration shipped only have the local flag.
          //   * After a successful onboarding completion the local
          //     flag is set immediately while the markOnboarded
          //     IPC may still be in flight - the OR keeps the
          //     boot-time check stable across that window.
          let serverOnboarded = false
          if (authenticated) {
            try {
              const authUser = await window.raven.authGetCurrentUser()
              serverOnboarded = !!(authUser && authUser.onboardedAt)
            } catch { /* fall back to local-only flag */ }
          }
          const effectivelyOnboarded = onboarded || serverOnboarded

          log.info('Auth check:', { authenticated, onboarded, serverOnboarded, effectivelyOnboarded })

          if (!authenticated) {
            setProAuthenticated(false)
            setView('onboarding-pro')
          } else if (!effectivelyOnboarded) {
            setProAuthenticated(true)
            setView('onboarding-pro')
          } else {
            // Mirror the server flag locally if it was the
            // tie-breaker, so future cold boots can fast-path
            // without a network round-trip.
            if (serverOnboarded && !onboarded) {
              window.raven.storeSet('proOnboardingComplete', true)
            }
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
      cleanups.push(window.raven.onAuthLoginCompleted(async (data) => {
        if (!data.success) return
        // Auth completion is a DASHBOARD-window-only state transition.
        // The overlay window also receives this broadcast (the
        // authIpc.broadcastAuthLoginCompleted helper sends to every
        // window), but the overlay's job is to render the small
        // floating pill (`view === 'overlay'`), not the onboarding
        // flow. Without this guard the overlay would flip its `view`
        // to `'onboarding-pro'` and start rendering the full
        // ProOnboarding component on its full-screen-transparent
        // canvas. The bug stays invisible until `overlay.show()`
        // fires (currently triggered by the dashboard's own
        // `onboarding:completed` IPC), at which point the user sees
        // an apparent SECOND window with onboarding content sitting
        // on top of the dashboard - reported live by user 2026-05-10
        // after a Google OAuth flow on staging dev mode.
        //
        // Same gate as the onAuthSessionExpired listener below.
        if (windowType === 'overlay') return
        log.info('Auth login completed via deep link - updating state')
        setProAuthenticated(true)
        // Returning-user fast-path. The server-side `onboardedAt`
        // field on the user record is the source of truth for "this
        // user has completed onboarding before." It survives the
        // local data dir being wiped, works across devices, and
        // does not depend on heuristics like "OS permissions are
        // already granted" (which had real edge cases - users could
        // grant permissions outside the app and skip the
        // educational tour without ever asking for it). See
        // backend route POST /api/auth/me/onboarded + migration
        // 0018_add_user_onboarded_at for how this gets set, and
        // ProOnboarding.handleFinish() for where the renderer
        // makes the call.
        //
        // Local fallback: also accept `proOnboardingComplete` from
        // electron-store as a positive signal. Covers the
        // intermediate state right after the user finishes
        // onboarding but the markOnboarded() IPC hasn't returned
        // yet, and the edge case of a much older client whose
        // server doesn't yet support /me/onboarded (the route 404s
        // and the field never lands).
        //
        // If neither signal fires (genuinely new account, never
        // onboarded anywhere), fall through to the onboarding-pro
        // flow. Also fall through on any storage / IPC error so a
        // transient failure can't soft-lock the user.
        try {
          const settings = await window.raven.storeGetAll()
          const localFlag = (settings.proOnboardingComplete || settings.onboardingComplete) as boolean
          const authUser = await window.raven.authGetCurrentUser()
          const serverOnboarded = !!(authUser && authUser.onboardedAt)
          if (serverOnboarded || localFlag) {
            // Persist locally for boot-time fast-paths and for
            // offline relaunches. The serverOnboarded value is
            // already authoritative; the localFlag mirror just
            // saves a network round-trip on next boot.
            if (serverOnboarded && !localFlag) {
              window.raven.storeSet('proOnboardingComplete', true)
            }
            const allGranted = await permissionsAllGranted()
            setView(allGranted ? 'dashboard' : 'permissions-gate')
            return
          }
        } catch { /* fall through to onboarding-pro */ }
        setView('onboarding-pro')
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
