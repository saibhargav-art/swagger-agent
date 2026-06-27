import { create } from 'zustand';
import type { Tool } from '@/types/tool';

interface ToolState {
  tools: Tool[];
  isLoading: boolean;
  error: string | null;
  setTools: (tools: Tool[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useToolStore = create<ToolState>()((set) => ({
  tools: [],
  isLoading: false,
  error: null,
  setTools: (tools) => set({ tools }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
