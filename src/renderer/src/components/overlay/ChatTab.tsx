import { useState, useEffect, useRef } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: string;
  timestamp: number;
}

export function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [_streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.raven.claudeGetHistory().then((history: ChatMessage[]) => {
      setMessages(history);
    }).catch(() => {});

    const unsub = window.raven.onClaudeResponse((data) => {
      if (data.type === 'start' && data.userMessage) {
        setMessages((prev) => [...prev, data.userMessage!]);
        setIsLoading(true);
        setError('');
        setStreamingMessage('');
        setStreamingMessageId(data.userMessage!.id + '-response');
      } else if (data.type === 'delta') {
        setStreamingMessage(data.fullText || '');
        setIsLoading(false);
      } else if (data.type === 'done' && data.assistantMessage) {
        setMessages((prev) => [...prev, data.assistantMessage!]);
        setStreamingMessage('');
        setStreamingMessageId(null);
        setIsLoading(false);
      } else if (data.type === 'error') {
        setError(data.error || 'Something went wrong');
        setIsLoading(false);
        setStreamingMessage('');
        setStreamingMessageId(null);
      } else if (data.type === 'cleared') {
        setMessages([]);
        setStreamingMessage('');
        setError('');
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  if (messages.length === 0 && !isLoading && !streamingMessage) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
        <div className="text-4xl mb-3">🐦‍⬛</div>
        <h3 className="text-white/90 font-medium mb-2">Chat with Raven</h3>
        <p className="text-white/50 text-sm max-w-[280px]">
          Use the quick actions below or type a question. Raven will help based on your live conversation.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex animate-message-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
              msg.role === 'user'
                ? 'bg-cyan-600 text-white rounded-br-md'
                : 'bg-white/10 text-white/90 rounded-bl-md'
            }`}
          >
            {msg.role === 'assistant' && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs font-medium text-cyan-400">Raven</span>
              </div>
            )}
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {msg.content}
            </div>
            <div className={`text-xs mt-1.5 ${msg.role === 'user' ? 'text-white/60' : 'text-white/40'}`}>
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      ))}

      {(isLoading || streamingMessage) && (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-white/10 text-white/90">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-xs font-medium text-cyan-400">Raven</span>
            </div>
            {isLoading && !streamingMessage ? (
              <div className="flex items-center gap-2 text-white/50 text-sm py-1">
                <span className="animate-pulse-dot">●</span>
                <span className="animate-pulse-dot" style={{ animationDelay: '0.15s' }}>●</span>
                <span className="animate-pulse-dot" style={{ animationDelay: '0.3s' }}>●</span>
              </div>
            ) : (
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {streamingMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex justify-center">
          <div className="bg-red-500/20 text-red-400 text-sm px-4 py-2 rounded-lg">
            {error}
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
