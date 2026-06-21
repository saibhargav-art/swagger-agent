import { useCallback } from 'react';
import { useChatStore } from '@/store/chatStore';
import { chatService } from '@/services/ai/ChatService';
import { generateId } from '@/utils/format';

export function useChat() {
  const {
    conversations,
    activeConversationId,
    isStreaming,
    createConversation,
    deleteConversation,
    renameConversation,
    setActiveConversation,
    addMessage,
    getActiveConversation,
  } = useChatStore();

  const activeConversation = getActiveConversation();

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      let convId = activeConversationId;

      // Auto-create conversation if none active
      if (!convId) {
        convId = createConversation();
      }

      // Add user message immediately
      addMessage(convId, {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      });

      // Let the chat service handle the rest
      await chatService.send(convId, content.trim());
    },
    [activeConversationId, isStreaming, createConversation, addMessage]
  );

  const startNewChat = useCallback(() => {
    const id = createConversation();
    return id;
  }, [createConversation]);

  return {
    conversations,
    activeConversation,
    activeConversationId,
    isStreaming,
    sendMessage,
    startNewChat,
    deleteConversation,
    renameConversation,
    setActiveConversation,
  };
}
