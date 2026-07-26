import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConnectionStatus } from '@/types/connection';

export type StrandsModelProvider = 'ollama' | 'openai' | 'bedrock';

const DEFAULT_BROWSER_MCP_COMMAND = 'npx';
const DEFAULT_BROWSER_MCP_ARGS = '--no-install @playwright/mcp --browser chrome --shared-browser-context --save-session';

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
  status: ConnectionStatus;
  statusMessage: string | null;
  checkedAt: number | null;
  setAgentUrl: (agentUrl: string) => void;
  setModelProvider: (modelProvider: StrandsModelProvider) => void;
  setOllamaConfig: (config: { baseUrl?: string; model?: string }) => void;
  setOpenAiConfig: (config: { apiKey?: string; model?: string }) => void;
  setBrowserMcpConfig: (config: { enabled?: boolean; command?: string; args?: string }) => void;
  setContext7Config: (config: { enabled?: boolean; command?: string; args?: string }) => void;
  setConnectionState: (status: ConnectionStatus, message?: string | null) => void;
  disconnect: () => void;
  reset: () => void;
}

type PersistedAgentRuntimeState = Pick<
  AgentRuntimeState,
  | 'agentUrl'
  | 'modelProvider'
  | 'ollamaBaseUrl'
  | 'ollamaModel'
  | 'openAiModel'
  | 'browserMcpEnabled'
  | 'browserMcpCommand'
  | 'browserMcpArgs'
  | 'context7Enabled'
  | 'context7Command'
  | 'context7Args'
>;

const defaults = {
  agentUrl: import.meta.env.VITE_STRANDS_AGENT_URL ?? 'http://127.0.0.1:8787',
  modelProvider: (import.meta.env.VITE_STRANDS_MODEL_PROVIDER as StrandsModelProvider | undefined) ?? 'ollama',
  ollamaBaseUrl: import.meta.env.VITE_OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  ollamaModel: import.meta.env.VITE_OLLAMA_MODEL ?? 'qwen2.5:7b',
  openAiApiKey: '',
  openAiModel: import.meta.env.VITE_OPENAI_MODEL ?? 'gpt-4o-mini',
  browserMcpEnabled: import.meta.env.VITE_BROWSER_MCP_ENABLED !== 'false',
  browserMcpCommand: import.meta.env.VITE_BROWSER_MCP_COMMAND ?? DEFAULT_BROWSER_MCP_COMMAND,
  browserMcpArgs: import.meta.env.VITE_BROWSER_MCP_ARGS ?? DEFAULT_BROWSER_MCP_ARGS,
  context7Enabled: import.meta.env.VITE_CONTEXT7_MCP_ENABLED === 'true',
  context7Command: import.meta.env.VITE_CONTEXT7_MCP_COMMAND ?? '',
  context7Args: import.meta.env.VITE_CONTEXT7_MCP_ARGS ?? '',
};

export const useAgentRuntimeStore = create<AgentRuntimeState>()(
  persist(
    (set) => ({
      ...defaults,
      status: 'not-connected',
      statusMessage: null,
      checkedAt: null,
      setAgentUrl: (agentUrl) => set({ agentUrl: agentUrl.trim(), status: 'not-connected', statusMessage: null }),
      setModelProvider: (modelProvider) => set({ modelProvider, status: 'not-connected', statusMessage: null }),
      setOllamaConfig: (config) =>
        set((state) => ({
          ollamaBaseUrl: config.baseUrl ?? state.ollamaBaseUrl,
          ollamaModel: config.model ?? state.ollamaModel,
          status: 'not-connected',
          statusMessage: null,
        })),
      setOpenAiConfig: (config) =>
        set((state) => ({
          openAiApiKey: config.apiKey ?? state.openAiApiKey,
          openAiModel: config.model ?? state.openAiModel,
          status: 'not-connected',
          statusMessage: null,
        })),
      setBrowserMcpConfig: (config) =>
        set((state) => ({
          browserMcpEnabled: config.enabled ?? state.browserMcpEnabled,
          browserMcpCommand:
            config.command ?? (config.enabled === true && !state.browserMcpCommand ? DEFAULT_BROWSER_MCP_COMMAND : state.browserMcpCommand),
          browserMcpArgs:
            config.args ?? (config.enabled === true && !state.browserMcpArgs ? DEFAULT_BROWSER_MCP_ARGS : state.browserMcpArgs),
          status: 'not-connected',
          statusMessage: null,
        })),
      setContext7Config: (config) =>
        set((state) => ({
          context7Enabled: config.enabled ?? state.context7Enabled,
          context7Command: config.command ?? state.context7Command,
          context7Args: config.args ?? state.context7Args,
          status: 'not-connected',
          statusMessage: null,
        })),
      setConnectionState: (status, statusMessage = null) => set({
        status,
        statusMessage,
        checkedAt: status === 'connecting' ? null : Date.now(),
      }),
      disconnect: () => set({
        status: 'not-connected',
        statusMessage: null,
        checkedAt: null,
        openAiApiKey: '',
      }),
      reset: () => set({
        ...defaults,
        status: 'not-connected',
        statusMessage: null,
        checkedAt: null,
      }),
    }),
    {
      name: 'swagger-agent-runtime',
      version: 3,
      migrate: (persistedState) => {
        const state = persistedState as Partial<PersistedAgentRuntimeState>;
        const usesLegacyBrowserMcp = state.browserMcpArgs?.includes('@browsermcp/mcp');
        const migratedAgentUrl = state.agentUrl?.replace('://localhost:', '://127.0.0.1:');

        return {
          agentUrl: migratedAgentUrl ?? defaults.agentUrl,
          modelProvider: state.modelProvider ?? defaults.modelProvider,
          ollamaBaseUrl: state.ollamaBaseUrl ?? defaults.ollamaBaseUrl,
          ollamaModel: state.ollamaModel ?? defaults.ollamaModel,
          openAiModel: state.openAiModel ?? defaults.openAiModel,
          browserMcpEnabled: state.browserMcpEnabled ?? defaults.browserMcpEnabled,
          browserMcpCommand: usesLegacyBrowserMcp
            ? DEFAULT_BROWSER_MCP_COMMAND
            : state.browserMcpCommand ?? defaults.browserMcpCommand,
          browserMcpArgs: usesLegacyBrowserMcp
            ? DEFAULT_BROWSER_MCP_ARGS
            : state.browserMcpArgs ?? defaults.browserMcpArgs,
          context7Enabled: state.context7Enabled ?? defaults.context7Enabled,
          context7Command: state.context7Command ?? defaults.context7Command,
          context7Args: state.context7Args ?? defaults.context7Args,
        };
      },
      partialize: (state) => ({
        agentUrl: state.agentUrl,
        modelProvider: state.modelProvider,
        ollamaBaseUrl: state.ollamaBaseUrl,
        ollamaModel: state.ollamaModel,
        openAiModel: state.openAiModel,
        browserMcpEnabled: state.browserMcpEnabled,
        browserMcpCommand: state.browserMcpCommand,
        browserMcpArgs: state.browserMcpArgs,
        context7Enabled: state.context7Enabled,
        context7Command: state.context7Command,
        context7Args: state.context7Args,
      }),
    },
  ),
);
