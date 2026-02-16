import type { AIProvider, AIMessage, AIContentPart, StreamCallbacks } from './types';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;
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
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: this.apiKey });

    const openaiMessages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
    }> = [
      { role: 'system', content: params.system },
      ...params.messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: this.convertContent(msg.content),
      })),
    ];

    let fullText = '';

    try {
      const stream = await client.chat.completions.create({
        model: this.model,
        max_tokens: params.maxTokens ?? 1024,
        messages: openaiMessages,
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) {
          fullText += text;
          callbacks.onText(text);
        }
      }

      callbacks.onDone(fullText);
    } catch (error: unknown) {
      let errorMsg = 'Failed to get AI response.';
      const status = error != null && typeof error === 'object' && 'status' in error
        ? (error as { status: number }).status
        : undefined;
      if (status === 401) errorMsg = 'Invalid OpenAI API key. Check settings.';
      else if (status === 429) errorMsg = 'Rate limited. Wait a moment and try again.';
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
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: this.apiKey });

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (params.system) {
      messages.push({ role: 'system', content: params.system });
    }
    messages.push({ role: 'user', content: params.prompt });

    const response = await client.chat.completions.create({
      model: this.model,
      max_tokens: params.maxTokens ?? 60,
      messages,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }

  private convertContent(
    content: string | AIContentPart[]
  ): string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
    if (typeof content === 'string') return content;

    return content.map((part) => {
      if (part.type === 'text') {
        return { type: 'text' as const, text: part.text };
      }
      return {
        type: 'image_url' as const,
        image_url: {
          url: `data:${part.mediaType};base64,${part.base64}`,
        },
      };
    });
  }
}
