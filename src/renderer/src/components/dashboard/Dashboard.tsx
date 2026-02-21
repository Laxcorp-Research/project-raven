import { useState, useEffect, useCallback } from 'react'
import { Cloud } from 'lucide-react'
import { createLogger } from '../../lib/logger'
import { Header } from './Header'
import { useAppMode } from '../../hooks/useAppMode'

const log = createLogger('Dashboard')
import { SessionList } from './SessionList'
import { RecordingChip } from './RecordingChip'
import { SessionDetail } from './SessionDetail'
import { SettingsModal } from './SettingsModal'
import { SearchResultsView } from './SearchResultsView'

interface TranscriptEntry {
  id: string
  source: 'mic' | 'system'
  text: string
  timestamp: number
  isFinal: boolean
}

interface SessionDetailData {
  id: string
  title: string
  transcript: TranscriptEntry[]
  summary: string | null
  durationSeconds: number
  startedAt: number
  modeId: string | null
}

export function Dashboard() {
  const { isPro } = useAppMode()
  const [stealth, setStealth] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ synced: number; total: number; done: boolean } | null>(null)
  const [activeSession, setActiveSession] = useState<{ id: string; title: string; startedAt: number } | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [selectedSession, setSelectedSession] = useState<SessionDetailData | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchQuery, setActiveSearchQuery] = useState<string | null>(null)

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
        log.error('Failed to load active session:', error)
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
        const sessionId = state.endedSessionId
        setActiveSession(null)
        if (sessionId) {
          window.raven.sessions.get(sessionId).then((fullSession) => {
            if (fullSession) setSelectedSession(fullSession)
          }).catch(() => {})
        }
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

    const unsubListUpdated = window.raven.sessions.onListUpdated(() => {
      setSelectedSession((prev) => {
        if (!prev) return prev
        const prevId = prev.id
        window.raven.sessions.get(prevId).then((updated) => {
          if (updated) {
            setSelectedSession((current) => current?.id === prevId ? updated : current)
          }
        }).catch(() => {})
        return prev
      })
    })

    window.raven.audioGetState().then((state) => {
      setIsRecording(state.isRecording)
      if (state.isRecording) {
        syncActiveSession()
      } else {
        setActiveSession(null)
      }
    }).catch((err) => log.error('Failed to get audio state:', err))

    const unsubTraySettings = window.raven.on('tray:open-settings', () => {
      setSettingsOpen(true)
    })

    return () => {
      unsub()
      unsubRecording()
      unsubSessionUpdated()
      unsubListUpdated()
      unsubTraySettings()
    }
  }, [])

  useEffect(() => {
    if (!isPro) return
    try {
      const unsub = window.raven.onSyncProgress((data) => {
        if (data.done) {
          setTimeout(() => setSyncProgress(null), 3000)
          setSyncProgress({ synced: data.total, total: data.total, done: true })
        } else {
          setSyncProgress({ synced: data.synced, total: data.total, done: false })
        }
      })
      return unsub
    } catch {
      // sync not available
    }
  }, [isPro])

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
      log.error('Failed to stop recording:', error)
    }
  }

  const handleOpenSettings = () => {
    setSettingsOpen(true)
  }

  const handleSessionSelect = async (session: { id: string }) => {
    try {
      const fullSession = await window.raven.sessions.get(session.id)
      if (fullSession) {
        setSelectedSession(fullSession)
      }
    } catch (error) {
      log.error('Failed to load session:', error)
    }
  }

  const handleBackToList = () => {
    setSelectedSession(null)
  }

  const handleSearchSubmit = useCallback((query: string) => {
    setActiveSearchQuery(query)
    setSelectedSession(null)
  }, [])

  const handleSearchBack = useCallback(() => {
    setActiveSearchQuery(null)
    setSearchQuery('')
  }, [])

  const handleUpdateTitle = async (sessionId: string, newTitle: string) => {
    try {
      await window.raven.sessions.updateTitle(sessionId, newTitle)
      setSelectedSession((prev) => (prev ? { ...prev, title: newTitle } : null))
    } catch (error) {
      log.error('Failed to update title:', error)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Custom title bar - draggable, centered title */}
      <div
        className="flex items-center justify-center shrink-0 h-9 bg-white border-b border-gray-100 text-xs font-medium text-gray-400 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        Raven
      </div>
      <Header
        stealth={stealth}
        onToggleStealth={handleToggleStealth}
        onStartRaven={handleStartRaven}
        isRecording={isRecording}
        onOpenSettings={handleOpenSettings}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        onSessionSelect={handleSessionSelect}
      />

      {syncProgress && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-100">
          <Cloud size={16} className="text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-xs text-blue-700 mb-1">
              <span>
                {syncProgress.done
                  ? `Uploaded ${syncProgress.total} session${syncProgress.total > 1 ? 's' : ''} to cloud`
                  : `Uploading sessions to cloud... ${syncProgress.synced} of ${syncProgress.total}`}
              </span>
              <span className="text-blue-500">
                {syncProgress.done ? 'Done' : `${Math.round((syncProgress.synced / syncProgress.total) * 100)}%`}
              </span>
            </div>
            <div className="w-full h-1 bg-blue-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${syncProgress.done ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.round((syncProgress.synced / syncProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedSession ? (
          <SessionDetail
            session={selectedSession}
            onBack={handleBackToList}
            onUpdateTitle={handleUpdateTitle}
          />
        ) : activeSearchQuery ? (
          <SearchResultsView
            query={activeSearchQuery}
            onBack={handleSearchBack}
            onSessionSelect={handleSessionSelect}
          />
        ) : (
          <SessionList
            onSessionSelect={handleSessionSelect}
            activeSessionId={activeSession?.id || null}
            searchQuery={searchQuery}
            activeSession={
              activeSession
                ? { ...activeSession, durationSeconds: recordingDuration }
                : null
            }
          />
        )}
      </div>

      {activeSession && (
        <RecordingChip
          sessionTitle={activeSession.title}
          duration={recordingDuration}
          onStop={handleStopRecording}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
