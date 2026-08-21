export type MessageRole = 'user' | 'assistant';

export interface RuntimeConfirmation {
  runId: string;
  title: string;
  details: Record<string, unknown>;
  kind?: 'write';
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface RuntimeTraceStep {
  type: 'tool';
  name: string;
  input?: unknown;
  result?: unknown;
  ok: boolean;
  status?: 'success' | 'error' | 'attention';
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  runtimeTrace?: RuntimeTraceStep[];
  runtimeConfirmation?: RuntimeConfirmation;
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
