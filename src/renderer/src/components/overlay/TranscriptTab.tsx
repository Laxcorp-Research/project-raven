import { useState, useEffect, useRef } from 'react';

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
  const transcriptEndRef = useRef<HTMLDivElement>(null);

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
          const last = prev[prev.length - 1]
          if (last && last.speaker === incoming.speaker && (incoming.timestamp - last.timestamp) < 5000) {
            const updated = [...prev]
            updated[updated.length - 1] = { ...last, text: `${last.text} ${incoming.text}`, timestamp: incoming.timestamp }
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
        setInterims({ mic: '', system: '' });
        setEntries([]);
      }
    });

    return () => {
      unsubTranscript();
      unsubRecording();
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, interims]);

  if (entries.length === 0 && !interims.mic && !interims.system) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
        <div className="text-4xl mb-3">🎙️</div>
        <h3 className="text-white/90 font-medium mb-2">Live Transcript</h3>
        <p className="text-white/50 text-sm max-w-[280px]">
          Start recording to see the live transcript. Your voice will appear on the right, others on the left.
        </p>
      </div>
    );
  }

  const userName = displayName || 'You';

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {isRecording && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          <span className="text-green-400/70 text-xs">Live transcription</span>
        </div>
      )}

      {entries.map((entry) => (
        <div
          key={entry.id}
          className={`flex animate-message-in ${entry.speaker === 'you' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-3 py-2 ${
              entry.speaker === 'you'
                ? 'bg-cyan-600/80 text-white rounded-br-md'
                : 'bg-white/10 text-white/90 rounded-bl-md'
            }`}
          >
            <div className="text-xs text-white/50 mb-0.5">
              {entry.speaker === 'you' ? userName : 'Them'}
            </div>
            <div className="text-sm leading-relaxed">{entry.text}</div>
          </div>
        </div>
      ))}

      {interims.system && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-bl-md px-3 py-2 bg-white/5 text-white/60 border border-white/10">
            <div className="text-xs text-white/40 mb-0.5">Them</div>
            <div className="text-sm leading-relaxed italic">{interims.system}</div>
          </div>
        </div>
      )}

      {interims.mic && (
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-br-md px-3 py-2 bg-cyan-600/40 text-white/70 border border-cyan-500/30">
            <div className="text-xs text-white/40 mb-0.5">{userName}</div>
            <div className="text-sm leading-relaxed italic">{interims.mic}</div>
          </div>
        </div>
      )}

      <div ref={transcriptEndRef} />
    </div>
  );
}
