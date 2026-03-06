import { useState, useEffect, useRef, useCallback } from 'react';

interface TranscriptEntry {
  id: string;
  source: 'mic' | 'system';
  text: string;
  speaker: 'you' | 'them';
  timestamp: number;
  isFinal: boolean;
}

export function TranscriptTab() {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [interims, setInterims] = useState<{ mic: string; system: string }>({ mic: '', system: '' });
  const [isRecording, setIsRecording] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null)
  const [connection, setConnection] = useState<{
    phase: 'idle' | 'connecting' | 'retrying' | 'connected' | 'failed'
    provider?: 'recall' | 'assemblyai' | 'deepgram' | null
    retryCount?: number
    maxRetries?: number
    nextRetryAt?: number | null
    message?: string
    error?: string
  }>({ phase: 'idle' })
  const [now, setNow] = useState(() => Date.now())
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    window.raven.storeGet('displayName').then((name) => {
      setDisplayName((name as string) || '');
    }).catch(() => {});

    window.raven.getTranscriptEntries?.().then((e: TranscriptEntry[]) => {
      if (e) setEntries(e);
    }).catch(() => {});

    window.raven.audioGetState().then((state: { isRecording: boolean }) => {
      setIsRecording(state.isRecording);
    }).catch(() => {});

    const unsubTranscript = window.raven.onTranscriptUpdate((data) => {
      const incoming = (data as unknown as { entry?: TranscriptEntry }).entry
      if (incoming && data.isFinal) {
        setEntries(prev => {
          const existingIdx = prev.findIndex(e => e.id === incoming.id)
          if (existingIdx >= 0) {
            const updated = [...prev]
            updated[existingIdx] = incoming
            return updated
          }
          return [...prev, incoming]
        })
      }
      if (data.interims) {
        setInterims(data.interims);
      }
    });

    const unsubRecording = window.raven.onRecordingStateChanged((state) => {
      setIsRecording(state.isRecording);
      if (!state.isRecording) {
        setRecordingStartedAt(null)
        setConnection({ phase: 'idle' })
        setInterims({ mic: '', system: '' });
        setEntries([]);
      } else {
        setRecordingStartedAt(Date.now())
        // Default to "connecting" so the UI can show something even if
        // the main process hasn't emitted connection state yet.
        setConnection((prev) => (prev.phase === 'idle' ? { phase: 'connecting' } : prev))
      }
    });

    const unsubConn = window.raven.onTranscriptionConnectionState?.((data) => {
      setConnection(data)
    }) ?? (() => {})

    return () => {
      unsubTranscript();
      unsubRecording();
      unsubConn()
    };
  }, []);

  useEffect(() => {
    if (!isRecording) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [isRecording])

  useEffect(() => {
    requestAnimationFrame(scrollToBottom);
  }, [entries, interims, scrollToBottom]);

  const connected = connection.phase === 'connected'
  const failed = connection.phase === 'failed'
  const showConnectingBanner =
    isRecording
    && !connected
    && !failed
    && Boolean(recordingStartedAt)
    && (now - (recordingStartedAt ?? now)) >= 5000

  const retryCount = connection.retryCount ?? 0
  const maxRetries = connection.maxRetries ?? 3
  const nextRetryInSec = connection.nextRetryAt ? Math.max(0, Math.ceil((connection.nextRetryAt - now) / 1000)) : null

  const providerLabel =
    connection.provider === 'assemblyai'
      ? 'AssemblyAI'
      : connection.provider === 'deepgram'
        ? 'Deepgram'
        : connection.provider === 'recall'
          ? 'Recall'
          : null

  if (entries.length === 0 && !interims.mic && !interims.system) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
        <svg width="32" height="32" viewBox="0 0 24 24" className="text-white/25 mb-3">
          <path
            fill="currentColor"
            d="M12 3a4 4 0 0 0-4 4v4.5a4 4 0 1 0 8 0V7a4 4 0 0 0-4-4Z"
          />
          <path
            fill="currentColor"
            d="M6.25 11.5a.75.75 0 0 1 .75.75 5 5 0 0 0 10 0 .75.75 0 0 1 1.5 0 6.5 6.5 0 0 1-5.75 6.46V21a.75.75 0 0 1-1.5 0v-2.29A6.5 6.5 0 0 1 5.5 12.25a.75.75 0 0 1 .75-.75Z"
          />
        </svg>
        {isRecording ? (
          <>
            {failed ? (
              <>
                <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-400/20">
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
                  </span>
                  <span className="text-red-200/90 text-xs font-medium">Transcription failed</span>
                </div>
                <p className="text-white/45 text-xs max-w-[280px]">
                  {connection.error || 'We couldn’t connect to transcription. Recording stopped.'}
                </p>
              </>
            ) : showConnectingBanner ? (
              <>
                <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/35 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white/50" />
                  </span>
                  <span className="text-white/70 text-xs font-medium">Connecting to transcription...</span>
                </div>
                <p className="text-white/40 text-xs max-w-[280px]">
                  {connection.phase === 'retrying' && nextRetryInSec !== null
                    ? `Retry ${Math.min(retryCount + 1, maxRetries)}/${maxRetries} in ${nextRetryInSec}s.`
                    : providerLabel
                      ? `Trying ${providerLabel}...`
                      : 'Trying to connect...'}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  <span className="text-white/70 text-xs font-medium">Listening...</span>
                </div>
                <p className="text-white/40 text-xs max-w-[240px]">
                  Speech will appear here as it&apos;s detected.
                </p>
              </>
            )}
          </>
        ) : (
          <>
            <h3 className="text-white/60 text-sm font-medium mb-1">Live Transcript</h3>
            <p className="text-white/35 text-xs max-w-[240px]">
              Start a session to see the conversation transcribed in real-time.
            </p>
          </>
        )}
      </div>
    );
  }

  const userName = displayName || 'You';

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
      {isRecording && (
        <div className="flex items-center gap-2 mb-2 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 w-fit">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="text-white/70 text-[11px] font-medium tracking-wide uppercase">Live</span>
        </div>
      )}

      {showConnectingBanner && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
          <div className="relative flex h-2 w-2 mt-[1px]">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/35 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white/50" />
          </div>
          <div className="flex flex-col">
            <div className="text-white/70 text-xs font-medium">Connecting to transcription...</div>
            <div className="text-white/40 text-[11px]">
              {connection.phase === 'retrying' && nextRetryInSec !== null
                ? `Retry ${Math.min(retryCount + 1, maxRetries)}/${maxRetries} in ${nextRetryInSec}s.`
                : providerLabel
                  ? `Trying ${providerLabel}...`
                  : 'Trying to connect...'}
            </div>
          </div>
        </div>
      )}

      {failed && (
        <div className="mb-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-400/20">
          <div className="text-red-200/90 text-xs font-medium mb-0.5">Transcription failed</div>
          <div className="text-white/45 text-[11px]">
            {connection.error || 'We couldn’t connect to transcription. Recording stopped.'}
          </div>
        </div>
      )}

      {entries.map((entry) => (
        <div
          key={entry.id}
          className={`flex ${entry.speaker === 'you' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-3 py-1.5 ${
              entry.speaker === 'you'
                ? 'bg-gradient-to-b from-blue-500 to-blue-700 text-white rounded-br-md'
                : 'bg-white/10 text-white/90 rounded-bl-md'
            }`}
          >
            <div className={`text-[10px] leading-tight ${entry.speaker === 'you' ? 'text-blue-200/60' : 'text-white/40'}`}>
              {entry.speaker === 'you' ? userName : 'Them'}
            </div>
            <div className="text-sm leading-snug">{entry.text}</div>
          </div>
        </div>
      ))}

      {interims.system && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-bl-md px-3 py-1.5 bg-white/5 text-white/60 border border-white/10">
            <div className="text-[10px] leading-tight text-white/30">Them</div>
            <div className="text-sm leading-snug italic">{interims.system}</div>
          </div>
        </div>
      )}

      {interims.mic && (
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-br-md px-3 py-1.5 bg-gradient-to-b from-blue-500/30 to-blue-700/30 text-white/70 border border-blue-500/20">
            <div className="text-[10px] leading-tight text-blue-200/40">{userName}</div>
            <div className="text-sm leading-snug italic">{interims.mic}</div>
          </div>
        </div>
      )}
    </div>
  );
}
