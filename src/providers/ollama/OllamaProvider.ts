import type { AIProvider, ChatMessage, StreamChunk } from '../types';

export class OllamaProvider implements AIProvider {
  id = 'ollama';
  name = 'Ollama';

  private baseUrl: string;
  private model: string;

  constructor(baseUrl = 'http://localhost:11434', model = 'gemma3:1b') {
    this.baseUrl = OllamaProvider.normalizeBaseUrl(baseUrl);
    this.model = model;
  }

  private static normalizeBaseUrl(baseUrl: string): string {
    const normalizedUrl = baseUrl.trim().replace(/\/$/, '');
    try {
      const parsed = new URL(normalizedUrl);
      if (parsed.hostname === 'localhost') {
        parsed.hostname = '127.0.0.1';
      }
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return normalizedUrl;
    }
  }

  static async getAvailableModels(baseUrl: string): Promise<string[]> {
    const normalizedUrl = OllamaProvider.normalizeBaseUrl(baseUrl);
    const res = await fetch(`${normalizedUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama model discovery failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const modelNames: Array<string | undefined> = models.map((model: any) =>
      typeof model === 'string' ? model : model.name || model.model
    );

    return modelNames.filter((value): value is string => Boolean(value));
  }

  async getAvailableModels(): Promise<string[]> {
    return OllamaProvider.getAvailableModels(this.baseUrl);
  }

  isConfigured(): boolean {
    return this.baseUrl.trim().length > 0 && this.model.trim().length > 0;
  }

  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
      signal,
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status}. Is Ollama running?`);

    const data = await res.json();
    return data.message.content as string;
  }

  async *stream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<StreamChunk> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
      signal,
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status}. Is Ollama running?`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) { yield { done: true }; return; }

      const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.message?.content) yield { text: json.message.content, done: false };
          if (json.done) { yield { done: true }; return; }
        } catch { /* skip */ }
      }
    }
  }

  async testConnection(): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Ollama base URL is not configured.');
    }
    const res = await fetch(`${this.baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama connection failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const availableModelNames: Array<string | undefined> = models.map((model: any) =>
      typeof model === 'string' ? model : model.name || model.model
    );

    const validModelNames = availableModelNames.filter((value): value is string => Boolean(value));
    const modelFound = validModelNames.includes(this.model);
    if (!modelFound) {
      throw new Error(
        `Ollama model '${this.model}' not found. Available models: ${availableModelNames.join(", ")}`
      );
    }
  }
}
