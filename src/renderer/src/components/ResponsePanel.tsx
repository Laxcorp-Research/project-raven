import { useAppStore } from '../stores/appStore'

export function ResponsePanel() {
  const { aiResponse, isAiLoading } = useAppStore()

  if (isAiLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-2" />
          <p className="text-gray-500 text-xs">Getting suggestion...</p>
        </div>
      </div>
    )
  }

  if (!aiResponse) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-gray-600 text-xs">
            Press{' '}
            <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-[10px] text-gray-400 font-mono">⌘ Enter</kbd>{' '}
            to get an AI suggestion
          </p>
          <p className="text-gray-700 text-[10px] mt-1">or type a question below</p>
        </div>
      </div>
    )
  }

  return (
    <div data-scroll-container className="flex-1 overflow-y-auto p-3">
      <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{aiResponse}</div>
    </div>
  )
}
