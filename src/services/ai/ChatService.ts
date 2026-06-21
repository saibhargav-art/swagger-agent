import { providerManager } from './ProviderManager';
import { webMCPService } from '@/services/webmcp/WebMCPService';
import { useChatStore } from '@/store/chatStore';
import { useProviderStore } from '@/store/providerStore';
import { useToolStore } from '@/store/toolStore';
import { generateId } from '@/utils/format';
import type { Tool } from '@/types/tool';
import type { ChatMessage } from '@/providers/types';

// Instructs the AI how to call tools
function buildSystemPrompt(tools: Tool[]): string {
  if (tools.length === 0) return 'You are a helpful AI assistant.';

  const list = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');

  return `You are a helpful AI assistant with access to the following tools:

${list}

When you need to execute a tool, include a tool_call block in your response:
<tool_call>{"tool": "toolName", "params": {"key": "value"}}</tool_call>

Rules:
- Before the tool_call, briefly describe what you are doing in plain language.
- Only call one tool per response.
- If no tool is needed, respond normally without a tool_call block.`;
}

function parseToolCall(
  text: string
): { tool: string; params: Record<string, unknown> } | null {
  const match = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

// Strip tool_call XML from display text
function toDisplayContent(text: string): string {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
}

export class ChatService {
  async send(conversationId: string, userContent: string): Promise<void> {
    const { conversations, addMessage, updateMessage, setStreaming } =
      useChatStore.getState();
    const { activeProviderId, configs } = useProviderStore.getState();
    const { tools, addActivity, updateActivity } = useToolStore.getState();

    const conversation = conversations.find((c) => c.id === conversationId);
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
      const provider = providerManager.getProvider(activeProviderId, configs);

      if (!provider.isConfigured()) {
        updateMessage(conversationId, assistantMsgId, {
          content:
            'Provider not configured. Go to **Settings** to add an API key.',
          isStreaming: false,
        });
        return;
      }

      // Build messages for the API call
      const history: ChatMessage[] = conversation.messages
        .filter((m) => !m.isStreaming)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const apiMessages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(tools) },
        ...history,
        { role: 'user', content: userContent },
      ];

      // Stream the response
      let fullContent = '';

      for await (const chunk of provider.stream(apiMessages)) {
        if (chunk.done) break;
        if (chunk.text) {
          fullContent += chunk.text;
          updateMessage(conversationId, assistantMsgId, {
            content: toDisplayContent(fullContent) || fullContent,
          });
        }
      }

      // Check for a tool call in the complete response
      const toolCall = parseToolCall(fullContent);

      if (toolCall) {
        const startedAt = Date.now();
        const activityId = generateId();

        // Show executing state in message
        updateMessage(conversationId, assistantMsgId, {
          content: toDisplayContent(fullContent),
          toolCall: {
            toolName: toolCall.tool,
            params: toolCall.params,
            status: 'executing',
            startedAt,
          },
          isStreaming: false,
        });

        addActivity({
          id: activityId,
          toolName: toolCall.tool,
          status: 'executing',
          timestamp: startedAt,
        });

        try {
          const result = await webMCPService.executeTool(
            toolCall.tool,
            toolCall.params
          );
          const duration = Date.now() - startedAt;

          updateMessage(conversationId, assistantMsgId, {
            toolCall: {
              toolName: toolCall.tool,
              params: toolCall.params,
              status: 'success',
              result,
              startedAt,
              completedAt: Date.now(),
            },
          });

          updateActivity(activityId, { status: 'success', result, duration });
        } catch (err) {
          const error =
            err instanceof Error ? err.message : 'Tool execution failed';
          updateMessage(conversationId, assistantMsgId, {
            toolCall: {
              toolName: toolCall.tool,
              params: toolCall.params,
              status: 'error',
              error,
              startedAt,
              completedAt: Date.now(),
            },
          });
          updateActivity(activityId, {
            status: 'error',
            error,
            duration: Date.now() - startedAt,
          });
        }
      } else {
        updateMessage(conversationId, assistantMsgId, {
          content: fullContent,
          isStreaming: false,
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'An error occurred';
      updateMessage(conversationId, assistantMsgId, {
        content: `Error: ${error}`,
        isStreaming: false,
      });
    } finally {
      setStreaming(false);
      updateMessage(conversationId, assistantMsgId, { isStreaming: false });
    }
  }
}

export const chatService = new ChatService();
