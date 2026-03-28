import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
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

type OverlayTourProps = { onBack: () => void; onNext: () => void }

function OverlayTourFallback(_props: OverlayTourProps): JSX.Element {
  return <div />
}

const overlayTourLoaders = import.meta.glob('../../../../pro/renderer/onboarding/OverlayTour.tsx')
const loadOverlayTour = Object.values(overlayTourLoaders)[0] as
  | (() => Promise<{ OverlayTour: React.ComponentType<OverlayTourProps> }>) | undefined

const OverlayTour = lazy<React.ComponentType<OverlayTourProps>>(async () => {
  if (loadOverlayTour) {
    try {
      const mod = await loadOverlayTour()
      return { default: mod.OverlayTour }
    } catch {
      return { default: OverlayTourFallback }
    }
  }
  return { default: OverlayTourFallback }
})

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
  insightsJson?: string | null
  durationSeconds: number
  startedAt: number
  modeId: string | null
}

interface DashboardProps {
  initialUserProfile?: { name: string; email: string; avatarUrl: string | null } | null
  initialSubscription?: { plan: string; status: string; currentPeriodEnd: string | null } | null
}

export function Dashboard({ initialUserProfile, initialSubscription }: DashboardProps = {}) {
  const { isPro } = useAppMode()
  const [stealth, setStealth] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ synced: number; total: number; done: boolean } | null>(null)
  const [activeSession, setActiveSession] = useState<{ id: string; title: string; startedAt: number } | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [selectedSession, setSelectedSession] = useState<SessionDetailData | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'billing' | undefined>(undefined)
  const [showOverlayTour, setShowOverlayTour] = useState(false)
  const [subscription, setSubscription] = useState(initialSubscription)
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
        if (prev && prev.id !== session.id) return prev
        return {
          id: session.id,
          title: session.title || prev?.title || 'Untitled session',
          startedAt: session.startedAt || prev?.startedAt || Date.now(),
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
    if (initialSubscription) setSubscription(initialSubscription)
  }, [initialSubscription])

  useEffect(() => {
    if (!isPro || subscription) return
    window.raven.authGetSubscription?.().then((sub) => {
      if (sub) setSubscription(sub)
    }).catch(() => {})
  }, [isPro, subscription])

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
    setSettingsInitialTab(undefined)
    setSettingsOpen(true)
  }

  const handleOpenBilling = () => {
    setSettingsInitialTab('billing')
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
        onReplayTour={isPro ? () => setShowOverlayTour(true) : undefined}
        initialUserProfile={initialUserProfile}
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

      {isPro && !isRecording && subscription?.plan === 'FREE' && (
        <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
          <div className="flex items-center gap-2 min-w-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
            <span className="text-sm font-medium truncate">Unlock unlimited sessions, AI responses, and meeting insights.</span>
          </div>
          <button
            onClick={handleOpenBilling}
            className="px-3 py-1 bg-white text-purple-700 text-xs font-semibold rounded-md hover:bg-white/90 transition-colors shrink-0 ml-3"
          >
            Upgrade to Pro
          </button>
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
        onClose={() => { setSettingsOpen(false); setSettingsInitialTab(undefined) }}
        initialSubscription={initialSubscription}
        initialTab={settingsInitialTab}
      />

      {showOverlayTour && (
        <div className="fixed inset-0 z-[300] bg-white">
          <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-400">Loading...</div>}>
            <div className="flex items-center justify-center h-full">
              <div className="w-full max-w-md px-6">
                <OverlayTour
                  onBack={() => setShowOverlayTour(false)}
                  onNext={() => setShowOverlayTour(false)}
                />
              </div>
            </div>
          </Suspense>
        </div>
      )}
    </div>
  )
}
