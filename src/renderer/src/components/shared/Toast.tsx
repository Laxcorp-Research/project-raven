import { useEffect } from 'react'

interface ToastProps {
  message: string
  type: 'loading' | 'success' | 'error'
  onComplete?: () => void
}

export function Toast({ message, type, onComplete }: ToastProps) {
  useEffect(() => {
    if (type === 'success') {
      const timer = setTimeout(() => { onComplete?.() }, 2000)
      return () => clearTimeout(timer)
    }
    if (type === 'error') {
      const timer = setTimeout(() => { onComplete?.() }, 5000)
      return () => clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  const isWindows = navigator.platform.includes('Win')

  return (
    <div className={`fixed right-4 flex items-center gap-3 px-5 py-3.5 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100 z-50 animate-slide-in-right ${isWindows ? 'top-12' : 'top-4'}`}>
      {type === 'loading' && (
        <svg className="w-5 h-5 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {type === 'success' && (
        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 12l5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      {type === 'error' && (
        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      <span className="text-sm font-medium text-gray-900">{message}</span>
      {type === 'error' && (
        <button onClick={() => onComplete?.()} className="ml-1 p-0.5 text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
