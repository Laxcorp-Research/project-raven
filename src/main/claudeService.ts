import Anthropic from '@anthropic-ai/sdk';
import { BrowserWindow, ipcMain, desktopCapturer, screen } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { sessionManager } from './services/sessionManager';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: string;
  timestamp: number;
}

interface ConversationState {
  messages: ChatMessage[];
  lastProcessedTranscriptLength: number;
}

interface ScreenshotAttachment {
  mediaType: 'image/png';
  data: string;
  previewData: string;
}

const buildSystemPrompt = (modePrompt?: string): string => {
  let prompt = `You are Raven, an AI assistant helping during a live meeting, interview, or call.

CRITICAL CONTEXT RULES:
1. You have access to the LIVE TRANSCRIPT of the conversation happening right now.
2. You also have your PREVIOUS RESPONSES in this session — DO NOT repeat yourself.
3. Focus on what's NEW or UNANSWERED since your last response.
4. If the user asks you something and you've already answered it, say so briefly and ask if they want more detail.
5. If there's a recent question in the transcript that hasn't been addressed, prioritize answering that.
6. Be concise (2-4 sentences) unless the user explicitly asks for more detail.
7. Be direct and actionable — the user is in a live conversation and needs quick help.

RESPONSE GUIDELINES:
- For interviews: Help with behavioral answers, technical explanations
- For sales calls: Suggest talking points, handle objections
- For meetings: Summarize key points, suggest action items
- When suggesting what to say, use quotes: "Say this: ..."
- Use markdown formatting when helpful (bold key phrases, bullet points for lists)`;

  if (modePrompt) {
    prompt += `\n\nADDITIONAL CONTEXT FROM USER'S ACTIVE MODE:\n${modePrompt}`;
  }

  return prompt;
};

const ACTION_PROMPTS: Record<string, string> = {
  assist: 'Based on what\'s happening RIGHT NOW in this conversation, provide a helpful suggestion. Focus on anything new since your last response.',
  'what-should-i-say': 'Based on the current conversation state, suggest exactly what I should say next. Format as: "Say this: [your suggestion]". Make it natural and directly usable.',
  'follow-up': 'Suggest 2-3 smart follow-up questions I could ask RIGHT NOW based on what\'s been discussed. Format as direct questions I can use verbatim.',
  recap: 'Provide a concise recap of this conversation so far. Include: key points discussed, any decisions made, action items, and anything that seems unresolved.',
};

/**
 * Generate a session title from transcript using Claude
 */
export async function generateSessionTitle(
  anthropicApiKey: string,
  transcriptText: string
): Promise<string> {
  if (!anthropicApiKey) {
    throw new Error('Anthropic API key not configured');
  }

  try {
    const response = await (new Anthropic({ apiKey: anthropicApiKey })).messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 30,
      messages: [{
        role: 'user',
        content: `<task>Generate a 3-7 word title for the following meeting transcript. Output ONLY the title text, nothing else.</task>

<transcript>
${transcriptText.slice(0, 1500)}
</transcript>

<examples>
Good titles: "Q4 Sales Review", "Marketing Budget Discussion", "Team Standup Meeting", "Interview with John"
Bad titles: "I'd be happy to help...", "Here's a title:", "The conversation is about..."
</examples>

Title:`
      }],
    });

    let title = (response.content[0] as any).text?.trim() || 'Untitled Session';

    title = title
      .replace(/^["']|["']$/g, '')
      .replace(/^(Title:|Here's|The title is|A good title would be)/i, '')
      .replace(/[.!?]$/, '')
      .trim();

    if (
      title.toLowerCase().startsWith("i'd")
      || title.toLowerCase().startsWith('i need')
      || title.toLowerCase().startsWith("i don't")
      || title.length > 60
    ) {
      throw new Error('Invalid title format');
    }

    return title.length > 50 ? title.slice(0, 47) + '...' : title;
  } catch (error) {
    console.error('[ClaudeService] Title generation failed:', error);
    throw error;
  }
}

export class ClaudeService {
  private client: Anthropic | null = null;
  private overlayWindow: BrowserWindow | null = null;
  private isProcessing = false;
  private conversation: ConversationState = {
    messages: [],
    lastProcessedTranscriptLength: 0,
  };

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
      modePrompt?: string;
      includeScreenshot?: boolean;
    }) => {
      try {
        const Store = (await import('electron-store')).default;
        const store = new Store();
        const apiKey = store.get('anthropicApiKey', '') as string;

        if (!apiKey) {
          this.broadcastError('No Anthropic API key configured. Add it in Settings.');
          return;
        }

        if (this.isProcessing) {
          console.log('[ClaudeService] Ignoring request while processing is active');
          return;
        }

        this.client = new Anthropic({ apiKey });
        this.isProcessing = true;

        const screenshotAttachment = params.includeScreenshot
          ? await this.captureScreenshotExcludingRaven()
          : null;

        const userMessageContent = this.buildUserMessage(params);
        const assistantMessageId = this.generateId();
        const userMessage: ChatMessage = {
          id: this.generateId(),
          role: 'user',
          content: params.action === 'custom' && params.customPrompt
            ? params.customPrompt
            : this.getActionLabel(params.action),
          action: params.action,
          timestamp: Date.now(),
        };

        this.conversation.messages.push(userMessage);
        this.conversation.lastProcessedTranscriptLength = params.transcript.length;
        sessionManager.addSessionMessage('user', userMessage.content);

        this.broadcast({
          type: 'start',
          messageId: assistantMessageId,
          userMessage,
          requestMeta: {
            includeScreenshot: Boolean(screenshotAttachment),
            screenshotPreviewData: screenshotAttachment
              ? `data:image/png;base64,${screenshotAttachment.previewData}`
              : undefined,
          },
        });

        const claudeMessages = this.buildClaudeMessages(
          userMessageContent,
          screenshotAttachment
        );

        let fullResponse = '';

        const stream = this.client.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: buildSystemPrompt(params.modePrompt),
          messages: claudeMessages,
        });

        stream.on('text', (text) => {
          fullResponse += text;
          this.broadcast({
            type: 'delta',
            messageId: assistantMessageId,
            text,
            fullText: fullResponse,
          });
        });

        await stream.finalMessage();

        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: fullResponse,
          timestamp: Date.now(),
        };
        this.conversation.messages.push(assistantMessage);
        sessionManager.addSessionMessage('assistant', assistantMessage.content);

        const userMessageText = params.action === 'custom' && params.customPrompt
          ? params.customPrompt
          : this.getActionLabel(params.action);

        sessionManager.addAIResponse({
          id: uuidv4(),
          action: params.action,
          userMessage: userMessageText,
          response: fullResponse,
          timestamp: Date.now(),
        });

        this.broadcast({
          type: 'done',
          messageId: assistantMessageId,
          fullText: fullResponse,
          assistantMessage,
        });

        this.isProcessing = false;

      } catch (error: any) {
        this.isProcessing = false;
        let errorMsg = 'Failed to get AI response.';
        if (error?.status === 401) errorMsg = 'Invalid Anthropic API key. Check settings.';
        else if (error?.status === 429) errorMsg = 'Rate limited. Wait a moment and try again.';
        else if (error?.status === 529) errorMsg = 'Claude is overloaded. Try again shortly.';
        else if (error?.message) errorMsg = `AI error: ${error.message}`;
        console.error('[ClaudeService] Error:', error);
        this.broadcastError(errorMsg);
      }
    });

    ipcMain.handle('claude:get-history', async () => {
      return this.conversation.messages;
    });

    ipcMain.handle('claude:clear-history', async () => {
      this.conversation = {
        messages: [],
        lastProcessedTranscriptLength: 0,
      };
      this.broadcast({ type: 'cleared' });
      return { success: true };
    });
  }

  private buildUserMessage(params: {
    transcript: string;
    action: string;
    customPrompt?: string;
    includeScreenshot?: boolean;
  }): string {
    let message = '';

    if (params.transcript.trim()) {
      const newTranscript = params.transcript.slice(this.conversation.lastProcessedTranscriptLength);

      if (this.conversation.messages.length === 0) {
        message += `CURRENT TRANSCRIPT:\n${params.transcript}\n\n`;
      } else if (newTranscript.trim()) {
        message += `NEW IN TRANSCRIPT (since my last message):\n${newTranscript.trim()}\n\n`;
        message += `FULL TRANSCRIPT FOR CONTEXT:\n${params.transcript}\n\n`;
      } else {
        message += `TRANSCRIPT (no new content since last time):\n${params.transcript}\n\n`;
      }
    } else {
      message += '(No transcript yet — conversation just started)\n\n';
    }

    if (params.action === 'custom' && params.customPrompt) {
      message += `MY QUESTION: ${params.customPrompt}`;
    } else {
      message += `REQUEST: ${ACTION_PROMPTS[params.action] || ACTION_PROMPTS.assist}`;
    }

    if (params.includeScreenshot) {
      message += '\n\nVISUAL CONTEXT: Analyze the attached screenshot for on-screen context.';
    }

    return message;
  }

  private buildClaudeMessages(
    currentUserMessage: string,
    screenshot: ScreenshotAttachment | null
  ): Array<{
    role: 'user' | 'assistant';
    content:
      | string
      | Array<
          | { type: 'text'; text: string }
          | {
              type: 'image';
              source: { type: 'base64'; media_type: string; data: string };
            }
        >;
  }> {
    const messages: Array<{
      role: 'user' | 'assistant';
      content:
        | string
        | Array<
            | { type: 'text'; text: string }
            | {
                type: 'image';
                source: { type: 'base64'; media_type: string; data: string };
              }
          >;
    }> = [];

    const recentHistory = this.conversation.messages.slice(-20);

    for (let i = 0; i < recentHistory.length - 1; i++) {
      const msg = recentHistory[i];
      messages.push({
        role: msg.role,
        content: msg.role === 'user'
          ? `[Previous request: ${msg.content}]`
          : msg.content,
      });
    }

    if (screenshot) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: currentUserMessage },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: screenshot.mediaType,
              data: screenshot.data,
            },
          },
        ],
      });
    } else {
      messages.push({
        role: 'user',
        content: currentUserMessage,
      });
    }

    return messages;
  }

  private getActionLabel(action: string): string {
    switch (action) {
      case 'assist': return 'Assist';
      case 'what-should-i-say': return 'What should I say?';
      case 'follow-up': return 'Follow-up';
      case 'recap': return 'Recap';
      case 'custom': return 'Question';
      default: return 'Assist';
    }
  }

  private async captureScreenshotExcludingRaven(): Promise<ScreenshotAttachment | null> {
    const appWindows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed());
    const originalContentProtection = new Map<BrowserWindow, boolean>();

    try {
      // Prevent all Raven windows from appearing in captured frames without changing visibility.
      for (const win of appWindows) {
        const currentProtected = typeof win.isContentProtected === 'function'
          ? win.isContentProtected()
          : false;
        originalContentProtection.set(win, currentProtected);
        win.setContentProtection(true);
      }

      // Small delay so compositor applies content protection before capture.
      await this.sleep(45);

      const primaryDisplay = screen.getPrimaryDisplay();
      const maxCaptureWidth = 1920;
      const scale = Math.min(1, maxCaptureWidth / Math.max(1, primaryDisplay.size.width));
      const captureWidth = Math.max(640, Math.floor(primaryDisplay.size.width * scale));
      const captureHeight = Math.max(360, Math.floor(primaryDisplay.size.height * scale));

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: captureWidth,
          height: captureHeight,
        },
      });

      const targetDisplayId = String(primaryDisplay.id);
      const source = sources.find((candidate) => candidate.display_id === targetDisplayId) || sources[0];
      if (!source || source.thumbnail.isEmpty()) {
        console.warn('[ClaudeService] Screenshot capture returned empty thumbnail');
        return null;
      }

      return {
        mediaType: 'image/png',
        data: source.thumbnail.toPNG().toString('base64'),
        previewData: source.thumbnail.resize({ width: 320 }).toPNG().toString('base64'),
      };
    } catch (error) {
      console.error('[ClaudeService] Failed to capture screenshot:', error);
      return null;
    } finally {
      for (const win of appWindows) {
        if (win.isDestroyed()) continue;
        const previous = originalContentProtection.get(win) ?? false;
        win.setContentProtection(previous);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private broadcast(data: {
    type: 'start' | 'delta' | 'done' | 'error' | 'cleared';
    userMessage?: ChatMessage;
    assistantMessage?: ChatMessage;
    messageId?: string;
    text?: string;
    fullText?: string;
    error?: string;
    requestMeta?: { includeScreenshot: boolean; screenshotPreviewData?: string };
  }): void {
    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('claude:response', data);
      }
    } catch (err) {
      console.error('[ClaudeService] Broadcast error:', err);
    }
  }

  private broadcastError(error: string): void {
    this.broadcast({ type: 'error', error });
  }
}
