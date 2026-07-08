import { create } from 'zustand';

export type StrandsModelProvider = 'ollama' | 'openai' | 'bedrock';

interface AgentRuntimeState {
  agentUrl: string;
  modelProvider: StrandsModelProvider;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openAiApiKey: string;
  openAiModel: string;
  setAgentUrl: (agentUrl: string) => void;
  setModelProvider: (modelProvider: StrandsModelProvider) => void;
  setOllamaConfig: (config: { baseUrl?: string; model?: string }) => void;
  setOpenAiConfig: (config: { apiKey?: string; model?: string }) => void;
  reset: () => void;
}

const defaults = {
  agentUrl: import.meta.env.VITE_STRANDS_AGENT_URL ?? 'http://localhost:8787',
  modelProvider: (import.meta.env.VITE_STRANDS_MODEL_PROVIDER as StrandsModelProvider | undefined) ?? 'ollama',
  ollamaBaseUrl: import.meta.env.VITE_OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  ollamaModel: import.meta.env.VITE_OLLAMA_MODEL ?? 'qwen2.5:7b',
  openAiApiKey: '',
  openAiModel: import.meta.env.VITE_OPENAI_MODEL ?? 'gpt-4o-mini',
};

export const useAgentRuntimeStore = create<AgentRuntimeState>()((set) => ({
  ...defaults,
  setAgentUrl: (agentUrl) => set({ agentUrl: agentUrl.trim() }),
  setModelProvider: (modelProvider) => set({ modelProvider }),
  setOllamaConfig: (config) =>
    set((state) => ({
      ollamaBaseUrl: config.baseUrl ?? state.ollamaBaseUrl,
      ollamaModel: config.model ?? state.ollamaModel,
    })),
  setOpenAiConfig: (config) =>
    set((state) => ({
      openAiApiKey: config.apiKey ?? state.openAiApiKey,
      openAiModel: config.model ?? state.openAiModel,
    })),
  reset: () => set(defaults),
}));
