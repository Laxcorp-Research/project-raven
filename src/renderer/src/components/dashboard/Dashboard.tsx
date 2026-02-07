import { useState, useEffect } from 'react'
import { Header } from './Header'
import { SessionList } from './SessionList'
import { Sidebar } from './Sidebar'
import { RecordingChip } from './RecordingChip'
import { SessionDetail } from './SessionDetail'

export function Dashboard() {
  const [stealth, setStealth] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [activeSession, setActiveSession] = useState<{ id: string; title: string; startedAt: number } | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)

  useEffect(() => {
    async function loadState() {
      const val = await window.raven.storeGet('stealthEnabled')
      setStealth(val as boolean)
    }
    loadState()

    async function syncActiveSession() {
      try {
        const session =
          (await window.raven.sessions.getActive()) ||
          (await window.raven.sessions.getInProgress())
        if (session) {
          setActiveSession({
            id: session.id,
            title: session.title || 'Untitled session',
            startedAt: session.startedAt ?? session.createdAt ?? Date.now(),
          })
        }
      } catch (error) {
        console.error('Failed to load active session:', error)
      }
    }

    const unsub = window.raven.onStealthChanged((enabled) => {
      setStealth(enabled)
    })

    const unsubRecording = window.raven.onRecordingStateChanged((state) => {
      setIsRecording(state.isRecording)
      if (state.isRecording) {
        syncActiveSession()
      } else {
        setActiveSession(null)
      }
    })

    const unsubSessionUpdated = window.raven.sessions.onSessionUpdated((session) => {
      if (!session) return
      setActiveSession((prev) => {
        if (!prev || prev.id !== session.id) return prev
        return {
          ...prev,
          title: session.title || prev.title,
          startedAt: session.startedAt || prev.startedAt,
        }
      })
    })

    window.raven.audioGetState().then((state) => {
      setIsRecording(state.isRecording)
      if (state.isRecording) {
        syncActiveSession()
      } else {
        setActiveSession(null)
      }
    })

    return () => {
      unsub()
      unsubRecording()
      unsubSessionUpdated()
    }
  }, [])

  useEffect(() => {
    if (!activeSession) {
      setRecordingDuration(0)
      return
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - activeSession.startedAt) / 1000)
      setRecordingDuration(elapsed)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [activeSession])

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

  const handleStopRecording = () => {
    try {
      window.raven.sendHotkeyToggleRecording()
    } catch (error) {
      console.error('Failed to stop recording:', error)
    }
  }

  const handleOpenSettings = () => {
    // Settings modal comes in Phase E
    console.log('Settings clicked — coming in Phase E')
  }

  const handleSessionSelect = async (session: { id: string }) => {
    try {
      const fullSession = await window.raven.sessions.get(session.id)
      if (fullSession) {
        setSelectedSession(fullSession)
      }
    } catch (error) {
      console.error('Failed to load session:', error)
    }
  }

  const handleBackToList = () => {
    setSelectedSession(null)
  }

  const handleUpdateTitle = async (sessionId: string, newTitle: string) => {
    try {
      await window.raven.sessions.updateTitle(sessionId, newTitle)
      setSelectedSession((prev) => (prev ? { ...prev, title: newTitle } : null))
    } catch (error) {
      console.error('Failed to update title:', error)
    }
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar onOpenSettings={handleOpenSettings} />

      <div className="flex-1 flex flex-col">
        {!selectedSession && (
          <Header
            stealth={stealth}
            onToggleStealth={handleToggleStealth}
            onStartRaven={handleStartRaven}
            isRecording={isRecording}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedSession ? (
            <SessionDetail
              session={selectedSession}
              onBack={handleBackToList}
              onUpdateTitle={handleUpdateTitle}
            />
          ) : (
            <SessionList
              onSessionSelect={handleSessionSelect}
              activeSessionId={activeSession?.id || null}
              activeSession={
                activeSession
                  ? { ...activeSession, durationSeconds: recordingDuration }
                  : null
              }
            />
          )}
        </div>
      </div>

      {activeSession && (
        <RecordingChip
          sessionTitle={activeSession.title}
          duration={recordingDuration}
          onStop={handleStopRecording}
        />
      )}
    </div>
  )
}
