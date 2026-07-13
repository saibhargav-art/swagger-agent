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
}

export type AgentRuntimeEvent =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'tool-start'
      toolName: string
      title?: string
    }
  | {
      type: 'tool-result'
      toolName: string
      title?: string
      result: unknown
    }
  | {
      type: 'confirmation-required'
      runId: string
      title: string
      details: Record<string, unknown>
    }
  | {
      type: 'trace'
      steps: AgentRuntimeTraceStep[]
    }
  | {
      type: 'choice-required'
      runId: string
      title: string
      options: Array<{
        id: string
        label: string
        description?: string
        value: unknown
      }>
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
  approve(runId: string): Promise<void>
  reject(runId: string): Promise<void>
  choose(runId: string, optionId: string): Promise<void>
  cancel(runId: string): Promise<void>
}
