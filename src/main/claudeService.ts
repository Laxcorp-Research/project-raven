import { BrowserWindow, ipcMain, desktopCapturer, screen } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { sessionManager } from './services/sessionManager';
import { getProviderFromStore, getFastProvider, getProProvider, getProFastProvider } from './services/ai/providerFactory';
import { getSetting, isProMode } from './store';
import type { AIMessage, AIContentPart } from './services/ai/types';
import { createLogger } from './logger';
import { TITLE_MAX_TOKENS, TITLE_TRANSCRIPT_SLICE, TITLE_MAX_LENGTH, TITLE_TRUNCATE_AT, TITLE_TRUNCATED_LENGTH, STREAM_MAX_TOKENS, RAG_QUERY_TRANSCRIPT_SLICE, RAG_DEFAULT_TOP_K, CONVERSATION_HISTORY_LIMIT, TRANSCRIPT_LINE_LIMIT, SCREENSHOT_CAPTURE_DELAY_MS, SCREENSHOT_MAX_WIDTH, SCREENSHOT_MIN_WIDTH, SCREENSHOT_MIN_HEIGHT, SCREENSHOT_PREVIEW_WIDTH } from './constants';

const log = createLogger('Claude');

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

let getServerSystemPrompt: (() => Promise<string | null>) | null = null
let getServerActionPrompt: ((action: string) => Promise<string | null>) | null = null

async function loadProPromptService(): Promise<void> {
  if (!isProMode()) return
  try {
    const mod = await import(/* @vite-ignore */ '../pro/main/promptService')
    getServerSystemPrompt = mod.getServerSystemPrompt
    getServerActionPrompt = mod.getServerActionPrompt
  } catch (err) {
    log.debug('Pro prompt service not available:', err)
  }
}
void loadProPromptService()

const buildSystemPrompt = (modePrompt?: string, ragChunks?: Array<{ chunkText: string; fileName: string; score: number }>): string => {
  let prompt = `You are Raven, the user's real-time AI co-pilot. You can see the user's screen (when a screenshot is attached) and the live audio transcript of the conversation (when provided).

OVERRIDE RULE: If the user typed a specific question (marked "USER QUESTION"), answer it directly using all available context — transcript, screen, conversation history. This ALWAYS takes priority over the automatic detection below.

PRIORITY SYSTEM — When no explicit user question is present, execute the highest applicable priority:

1. ANSWER THE QUESTION: If someone just asked a question at the END of the transcript, answer it directly. This is the HIGHEST PRIORITY. Start with the answer.

2. SOLVE SCREEN PROBLEMS: If the screen shows a solvable problem (math, code, logic, aptitude, multiple choice), solve it correctly — regardless of what's happening in the transcript. If there's an active conversation, frame the answer as coaching ("Say this: the answer is X because..."). If there's no conversation, give the answer directly.

3. ADVANCE THE CONVERSATION: If there's no question to answer and no problem to solve, suggest what the user should say next — 1-3 follow-up questions or talking points.

4. PASSIVE: If none of the above apply, respond with "Not sure what you need help with right now." Do NOT invent tasks, summarize without being asked, or provide unsolicited advice.

CONTENT-SPECIFIC FORMATS:

- Math / Aptitude / Logic: Start with the answer. Show step-by-step reasoning. End with **FINAL ANSWER: [answer]**. Include a **VERIFY:** section where you double-check using a different method.
- Multiple Choice: State the correct answer letter and text first. Explain why it's correct. Then briefly explain why each other option is wrong.
- Code / Technical: Start with the solution code with comments on key lines. Follow with complexity analysis and explanation.
- "What should I say?" / Coaching: Provide the exact words the user can say. Format as a direct quote. Keep it natural, conversational, and immediately usable.

RESPONSE STYLE:

- NEVER use meta-phrases ("Let me help you", "I can see that", "Based on the transcript", "Great question", "Sure!", "Of course!")
- NEVER summarize unless explicitly asked
- NEVER reference "screenshot" or "image" — say "the screen" if you must refer to visual content
- NEVER repeat yourself — you have your previous responses in the conversation history
- Be concise by default: 1-4 sentences for coaching/conversation. For problem-solving, be as thorough as needed to get the answer RIGHT.
- Use **bold** for key terms and - bullets for lists. Do NOT use markdown headers (#, ##, ###).
- Match the user's language. If the transcript is in Hindi, respond in Hindi. If mixed, match the user's dominant language.

TRANSCRIPT HANDLING:

- Prioritize the END of the transcript — that's what's happening RIGHT NOW
- Real transcripts are messy: garbled words, filler, incomplete sentences, possibly mislabeled speakers. Focus on INTENT, not grammar.
- If you're 50%+ confident someone is asking something, treat it as a question and answer it
- "(still speaking)" entries are live — the speaker hasn't finished. Use them for context but the final wording may differ.

SCREEN + TRANSCRIPT INTERACTION:

- Screen has a problem AND transcript has a question about it → answer the question using the screen
- Screen has a problem AND transcript is unrelated → solve the screen problem
- Screen is general AND transcript has a question → answer the transcript question
- The screen is supplementary context unless it contains a solvable problem

CONVERSATION HISTORY:

- Use previous messages for continuity. If you already answered something, don't repeat — refer back briefly.
- Conversation history may span across topics. Use whatever context is relevant to the current request.`;

  const rawName = getSetting('displayName') as string | undefined;
  if (rawName) {
    const userName = rawName.replace(/[\n\r]/g, ' ').trim().slice(0, 50);
    if (userName) {
      prompt += `\n\n<user_name>${userName}</user_name>\nIn the transcript, this user's speech is labeled "${userName}". Other speakers are labeled "Them".`;
    }
  }

  if (modePrompt) {
    prompt += `\n\nMODE-SPECIFIC INSTRUCTIONS (follow these in addition to the above):\n${modePrompt}`;
  }

  if (ragChunks && ragChunks.length > 0) {
    prompt += `\n\nREFERENCE DOCUMENTS (use to inform your responses when relevant):\n`;
    ragChunks.forEach((chunk, i) => {
      prompt += `\n[${i + 1}] (from "${chunk.fileName}"):\n${chunk.chunkText}\n`;
    });
  }

  return prompt;
};

const ACTION_PROMPTS: Record<string, string> = {
  assist: 'Execute the priority system. Focus on the END of the transcript — what just happened, what was just asked. If the screen shows a problem, solve it. If there is a question, answer it. If neither, suggest what to say next.',
  'what-should-i-say': 'The other person ("Them") just said or asked something at the END of the transcript. Craft a direct response I can say RIGHT NOW. Use the FULL transcript for context — if they reference something discussed earlier, pull from that. Give me the exact words as a verbatim quote. Make it natural, conversational, and directly responsive.',
  'follow-up': 'Suggest 2-3 follow-up questions I can ask RIGHT NOW. Each must be directly usable — natural spoken language, not formal. Each should advance the conversation in a meaningful direction based on what was just discussed.',
  recap: 'Concise recap of this conversation. Use bullets. Include: key points discussed, decisions made, action items with owners, and anything unresolved. Be specific — names, numbers, commitments.',
  'fact-check': 'Review the recent claims, statements, and facts mentioned in the transcript. For each significant claim: state the claim, whether it is accurate/inaccurate/unverifiable, and a brief correction or confirmation. Focus on factual assertions (numbers, dates, technical claims), not opinions.',
  'tell-me-more': 'Expand on your most recent response. Provide deeper detail, additional examples, or alternative perspectives. Do not repeat what you already said — add new information.',
};

/**
 * Generate a session title using the active AI provider
 */
export async function generateSessionTitle(
  transcriptText: string
): Promise<string> {
  try {
    const provider = await getProviderFromStore();

    const prompt = `<task>Generate a 3-7 word title for the following meeting transcript. Output ONLY the title text, nothing else.</task>

<transcript>
${transcriptText.slice(0, TITLE_TRANSCRIPT_SLICE)}
</transcript>

<examples>
Good titles: "Q4 Sales Review", "Marketing Budget Discussion", "Team Standup Meeting", "Interview with John"
Bad titles: "I'd be happy to help...", "Here's a title:", "The conversation is about..."
</examples>

Title:`;

    let title = await provider.generateShort({ prompt, maxTokens: TITLE_MAX_TOKENS });

    title = title
      .replace(/^["']|["']$/g, '')
      .replace(/^(Title:|Here's|The title is|A good title would be)/i, '')
      .replace(/[.!?]$/, '')
      .trim();

    if (
      title.toLowerCase().startsWith("i'd")
      || title.toLowerCase().startsWith('i need')
      || title.toLowerCase().startsWith("i don't")
      || title.length > TITLE_MAX_LENGTH
    ) {
      throw new Error('Invalid title format');
    }

    return title.length > TITLE_TRUNCATE_AT ? title.slice(0, TITLE_TRUNCATED_LENGTH) + '...' : title;
  } catch (error) {
    log.error('Title generation failed:', error);
    throw error;
  }
}

export class ClaudeService {
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
      modeId?: string;
      includeScreenshot?: boolean;
    }) => {
      try {
        if (this.isProcessing) {
          log.debug('Ignoring request while processing is active');
          return;
        }

        this.isProcessing = true;

        let provider;
        if (isProMode()) {
          const useDeepModel = getSetting('smartMode') === true;
          provider = useDeepModel ? await getProProvider() : await getProFastProvider();
        } else {
          provider = await getProviderFromStore();
        }

        const screenshotAttachment = params.includeScreenshot
          ? await this.captureScreenshotExcludingRaven()
          : null;

        const userMessageContent = await this.buildUserMessage(params);
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

        const aiMessages = this.buildAIMessages(userMessageContent, screenshotAttachment);

        let ragChunks: Array<{ chunkText: string; fileName: string; score: number }> = [];
        if (params.modeId) {
          try {
            const { retrieveRelevantChunks } = await import('./services/ragService');
            const queryText = params.customPrompt || params.transcript.slice(-RAG_QUERY_TRANSCRIPT_SLICE) || params.action;
            ragChunks = await retrieveRelevantChunks(params.modeId, queryText, RAG_DEFAULT_TOP_K);
          } catch (err) {
            log.error('RAG retrieval failed (non-fatal):', err);
          }
        }

        let fullResponse = '';

        let systemPrompt: string
        if (getServerSystemPrompt) {
          const serverPrompt = await getServerSystemPrompt()
          systemPrompt = serverPrompt || buildSystemPrompt(params.modePrompt, ragChunks.length > 0 ? ragChunks : undefined)
        } else {
          systemPrompt = buildSystemPrompt(params.modePrompt, ragChunks.length > 0 ? ragChunks : undefined)
        }

        const streamTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI_STREAM_TIMEOUT')), 60_000)
        );
        await Promise.race([
          provider.streamResponse(
            {
              system: systemPrompt,
              messages: aiMessages,
              maxTokens: STREAM_MAX_TOKENS,
            },
            {
              onText: (text) => {
                fullResponse += text;
                this.broadcast({
                  type: 'delta',
                  messageId: assistantMessageId,
                  text,
                  fullText: fullResponse,
                });
              },
              onDone: () => {
                // handled below after await
              },
              onError: (errorMsg) => {
                this.isProcessing = false;
                this.broadcastError(errorMsg);
              },
            }
          ),
          streamTimeout,
        ]);

        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: fullResponse,
          timestamp: Date.now(),
        };
        this.conversation.messages.push(assistantMessage);

        if (this.conversation.messages.length > CONVERSATION_HISTORY_LIMIT) {
          this.conversation.messages = this.conversation.messages.slice(-CONVERSATION_HISTORY_LIMIT);
        }

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

      } catch (error: unknown) {
        this.isProcessing = false;

        // Check for usage limit error from the backend proxy
        if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'LIMIT_REACHED') {
          const limitErr = error as { used: number; limit: number; resetAt: string };
          this.broadcast({
            type: 'error',
            error: 'LIMIT_REACHED',
            limitInfo: {
              used: limitErr.used,
              limit: limitErr.limit,
              resetAt: limitErr.resetAt,
            },
          });
          return;
        }

        const msg = error instanceof Error ? error.message : String(error);
        log.error('Error:', error);
        this.broadcastError(msg || 'Failed to get AI response.');
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

  private windowTranscript(transcript: string): string {
    const lines = transcript.split('\n');
    if (lines.length <= TRANSCRIPT_LINE_LIMIT) return transcript;
    const kept = lines.slice(-TRANSCRIPT_LINE_LIMIT);
    return `[...earlier conversation omitted — ${lines.length - TRANSCRIPT_LINE_LIMIT} lines]\n${kept.join('\n')}`;
  }

  private async buildUserMessage(params: {
    transcript: string;
    action: string;
    customPrompt?: string;
    includeScreenshot?: boolean;
  }): Promise<string> {
    let message = '';

    if (params.transcript.trim()) {
      const windowed = this.windowTranscript(params.transcript);
      const newTranscript = params.transcript.slice(this.conversation.lastProcessedTranscriptLength);

      if (this.conversation.messages.length === 0) {
        message += `LIVE TRANSCRIPT:\n${windowed}\n\n`;
      } else if (newTranscript.trim()) {
        const windowedNew = this.windowTranscript(newTranscript);
        message += `NEW SINCE LAST (read this first):\n${windowedNew.trim()}\n\nFULL TRANSCRIPT:\n${windowed}\n\n`;
      } else {
        message += `TRANSCRIPT (unchanged):\n${windowed}\n\n`;
      }
    }

    if (params.action === 'custom' && params.customPrompt) {
      message += `USER QUESTION: ${params.customPrompt}`;
    } else {
      let actionPrompt: string | null = null
      if (getServerActionPrompt) {
        actionPrompt = await getServerActionPrompt(params.action)
      }
      message += actionPrompt || ACTION_PROMPTS[params.action] || ACTION_PROMPTS.assist;
    }

    if (params.includeScreenshot) {
      message += '\n\n[Screenshot of the user\'s screen is attached]';
    }

    return message;
  }

  private buildAIMessages(
    currentUserMessage: string,
    screenshot: ScreenshotAttachment | null
  ): AIMessage[] {
    const messages: AIMessage[] = [];

    const recentHistory = this.conversation.messages.slice(-CONVERSATION_HISTORY_LIMIT);

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
      const parts: AIContentPart[] = [
        { type: 'text', text: currentUserMessage },
        {
          type: 'image',
          base64: screenshot.data,
          mediaType: screenshot.mediaType,
        },
      ];
      messages.push({ role: 'user', content: parts });
    } else {
      messages.push({ role: 'user', content: currentUserMessage });
    }

    return messages;
  }

  private getActionLabel(action: string): string {
    switch (action) {
      case 'assist': return 'Assist';
      case 'what-should-i-say': return 'What should I say?';
      case 'follow-up': return 'Follow-up';
      case 'recap': return 'Recap';
      case 'fact-check': return 'Fact Check';
      case 'tell-me-more': return 'Tell me more';
      case 'custom': return 'Question';
      default: return 'Assist';
    }
  }

  private async captureScreenshotExcludingRaven(): Promise<ScreenshotAttachment | null> {
    const appWindows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed());
    const originalContentProtection = new Map<BrowserWindow, boolean>();

    try {
      for (const win of appWindows) {
        const currentProtected = typeof win.isContentProtected === 'function'
          ? win.isContentProtected()
          : false;
        originalContentProtection.set(win, currentProtected);
        win.setContentProtection(true);
      }

      await this.sleep(SCREENSHOT_CAPTURE_DELAY_MS);

      const primaryDisplay = screen.getPrimaryDisplay();
      const maxCaptureWidth = SCREENSHOT_MAX_WIDTH;
      const scale = Math.min(1, maxCaptureWidth / Math.max(1, primaryDisplay.size.width));
      const captureWidth = Math.max(SCREENSHOT_MIN_WIDTH, Math.floor(primaryDisplay.size.width * scale));
      const captureHeight = Math.max(SCREENSHOT_MIN_HEIGHT, Math.floor(primaryDisplay.size.height * scale));

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
        log.warn('Screenshot capture returned empty thumbnail');
        return null;
      }

      return {
        mediaType: 'image/png',
        data: source.thumbnail.toPNG().toString('base64'),
        previewData: source.thumbnail.resize({ width: SCREENSHOT_PREVIEW_WIDTH }).toPNG().toString('base64'),
      };
    } catch (error) {
      log.error('Failed to capture screenshot:', error);
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
    limitInfo?: { used: number; limit: number; resetAt: string };
    requestMeta?: { includeScreenshot: boolean; screenshotPreviewData?: string };
  }): void {
    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('claude:response', data);
      }
    } catch (err) {
      log.error('Broadcast error:', err);
    }
  }

  private broadcastError(error: string): void {
    this.broadcast({ type: 'error', error });
  }
}
