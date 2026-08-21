import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
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
  cleanupAfterReload: () => void;

  // Derived
  getActiveConversation: () => Conversation | undefined;
}

export const useChatStore = create<ChatState>()(persist((set, get) => ({
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

  cleanupAfterReload: () => {
    set((state) => {
      const conversations = state.conversations
        .map((conversation) => ({
          ...conversation,
          messages: sanitizePersistedMessages(conversation.messages),
        }))
        .filter((conversation) => conversation.messages.length > 0);
      const activeConversationId = conversations.some((conversation) => conversation.id === state.activeConversationId)
        ? state.activeConversationId
        : conversations[0]?.id ?? null;

      return {
        conversations,
        activeConversationId,
        isStreaming: false,
      };
    });
  },

  getActiveConversation: () => {
    const { conversations, activeConversationId } = get();
    return conversations.find((c) => c.id === activeConversationId);
  },
}), {
  name: 'swagger-agent-chat-session',
  storage: createJSONStorage(() => sessionStorage),
  partialize: (state) => ({
    conversations: state.conversations.map((conversation) => ({
      ...conversation,
      messages: sanitizePersistedMessages(conversation.messages),
    })),
    activeConversationId: state.activeConversationId,
  }),
}));

function sanitizePersistedMessages(messages: Message[]): Message[] {
  return messages
    .map((message) => ({
      ...message,
      isStreaming: false,
      runtimeConfirmation: undefined,
      runtimeTrace: undefined,
    }))
    .filter((message) => {
      if (message.role === 'user') return Boolean(message.content.trim());
      return Boolean(message.content.trim());
    });
}
