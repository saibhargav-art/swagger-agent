import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConnectionStatus } from '@/types/connection';

const TOKEN_STORAGE_KEY = 'swagger-agent-webmcp-token';

interface WebMCPState {
  connectionId: string;
  baseUrl: string;
  loginUrl: string;
  bearerToken: string;
  status: ConnectionStatus;
  error: string | null;
  toolCount: number;
  appName: string | null;
  appDescription: string | null;
  uiHints: Record<string, unknown> | null;
  setBaseUrl: (baseUrl: string) => void;
  setLoginUrl: (loginUrl: string) => void;
  setBearerToken: (bearerToken: string) => void;
  checkedAt: number | null;
  setStatus: (status: ConnectionStatus) => void;
  setError: (error: string | null) => void;
  setToolCount: (count: number) => void;
  setAppInfo: (info: { name?: string | null; description?: string | null; uiHints?: Record<string, unknown> | null }) => void;
  setConnectionId: (connectionId: string) => void;
  disconnect: () => void;
}

export const useWebMCPStore = create<WebMCPState>()(
  persist(
    (set) => ({
      connectionId: '',
      baseUrl: import.meta.env.VITE_WEBMCP_BASE_URL ?? '',
      loginUrl: import.meta.env.VITE_WEBMCP_LOGIN_URL ?? '',
      bearerToken: readSessionToken(),
      status: 'not-connected',
      error: null,
      checkedAt: null,
      toolCount: 0,
      appName: null,
      appDescription: null,
      uiHints: null,
      setBaseUrl: (baseUrl: string) =>
        set({
          connectionId: '',
          baseUrl: baseUrl.trim(),
          status: 'not-connected',
          error: null,
          toolCount: 0,
          appName: null,
          appDescription: null,
          uiHints: null,
          checkedAt: null,
        }),
      setLoginUrl: (loginUrl: string) => set({ loginUrl: loginUrl.trim() }),
      setBearerToken: (bearerToken) => {
        const token = bearerToken.trim();
        writeSessionToken(token);
        set({ connectionId: '', bearerToken: token, status: 'not-connected', error: null, checkedAt: null, uiHints: null });
      },
      setStatus: (status) => set({ status, checkedAt: status === 'connecting' ? null : Date.now() }),
      setError: (error) => set({ error }),
      setToolCount: (toolCount) => set({ toolCount }),
      setAppInfo: (info) =>
        set({
          appName: info.name?.trim() || null,
          appDescription: info.description?.trim() || null,
          uiHints: info.uiHints ?? null,
        }),
      setConnectionId: (connectionId) => set({ connectionId }),
      disconnect: () => {
        writeSessionToken('');
        set({
          connectionId: '',
          baseUrl: '',
          loginUrl: '',
          bearerToken: '',
          status: 'not-connected',
          error: null,
          toolCount: 0,
          appName: null,
          appDescription: null,
          uiHints: null,
          checkedAt: null,
        });
      },
    }),
    {
      name: 'swagger-agent-webmcp',
      partialize: (state) => ({
        baseUrl: state.baseUrl,
        loginUrl: state.loginUrl,
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
