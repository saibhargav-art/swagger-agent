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

export interface ToolFormField {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  enum?: string[];
  options?: Array<{ label: string; value: string }>;
}

export interface ToolForm {
  toolName: string;
  title: string;
  description?: string;
  mode?: 'input' | 'confirm';
  fields: ToolFormField[];
  initialParams?: Record<string, unknown>;
  confirmationDetails?: Record<string, unknown>;
}

export interface ToolOption {
  toolName: string;
  title: string;
  description?: string;
  fields: ToolFormField[];
  initialParams?: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  toolCall?: ToolCall;
  toolForm?: ToolForm;
  toolOptions?: ToolOption[];
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
