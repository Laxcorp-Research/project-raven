import { useState, useEffect, lazy, Suspense } from 'react'
import { createLogger } from './lib/logger'
import { Onboarding } from './components/Onboarding'
import { Dashboard } from './components/dashboard/Dashboard'
import { OverlayWindow } from './components/overlay/OverlayWindow'

const log = createLogger('App')

type AppView = 'loading' | 'overlay' | 'onboarding-free' | 'onboarding-pro' | 'dashboard'

type ProOnboardingProps = { alreadyAuthenticated: boolean; onComplete: () => void }

function ProOnboardingFallback(_props: ProOnboardingProps): JSX.Element {
  return <div />
}

const proOnboardingModule = '../../pro/renderer/onboarding/ProOnboarding'
const ProOnboarding = lazy<React.ComponentType<ProOnboardingProps>>(async () => {
  try {
    const mod = await import(/* @vite-ignore */ proOnboardingModule)
    return { default: mod.ProOnboarding }
  } catch {
    return { default: ProOnboardingFallback }
  }
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
            setView('dashboard')

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
            setView('dashboard')
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
      cleanups.push(window.raven.onThemeChanged((theme: 'dark' | 'light') => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
      }))
    } catch { /* theme bridge not available */ }

    // Apply theme on mount
    window.raven.storeGet('theme').then((t) => {
      if (t === 'dark') document.documentElement.classList.add('dark')
      else if (t === 'light') document.documentElement.classList.remove('dark')
    }).catch(() => {})

    try {
      cleanups.push(window.raven.onAuthLoginCompleted((data) => {
        if (data.success) {
          log.info('Auth login completed via deep link — updating state')
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
        // Only redirect to login from the dashboard — the overlay handles
        // auth expiry by showing a card, not by replacing its UI.
        if (windowType !== 'overlay') {
          log.warn('Auth session expired — redirecting to login')
          setProAuthenticated(false)
          setView('onboarding-pro')
        }
      }) ?? (() => {}))
    } catch {
      // not in pro mode
    }

    return () => cleanups.forEach((fn) => fn())
  }, [windowType])

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
