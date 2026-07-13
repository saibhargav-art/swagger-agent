import { create } from 'zustand';

export type StrandsModelProvider = 'ollama' | 'openai' | 'bedrock';

interface AgentRuntimeState {
  agentUrl: string;
  modelProvider: StrandsModelProvider;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openAiApiKey: string;
  openAiModel: string;
  browserMcpEnabled: boolean;
  browserMcpCommand: string;
  browserMcpArgs: string;
  context7Enabled: boolean;
  context7Command: string;
  context7Args: string;
  setAgentUrl: (agentUrl: string) => void;
  setModelProvider: (modelProvider: StrandsModelProvider) => void;
  setOllamaConfig: (config: { baseUrl?: string; model?: string }) => void;
  setOpenAiConfig: (config: { apiKey?: string; model?: string }) => void;
  setBrowserMcpConfig: (config: { enabled?: boolean; command?: string; args?: string }) => void;
  setContext7Config: (config: { enabled?: boolean; command?: string; args?: string }) => void;
  reset: () => void;
}

const defaults = {
  agentUrl: import.meta.env.VITE_STRANDS_AGENT_URL ?? 'http://localhost:8787',
  modelProvider: (import.meta.env.VITE_STRANDS_MODEL_PROVIDER as StrandsModelProvider | undefined) ?? 'ollama',
  ollamaBaseUrl: import.meta.env.VITE_OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  ollamaModel: import.meta.env.VITE_OLLAMA_MODEL ?? 'qwen2.5:7b',
  openAiApiKey: '',
  openAiModel: import.meta.env.VITE_OPENAI_MODEL ?? 'gpt-4o-mini',
  browserMcpEnabled: import.meta.env.VITE_BROWSER_MCP_ENABLED === 'true',
  browserMcpCommand: import.meta.env.VITE_BROWSER_MCP_COMMAND ?? '',
  browserMcpArgs: import.meta.env.VITE_BROWSER_MCP_ARGS ?? '',
  context7Enabled: import.meta.env.VITE_CONTEXT7_MCP_ENABLED === 'true',
  context7Command: import.meta.env.VITE_CONTEXT7_MCP_COMMAND ?? '',
  context7Args: import.meta.env.VITE_CONTEXT7_MCP_ARGS ?? '',
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
  setBrowserMcpConfig: (config) =>
    set((state) => ({
      browserMcpEnabled: config.enabled ?? state.browserMcpEnabled,
      browserMcpCommand: config.command ?? state.browserMcpCommand,
      browserMcpArgs: config.args ?? state.browserMcpArgs,
    })),
  setContext7Config: (config) =>
    set((state) => ({
      context7Enabled: config.enabled ?? state.context7Enabled,
      context7Command: config.command ?? state.context7Command,
      context7Args: config.args ?? state.context7Args,
    })),
  reset: () => set(defaults),
}));
