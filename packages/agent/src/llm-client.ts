
import { Anthropic } from '@anthropic-ai/sdk';

export interface LlmClient {
  generate(options: { prompt: string; systemPrompt?: string; model?: string }): Promise<{ text: string, error?: string }>;
  streamChat(options: { prompt: string; systemPrompt?: string; model?: string }): AsyncGenerator<{ text: string, error?: string }>;
}

class DefaultLlmClient implements LlmClient {
  private anthropic: Anthropic | undefined;

  private getClient(): Anthropic {
    if (this.anthropic) {
      return this.anthropic;
    }
    // The Anthropic SDK will automatically pick up the ANTHROPIC_API_KEY from the environment.
    this.anthropic = new Anthropic();
    return this.anthropic;
  }
  
  async generate(options: { prompt: string; systemPrompt?: string; model?: string }): Promise<{ text: string, error?: string }> {
    try {
      const client = this.getClient();
      const { prompt, systemPrompt, model } = options;

      const response = await client.messages.create({
        model: model || 'claude-3-opus-20240229',
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
      });

      if (response.content.length === 0 || response.content[0].type !== 'text') {
        return { text: '', error: 'No text content in LLM response' };
      }
      
      const text = response.content[0].text;
      return { text };

    } catch (e) {
        if (e instanceof Error) {
            return { text: '', error: e.message };
        }
        return { text: '', error: 'Unknown error during LLM generation' };
    }
  }

  async *streamChat(options: { prompt: string; systemPrompt?: string; model?: string }): AsyncGenerator<{ text: string, error?: string }> {
    try {
      const client = this.getClient();
      const { prompt, systemPrompt, model } = options;

      const stream = await client.messages.stream({
        model: model || 'claude-3-opus-20240229',
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          yield { text: chunk.delta.text };
        }
      }
    } catch (e) {
        if (e instanceof Error) {
            yield { text: '', error: e.message };
        }
        yield { text: '', error: 'Unknown error during LLM generation' };
    }
  }
}

export const llmClient = new DefaultLlmClient();
