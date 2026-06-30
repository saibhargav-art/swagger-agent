import { providerManager } from './ProviderManager';
import { toolPlanner, type ToolPlan } from '@/services/agent/ToolPlanner';
import { humanizeToolName } from '@/services/agent/AgentText';
import { askForRecordTarget, resolveRequiredId, unresolvedLookupMessage } from '@/services/agent/RecordResolver';
import { applyPromptResultFilterForTool, summarizeToolResult } from '@/services/agent/ResultPresenter';
import { ambiguousToolOptions as buildAmbiguousToolOptions, bestToolMatch } from '@/services/agent/ToolMatcher';
import { extractParamsFromMessage, mergeParams } from '@/services/agent/ToolParams';
import {
  askForMissingFields,
  confirmationDetailsFor,
  getTool,
  isWriteTool,
  missingRequiredFields,
  requiredFields,
  toolForm,
  toolFormWithIdChoices,
  toolOptions as buildToolOptions,
  toolSummary,
  userRequestedWrite,
} from '@/services/agent/ToolRuntime';
import { webMCPService } from '@/services/webmcp/WebMCPService';
import { useChatStore } from '@/store/chatStore';
import { useProviderStore } from '@/store/providerStore';
import { useToolStore } from '@/store/toolStore';
import { useWebMCPStore } from '@/store/webMCPStore';
import { generateId } from '@/utils/format';
import type { Tool } from '@/types/tool';
import type { Conversation, ToolForm, ToolOption } from '@/types/chat';

function toolOptions(tools: Tool[], message = ''): ToolOption[] {
  return buildToolOptions(tools, message, extractParamsFromMessage);
}

function isCancelMessage(message: string): boolean {
  return /^(cancel|stop|never mind|nevermind|clear)$/i.test(message.trim());
}

function isGreeting(message: string): boolean {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening|whats up|what's up)[!. ]*$/i.test(
    message.trim()
  );
}

function isCapabilityQuestion(message: string): boolean {
  return /\b(what can you do|can you do|help|available tools|list tools|what tools|capabilities)\b/i.test(message);
}

function describeTools(tools: Tool[]): string {
  if (tools.length === 0) return 'No actions are available from the connected app yet.';

  const lines = tools
    .slice(0, 8)
    .map((tool) => {
      const required = requiredFields(tool);
      return `- ${humanizeToolName(tool.name)}: ${toolSummary(tool)}${
        required.length ? ` Required: ${required.join(', ')}` : ''
      }`;
    })
    .join('\n');

  return `I can help with these connected app actions:\n${lines}`;
}

function exampleRequests(tools: Tool[]): string {
  const examples = tools.slice(0, 4).map((tool) => {
    const required = requiredFields(tool);
    if (required.length === 0) return `- ${humanizeToolName(tool.name)}`;
    return `- ${humanizeToolName(tool.name)} with ${required.map((field) => `<${field}>`).join(', ')}`;
  });

  return examples.length ? `\n\nTry one of these:\n${examples.join('\n')}` : '';
}

function unsupportedConnectedActionMessage(tools: Tool[]): string {
  if (tools.length === 0) {
    return 'Sorry, I can only help with actions from a connected app. Connect a website first, then I can use its tools.';
  }

  return `Sorry, I can only help with actions from the connected app.\n\n${describeTools(tools)}`;
}

function handleLocalToolOnlyMessage(
  message: string,
  tools: Tool[]
): { content: string; toolOptions?: ToolOption[] } | null {
  if (isGreeting(message)) {
    return {
      content: `Hi. I can help with the app you connected here.\n\n${describeTools(tools)}${exampleRequests(tools)}`,
      toolOptions: toolOptions(tools, message),
    };
  }

  if (isCapabilityQuestion(message)) {
    return {
      content: `${describeTools(tools)}${exampleRequests(tools)}`,
      toolOptions: toolOptions(tools, message),
    };
  }

  return null;
}

export class ChatService {
  private async handleToolPlan({
    conversationId,
    messageId,
    conversation,
    tools,
    plan,
    userContent,
    forcedTool,
  }: {
    conversationId: string;
    messageId: string;
    conversation: Conversation;
    tools: Tool[];
    plan: ToolPlan;
    userContent: string;
    forcedTool?: boolean;
  }): Promise<boolean> {
    const { updateMessage, setPendingToolRequest } = useChatStore.getState();
    if (!plan.tool) return false;
    const toolDefinition = getTool(tools, plan.tool);
    if (!toolDefinition) return false;
    if (typeof plan.confidence === 'number' && plan.confidence < 0.35) return false;
    if (!forcedTool && isWriteTool(toolDefinition) && !userRequestedWrite(userContent)) return false;

    const resolution = await resolveRequiredId(
      conversation,
      tools,
      toolDefinition,
      mergeParams(toolDefinition, {}, { ...extractParamsFromMessage(userContent, toolDefinition), ...plan.params }),
      userContent,
      plan.lookupText
    );
    const params = resolution.params;
    const missing = missingRequiredFields(toolDefinition, params);

    if (missing.length > 0) {
      const lookupMessage = missing.includes('id') ? unresolvedLookupMessage(resolution, toolDefinition) : null;
      setPendingToolRequest(conversationId, {
        toolName: toolDefinition.name,
        params,
      });

      if (lookupMessage) {
        updateMessage(conversationId, messageId, {
          content: lookupMessage,
          isStreaming: false,
        });
        return true;
      }

      if (missing.includes('id') && !resolution.choices?.length) {
        updateMessage(conversationId, messageId, {
          content: askForRecordTarget(toolDefinition),
          isStreaming: false,
        });
        return true;
      }

      const mode: ToolForm['mode'] = isWriteTool(toolDefinition) ? 'confirm' : 'input';
      updateMessage(conversationId, messageId, {
        content: resolution.choices?.length
          ? `I found matching records. Select the record, then ${
              mode === 'confirm' ? 'confirm' : 'execute'
            } ${humanizeToolName(toolDefinition.name).toLowerCase()}.`
          : `${askForMissingFields(toolDefinition, missing)}\n\nComplete the empty fields below.`,
        toolForm: resolution.choices?.length
          ? toolFormWithIdChoices(
              toolDefinition,
              params,
              resolution.choices,
              mode,
              confirmationDetailsFor(params, resolution)
            )
          : toolForm(toolDefinition, params, mode, confirmationDetailsFor(params, resolution)),
        isStreaming: false,
      });
      return true;
    }

    setPendingToolRequest(conversationId, null);

    if (isWriteTool(toolDefinition)) {
      updateMessage(conversationId, messageId, {
        content: `Confirm ${humanizeToolName(toolDefinition.name).toLowerCase()} with these details.`,
        toolForm: toolForm(toolDefinition, params, 'confirm', confirmationDetailsFor(params, resolution)),
        isStreaming: false,
      });
      return true;
    }

    await this.executeToolCall(conversationId, messageId, toolDefinition, params, userContent);
    return true;
  }

  private async executeToolCall(
    conversationId: string,
    messageId: string,
    tool: Tool,
    params: Record<string, unknown>,
    sourceText = ''
  ): Promise<void> {
    const { updateMessage } = useChatStore.getState();
    const startedAt = Date.now();

    updateMessage(conversationId, messageId, {
      content: '',
      toolCall: {
        toolName: tool.name,
        params,
        status: 'executing',
        startedAt,
      },
      isStreaming: false,
    });

    try {
      const rawResult = await webMCPService.executeTool(tool.name, params);
      const result = applyPromptResultFilterForTool(rawResult, sourceText, tool);

      updateMessage(conversationId, messageId, {
        content: summarizeToolResult(tool.name, result),
        toolCall: {
          toolName: tool.name,
          params,
          status: 'success',
          result,
          startedAt,
          completedAt: Date.now(),
        },
      });

    } catch (err) {
      let error = err instanceof Error ? err.message : 'Tool execution failed';
      if (typeof error === 'string' && error.includes('No WebMCP base URL configured')) {
        error = 'No WebMCP base URL configured. Connect your WebMCP URL in Connections to enable tool execution.';
      }

      updateMessage(conversationId, messageId, {
        content: '',
        toolCall: {
          toolName: tool.name,
          params,
          status: 'error',
          error,
          startedAt,
          completedAt: Date.now(),
        },
      });
    }
  }

  async send(conversationId: string, userContent: string): Promise<void> {
    const { conversations, addMessage, updateMessage, setStreaming } =
      useChatStore.getState();
    const { setPendingToolRequest } = useChatStore.getState();
    const { activeProviderId, configs } = useProviderStore.getState();
    const { tools } = useToolStore.getState();

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
      const { status: mcpStatus, baseUrl } = useWebMCPStore.getState();

      if (!provider.isConfigured()) {
        updateMessage(conversationId, assistantMsgId, {
          content:
            'Provider not configured. Go to **Connections** to add credentials and test the provider.',
          isStreaming: false,
        });
        return;
      }

      if (mcpStatus === 'connected' && tools.length === 0) {
        updateMessage(conversationId, assistantMsgId, {
          content:
            'WebMCP tools are still loading. Please wait a moment and try again.',
          isStreaming: false,
        });
        return;
      }

      const pendingTool = conversation.pendingToolRequest;

      if (pendingTool && isCancelMessage(userContent)) {
        setPendingToolRequest(conversationId, null);
        updateMessage(conversationId, assistantMsgId, {
          content: 'Cancelled the pending action.',
          isStreaming: false,
        });
        return;
      }

      const pendingToolDefinition = pendingTool ? getTool(tools, pendingTool.toolName) : undefined;
      if (pendingToolDefinition) {
        const pendingPlan = await toolPlanner.plan(provider, tools, conversation, userContent, {
          forcedTool: pendingToolDefinition,
          knownParams: pendingTool?.params ?? {},
        }).catch(() => null);
        const handled = await this.handleToolPlan({
          conversationId,
          messageId: assistantMsgId,
          conversation,
          tools,
          plan: pendingPlan ?? {
            tool: pendingToolDefinition.name,
            params: mergeParams(
              pendingToolDefinition,
              pendingTool?.params ?? {},
              extractParamsFromMessage(userContent, pendingToolDefinition)
            ),
          },
          userContent,
          forcedTool: true,
        });
        if (handled) return;
      }

      const localResponse = pendingTool ? null : handleLocalToolOnlyMessage(userContent, tools);
      if (localResponse) {
        updateMessage(conversationId, assistantMsgId, {
          content: localResponse.content,
          toolOptions: localResponse.toolOptions,
          isStreaming: false,
        });
        return;
      }

      if (mcpStatus === 'connected' && baseUrl.trim()) {
        updateMessage(conversationId, assistantMsgId, {
          content: 'Selecting an action...',
        });

        try {
          const modelPlan = await toolPlanner.plan(provider, tools, conversation, userContent);
          if (modelPlan) {
            const handled = await this.handleToolPlan({
              conversationId,
              messageId: assistantMsgId,
              conversation,
              tools,
              plan: modelPlan,
              userContent,
            });
            if (handled) return;
          }
        } catch {
          // Fall back to deterministic routing below when the provider cannot produce a valid plan.
        }
      }

      const ambiguousOptions = pendingTool ? [] : buildAmbiguousToolOptions(userContent, tools, extractParamsFromMessage);
      if (ambiguousOptions.length > 1) {
        updateMessage(conversationId, assistantMsgId, {
          content: 'I found multiple matching actions. Which one do you mean?',
          toolOptions: ambiguousOptions,
          isStreaming: false,
        });
        return;
      }

      const directMatch = bestToolMatch(userContent, tools);
      if (directMatch) {
        const handled = await this.handleToolPlan({
          conversationId,
          messageId: assistantMsgId,
          conversation,
          tools,
          plan: {
            tool: directMatch.name,
            params: extractParamsFromMessage(userContent, directMatch),
          },
          userContent,
        });
        if (handled) return;
      }

      updateMessage(conversationId, assistantMsgId, {
        content: unsupportedConnectedActionMessage(tools),
        toolOptions: toolOptions(tools, userContent),
        isStreaming: false,
      });
    } catch (err) {
      let error = err instanceof Error ? err.message : 'An error occurred';
      if (typeof error === 'string' && error.includes('No WebMCP base URL configured')) {
        error = 'No WebMCP base URL configured. Connect your WebMCP URL in Connections to enable tools.';
      }

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
