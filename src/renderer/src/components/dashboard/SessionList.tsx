import React, { useEffect, useState } from 'react'

interface Session {
  id: string
  title: string
  transcript: any[]
  aiResponses: any[]
  modeId: string | null
  durationSeconds: number
  startedAt: number
  endedAt: number | null
  createdAt: number
}

interface GroupedSessions {
  today: Session[]
  yesterday: Session[]
  thisWeek: Session[]
  earlier: Session[]
}

export function SessionList() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  useEffect(() => {
    loadSessions()

    const unsubscribe = window.raven.sessions.onListUpdated(() => {
      loadSessions()
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const handleClickOutside = () => setMenuOpenId(null)
    if (menuOpenId) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [menuOpenId])

  const loadSessions = async () => {
    try {
      const all = await window.raven.sessions.getAll()
      setSessions(all)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  const groupSessions = (sessions: Session[]): GroupedSessions => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const yesterday = today - 86400000
    const weekAgo = today - 7 * 86400000

    const grouped: GroupedSessions = {
      today: [],
      yesterday: [],
      thisWeek: [],
      earlier: [],
    }

    sessions.forEach((session) => {
      const sessionDate = session.startedAt
      if (sessionDate >= today) {
        grouped.today.push(session)
      } else if (sessionDate >= yesterday) {
        grouped.yesterday.push(session)
      } else if (sessionDate >= weekAgo) {
        grouped.thisWeek.push(session)
      } else {
        grouped.earlier.push(session)
      }
    })

    return grouped
  }

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins < 60) return `${mins}m ${secs}s`
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return `${hours}h ${remainingMins}m`
  }

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this session? This cannot be undone.')) {
      await window.raven.sessions.delete(id)
      loadSessions()
    }
    setMenuOpenId(null)
  }

  const handleRegenerateTitle = async (id: string) => {
    setMenuOpenId(null)
    const newTitle = await window.raven.sessions.regenerateTitle(id)
    console.log('Regenerated title:', newTitle)
    loadSessions()
  }

  const handleCopyTranscript = async (session: Session) => {
    const text = session.transcript
      .map((e: any) => `${e.source === 'mic' ? 'You' : 'Them'}: ${e.text}`)
      .join('\n')
    await navigator.clipboard.writeText(text)
    setMenuOpenId(null)
  }

  const handleExport = (session: Session) => {
    const markdown = `# ${session.title}

**Date:** ${new Date(session.startedAt).toLocaleString()}
**Duration:** ${formatDuration(session.durationSeconds)}

## Transcript

${session.transcript
  .map((e: any) => `**${e.source === 'mic' ? 'You' : 'Them'}:** ${e.text}`)
  .join('\n\n')}

${session.aiResponses.length > 0 ? `
## AI Responses

${session.aiResponses.map((r: any) => `### ${r.action}
**You asked:** ${r.userMessage}
**Raven:** ${r.response}`).join('\n\n')}
` : ''}
`

    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${session.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
    a.click()
    URL.revokeObjectURL(url)
    setMenuOpenId(null)
  }

  const grouped = groupSessions(sessions)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading sessions...</div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-6xl mb-4">🎙️</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions yet</h3>
        <p className="text-gray-500 max-w-sm">
          Start your first recording to see your session history here.
        </p>
      </div>
    )
  }

  const renderSessionGroup = (title: string, groupSessions: Session[]) => {
    if (groupSessions.length === 0) return null

    return (
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">
          {title}
        </h3>
        <div className="space-y-1">
          {groupSessions.map((session) => (
            <div
              key={session.id}
              className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
            >
              <div
                className="flex items-center justify-between p-3 cursor-pointer"
                onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 truncate">{session.title}</h4>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    <span>{formatTime(session.startedAt)}</span>
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                      {formatDuration(session.durationSeconds)}
                    </span>
                    <span className="text-gray-400">
                      {session.transcript.length} entries
                    </span>
                  </div>
                </div>

                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpenId(menuOpenId === session.id ? null : session.id)
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>

                  {menuOpenId === session.id && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                      <button
                        onClick={() => handleCopyTranscript(session)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        📋 Copy transcript
                      </button>
                      <button
                        onClick={() => handleRegenerateTitle(session.id)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        ✨ Regenerate title
                      </button>
                      <button
                        onClick={() => handleExport(session)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        📥 Export as Markdown
                      </button>
                      <hr className="my-1" />
                      <button
                        onClick={() => handleDelete(session.id)}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {expandedId === session.id && (
                <div className="border-t border-gray-100 p-3 bg-gray-50">
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {session.transcript.length === 0 ? (
                      <p className="text-gray-500 text-sm italic">No transcript available</p>
                    ) : (
                      session.transcript.map((entry: any, idx: number) => (
                        <div
                          key={idx}
                          className={`text-sm p-2 rounded ${
                            entry.source === 'mic'
                              ? 'bg-cyan-50 text-cyan-900'
                              : 'bg-gray-200 text-gray-900'
                          }`}
                        >
                          <span className="font-medium">
                            {entry.source === 'mic' ? 'You' : 'Them'}:
                          </span>{' '}
                          {entry.text}
                        </div>
                      ))
                    )}
                  </div>

                  {session.aiResponses.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        AI Responses
                      </h5>
                      <div className="space-y-2">
                        {session.aiResponses.map((response: any, idx: number) => (
                          <div key={idx} className="text-sm bg-purple-50 p-2 rounded">
                            <div className="font-medium text-purple-700">{response.action}</div>
                            <div className="text-purple-900 mt-1">{response.response}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      {renderSessionGroup('Today', grouped.today)}
      {renderSessionGroup('Yesterday', grouped.yesterday)}
      {renderSessionGroup('This Week', grouped.thisWeek)}
      {renderSessionGroup('Earlier', grouped.earlier)}
    </div>
  )
}
