import { useState } from 'react';
import { ChatTab } from './ChatTab';
import { TranscriptTab } from './TranscriptTab';

type Tab = 'chat' | 'transcript';

export function ResponsePanel() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex border-b border-white/10 px-4">
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === 'chat'
              ? 'text-cyan-400'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          Chat
          {activeTab === 'chat' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('transcript')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === 'transcript'
              ? 'text-cyan-400'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          Transcript
          {activeTab === 'transcript' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
          )}
        </button>
      </div>

      {activeTab === 'chat' ? <ChatTab /> : <TranscriptTab />}
    </div>
  );
}
