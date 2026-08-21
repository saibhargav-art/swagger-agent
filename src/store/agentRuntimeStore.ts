import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConnectionStatus } from '@/types/connection';

const OPENAI_KEY_STORAGE_KEY = 'swagger-agent-openai-key';
const ANTHROPIC_KEY_STORAGE_KEY = 'swagger-agent-anthropic-key';

export type StrandsModelProvider = 'openai' | 'anthropic';

interface AgentRuntimeState {
  agentUrl: string;
  modelProvider: StrandsModelProvider;
  openAiApiKey: string;
  openAiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  status: ConnectionStatus;
  statusMessage: string | null;
  checkedAt: number | null;
  setAgentUrl: (agentUrl: string) => void;
  setModelProvider: (modelProvider: StrandsModelProvider) => void;
  setOpenAiConfig: (config: { apiKey?: string; model?: string }) => void;
  setAnthropicConfig: (config: { apiKey?: string; model?: string }) => void;
  setConnectionState: (status: ConnectionStatus, message?: string | null) => void;
  disconnect: () => void;
  reset: () => void;
}

type PersistedAgentRuntimeState = Pick<
  AgentRuntimeState,
  | 'agentUrl'
  | 'modelProvider'
  | 'openAiModel'
  | 'anthropicModel'
>;

const defaults = {
  agentUrl: import.meta.env.VITE_STRANDS_AGENT_URL ?? 'http://127.0.0.1:8787',
  modelProvider: normalizeModelProvider(import.meta.env.VITE_STRANDS_MODEL_PROVIDER),
  openAiApiKey: readSessionSecret(OPENAI_KEY_STORAGE_KEY),
  openAiModel: import.meta.env.VITE_OPENAI_MODEL ?? 'gpt-4o-mini',
  anthropicApiKey: readSessionSecret(ANTHROPIC_KEY_STORAGE_KEY),
  anthropicModel: import.meta.env.VITE_ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest',
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
      setOpenAiConfig: (config) =>
        set((state) => {
          const openAiApiKey = config.apiKey ?? state.openAiApiKey;
          if (config.apiKey !== undefined) writeSessionSecret(OPENAI_KEY_STORAGE_KEY, openAiApiKey);
          return {
            openAiApiKey,
            openAiModel: config.model ?? state.openAiModel,
            status: 'not-connected',
            statusMessage: null,
          };
        }),
      setAnthropicConfig: (config) =>
        set((state) => {
          const anthropicApiKey = config.apiKey ?? state.anthropicApiKey;
          if (config.apiKey !== undefined) writeSessionSecret(ANTHROPIC_KEY_STORAGE_KEY, anthropicApiKey);
          return {
            anthropicApiKey,
            anthropicModel: config.model ?? state.anthropicModel,
            status: 'not-connected',
            statusMessage: null,
          };
        }),
      setConnectionState: (status, statusMessage = null) => set({
        status,
        statusMessage,
        checkedAt: status === 'connecting' ? null : Date.now(),
      }),
      disconnect: () => {
        writeSessionSecret(OPENAI_KEY_STORAGE_KEY, '');
        writeSessionSecret(ANTHROPIC_KEY_STORAGE_KEY, '');
        set({
          status: 'not-connected',
          statusMessage: null,
          checkedAt: null,
          openAiApiKey: '',
          anthropicApiKey: '',
        });
      },
      reset: () => {
        writeSessionSecret(OPENAI_KEY_STORAGE_KEY, '');
        writeSessionSecret(ANTHROPIC_KEY_STORAGE_KEY, '');
        set({
          ...defaults,
          openAiApiKey: '',
          anthropicApiKey: '',
          status: 'not-connected',
          statusMessage: null,
          checkedAt: null,
        });
      },
    }),
    {
      name: 'swagger-agent-runtime',
      version: 4,
      migrate: (persistedState) => {
        const state = persistedState as Partial<PersistedAgentRuntimeState>;
        const migratedAgentUrl = state.agentUrl?.replace('://localhost:', '://127.0.0.1:');

        return {
          agentUrl: migratedAgentUrl ?? defaults.agentUrl,
          modelProvider: normalizeModelProvider(state.modelProvider),
          openAiModel: state.openAiModel ?? defaults.openAiModel,
          anthropicModel: state.anthropicModel ?? defaults.anthropicModel,
        };
      },
      partialize: (state) => ({
        agentUrl: state.agentUrl,
        modelProvider: state.modelProvider,
        openAiModel: state.openAiModel,
        anthropicModel: state.anthropicModel,
      }),
    },
  ),
);

function normalizeModelProvider(value: unknown): StrandsModelProvider {
  return value === 'anthropic' ? 'anthropic' : 'openai';
}

function readSessionSecret(key: string): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(key)?.trim() ?? '';
}

function writeSessionSecret(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = value.trim();
  if (trimmed) window.sessionStorage.setItem(key, trimmed);
  else window.sessionStorage.removeItem(key);
}
