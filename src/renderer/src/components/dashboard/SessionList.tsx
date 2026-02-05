interface Session {
  id: string
  title: string
  duration: string
  timestamp: string
  date: string
}

interface SessionListProps {
  sessions: Session[]
}

export function SessionList({ sessions }: SessionListProps) {
  if (sessions.length === 0) {
    return <EmptyState />
  }

  // Group sessions by date
  const grouped = sessions.reduce<Record<string, Session[]>>((acc, session) => {
    if (!acc[session.date]) acc[session.date] = []
    acc[session.date].push(session)
    return acc
  }, {})

  return (
    <div className="flex-1 overflow-y-auto">
      {Object.entries(grouped).map(([date, dateSessions]) => (
        <div key={date} className="mb-6">
          <h3 className="px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {date}
          </h3>
          <div className="space-y-0.5">
            {dateSessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SessionRow({ session }: { session: Session }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{session.title}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {session.duration} · {session.timestamp}
        </p>
      </div>

      {/* Three-dot menu */}
      <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all">
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01"
          />
        </svg>
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-6xl">🎙️</div>
        <h2 className="text-xl font-semibold text-gray-900">No sessions yet</h2>
        <p className="text-gray-500 text-sm leading-relaxed">
          Click <span className="font-medium text-cyan-600">"Start Raven"</span> to begin your
          first session. Raven will transcribe your meeting and provide AI-powered suggestions in
          real-time.
        </p>
        <div className="pt-2">
          <div className="inline-flex items-center gap-4 text-xs text-gray-400">
            <span>
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">⌘⇧R</kbd>{' '}
              Toggle Recording
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">⌘⇧H</kbd>{' '}
              Toggle Overlay
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
