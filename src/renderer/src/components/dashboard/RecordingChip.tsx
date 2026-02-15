/**
 * Recording Chip - Floating indicator at bottom of dashboard
 * Shows when a session is actively recording
 */

interface RecordingChipProps {
  sessionTitle: string
  duration: number // in seconds
  onStop: () => void
}

export function RecordingChip({ sessionTitle, duration, onStop }: RecordingChipProps) {
  const mins = Math.floor(duration / 60)
  const secs = duration % 60
  const formattedDuration = `${mins}:${secs.toString().padStart(2, '0')}`

  return (
    <div className="fixed bottom-6 right-6 flex items-center gap-3 px-4 py-2.5 bg-white rounded-full shadow-lg border border-gray-200 z-50">
      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
        <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="4" />
        </svg>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900">
          {sessionTitle || 'Untitled session'}
        </span>
        <span className="text-sm text-gray-500">·</span>
        <span className="text-sm text-gray-500">Recording</span>
        <span className="text-sm text-gray-500">·</span>
        <span className="text-sm text-gray-500 tabular-nums">{formattedDuration}</span>
      </div>

      <div className="relative group">
        <button
          onClick={onStop}
          className="w-6 h-6 bg-red-500 rounded flex items-center justify-center hover:bg-red-600 transition-colors"
        >
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          Stop recording
        </div>
      </div>
    </div>
  )
}
