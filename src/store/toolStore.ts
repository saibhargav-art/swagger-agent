import { create } from 'zustand';
import type { Tool, ToolActivity, ActivityStatus } from '@/types/tool';

interface ToolState {
  tools: Tool[];
  activities: ToolActivity[];
  isLoading: boolean;
  error: string | null;

  setTools: (tools: Tool[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  addActivity: (activity: ToolActivity) => void;
  updateActivity: (
    id: string,
    updates: Partial<Omit<ToolActivity, 'id' | 'toolName' | 'timestamp'>> & {
      status?: ActivityStatus;
    }
  ) => void;
  clearActivities: () => void;
}

export const useToolStore = create<ToolState>()((set) => ({
  tools: [],
  activities: [],
  isLoading: false,
  error: null,

  setTools: (tools) => set({ tools }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  addActivity: (activity) =>
    set((s) => ({
      // Keep latest 50 activities
      activities: [activity, ...s.activities].slice(0, 50),
    })),

  updateActivity: (id, updates) =>
    set((s) => ({
      activities: s.activities.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),

  clearActivities: () => set({ activities: [] }),
}));
