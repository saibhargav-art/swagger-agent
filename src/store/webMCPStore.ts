import { create } from 'zustand';

interface WebMCPState {
  baseUrl: string;
  status: 'connected' | 'error' | 'not-connected';
  error: string | null;
  toolCount: number;
  setBaseUrl: (baseUrl: string) => void;
  setStatus: (status: 'connected' | 'error' | 'not-connected') => void;
  setError: (error: string | null) => void;
  setToolCount: (count: number) => void;
}

export const useWebMCPStore = create<WebMCPState>()((set) => ({
  baseUrl: import.meta.env.VITE_WEBMCP_BASE_URL ?? '',
  status: 'not-connected',
  error: null,
  toolCount: 0,
  setBaseUrl: (baseUrl: string) => set({ baseUrl: baseUrl.trim() }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setToolCount: (toolCount) => set({ toolCount }),
}));
