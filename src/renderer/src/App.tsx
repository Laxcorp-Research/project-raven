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

function App(): JSX.Element {
  const [view, setView] = useState<AppView>('loading')
  const [proAuthenticated, setProAuthenticated] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const type = await window.raven.windowGetType()

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

          log.info('Auth check:', { authenticated })

          if (!authenticated) {
            setProAuthenticated(false)
            setView('onboarding-pro')
          } else if (!onboarded) {
            setProAuthenticated(true)
            setView('onboarding-pro')
          } else {
            setView('dashboard')
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

    try {
      const unsub = window.raven.onAuthLoginCompleted((data) => {
        if (data.success) {
          log.info('Auth login completed via deep link — updating state')
          setProAuthenticated(true)
          setView('onboarding-pro')
        }
      })
      return unsub
    } catch {
      // not in pro mode
    }
  }, [])

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

  return <Dashboard />
}

export default App
