/**
 * Session List - Cluely-style design
 * - Grouped by date: "Today", "Yesterday", "Mon, Feb 2"
 * - Clean rows: Title | Duration | Time
 * - Minimal design, no cards
 */

import { useState, useEffect } from 'react'

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

  useEffect(() => {
    loadSessions()
    const unsubscribe = window.raven.sessions.onListUpdated(() => {
      loadSessions()
    })
    return () => unsubscribe()
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
      {Array.from(groupedSessions.entries()).map(([dateGroup, groupSessions]) => (
        <div key={dateGroup}>
          <div className="px-6 py-3 text-xs font-medium text-gray-500">
            {dateGroup}
          </div>

          {groupSessions.map((session) => {
            const isActive = session.id === activeId
            const displayTitle = isActive ? 'Untitled session' : (session.title || 'Untitled session')

            return (
              <button
                key={session.id}
                onClick={() => onSessionSelect?.(session)}
                className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors text-left group"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {isActive && (
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                    </span>
                  )}

                  <span className={`truncate text-sm ${isActive ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                    {displayTitle}
                  </span>
                </div>

                <div className="flex items-center gap-4 shrink-0 text-sm text-gray-500">
                  <span className="tabular-nums">{formatDuration(session.duration)}</span>
                  <span className="tabular-nums">{formatTime(session.createdAt)}</span>
                </div>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
