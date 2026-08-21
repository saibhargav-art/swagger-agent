import type { AgentRuntime, AgentRuntimeEvent, AgentRuntimeRequest } from './AgentRuntime'
import { connectCustomerApp } from '@/services/connections/ConnectionService'
import { useToolStore } from '@/store/toolStore'
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
    status?: 'success' | 'error' | 'attention'
  }>
  confirmationRequired?: {
    runId: string
    title: string
    details: Record<string, unknown>
    kind?: 'write'
    confirmLabel?: string
    cancelLabel?: string
  }
}

export class StrandsLocalRuntime implements AgentRuntime {
  readonly kind = 'strands-local' as const

  async *send(request: AgentRuntimeRequest): AsyncIterable<AgentRuntimeEvent> {
    const connection = useWebMCPStore.getState()
    const runtime = useAgentRuntimeStore.getState()
    const baseUrl = runtime.agentUrl || 'http://localhost:8787'

    let { response, payload } = await postChat(baseUrl, request, connection, runtime)
    if ((!response.ok || payload.error) && isStaleCustomerConnection(payload.error)) {
      await restoreCustomerConnection(runtime.agentUrl)
      ;({ response, payload } = await postChat(
        baseUrl,
        request,
        useWebMCPStore.getState(),
        useAgentRuntimeStore.getState(),
      ))
    }
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
        kind: payload.confirmationRequired.kind,
        confirmLabel: payload.confirmationRequired.confirmLabel,
        cancelLabel: payload.confirmationRequired.cancelLabel,
      }
    }
    yield { type: 'done' }
  }

  async confirm(
    runId: string,
    approved: boolean,
    kind?: 'write',
  ): Promise<StrandsResponse> {
    return this.resolveConfirmation(runId, approved, kind)
  }

  private async resolveConfirmation(
    runId: string,
    approved: boolean,
    kind?: 'write',
  ): Promise<StrandsResponse> {
    const runtime = useAgentRuntimeStore.getState()
    const connection = useWebMCPStore.getState()
    const baseUrl = runtime.agentUrl || 'http://localhost:8787'
    let response = await fetch(`${baseUrl.replace(/\/$/, '')}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildConfirmPayload(runId, approved, kind, connection)),
    })

    let payload = await readResponse(response)
    if ((!response.ok || payload.error) && isStaleCustomerConnection(payload.error)) {
      await restoreCustomerConnection(runtime.agentUrl)
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildConfirmPayload(runId, approved, kind, useWebMCPStore.getState())),
      })
      payload = await readResponse(response)
    }
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
  const customerConnectionId = connection.connectionId || undefined;
  return {
    message: request.message,
    conversationId: request.conversationId,
    modelProvider: runtime.modelProvider,
    ...(runtime.modelProvider === 'openai'
      ? {
          openAiApiKey: runtime.openAiApiKey || undefined,
          openAiModel: runtime.openAiModel,
        }
      : {
          anthropicApiKey: runtime.anthropicApiKey || undefined,
          anthropicModel: runtime.anthropicModel,
        }),
    customerConnectionId,
    webmcpBaseUrl: customerConnectionId ? undefined : connection.baseUrl || undefined,
    webmcpBearerToken: customerConnectionId ? undefined : connection.bearerToken || undefined,
  }
}

function buildConfirmPayload(
  runId: string,
  approved: boolean,
  kind: 'write' | undefined,
  connection: ReturnType<typeof useWebMCPStore.getState>,
) {
  const customerConnectionId = connection.connectionId || undefined;
  return {
    conversationId: runId,
    approved,
    kind,
    customerConnectionId,
    webmcpBaseUrl: customerConnectionId ? undefined : connection.baseUrl || undefined,
    webmcpBearerToken: customerConnectionId ? undefined : connection.bearerToken || undefined,
  }
}

async function postChat(
  baseUrl: string,
  request: AgentRuntimeRequest,
  connection: ReturnType<typeof useWebMCPStore.getState>,
  runtime: ReturnType<typeof useAgentRuntimeStore.getState>,
): Promise<{ response: Response; payload: StrandsResponse }> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequestPayload(request, connection, runtime)),
  })
  return { response, payload: await readResponse(response) }
}

function isStaleCustomerConnection(error: string | undefined): boolean {
  return Boolean(error && /customer connection is no longer available|reconnect the customer app/i.test(error))
}

async function restoreCustomerConnection(agentUrl: string): Promise<void> {
  const connection = useWebMCPStore.getState()
  if (!connection.baseUrl || !connection.bearerToken) {
    throw new Error('The customer session is unavailable. Reconnect the customer app.')
  }

  connection.setStatus('connecting')
  try {
    const result = await connectCustomerApp({
      agentUrl,
      baseUrl: connection.baseUrl,
      bearerToken: connection.bearerToken,
    })
    connection.setConnectionId(result.connectionId)
    connection.setToolCount(result.tools.length)
    connection.setAppInfo({ name: result.appName, description: result.appDescription, uiHints: result.uiHints })
    connection.setStatus('connected')
    connection.setError(null)
    useToolStore.getState().setTools(result.tools)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reconnect the customer app.'
    connection.setConnectionId('')
    connection.setStatus('error')
    connection.setError(message)
    useToolStore.getState().setTools([])
    throw error
  }
}

async function readResponse(response: Response): Promise<StrandsResponse> {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text) as StrandsResponse
  } catch {
    return {
      error: response.ok
        ? 'The local agent returned an invalid response.'
        : `The local agent failed with HTTP ${response.status}.`,
    }
  }
}
