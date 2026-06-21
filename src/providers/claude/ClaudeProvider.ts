import type { AIProvider, ChatMessage, StreamChunk } from '../types';

// Note: Anthropic API requires a server-side proxy for browser usage
// due to CORS restrictions. Configure a proxy at VITE_CLAUDE_PROXY_URL.
const API_BASE = import.meta.env.VITE_CLAUDE_PROXY_URL ?? 'https://api.anthropic.com';

export class ClaudeProvider implements AIProvider {
  id = 'claude';
  name = 'Claude';

  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'claude-3-5-haiku-20241022') {
    this.apiKey = apiKey;
    this.model = model;
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  private buildBody(messages: ChatMessage[], stream: boolean) {
    const system = messages.find((m) => m.role === 'system')?.content;
    const userMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    return JSON.stringify({
      model: this.model,
      max_tokens: 4096,
      ...(system ? { system } : {}),
      messages: userMessages,
      stream,
    });
  }

  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const res = await fetch(`${API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: this.buildBody(messages, false),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `Claude error: ${res.status}`);
    }

    const data = await res.json();
    return data.content[0].text as string;
  }

  async *stream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<StreamChunk> {
    const res = await fetch(`${API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: this.buildBody(messages, true),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `Claude error: ${res.status}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) { yield { done: true }; return; }

      const lines = decoder.decode(value, { stream: true }).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const json = JSON.parse(line.slice(6));
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            yield { text: json.delta.text, done: false };
          }
          if (json.type === 'message_stop') { yield { done: true }; return; }
        } catch { /* skip */ }
      }
    }
  }

    async testConnection(): Promise<void> {
      if (!this.isConfigured()) {
        throw new Error('Claude API key is not configured.');
      }
      const res = await fetch(`${API_BASE}/v1/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? `Claude connection failed: ${res.status}`);
      }
    }

    async getAvailableModels(): Promise<string[]> {
      if (!this.isConfigured()) {
        throw new Error('Claude API key is not configured.');
      }

      const res = await fetch(`${API_BASE}/v1/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? `Claude model discovery failed: ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      const models = Array.isArray(data.models) ? data.models : Array.isArray(data.data) ? data.data : [];

      return models
        .map((model: any) => typeof model === 'string' ? model : model.name || model.id)
        .filter((value): value is string => Boolean(value));
    }
  }
