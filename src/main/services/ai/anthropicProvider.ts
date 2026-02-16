import type { AIProvider, AIMessage, AIContentPart, StreamCallbacks } from './types';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic' as const;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
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
        max_tokens: params.maxTokens ?? 1024,
        system: params.system,
        messages: anthropicMessages,
      });

      stream.on('text', (text: string) => {
        fullText += text;
        callbacks.onText(text);
      });

      await stream.finalMessage();
      callbacks.onDone(fullText);
    } catch (error: any) {
      let errorMsg = 'Failed to get AI response.';
      if (error?.status === 401) errorMsg = 'Invalid Anthropic API key. Check settings.';
      else if (error?.status === 429) errorMsg = 'Rate limited. Wait a moment and try again.';
      else if (error?.status === 529) errorMsg = 'Claude is overloaded. Try again shortly.';
      else if (error?.message) errorMsg = `AI error: ${error.message}`;
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

    const response = await client.messages.create({
      model: this.model,
      max_tokens: params.maxTokens ?? 60,
      ...(params.system ? { system: params.system } : {}),
      messages,
    });

    return (response.content[0] as any).text?.trim() || '';
  }

  private convertContent(
    content: string | AIContentPart[]
  ): string | Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> {
    if (typeof content === 'string') return content;

    return content.map((part) => {
      if (part.type === 'text') {
        return { type: 'text' as const, text: part.text };
      }
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: part.mediaType,
          data: part.base64,
        },
      };
    });
  }
}
