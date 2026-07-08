export type MessageRole = 'user' | 'assistant';

export type ToolCallStatus = 'pending' | 'executing' | 'success' | 'error';

export interface ToolCall {
  toolName: string;
  params: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface RuntimeConfirmation {
  runId: string;
  title: string;
  details: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  toolCall?: ToolCall;
  runtimeConfirmation?: RuntimeConfirmation;
  timestamp: number;
  isStreaming?: boolean;
}

export interface PendingToolRequest {
  toolName: string;
  params: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  pendingToolRequest?: PendingToolRequest;
  createdAt: number;
  updatedAt: number;
}
