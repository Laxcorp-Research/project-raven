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
}

export function SessionList({ onSessionSelect, activeSessionId, activeSession }: SessionListProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [menuState, setMenuState] = useState<MenuState>({ sessionId: null, x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
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

  const groupedSessions = groupSessionsByDate(mergedSessions, activeId)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-2">
        {Array.from(groupedSessions.entries()).map(([dateGroup, groupSessions]) => (
          <div key={dateGroup} className="mb-2">
            <div className="pl-8 pr-6 py-3 text-sm font-medium text-gray-500">
              {dateGroup}
            </div>

            {groupSessions.map((session) => {
              const isActive = session.id === activeId
              const displayTitle = isActive
                ? 'Untitled session'
                : regeneratingId === session.id
                  ? 'Regenerating...'
                  : session.title || 'Untitled session'

              return (
                <div
                  key={session.id}
                  className="group flex items-center pl-8 pr-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onMouseEnter={() => setHoveredId(session.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSessionSelect?.(session)}
                >
                  {isActive ? (
                    <span className="w-2 h-2 rounded-full bg-cyan-500 mr-3 animate-pulse" />
                  ) : (
                    <span className="w-2 mr-3" />
                  )}

                <div className="flex-1 min-w-0">
                  <span
                    className={`block truncate max-w-[600px] ${
                      regeneratingId === session.id ? 'text-gray-400 animate-pulse' : 'text-gray-900'
                    }`}
                  >
                    {displayTitle}
                  </span>
                </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 tabular-nums bg-gray-100 px-2 py-0.5 rounded">
                      {formatDuration(session.duration)}
                    </span>

                    <div className="relative w-12 flex justify-end items-center">
                      <span
                        className={`text-sm text-gray-500 transition-all duration-200 ease-in-out ${
                          hoveredId === session.id || menuState.sessionId === session.id
                            ? 'opacity-0 translate-x-2'
                            : 'opacity-100 translate-x-0'
                        }`}
                      >
                        {formatTime(session.createdAt)}
                      </span>

                      <button
                        onClick={(event) => openMenu(event, session.id)}
                        className={`absolute right-0 p-1.5 cursor-pointer transition-all duration-200 ease-in-out ${
                          hoveredId === session.id || menuState.sessionId === session.id
                            ? 'opacity-100 translate-x-0'
                            : 'opacity-0 -translate-x-2 pointer-events-none'
                        }`}
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
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

      {menuState.sessionId && (
        <div
          ref={menuRef}
          className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 w-32 overflow-hidden"
          style={{ top: menuState.y, left: menuState.x }}
        >
          <button
            onClick={() => openRegenerateModal(menuState.sessionId!)}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Regenerate
          </button>
          <button
            onClick={() => openDeleteModal(menuState.sessionId!)}
            className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
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
