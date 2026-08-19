import { OpenAIProvider } from './openaiProvider';

export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1';

export class OpenCodeGoProvider extends OpenAIProvider {
  constructor(apiKey: string, model: string) {
    super(apiKey, model, undefined, {
      name: 'opencode-go',
      baseURL: OPENCODE_GO_BASE_URL,
      label: 'OpenCode Go',
    });
  }
}
