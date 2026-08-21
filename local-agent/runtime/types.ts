import type { LocalAgentConfig } from '../config.js'
export type RunAgentInput = {
  message: string
  conversationId?: string
  modelProvider?: LocalAgentConfig['modelProvider']
  openAiApiKey?: string
  openAiModel?: string
  anthropicApiKey?: string
  anthropicModel?: string
  customerConnectionId?: string
  webmcpBaseUrl?: string
  webmcpBearerToken?: string
  webmcpAuthHeader?: string
  webmcpAuthValue?: string
  allowWebMcpWrites?: boolean
}

export type ConfirmPendingActionInput = {
  conversationId: string
  approved: boolean
  kind?: 'write'
  webmcpBearerToken?: string
  webmcpAuthHeader?: string
  webmcpAuthValue?: string
}

export type AgentTraceStep = {
  type: 'tool'
  name: string
  input?: unknown
  result?: unknown
  ok: boolean
  status?: 'success' | 'error' | 'attention'
}

export type RunAgentResult = {
  content: string
  stopReason?: string
  trace?: AgentTraceStep[]
  confirmationRequired?: {
    runId: string
    toolName: string
    title: string
    details: Record<string, unknown>
    kind?: 'write'
    confirmLabel?: string
    cancelLabel?: string
  }
}
