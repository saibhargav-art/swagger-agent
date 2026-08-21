export type AgentRuntimeKind = 'strands-local'

export type AgentRuntimeRequest = {
  message: string
  conversationId?: string
}

export type AgentRuntimeTraceStep = {
  type: 'tool'
  name: string
  input?: unknown
  result?: unknown
  ok: boolean
  status?: 'success' | 'error' | 'attention'
}

export type AgentRuntimeEvent =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'confirmation-required'
      runId: string
      title: string
      details: Record<string, unknown>
      kind?: 'write'
      confirmLabel?: string
      cancelLabel?: string
    }
  | {
      type: 'trace'
      steps: AgentRuntimeTraceStep[]
    }
  | {
      type: 'done'
    }
  | {
      type: 'error'
      message: string
    }

export interface AgentRuntime {
  readonly kind: AgentRuntimeKind
  send(request: AgentRuntimeRequest): AsyncIterable<AgentRuntimeEvent>
}
