export type ProviderId = 'openai' | 'claude' | 'gemini' | 'ollama';

export interface OpenAIConfig {
  apiKey: string;
  model: string;
}

export interface ClaudeConfig {
  apiKey: string;
  model: string;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export interface ProviderConfigs {
  openai: OpenAIConfig;
  claude: ClaudeConfig;
  gemini: GeminiConfig;
  ollama: OllamaConfig;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
  ollama: 'Ollama',
};

export const DEFAULT_CONFIGS: ProviderConfigs = {
  openai: { apiKey: '', model: 'gpt-4o-mini' },
  claude: { apiKey: '', model: 'claude-3-5-haiku-20241022' },
  gemini: { apiKey: '', model: 'gemini-1.5-flash' },
  ollama: { baseUrl: 'http://localhost:11434', model: 'gemma3:1b' },
};
