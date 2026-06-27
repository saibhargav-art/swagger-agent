import type { AIProvider, ChatMessage, StreamChunk } from '../types';

export class OpenAIProvider implements AIProvider {
  id = 'openai';
  name = 'OpenAI';

  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `OpenAI error: ${res.status}`);
    }

    const data = await res.json();
    return data.choices[0].message.content as string;
  }

  async testConnection(): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key is not configured.');
    }
    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error?.message ?? `OpenAI connection failed: ${res.status}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key is not configured.');
    }

    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error?.message ?? `OpenAI model discovery failed: ${res.status}`);
    }

    const data = await res.json().catch(() => ({}));
    const models = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];

    return models
      .map((model: unknown) =>
        typeof model === 'string'
          ? model
          : typeof model === 'object' && model
            ? (model as { id?: string; name?: string }).id || (model as { id?: string; name?: string }).name
            : undefined
      )
      .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);
  }

  async *stream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<StreamChunk> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `OpenAI error: ${res.status}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) { yield { done: true }; return; }

      const lines = decoder.decode(value, { stream: true }).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') { yield { done: true }; return; }
        try {
          const json = JSON.parse(raw);
          const text: string | undefined = json.choices?.[0]?.delta?.content;
          if (text) yield { text, done: false };
        } catch { /* skip malformed */ }
      }
    }
  }
}
