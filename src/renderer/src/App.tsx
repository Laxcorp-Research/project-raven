import { useState, useEffect } from 'react'
import { createLogger } from './lib/logger'
import { Onboarding } from './components/Onboarding'
import { Dashboard } from './components/dashboard/Dashboard'
import { OverlayWindow } from './components/overlay/OverlayWindow'
import { PermissionsGate } from './components/PermissionsGate'

const log = createLogger('App')

type AppView = 'loading' | 'overlay' | 'onboarding-free' | 'permissions-gate' | 'dashboard'

async function permissionsAllGranted(): Promise<boolean> {
  try {
    const status = await window.raven.permissionsGetStatus()
    return (
      status.microphone === 'granted' &&
      status.screen === 'granted' &&
      status.accessibility === 'granted'
    )
  } catch {
    return true
  }
}

function App(): JSX.Element {
  const [view, setView] = useState<AppView>('loading')
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

        const settings = await window.raven.storeGetAll()
        const onboarded = settings.onboardingComplete as boolean
        const hasKeys = await window.raven.apiKeysHas()
        if (!onboarded || !hasKeys) {
          setView('onboarding-free')
          return
        }
        const allGranted = await permissionsAllGranted()
        setView(allGranted ? 'dashboard' : 'permissions-gate')
      } catch (err) {
        log.error('Failed to initialize:', err)
        setView('onboarding-free')
      }
    }
    void init()
  }, [])

  useEffect(() => {
    if (windowType !== 'dashboard') return
    if (view !== 'dashboard') return

    const onFocus = async () => {
      const ok = await permissionsAllGranted()
      if (!ok) {
        log.warn('Permission revoked while app running - routing to gate')
        setView('permissions-gate')
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [windowType, view])

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
    return (
      <PermissionsGate
        onAllGranted={() => {
          setView('dashboard')
          void window.raven.windowShowOverlay()
        }}
      />
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
