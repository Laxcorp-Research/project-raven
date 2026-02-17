import { useState, useEffect, type ReactNode } from 'react'
import { ArrowLeft, FileText } from 'lucide-react'
import { createLogger } from '../../lib/logger'

const log = createLogger('Search')

interface Session {
  id: string
  title: string
  summary: string | null
  durationSeconds: number
  startedAt: number
  endedAt: number | null
  createdAt: number
}

function truncateQuery(query: string, maxLen = 40): string {
  return query.length > maxLen ? query.slice(0, maxLen) + '...' : query
}

interface SearchResultsViewProps {
  query: string
  onBack: () => void
  onSessionSelect: (session: { id: string }) => void
}

function getDateGroup(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())

  if (dateOnly.getTime() === todayOnly.getTime()) return 'Today'
  if (dateOnly.getTime() === yesterdayOnly.getTime()) return 'Yesterday'

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`
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

function highlightMatches(text: string, query: string): ReactNode {
  if (!query.trim()) return text
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200/60 text-inherit rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

export function SearchResultsView({ query, onBack, onSessionSelect }: SearchResultsViewProps) {
  const [results, setResults] = useState<Session[]>([])
  const [recentSessions, setRecentSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function doSearch() {
      setIsLoading(true)
      try {
        const [sessions, all] = await Promise.all([
          window.raven.sessions.search(query),
          window.raven.sessions.getAll()
        ])
        if (!cancelled) {
          setResults(sessions)
          setRecentSessions(all.slice(0, 5))
        }
      } catch (error) {
        log.error('Search failed:', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    doSearch()
    return () => { cancelled = true }
  }, [query])

  const grouped = new Map<string, Session[]>()
  for (const session of results) {
    const group = getDateGroup(session.startedAt)
    if (!grouped.has(group)) grouped.set(group, [])
    grouped.get(group)!.push(session)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="max-w-[900px] mx-auto w-full px-6 pt-6 pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors mb-5 cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back</span>
        </button>
        {!isLoading && results.length > 0 && (
          <h1 className="text-2xl font-semibold text-gray-900 truncate max-w-full">
            Results for &quot;{truncateQuery(query)}&quot;
          </h1>
        )}
        {!isLoading && results.length === 0 && (
          <h1 className="text-2xl font-semibold text-gray-900 truncate max-w-full">
            No Results for &quot;{truncateQuery(query)}&quot;
          </h1>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[900px] mx-auto w-full px-6 pb-16">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : results.length === 0 ? (
            <div>
              {recentSessions.length > 0 && (
                <>
                  <p className="text-sm text-gray-500 mb-3">Your recent sessions</p>
                  {recentSessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => onSessionSelect(session)}
                      className="flex items-center justify-between py-3 px-4 -mx-4 rounded-lg cursor-pointer transition-colors hover:bg-gray-100/70"
                    >
                      <span className="text-gray-900 truncate mr-6">
                        {session.title || 'Untitled session'}
                      </span>
                      <span className="text-sm text-gray-500 tabular-nums shrink-0">
                        {formatTime(session.startedAt)}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            Array.from(grouped.entries()).map(([dateGroup, sessions]) => (
              <div key={dateGroup} className="mb-2">
                <div className="sticky top-0 py-2.5 px-4 -mx-4 text-xs font-medium text-gray-400 bg-white z-10">
                  {dateGroup}
                </div>
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => onSessionSelect(session)}
                    className="group flex items-center justify-between py-3 px-4 -mx-4 rounded-lg cursor-pointer transition-colors duration-150 hover:bg-gray-100/70"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1 mr-6">
                      <FileText size={16} className="text-gray-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-gray-900 truncate">
                          {highlightMatches(session.title || 'Untitled session', query)}
                        </p>
                        {session.summary && (
                          <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
                            {highlightMatches(session.summary, query)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm text-gray-600 tabular-nums bg-gray-200/70 px-2.5 py-0.5 rounded-full">
                        {formatDuration(session.durationSeconds)}
                      </span>
                      <span className="text-sm text-gray-500 tabular-nums">
                        {formatTime(session.startedAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
