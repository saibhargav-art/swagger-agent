import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConnectionStatus } from '@/types/connection';

const TOKEN_STORAGE_KEY = 'swagger-agent-webmcp-token';

interface WebMCPState {
  connectionId: string;
  baseUrl: string;
  bearerToken: string;
  status: ConnectionStatus;
  error: string | null;
  appName: string | null;
  setBaseUrl: (baseUrl: string) => void;
  setBearerToken: (bearerToken: string) => void;
  setStatus: (status: ConnectionStatus) => void;
  setError: (error: string | null) => void;
  setAppName: (name?: string | null) => void;
  setConnectionId: (connectionId: string) => void;
  disconnect: () => void;
}

export const useWebMCPStore = create<WebMCPState>()(
  persist(
    (set) => ({
      connectionId: '',
      baseUrl: import.meta.env.VITE_WEBMCP_BASE_URL ?? '',
      bearerToken: readSessionToken(),
      status: 'not-connected',
      error: null,
      appName: null,
      setBaseUrl: (baseUrl: string) =>
        set({
          connectionId: '',
          baseUrl: baseUrl.trim(),
          status: 'not-connected',
          error: null,
          appName: null,
        }),
      setBearerToken: (bearerToken) => {
        const token = bearerToken.trim();
        writeSessionToken(token);
        set({
          connectionId: '',
          bearerToken: token,
          status: 'not-connected',
          error: null,
          appName: null,
        });
      },
      setStatus: (status) => set({ status }),
      setError: (error) => set({ error }),
      setAppName: (name) => set({ appName: name?.trim() || null }),
      setConnectionId: (connectionId) => set({ connectionId }),
      disconnect: () => {
        writeSessionToken('');
        set({
          connectionId: '',
          baseUrl: '',
          bearerToken: '',
          status: 'not-connected',
          error: null,
          appName: null,
        });
      },
    }),
    {
      name: 'swagger-agent-webmcp',
      partialize: (state) => ({
        baseUrl: state.baseUrl,
      }),
    },
  ),
);

function readSessionToken(): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY)?.trim() ?? '';
}

function writeSessionToken(token: string): void {
  if (typeof window === 'undefined') return;
  if (token) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  else window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}
