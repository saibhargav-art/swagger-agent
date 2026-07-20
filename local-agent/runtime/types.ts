import type { LocalAgentConfig } from '../config.js'

export type RunAgentInput = {
  message: string
  conversationId?: string
  modelProvider?: LocalAgentConfig['modelProvider']
  openAiApiKey?: string
  openAiModel?: string
  ollamaBaseUrl?: string
  ollamaModel?: string
  browserMcpEnabled?: boolean
  browserMcpCommand?: string
  browserMcpArgs?: string[]
  context7Enabled?: boolean
  context7Command?: string
  context7Args?: string[]
  customerConnectionId?: string
  webmcpBaseUrl?: string
  webmcpLoginUrl?: string
  browserStartUrl?: string
  chatAppUrl?: string
  webmcpBearerToken?: string
  webmcpAuthHeader?: string
  webmcpAuthValue?: string
  allowWebMcpWrites?: boolean
}

export type ConfirmPendingActionInput = {
  conversationId: string
  approved: boolean
  kind?: 'write' | 'browser-login'
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
    kind?: 'write' | 'browser-login'
    confirmLabel?: string
    cancelLabel?: string
  }
}
