import { useState, useEffect } from 'react'

export function AboutTab() {
  const [appVersion, setAppVersion] = useState('...')

  useEffect(() => {
    window.raven.getAppVersion().then((v) => setAppVersion(v)).catch(() => {})
  }, [])

  const handleOpenLink = (url: string) => {
    window.raven.openExternal?.(url)
  }

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.15),transparent_60%)]" />
        <div className="relative flex items-center gap-4">
          <img
            src={new URL('../../../../../../logo/raven.svg', import.meta.url).href}
            alt="Raven"
            className="w-14 h-14 drop-shadow-lg"
            draggable={false}
          />
          <div>
            <h2 className="text-lg font-bold text-white">Raven</h2>
            <p className="text-sm text-white/50 mt-0.5">v{appVersion}</p>
          </div>
        </div>
        <p className="relative mt-4 text-sm text-white/60 leading-relaxed">
          Real-time transcription and AI suggestions for your meetings while being invisible to screen sharing.
        </p>
        <div className="relative mt-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/20">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
            MIT License
          </span>
        </div>
      </div>

      {/* Links - compact grid */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => handleOpenLink('https://github.com/Laxcorp-Research/project-raven')}
          className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-center"
        >
          <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
            <svg className="w-4.5 h-4.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </div>
          <div className="text-xs font-medium text-gray-700">GitHub</div>
        </button>

        <button
          onClick={() => handleOpenLink('https://github.com/Laxcorp-Research/project-raven/issues')}
          className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-center"
        >
          <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12h.01M12 16h.01M12 8h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-xs font-medium text-gray-700">Issues</div>
        </button>

        <button
          onClick={() => handleOpenLink('https://github.com/Laxcorp-Research/project-raven/discussions')}
          className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-center"
        >
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div className="text-xs font-medium text-gray-700">Discussions</div>
        </button>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          Made by{' '}
          <button
            onClick={() => handleOpenLink('https://laxcorpresearch.com')}
            className="text-blue-500 hover:text-blue-700 font-medium transition-colors"
          >
            Laxcorp Research
          </button>
          {' '}· Open source under MIT license
        </p>
      </div>
    </div>
  )
}
