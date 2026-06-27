import { create } from 'zustand';
import type { ProviderId, ProviderConfigs } from '@/types/provider';
import { DEFAULT_CONFIGS } from '@/types/provider';

interface ProviderState {
  activeProviderId: ProviderId;
  configs: ProviderConfigs;
  connectionStatus: Record<ProviderId, 'connected' | 'error' | 'not-connected'>;
  connectionError: Partial<Record<ProviderId, string>>;
  availableModels: Record<ProviderId, string[]>;

  setActiveProvider: (id: ProviderId) => void;
  updateConfig: <T extends ProviderId>(
    id: T,
    updates: Partial<ProviderConfigs[T]>
  ) => void;
  setProviderConnectionStatus: (id: ProviderId, status: 'connected' | 'error' | 'not-connected') => void;
  setProviderConnectionError: (id: ProviderId, error: string | null) => void;
  setAvailableModels: (id: ProviderId, models: string[]) => void;
  disconnectProvider: (id: ProviderId) => void;
}

export const useProviderStore = create<ProviderState>()((set) => ({
  activeProviderId: 'openai',
  configs: DEFAULT_CONFIGS,
  connectionStatus: {
    openai: 'not-connected',
    claude: 'not-connected',
    gemini: 'not-connected',
    ollama: 'not-connected',
  },
  connectionError: {},
  availableModels: {
    openai: [],
    claude: [],
    gemini: [],
    ollama: [],
  },

  setActiveProvider: (activeProviderId) => set({ activeProviderId }),

  updateConfig: (id, updates) => {
    set((s) => ({
      configs: {
        ...s.configs,
        [id]: { ...s.configs[id], ...updates },
      },
      connectionStatus: {
        ...s.connectionStatus,
        [id]: 'not-connected',
      },
      connectionError: {
        ...s.connectionError,
        [id]: undefined,
      },
      availableModels: {
        ...s.availableModels,
        [id]: [],
      },
    }));
  },
  setProviderConnectionStatus: (id, status) =>
    set((s) => ({
      connectionStatus: { ...s.connectionStatus, [id]: status },
    })),
  setProviderConnectionError: (id, error) =>
    set((s) => ({
      connectionError: { ...s.connectionError, [id]: error ?? undefined },
    })),
  setAvailableModels: (id, models) =>
    set((s) => ({
      availableModels: { ...s.availableModels, [id]: models },
    })),
  disconnectProvider: (id) =>
    set((s) => ({
      connectionStatus: { ...s.connectionStatus, [id]: 'not-connected' },
      connectionError: { ...s.connectionError, [id]: undefined },
      availableModels: { ...s.availableModels, [id]: [] },
    })),
}));
