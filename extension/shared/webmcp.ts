export type WebMcpTool = {
  name: string
  title?: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean; [key: string]: unknown }
}

export type WebMcpProperty = {
  type?: string
  title?: string
  description?: string
  enum?: Array<string | number | boolean>
  default?: unknown
}

export type WebMcpRequest =
  | { type: 'webmcp:list'; tabId: number }
  | { type: 'webmcp:execute'; tabId: number; toolName: string; input: Record<string, unknown> }

export type WebMcpResponse<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: string }
