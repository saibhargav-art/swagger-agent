import type { JSONSchema, JSONValue } from '@strands-agents/sdk'

export type BrowserToolDefinition = {
  name: string
  title?: string
  description?: string
  inputSchema: JSONSchema
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    [key: string]: unknown
  }
}

export type ChatRequest = {
  sessionId: string
  conversationId: string
  executionId: string
  message: string
  activeWorkflow?: {
    status?: string
    nextAction: string
    nextActionInput?: Record<string, JSONValue>
    confirmationRequired?: boolean
    actionLabel?: string
    loadingLabel?: string
    editAction?: string
  }
  tools: BrowserToolDefinition[]
  model?: {
    provider: 'openai' | 'anthropic'
    apiKey: string
    modelId: string
  }
}

export type ChatResponse = { content: string; stopReason?: string }

export type ToolRequestEvent = {
  type: 'tool_request'
  requestId: string
  executionId: string
  tool: BrowserToolDefinition
  input: Record<string, unknown>
}

export type ToolResultRequest = {
  sessionId: string
  requestId: string
  ok: boolean
  result?: JSONValue
  error?: string
}
