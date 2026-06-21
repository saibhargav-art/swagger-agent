import type { AIProvider } from '@/providers/types';
import { OpenAIProvider } from '@/providers/openai/OpenAIProvider';
import { ClaudeProvider } from '@/providers/claude/ClaudeProvider';
import { GeminiProvider } from '@/providers/gemini/GeminiProvider';
import { OllamaProvider } from '@/providers/ollama/OllamaProvider';
import type { ProviderId, ProviderConfigs } from '@/types/provider';

export class ProviderManager {
  getProvider(id: ProviderId, configs: ProviderConfigs): AIProvider {
    switch (id) {
      case 'openai':
        return new OpenAIProvider(configs.openai.apiKey, configs.openai.model);
      case 'claude':
        return new ClaudeProvider(configs.claude.apiKey, configs.claude.model);
      case 'gemini':
        return new GeminiProvider(configs.gemini.apiKey, configs.gemini.model);
      case 'ollama':
        return new OllamaProvider(configs.ollama.baseUrl, configs.ollama.model);
      default:
        throw new Error(`Unsupported provider: ${id}`);
    }
  }
}

export const providerManager = new ProviderManager();
