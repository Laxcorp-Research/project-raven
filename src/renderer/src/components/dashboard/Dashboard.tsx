import { useState, useEffect } from 'react'
import { Header } from './Header'
import { SessionList } from './SessionList'
import { Sidebar } from './Sidebar'

export function Dashboard() {
  const [stealth, setStealth] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  useEffect(() => {
    async function loadState() {
      const val = await window.raven.storeGet('stealthEnabled')
      setStealth(val as boolean)
    }
    loadState()

    // Listen for stealth changes
    const unsub = window.raven.onStealthChanged((enabled) => {
      setStealth(enabled)
    })

    // Sync recording state from main process
    const unsubRecording = window.raven.onRecordingStateChanged((state) => {
      setIsRecording(state.isRecording)
    })

    window.raven.audioGetState().then((state) => {
      setIsRecording(state.isRecording)
    })

    return () => {
      unsub()
      unsubRecording()
    }
  }, [])

  const handleToggleStealth = async () => {
    const newValue = !stealth
    await window.raven.windowSetStealth(newValue)
    setStealth(newValue)
  }

  const handleStartRaven = async () => {
    if (!isRecording) {
      await window.raven.windowShowOverlay()
    }
    window.raven.sendHotkeyToggleRecording()
  }

  const handleOpenSettings = () => {
    // Settings modal comes in Phase E
    console.log('Settings clicked — coming in Phase E')
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar onOpenSettings={handleOpenSettings} />

      <div className="flex-1 flex flex-col">
        <Header
          stealth={stealth}
          onToggleStealth={handleToggleStealth}
          onStartRaven={handleStartRaven}
          isRecording={isRecording}
        />

        <SessionList />
      </div>
    </div>
  )
}
