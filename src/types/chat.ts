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

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  toolCall?: ToolCall;
  timestamp: number;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
