import { useState, useEffect } from 'react'
import { useAppMode } from '../../../hooks/useAppMode'

export function AboutTab() {
  const { isPro } = useAppMode()
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
            <h2 className="text-lg font-bold text-white">{isPro ? 'Raven Pro' : 'Raven'}</h2>
            <p className="text-sm text-white/50 mt-0.5">v{appVersion}</p>
          </div>
        </div>
        <p className="relative mt-4 text-sm text-white/60 leading-relaxed">
          Real-time transcription and AI suggestions for your meetings while being invisible to screen sharing.
        </p>
        {!isPro && (
          <div className="relative mt-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/20">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              MIT License
            </span>
          </div>
        )}
      </div>

      {/* Links - compact grid */}
      <div className="grid grid-cols-3 gap-2">
        {isPro ? (
          <>
            <button
              onClick={() => handleOpenLink('https://useraven.ai')}
              className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-center"
            >
              <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
              </div>
              <div className="text-xs font-medium text-gray-700">Website</div>
            </button>

            <button
              onClick={() => handleOpenLink('mailto:support@useraven.ai')}
              className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-center"
            >
              <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div className="text-xs font-medium text-gray-700">Support</div>
            </button>

            <button
              onClick={() => handleOpenLink('mailto:feedback@useraven.ai')}
              className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-center"
            >
              <div className="w-9 h-9 bg-green-500 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              </div>
              <div className="text-xs font-medium text-gray-700">Feedback</div>
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          {isPro ? (
            <>
              {'Raven Pro by '}
              <button
                onClick={() => handleOpenLink('https://laxcorpresearch.com')}
                className="text-blue-500 hover:text-blue-700 font-medium transition-colors"
              >
                Laxcorp Research
              </button>
            </>
          ) : (
            <>
              {'Made by '}
              <button
                onClick={() => handleOpenLink('https://laxcorpresearch.com')}
                className="text-blue-500 hover:text-blue-700 font-medium transition-colors"
              >
                Laxcorp Research
              </button>
              {' · Open source under MIT license'}
            </>
          )}
        </p>
      </div>
    </div>
  )
}
