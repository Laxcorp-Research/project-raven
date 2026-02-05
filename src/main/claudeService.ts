import Anthropic from '@anthropic-ai/sdk';
import { BrowserWindow, ipcMain } from 'electron';

const SYSTEM_PROMPT = `You are an AI assistant helping during a live meeting, interview, or call.
Your job is to provide helpful, concise suggestions based on what's being discussed.

Guidelines:
- Keep responses concise (2-4 sentences unless more detail is needed)
- Be direct and actionable
- If a question is asked in the conversation, help formulate a good answer
- For job interviews: help with behavioral answers, technical explanations
- For sales calls: suggest talking points, handle objections
- For meetings: summarize key points, suggest action items
- Focus on what would be immediately useful right now
- Format with markdown when helpful (bold key phrases, bullet points for lists)`;

const PROMPT_TEMPLATES: Record<string, string> = {
  assist: 'Based on this conversation, provide a helpful suggestion or insight that would be useful right now.',
  'what-should-i-say': 'Based on this conversation, suggest exactly what the user should say next. Frame it as: "Say this next:" followed by the suggested response in quotes. Make it natural and conversational.',
  'follow-up': 'Based on this conversation, suggest 2-3 smart follow-up questions the user could ask. Frame each as a direct question they can use verbatim.',
  recap: 'Provide a concise recap of this conversation so far. Include: key points discussed, any decisions made, and any action items mentioned. Use bullet points for clarity.',
};

export class ClaudeService {
  private client: Anthropic | null = null;
  private overlayWindow: BrowserWindow | null = null;
  private isProcessing = false;

  constructor(overlayWindow: BrowserWindow | null) {
    this.overlayWindow = overlayWindow;
    this.registerIpcHandlers();
  }

  setWindow(overlay: BrowserWindow | null): void {
    this.overlayWindow = overlay;
  }

  private registerIpcHandlers(): void {
    ipcMain.handle('claude:get-response', async (_event, params: {
      transcript: string;
      action: string;
      customPrompt?: string;
    }) => {
      try {
        const Store = (await import('electron-store')).default;
        const store = new Store();
        const apiKey = store.get('anthropicApiKey', '') as string;

        if (!apiKey) {
          this.broadcast({ type: 'error', error: 'No Anthropic API key configured. Add it in Settings.' });
          return;
        }

        if (this.isProcessing) {
          this.broadcast({ type: 'error', error: 'Already processing a request...' });
          return;
        }

        this.client = new Anthropic({ apiKey });
        this.isProcessing = true;
        this.broadcast({ type: 'start', action: params.action });

        let userMessage = '';
        if (params.transcript.trim()) {
          userMessage += `Here's the conversation transcript so far:\n\n${params.transcript}\n\n`;
        } else {
          userMessage += '(No transcript yet — the conversation just started)\n\n';
        }

        if (params.action === 'custom' && params.customPrompt) {
          userMessage += `User's question: ${params.customPrompt}`;
        } else {
          userMessage += PROMPT_TEMPLATES[params.action] || PROMPT_TEMPLATES.assist;
        }

        let fullResponse = '';

        const stream = this.client.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        });

        stream.on('text', (text) => {
          fullResponse += text;
          this.broadcast({ type: 'delta', text, fullText: fullResponse });
        });

        await stream.finalMessage();
        this.broadcast({ type: 'done', fullText: fullResponse });
        this.isProcessing = false;

      } catch (error: any) {
        this.isProcessing = false;
        let errorMsg = 'Failed to get AI response.';
        if (error?.status === 401) errorMsg = 'Invalid Anthropic API key. Check settings.';
        else if (error?.status === 429) errorMsg = 'Rate limited. Wait a moment and try again.';
        else if (error?.status === 529) errorMsg = 'Claude is overloaded. Try again shortly.';
        else if (error?.message) errorMsg = `AI error: ${error.message}`;
        console.error('[ClaudeService] Error:', error);
        this.broadcast({ type: 'error', error: errorMsg });
      }
    });
  }

  private broadcast(data: {
    type: 'start' | 'delta' | 'done' | 'error';
    action?: string;
    text?: string;
    fullText?: string;
    error?: string;
  }): void {
    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('claude:response', data);
      }
    } catch (err) {
      console.error('[ClaudeService] Broadcast error:', err);
    }
  }
}
