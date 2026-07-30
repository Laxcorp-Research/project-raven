import type { AIProvider, AIMessage, AIContentPart, StreamCallbacks, AIRequestOptions } from './types';

// Models that support adaptive thinking via `thinking: { type: 'adaptive' }`.
// On these models, manual `thinking: { type: 'enabled', budget_tokens: N }` is
// either deprecated (Opus 4.6, Sonnet 4.6) or rejected outright with 400
// (Opus 4.7). The xhigh effort level was introduced with Opus 4.7 for
// coding/agentic use cases.
//
// IMPORTANT: thinking-capable responses are LONGER. The thinking blocks
// themselves consume output tokens (they are emitted before the final
// answer). A 1024 max_tokens cap routinely truncates the final response on
// these models. Callers that opt into a thinking model must request enough
// headroom; we also bump the per-call default below.
const ADAPTIVE_THINKING_MODELS = new Set<string>([
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
]);

// xhigh effort is exclusive to Opus 4.7 today (per Anthropic docs); using it
// on Opus 4.6 / Sonnet 4.6 returns 400. The other models in the set above
// fall back to the API's default (`high`) which still triggers thinking on
// complex requests.
const XHIGH_EFFORT_MODELS = new Set<string>([
  'claude-opus-4-7',
]);

// Default max_tokens for non-thinking models. Matches what callers expected
// before this provider learned about adaptive thinking.
const DEFAULT_MAX_TOKENS = 1024;

// Default max_tokens for thinking-capable models. Adaptive thinking emits
// reasoning blocks BEFORE the final answer; on a hard problem (e.g. a
// CodeSignal task that needs full source code in the response) the
// thinking alone can easily consume 4-8K tokens, and the final answer
// another 4-8K. 16384 leaves comfortable headroom without being wasteful
// for shorter queries (output tokens are billed only as emitted).
const THINKING_DEFAULT_MAX_TOKENS = 16384;

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic' as const;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Returns the `thinking` + `output_config` parameters appropriate for this
   * model, or an empty object if the model has no thinking support. Splitting
   * this out lets streamResponse and generateShort share the logic and lets
   * tests assert the wiring without hitting the SDK.
   */
  private thinkingParams(): Record<string, unknown> {
    if (!ADAPTIVE_THINKING_MODELS.has(this.model)) return {};
    const base: Record<string, unknown> = { thinking: { type: 'adaptive' } };
    if (XHIGH_EFFORT_MODELS.has(this.model)) {
      base.output_config = { effort: 'xhigh' };
    }
    return base;
  }

  private resolveMaxTokens(requested?: number): number {
    if (typeof requested === 'number' && requested > 0) return requested;
    return ADAPTIVE_THINKING_MODELS.has(this.model)
      ? THINKING_DEFAULT_MAX_TOKENS
      : DEFAULT_MAX_TOKENS;
  }

  async streamResponse(
    params: { system: string; messages: AIMessage[]; maxTokens?: number },
    callbacks: StreamCallbacks,
    options?: AIRequestOptions,
  ): Promise<void> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: this.apiKey });

    const anthropicMessages = params.messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: this.convertContent(msg.content),
    }));

    let fullText = '';

    try {
      const request = {
        model: this.model,
        max_tokens: this.resolveMaxTokens(params.maxTokens),
        system: params.system,
        messages: anthropicMessages,
        ...this.thinkingParams(),
      };
      const stream = options?.signal
        ? client.messages.stream(request, { signal: options.signal })
        : client.messages.stream(request);

      stream.on('text', (text: string) => {
        fullText += text;
        callbacks.onText(text);
      });

      await stream.finalMessage();
      callbacks.onDone(fullText);
    } catch (error: unknown) {
      let errorMsg = 'Failed to get AI response.';
      const status = error != null && typeof error === 'object' && 'status' in error
        ? (error as { status: number }).status
        : undefined;
      if (status === 401) errorMsg = 'Invalid Anthropic API key. Check settings.';
      else if (status === 429) errorMsg = 'Rate limited. Wait a moment and try again.';
      else if (status === 529) errorMsg = 'Claude is overloaded. Try again shortly.';
      else if (error instanceof Error) errorMsg = `AI error: ${error.message}`;
      callbacks.onError(errorMsg);
      throw error;
    }
  }

  async generateShort(params: {
    system?: string;
    prompt: string;
    maxTokens?: number;
  }, options?: AIRequestOptions): Promise<string> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: this.apiKey });

    const messages: Array<{ role: 'user'; content: string }> = [
      { role: 'user', content: params.prompt },
    ];

    // generateShort is for quick title/summary generations. We do NOT enable
    // thinking here even on thinking-capable models: callers expect a 60-token
    // single-line output and the thinking overhead would dominate. The cap
    // stays at the caller's request (default 60).
    const request = {
      model: this.model,
      max_tokens: params.maxTokens ?? 60,
      ...(params.system ? { system: params.system } : {}),
      messages,
    };
    const response = options?.signal
      ? await client.messages.create(request, { signal: options.signal })
      : await client.messages.create(request);

    const block = response.content[0];
    return (block.type === 'text' ? block.text : '').trim();
  }

  private convertContent(
    content: string | AIContentPart[]
  ): string | Array<
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: AnthropicImageMediaType; data: string } }
  > {
    if (typeof content === 'string') return content;

    return content.map((part) => {
      if (part.type === 'text') {
        return { type: 'text' as const, text: part.text };
      }
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          // Anthropic's SDK narrows media_type to the four image/* literals
          // they accept. Our upstream AIContentPart.mediaType is a bare
          // string because screenshots are generated with the MIME type
          // from the renderer; they are always one of these four. If a
          // caller ever passes something else Anthropic will reject at
          // the API boundary anyway - the cast is the minimum needed to
          // stop the type from widening back to string here.
          media_type: part.mediaType as AnthropicImageMediaType,
          data: part.base64,
        },
      };
    });
  }
}

type AnthropicImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
