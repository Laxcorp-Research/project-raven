import type { AIProvider, AIMessage, AIContentPart, StreamCallbacks } from './types';
import { buildOpenAIEffortParams, streamMaxTokensFor } from './types';
import type OpenAI from 'openai';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;
  private apiKey: string;
  private model: string;
  private effort?: string;

  constructor(apiKey: string, model: string, effort?: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.effort = effort;
  }

  async streamResponse(
    params: { system: string; messages: AIMessage[]; maxTokens?: number },
    callbacks: StreamCallbacks
  ): Promise<void> {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: this.apiKey });

    // Build as the SDK's discriminated ChatCompletionMessageParam union
    // rather than a widened { role: 'system' | 'user' | 'assistant' }
    // shape: the SDK narrows each variant's role to a single literal, and
    // ChatCompletionAssistantMessageParam's content cannot contain
    // image_url parts (assistants don't emit images). Assistant messages
    // from our AIMessage contract have always been strings at runtime
    // (model responses), so flatten any accidental image content to its
    // text parts for the assistant branch rather than blindly passing
    // what convertContent returns.
    const systemMessage: OpenAIChatMessage = { role: 'system', content: params.system };
    const userMessages: OpenAIChatMessage[] = params.messages.map((msg) => {
      if (msg.role === 'user') {
        return { role: 'user', content: this.convertContent(msg.content) };
      }
      const assistantText = typeof msg.content === 'string'
        ? msg.content
        : msg.content
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            // Use a newline, not an empty string. Multipart assistant
            // content only occurs in OSS builds where users bring their
            // own OpenAI key; joining with '' would silently mash
            // sentences together ("Hello.How are you?") and degrade
            // follow-up LLM context. Newline matches how the Anthropic
            // provider flattens the same case.
            .join('\n');
      return { role: 'assistant', content: assistantText };
    });
    const openaiMessages: OpenAIChatMessage[] = [systemMessage, ...userMessages];

    let fullText = '';

    try {
      const stream = await client.chat.completions.create({
        model: this.model,
        max_tokens: params.maxTokens ?? streamMaxTokensFor('openai', this.model),
        messages: openaiMessages,
        stream: true,
        ...this.effortParams(),
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
      max_tokens: streamMaxTokensFor('openai', this.model),
      messages,
      ...this.effortParams(),
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }

  private effortParams(): Record<string, unknown> {
    return buildOpenAIEffortParams(this.model, this.effort);
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

type OpenAIChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
