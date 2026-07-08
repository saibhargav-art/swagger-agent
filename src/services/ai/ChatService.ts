import { strandsLocalRuntime } from '@/services/runtime';
import { useChatStore } from '@/store/chatStore';
import { generateId } from '@/utils/format';

export class ChatService {
  async send(conversationId: string, userContent: string): Promise<void> {
    const { conversations, addMessage, updateMessage, setStreaming } = useChatStore.getState();
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    const assistantMsgId = generateId();
    addMessage(conversationId, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    });

    setStreaming(true);

    try {
      for await (const event of strandsLocalRuntime.send({ conversationId, message: userContent })) {
        if (event.type === 'text') {
          updateMessage(conversationId, assistantMsgId, {
            content: event.text,
            runtimeConfirmation: undefined,
            isStreaming: false,
          });
        }

        if (event.type === 'confirmation-required') {
          updateMessage(conversationId, assistantMsgId, {
            runtimeConfirmation: {
              runId: event.runId,
              title: event.title,
              details: event.details,
            },
            isStreaming: false,
          });
        }

        if (event.type === 'error') {
          updateMessage(conversationId, assistantMsgId, {
            content: `Local Strands agent error: ${event.message}`,
            runtimeConfirmation: undefined,
            isStreaming: false,
          });
        }
      }
    } catch (err) {
      updateMessage(conversationId, assistantMsgId, {
        content:
          err instanceof TypeError
            ? 'Local Strands agent is not running. Start it with `npm run agent:server`, then try again.'
            : `Local Strands agent error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        runtimeConfirmation: undefined,
        isStreaming: false,
      });
    } finally {
      setStreaming(false);
      updateMessage(conversationId, assistantMsgId, { isStreaming: false });
    }
  }
}

export const chatService = new ChatService();
