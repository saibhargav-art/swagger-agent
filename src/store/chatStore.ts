import { create } from 'zustand';
import type { Conversation, Message } from '@/types/chat';
import { generateId } from '@/utils/format';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isStreaming: boolean;

  // Conversation actions
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setActiveConversation: (id: string | null) => void;

  // Message actions
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (
    conversationId: string,
    messageId: string,
    updates: Partial<Message>
  ) => void;

  setStreaming: (streaming: boolean) => void;

  // Derived
  getActiveConversation: () => Conversation | undefined;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isStreaming: false,

  createConversation: () => {
    const id = generateId();
    const now = Date.now();
    const conversation: Conversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      conversations: [conversation, ...s.conversations],
      activeConversationId: id,
    }));
    return id;
  },

  deleteConversation: (id) => {
    set((s) => {
      const filtered = s.conversations.filter((c) => c.id !== id);
      const nextActive =
        s.activeConversationId === id
          ? filtered[0]?.id ?? null
          : s.activeConversationId;
      return { conversations: filtered, activeConversationId: nextActive };
    });
  },

  renameConversation: (id, title) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }));
  },

  setActiveConversation: (id) => {
    set({ activeConversationId: id });
  },

  addMessage: (conversationId, message) => {
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        // Auto-title from first user message
        const title =
          c.messages.length === 0 && message.role === 'user'
            ? message.content.slice(0, 40)
            : c.title;
        return {
          ...c,
          title,
          messages: [...c.messages, message],
          updatedAt: Date.now(),
        };
      }),
    }));
  },

  updateMessage: (conversationId, messageId, updates) => {
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.id === messageId ? { ...m, ...updates } : m
          ),
          updatedAt: Date.now(),
        };
      }),
    }));
  },

  setStreaming: (isStreaming) => set({ isStreaming }),

  getActiveConversation: () => {
    const { conversations, activeConversationId } = get();
    return conversations.find((c) => c.id === activeConversationId);
  },
}));
