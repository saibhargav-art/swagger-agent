import type { WebMcpTool } from '../shared/webmcp'

const AGENT_URL = 'http://127.0.0.1:8787'

export type ToolRequest = {
  type: 'tool_request'
  requestId: string
  executionId: string
  tool: WebMcpTool
  input: Record<string, unknown>
}

export type ModelSettings = {
  provider: 'openai' | 'anthropic'
  apiKey: string
  modelId: string
}

export type ActiveWorkflow = {
  status?: string
  nextAction: string
  nextActionInput?: Record<string, unknown>
  confirmationRequired?: boolean
  actionLabel?: string
  loadingLabel?: string
  editAction?: string
}

export function connectAgent(
  sessionId: string,
  onRequest: (request: ToolRequest) => void,
  onStatus: (connected: boolean) => void,
): () => void {
  const source = new EventSource(`${AGENT_URL}/events?sessionId=${encodeURIComponent(sessionId)}`)
  source.onopen = () => onStatus(true)
  source.onerror = () => onStatus(false)
  source.addEventListener('tool_request', (event) => {
    onRequest(JSON.parse((event as MessageEvent<string>).data) as ToolRequest)
  })
  return () => source.close()
}

export async function sendMessage(
  sessionId: string,
  conversationId: string,
  executionId: string,
  message: string,
  tools: WebMcpTool[],
  model: ModelSettings,
  activeWorkflow?: ActiveWorkflow,
): Promise<string> {
  const response = await fetch(`${AGENT_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      conversationId,
      executionId,
      message,
      activeWorkflow,
      tools: tools.map((tool) => ({
        ...tool,
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      })),
      model,
    }),
  })
  const body = await response.json() as { content?: string; error?: string }
  if (!response.ok) throw new Error(body.error || 'The agent request failed.')
  return body.content || 'Completed.'
}

export async function returnToolResult(
  sessionId: string,
  requestId: string,
  result: { ok: boolean; result?: unknown; error?: string },
): Promise<void> {
  const response = await fetch(`${AGENT_URL}/tool-results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, requestId, ...result }),
  })
  if (!response.ok) throw new Error('Could not return the tool result to Strands.')
}
