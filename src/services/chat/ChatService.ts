import { strandsLocalRuntime } from '@/services/runtime';
import { useChatStore } from '@/store/chatStore';
import { generateId } from '@/utils/format';

export class ChatService {
  async send(conversationId: string, userContent: string): Promise<void> {
    const { conversations, addMessage, updateMessage, setStreaming } = useChatStore.getState();
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    for (const message of conversation.messages) {
      if (message.runtimeConfirmation) {
        updateMessage(conversationId, message.id, { runtimeConfirmation: undefined });
      }
    }

    const assistantMessageId = generateId();
    let assistantAdded = false;
    const ensureAssistantMessage = () => {
      if (assistantAdded) return;
      addMessage(conversationId, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      });
      assistantAdded = true;
    };
    setStreaming(true);

    try {
      for await (const event of strandsLocalRuntime.send({ conversationId, message: userContent })) {
        ensureAssistantMessage();
        if (event.type === 'text') {
          updateMessage(conversationId, assistantMessageId, {
            content: event.text,
            runtimeConfirmation: undefined,
            isStreaming: false,
          });
        }
        if (event.type === 'confirmation-required') {
          updateMessage(conversationId, assistantMessageId, {
            runtimeConfirmation: {
              runId: event.runId,
              title: event.title,
              details: event.details,
              kind: event.kind,
              confirmLabel: event.confirmLabel,
              cancelLabel: event.cancelLabel,
            },
            isStreaming: false,
          });
        }
        if (event.type === 'trace') {
          updateMessage(conversationId, assistantMessageId, { runtimeTrace: event.steps });
        }
        if (event.type === 'error') {
          updateMessage(conversationId, assistantMessageId, {
            content: `Local agent error: ${event.message}`,
            runtimeConfirmation: undefined,
            isStreaming: false,
          });
        }
      }
    } catch (error) {
      ensureAssistantMessage();
      updateMessage(conversationId, assistantMessageId, {
        content: error instanceof TypeError
          ? 'The local agent is unavailable. Start it with `npm run agent:server`, then try again.'
          : `Local agent error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        runtimeConfirmation: undefined,
        isStreaming: false,
      });
    } finally {
      setStreaming(false);
      if (assistantAdded) {
        updateMessage(conversationId, assistantMessageId, { isStreaming: false });
      }
    }
  }
}

export const chatService = new ChatService();
