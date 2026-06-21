import type { AIProvider, ChatMessage, StreamChunk } from '../types';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiPart { text: string }
interface GeminiContent { role: string; parts: GeminiPart[] }

export class GeminiProvider implements AIProvider {
  id = 'gemini';
  name = 'Gemini';

  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  private toGeminiMessages(messages: ChatMessage[]): {
    systemInstruction?: { parts: GeminiPart[] };
    contents: GeminiContent[];
  } {
    const system = messages.find((m) => m.role === 'system');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    return {
      ...(system ? { systemInstruction: { parts: [{ text: system.content }] } } : {}),
      contents,
    };
  }

  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const url = `${API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.toGeminiMessages(messages)),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `Gemini error: ${res.status}`);
    }

    const data = await res.json();
    return data.candidates[0].content.parts[0].text as string;
  }

  async *stream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<StreamChunk> {
    const url = `${API_BASE}/models/${this.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.toGeminiMessages(messages)),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `Gemini error: ${res.status}`);
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
          const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield { text, done: false };
        } catch { /* skip */ }
      }
    }
  }

  async testConnection(): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured.');
    }
    const res = await fetch(`${API_BASE}/models/${this.model}?key=${this.apiKey}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error?.message ?? `Gemini connection failed: ${res.status}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured.');
    }

    const res = await fetch(`${API_BASE}/models?key=${this.apiKey}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error?.message ?? `Gemini model discovery failed: ${res.status}`);
    }

    const data = await res.json().catch(() => ({}));
    const models = Array.isArray(data.models) ? data.models : Array.isArray(data.model) ? data.model : [];

    return models
      .map((model) => typeof model === 'string' ? model : model.name || model.id)
      .filter((value): value is string => Boolean(value));
  }
}
