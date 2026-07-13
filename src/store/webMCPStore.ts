import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WebMCPState {
  baseUrl: string;
  loginUrl: string;
  authMode: 'bearer' | 'browser-session';
  bearerToken: string;
  status: 'connected' | 'error' | 'not-connected';
  error: string | null;
  toolCount: number;
  appName: string | null;
  appDescription: string | null;
  setBaseUrl: (baseUrl: string) => void;
  setLoginUrl: (loginUrl: string) => void;
  setAuthConfig: (config: { authMode: 'bearer' | 'browser-session'; bearerToken?: string }) => void;
  setStatus: (status: 'connected' | 'error' | 'not-connected') => void;
  setError: (error: string | null) => void;
  setToolCount: (count: number) => void;
  setAppInfo: (info: { name?: string | null; description?: string | null }) => void;
  disconnect: () => void;
}

export const useWebMCPStore = create<WebMCPState>()(
  persist(
    (set) => ({
      baseUrl: import.meta.env.VITE_WEBMCP_BASE_URL ?? '',
      loginUrl: import.meta.env.VITE_WEBMCP_LOGIN_URL ?? '',
      authMode: 'bearer',
      bearerToken: '',
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
      setLoginUrl: (loginUrl: string) => set({ loginUrl: loginUrl.trim() }),
      setAuthConfig: (config) =>
        set({
          authMode: config.authMode,
          bearerToken: config.bearerToken?.trim() ?? '',
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
          loginUrl: '',
          authMode: 'bearer',
          bearerToken: '',
          status: 'not-connected',
          error: null,
          toolCount: 0,
          appName: null,
          appDescription: null,
        }),
    }),
    {
      name: 'swagger-agent-webmcp',
      partialize: (state) => ({
        baseUrl: state.baseUrl,
        loginUrl: state.loginUrl,
        authMode: state.authMode,
      }),
    },
  ),
);
