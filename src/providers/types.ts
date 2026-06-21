export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamChunk {
  text?: string;
  done: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  isConfigured(): boolean;
  chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string>;
  stream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<StreamChunk>;
  testConnection(): Promise<void>;
  getAvailableModels(): Promise<string[]>;
}
