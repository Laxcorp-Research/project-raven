import { useState, useEffect } from 'react'
import { Onboarding } from './components/Onboarding'
import { Dashboard } from './components/dashboard/Dashboard'
import { OverlayWindow } from './components/overlay/OverlayWindow'

function App(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [windowType, setWindowType] = useState<'dashboard' | 'overlay' | 'unknown'>('unknown')

  useEffect(() => {
    async function init() {
      try {
        const type = await window.raven.windowGetType()
        setWindowType(type)

        if (type === 'dashboard') {
          const settings = await window.raven.storeGetAll()
          const onboarded = settings.onboardingComplete as boolean
          const hasKeys = await window.raven.apiKeysHas()

          if (!onboarded || !hasKeys) {
            setShowOnboarding(true)
          }
        }
      } catch (err) {
        console.error('Failed to initialize:', err)
        setWindowType('dashboard')
        setShowOnboarding(true)
      }
      setLoading(false)
    }
    init()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  if (windowType === 'overlay') {
    return <OverlayWindow />
  }

  if (showOnboarding) {
    return (
      <Onboarding
        onComplete={() => {
          setShowOnboarding(false)
          window.raven.sendOnboardingCompleted()
        }}
      />
    )
  }

  return <Dashboard />
}

export default App
