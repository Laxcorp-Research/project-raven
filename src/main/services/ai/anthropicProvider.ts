import type { AIProvider, AIMessage, AIContentPart, StreamCallbacks } from './types';
import { buildAnthropicEffortParams, streamMaxTokensFor } from './types';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic' as const;
  private apiKey: string;
  private model: string;
  private effort?: string;

  constructor(apiKey: string, model: string, effort?: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.effort = effort;
  }

  /** User-selected effort. Tests assert this without hitting the SDK. */
  private thinkingParams(): Record<string, unknown> {
    return buildAnthropicEffortParams(this.model, this.effort);
  }

  private resolveMaxTokens(requested?: number): number {
    if (typeof requested === 'number' && requested > 0) return requested;
    return streamMaxTokensFor('anthropic', this.model);
  }

  async streamResponse(
    params: { system: string; messages: AIMessage[]; maxTokens?: number },
    callbacks: StreamCallbacks
  ): Promise<void> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: this.apiKey });

    const anthropicMessages = params.messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: this.convertContent(msg.content),
    }));

    let fullText = '';

    try {
      const stream = client.messages.stream({
        model: this.model,
        max_tokens: this.resolveMaxTokens(params.maxTokens),
        system: params.system,
        messages: anthropicMessages,
        ...this.thinkingParams(),
      });

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
  }): Promise<string> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: this.apiKey });

    const messages: Array<{ role: 'user'; content: string }> = [
      { role: 'user', content: params.prompt },
    ];

    // Anthropic rejects non-streaming messages.create when max_tokens is
    // large enough that the call may exceed 10 minutes (Sonnet 5 at 128k
    // + high effort). Stream the same budget Assist uses.
    let fullText = '';
    const stream = client.messages.stream({
      model: this.model,
      max_tokens: streamMaxTokensFor('anthropic', this.model),
      ...(params.system ? { system: params.system } : {}),
      messages,
      ...this.thinkingParams(),
    });
    stream.on('text', (text: string) => {
      fullText += text;
    });
    await stream.finalMessage();
    return fullText.trim();
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
