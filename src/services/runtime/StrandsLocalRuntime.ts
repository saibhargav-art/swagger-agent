import type { AgentRuntime, AgentRuntimeEvent, AgentRuntimeRequest } from './AgentRuntime'
import { useWebMCPStore } from '@/store/webMCPStore'
import { useAgentRuntimeStore } from '@/store/agentRuntimeStore'

type StrandsResponse = {
  content?: string
  error?: string
  trace?: Array<{
    type: 'tool'
    name: string
    input?: unknown
    result?: unknown
    ok: boolean
  }>
  confirmationRequired?: {
    runId: string
    title: string
    details: Record<string, unknown>
  }
}

export class StrandsLocalRuntime implements AgentRuntime {
  readonly kind = 'strands-local' as const

  async *send(request: AgentRuntimeRequest): AsyncIterable<AgentRuntimeEvent> {
    const connection = useWebMCPStore.getState()
    const runtime = useAgentRuntimeStore.getState()
    const baseUrl = runtime.agentUrl || 'http://localhost:8787'

    yield { type: 'text', text: 'Thinking with local Strands agent...' }

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestPayload(request, connection, runtime)),
    })

    const payload = await response.json() as StrandsResponse
    if (!response.ok || payload.error) {
      yield {
        type: 'error',
        message: payload.error ?? `Local Strands agent failed with HTTP ${response.status}`,
      }
      return
    }

    yield { type: 'text', text: payload.content ?? 'No response from local Strands agent.' }
    if (payload.trace?.length) {
      yield { type: 'trace', steps: payload.trace }
    }
    if (payload.confirmationRequired) {
      yield {
        type: 'confirmation-required',
        runId: payload.confirmationRequired.runId,
        title: payload.confirmationRequired.title,
        details: payload.confirmationRequired.details,
      }
    }
    yield { type: 'done' }
  }

  async approve(runId: string): Promise<void> {
    await this.resolveConfirmation(runId, true)
  }

  async reject(runId: string): Promise<void> {
    await this.resolveConfirmation(runId, false)
  }

  async choose(): Promise<void> {}
  async cancel(): Promise<void> {}

  async confirm(runId: string, approved: boolean): Promise<StrandsResponse> {
    return this.resolveConfirmation(runId, approved)
  }

  private async resolveConfirmation(runId: string, approved: boolean): Promise<StrandsResponse> {
    const runtime = useAgentRuntimeStore.getState()
    const connection = useWebMCPStore.getState()
    const baseUrl = runtime.agentUrl || 'http://localhost:8787'
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: runId,
        approved,
        webmcpBearerToken: connection.authMode === 'bearer' ? connection.bearerToken : undefined,
      }),
    })

    const payload = await response.json() as StrandsResponse
    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? `Local Strands agent failed with HTTP ${response.status}`)
    }

    return payload
  }
}

export const strandsLocalRuntime = new StrandsLocalRuntime()

function buildRequestPayload(
  request: AgentRuntimeRequest,
  connection: ReturnType<typeof useWebMCPStore.getState>,
  runtime: ReturnType<typeof useAgentRuntimeStore.getState>,
) {
  return {
    message: request.message,
    conversationId: request.conversationId,
    modelProvider: runtime.modelProvider,
    ...(runtime.modelProvider === 'ollama'
      ? {
          ollamaBaseUrl: runtime.ollamaBaseUrl,
          ollamaModel: runtime.ollamaModel,
        }
      : {}),
    ...(runtime.modelProvider === 'openai'
      ? {
          openAiApiKey: runtime.openAiApiKey || undefined,
          openAiModel: runtime.openAiModel,
        }
      : {}),
    browserMcpEnabled: runtime.browserMcpEnabled,
    browserMcpCommand: runtime.browserMcpEnabled ? runtime.browserMcpCommand || undefined : undefined,
    browserMcpArgs: runtime.browserMcpEnabled ? parseArgs(runtime.browserMcpArgs) : [],
    context7Enabled: runtime.context7Enabled,
    context7Command: runtime.context7Enabled ? runtime.context7Command || undefined : undefined,
    context7Args: runtime.context7Enabled ? parseArgs(runtime.context7Args) : [],
    webmcpBaseUrl: connection.baseUrl,
    webmcpBearerToken: connection.authMode === 'bearer' ? connection.bearerToken : undefined,
    allowWebMcpWrites: import.meta.env.VITE_ALLOW_WEBMCP_WRITES === 'true',
  }
}

function parseArgs(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    // Keep the UI friendly: support either JSON arrays or simple command-line text.
  }

  return trimmed.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, '')) ?? []
}
