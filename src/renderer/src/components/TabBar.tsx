import { useAppStore } from '../stores/appStore'

export function TabBar() {
  const { activeTab, setActiveTab } = useAppStore()

  return (
    <div className="flex border-b border-white/5">
      <button
        onClick={() => setActiveTab('response')}
        className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
          activeTab === 'response'
            ? 'text-white border-b-2 border-blue-500'
            : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        AI Response
      </button>
      <button
        onClick={() => setActiveTab('transcript')}
        className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
          activeTab === 'transcript'
            ? 'text-white border-b-2 border-blue-500'
            : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        Transcript
      </button>
    </div>
  )
}
