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

      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Resources</h3>
        <div className="space-y-0.5">
          {[
            { label: 'Blog', url: 'https://useraven.ai/blog', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" /> },
            { label: 'Changelog', url: 'https://useraven.ai/changelog', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /> },
            { label: 'Privacy Policy', url: 'https://useraven.ai/legal/privacy-policy', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" /> },
            { label: 'Terms of Service', url: 'https://useraven.ai/legal/terms-of-service', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /> },
            { label: 'Report a Bug', url: 'https://github.com/Laxcorp-Research/project-raven/issues/new', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.867.966 1.867 2.013 0 .89-.616 1.688-1.489 1.866a15.18 15.18 0 01-7.522 0C7.366 16.688 6.75 15.89 6.75 15c0-1.047.83-1.867 1.867-2.013A15.247 15.247 0 0112 12.75zm0 0c-2.209 0-4.267.427-6.108 1.177M12 12.75c2.209 0 4.267.427 6.108 1.177M12 12.75V9m0 0a3 3 0 10-6 0v1.5M12 9a3 3 0 016 0v1.5" /> },
          ].map((link) => (
            <button
              key={link.label}
              onClick={() => handleOpenLink(link.url)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left group"
            >
              <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {link.icon}
              </svg>
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">{link.label}</span>
              <svg className="w-3 h-3 text-gray-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          {'Made by '}
          <button
            onClick={() => handleOpenLink('https://laxcorpresearch.com')}
            className="text-blue-500 hover:text-blue-700 font-medium transition-colors"
          >
            Laxcorp Research
          </button>
          {' · Open source under MIT license'}
        </p>
      </div>
    </div>
  )
}
