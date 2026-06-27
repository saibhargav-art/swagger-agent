import { create } from 'zustand';

interface WebMCPState {
  baseUrl: string;
  status: 'connected' | 'error' | 'not-connected';
  error: string | null;
  toolCount: number;
  appName: string | null;
  appDescription: string | null;
  setBaseUrl: (baseUrl: string) => void;
  setStatus: (status: 'connected' | 'error' | 'not-connected') => void;
  setError: (error: string | null) => void;
  setToolCount: (count: number) => void;
  setAppInfo: (info: { name?: string | null; description?: string | null }) => void;
  disconnect: () => void;
}

export const useWebMCPStore = create<WebMCPState>()((set) => ({
  baseUrl: import.meta.env.VITE_WEBMCP_BASE_URL ?? '',
  status: 'not-connected',
  error: null,
  toolCount: 0,
  appName: null,
  appDescription: null,
  setBaseUrl: (baseUrl: string) =>
    set({
      baseUrl: baseUrl.trim(),
      status: 'not-connected',
      error: null,
      toolCount: 0,
      appName: null,
      appDescription: null,
    }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setToolCount: (toolCount) => set({ toolCount }),
  setAppInfo: (info) =>
    set({
      appName: info.name?.trim() || null,
      appDescription: info.description?.trim() || null,
    }),
  disconnect: () =>
    set({
      baseUrl: '',
      status: 'not-connected',
      error: null,
      toolCount: 0,
      appName: null,
      appDescription: null,
    }),
}));
