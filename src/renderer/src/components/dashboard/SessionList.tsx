/**
 * Session List - Cluely-style design
 * - Grouped by date: "Today", "Yesterday", "Mon, Feb 2"
 * - Clean rows: Title | Duration | Time
 * - Minimal design, no cards
 */

import { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { ConfirmModal } from '../shared/ConfirmModal'
import { Toast } from '../shared/Toast'

interface Session {
  id: string
  title: string
  duration: number // in seconds
  createdAt: number
  updatedAt: number
  isActive?: boolean
}

interface ActiveSessionInfo {
  id: string
  title: string
  startedAt: number
  durationSeconds?: number
}

interface MenuState {
  sessionId: string | null
  x: number
  y: number
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  let hours = date.getHours()
  const mins = date.getMinutes()
  const ampm = hours >= 12 ? 'pm' : 'am'
  hours = hours % 12 || 12
  return `${hours}:${mins.toString().padStart(2, '0')}${ampm}`
}

function getDateGroup(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())

  if (dateOnly.getTime() === todayOnly.getTime()) {
    return 'Today'
  }
  if (dateOnly.getTime() === yesterdayOnly.getTime()) {
    return 'Yesterday'
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`
}

function groupSessionsByDate(sessions: Session[], activeSessionId?: string | null): Map<string, Session[]> {
  const groups = new Map<string, Session[]>()

  const sorted = [...sessions].sort((a, b) => {
    if (activeSessionId) {
      if (a.id === activeSessionId && b.id !== activeSessionId) return -1
      if (b.id === activeSessionId && a.id !== activeSessionId) return 1
    }
    return b.createdAt - a.createdAt
  })

  for (const session of sorted) {
    const group = getDateGroup(session.createdAt)
    if (!groups.has(group)) {
      groups.set(group, [])
    }
    groups.get(group)!.push(session)
  }

  return groups
}

interface SessionListProps {
  onSessionSelect?: (session: Session) => void
  activeSessionId?: string | null
  activeSession?: ActiveSessionInfo | null
  searchQuery?: string
}

export function SessionList({ onSessionSelect, activeSessionId, activeSession, searchQuery = '' }: SessionListProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [menuState, setMenuState] = useState<MenuState>({ sessionId: null, x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const [tooltipState, setTooltipState] = useState<{ sessionId: string; x: number; y: number } | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; sessionId: string | null }>({
    isOpen: false,
    sessionId: null,
  })
  const [regenerateModal, setRegenerateModal] = useState<{ isOpen: boolean; sessionId: string | null }>({
    isOpen: false,
    sessionId: null,
  })
  const [toast, setToast] = useState<{ message: string; type: 'loading' | 'success' | 'error' } | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)

  useEffect(() => {
    loadSessions()
    const unsubscribe = window.raven.sessions.onListUpdated(() => {
      loadSessions()
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuState({ sessionId: null, x: 0, y: 0 })
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadSessions() {
    try {
      setIsLoading(true)
      const allSessions = await window.raven.sessions.getAll()
      const mapped = allSessions.map((session) => ({
        id: session.id,
        title: session.title,
        duration: session.durationSeconds ?? 0,
        createdAt: session.startedAt ?? session.createdAt,
        updatedAt: session.endedAt ?? session.createdAt,
      }))
      setSessions(mapped)
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const isTextTruncated = (element: HTMLElement | null): boolean => {
    if (!element) return false
    return element.scrollWidth > element.clientWidth
  }

  function openDeleteModal(sessionId: string) {
    setMenuState({ sessionId: null, x: 0, y: 0 })
    setDeleteModal({ isOpen: true, sessionId })
  }

  function openRegenerateModal(sessionId: string) {
    setMenuState({ sessionId: null, x: 0, y: 0 })
    setRegenerateModal({ isOpen: true, sessionId })
  }

  async function handleConfirmDelete() {
    const sessionId = deleteModal.sessionId
    setDeleteModal({ isOpen: false, sessionId: null })

    if (!sessionId) return

    setToast({ message: 'Deleting session...', type: 'loading' })
    try {
      await Promise.all([
        window.raven.sessions.delete(sessionId),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])
      setToast({ message: 'Deleted session', type: 'success' })
    } catch (err) {
      console.error('Failed to delete:', err)
      setToast({ message: 'Failed to delete', type: 'error' })
    }
  }

  async function handleConfirmRegenerate() {
    const sessionId = regenerateModal.sessionId
    setRegenerateModal({ isOpen: false, sessionId: null })

    if (!sessionId) return

    setRegeneratingId(sessionId)
    try {
      await window.raven.sessions.regenerateSummary(sessionId)
      setToast({ message: 'Regenerated summary', type: 'success' })
    } catch (err) {
      console.error('Failed to regenerate:', err)
      setToast({ message: 'Failed to regenerate', type: 'error' })
    } finally {
      setRegeneratingId(null)
    }
  }

  function openMenu(event: ReactMouseEvent<HTMLButtonElement>, sessionId: string) {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setMenuState({
      sessionId,
      x: rect.right - 120,
      y: rect.bottom + 4,
    })
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        Loading sessions...
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 text-sm">No sessions yet</p>
        <p className="text-gray-400 text-xs mt-1">Start a session to see it here</p>
      </div>
    )
  }

  const activeId = activeSession?.id || activeSessionId
  const mergedSessions = activeSession
    ? (() => {
        const activeItem: Session = {
          id: activeSession.id,
          title: activeSession.title || 'Untitled session',
          duration: activeSession.durationSeconds ?? 0,
          createdAt: activeSession.startedAt,
          updatedAt: activeSession.startedAt,
        }
        const existingIndex = sessions.findIndex((session) => session.id === activeSession.id)
        if (existingIndex === -1) {
          return [activeItem, ...sessions]
        }
        const next = [...sessions]
        next[existingIndex] = {
          ...next[existingIndex],
          ...activeItem,
          title: next[existingIndex].title || activeItem.title,
          duration: activeItem.duration || next[existingIndex].duration,
        }
        return next
      })()
    : sessions

  const filteredSessions = searchQuery.trim()
    ? mergedSessions.filter((s) =>
        s.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : mergedSessions

  const groupedSessions = groupSessionsByDate(filteredSessions, activeId)

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="max-w-[900px] mx-auto w-full px-6 min-w-[500px]">
        {Array.from(groupedSessions.entries()).map(([dateGroup, groupSessions]) => (
          <div key={dateGroup} className="mb-2">
            <div className="sticky top-0 py-2.5 px-4 -mx-4 text-xs font-medium text-gray-400 bg-white z-10">
              {dateGroup}
            </div>

            {groupSessions.map((session) => {
              const isActive = session.id === activeId
              const isProcessing = !isActive && (!session.title || session.title === 'Untitled Session') && session.duration > 0
              const displayTitle = isActive
                ? 'Untitled session'
                : regeneratingId === session.id
                  ? 'Regenerating...'
                  : isProcessing
                    ? 'Processing Session...'
                    : session.title || 'Untitled session'

              return (
                <div
                  key={session.id}
                  className={`group flex items-center justify-between py-3 px-4 -mx-4 rounded-lg cursor-pointer transition-colors duration-150 ${
                    hoveredId === session.id || menuState.sessionId === session.id
                      ? 'bg-gray-100/70'
                      : ''
                  }`}
                  onMouseEnter={() => setHoveredId(session.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSessionSelect?.(session)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 mr-6">
                    {isActive && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                    )}
                    {isProcessing && (
                      <span className="w-2 h-2 rounded-full animate-breathing-dot shrink-0" />
                    )}

                    <span
                      ref={(el) => {
                        if (el) el.dataset.sessionId = session.id
                      }}
                      onMouseEnter={(e) => {
                        const target = e.currentTarget
                        if (isTextTruncated(target)) {
                          const rect = target.getBoundingClientRect()
                          setTooltipState({
                            sessionId: session.id,
                            x: rect.left + rect.width / 2,
                            y: rect.bottom + 8,
                          })
                        }
                      }}
                      onMouseLeave={() => setTooltipState(null)}
                      className={`truncate max-w-[500px] text-sm ${
                        regeneratingId === session.id
                          ? 'text-gray-400 animate-pulse'
                          : isProcessing
                            ? 'text-gray-400 animate-pulse'
                            : 'text-gray-900'
                      }`}
                    >
                      {displayTitle}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500 tabular-nums bg-gray-100 px-2 py-0.5 rounded-full">
                      {formatDuration(session.duration)}
                    </span>

                    <div className="w-[65px] relative h-6 flex items-center justify-end overflow-hidden">
                      <span
                        className={`text-xs text-gray-400 tabular-nums absolute right-0 transition-all duration-200 ease-out ${
                          hoveredId === session.id || menuState.sessionId === session.id
                            ? 'opacity-0 -translate-x-3'
                            : 'opacity-100 translate-x-0'
                        }`}
                      >
                        {formatTime(session.createdAt)}
                      </span>

                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          openMenu(event, session.id)
                        }}
                        className={`absolute right-0 p-1 cursor-pointer transition-all duration-200 ease-out ${
                          hoveredId === session.id || menuState.sessionId === session.id
                            ? 'opacity-100 translate-x-0'
                            : 'opacity-0 translate-x-3 pointer-events-none'
                        }`}
                      >
                        <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                          <circle cx="4" cy="10" r="1.5" />
                          <circle cx="10" cy="10" r="1.5" />
                          <circle cx="16" cy="10" r="1.5" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {tooltipState && (
        <div
          className="fixed z-50 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg max-w-md break-words pointer-events-none"
          style={{
            left: tooltipState.x,
            top: tooltipState.y,
            transform: 'translateX(-50%)',
          }}
        >
          {sessions.find((s) => s.id === tooltipState.sessionId)?.title ||
            (activeSession?.id === tooltipState.sessionId ? activeSession.title : '')}
        </div>
      )}

      {menuState.sessionId && (
        <div
          ref={menuRef}
          className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 w-32 overflow-hidden"
          style={{ top: menuState.y, left: menuState.x }}
        >
          <button
            onClick={() => openRegenerateModal(menuState.sessionId!)}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors"
          >
            Regenerate
          </button>
          <button
            onClick={() => openDeleteModal(menuState.sessionId!)}
            className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 cursor-pointer transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="Delete Session"
        message="This will delete the session forever. This action cannot be undone."
        confirmLabel="Delete"
        confirmColor="red"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, sessionId: null })}
      />

      <ConfirmModal
        isOpen={regenerateModal.isOpen}
        title="Regenerate Session"
        message="This will regenerate the session notes and analysis. Your current notes will be replaced with new ones. This action cannot be undone."
        confirmLabel="Regenerate"
        confirmColor="orange"
        onConfirm={handleConfirmRegenerate}
        onCancel={() => setRegenerateModal({ isOpen: false, sessionId: null })}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onComplete={() => setToast(null)}
        />
      )}
    </div>
  )
}
