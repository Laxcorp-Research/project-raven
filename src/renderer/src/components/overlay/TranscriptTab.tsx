import { useState, useEffect, useRef } from 'react';

export function TranscriptTab() {
  const [transcript, setTranscript] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch current transcript on mount
    window.raven.getTranscript().then((text: string) => {
      if (text) setTranscript(text);
    });

    // Get current recording state
    window.raven.audioGetState().then((state: { isRecording: boolean }) => {
      setIsRecording(state.isRecording);
    });

    // Listen for transcript updates
    const unsubTranscript = window.raven.onTranscriptUpdate((data) => {
      setTranscript(data.fullTranscript);
    });

    const unsubStatus = window.raven.onTranscriptionStatus((data) => {
      setIsConnected(data.status === 'connected');
    });

    const unsubRecording = window.raven.onRecordingStateChanged((state) => {
      setIsRecording(state.isRecording);
    });

    return () => {
      unsubTranscript();
      unsubStatus();
      unsubRecording();
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  if (!transcript) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
        <div className="text-4xl mb-3">🎙️</div>
        <h3 className="text-white/90 font-medium mb-2">Live Transcript</h3>
        <p className="text-white/50 text-sm max-w-[280px]">
          Start recording to see the live transcript of your conversation here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {isRecording && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          <span className="text-green-400/70 text-xs">Live transcription</span>
        </div>
      )}
      <div className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap">
        {transcript}
      </div>
      <div ref={transcriptEndRef} />
    </div>
  );
}
