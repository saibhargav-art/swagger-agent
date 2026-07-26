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
    kind?: 'write' | 'browser-login'
    confirmLabel?: string
    cancelLabel?: string
  }
}

type BrowserSignInStatus = {
  state: 'none' | 'waiting' | 'authenticated'
  pageUrl?: string
  error?: string
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
    kind?: 'write' | 'browser-login',
  ): Promise<StrandsResponse> {
    return this.resolveConfirmation(runId, approved, kind)
  }

  async browserSignInStatus(runId: string): Promise<BrowserSignInStatus> {
    const runtime = useAgentRuntimeStore.getState()
    const baseUrl = runtime.agentUrl || 'http://localhost:8787'
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/browser-session/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: runId }),
    })
    const payload = await readBrowserStatus(response)
    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? `Local Strands agent failed with HTTP ${response.status}`)
    }
    return payload
  }

  private async resolveConfirmation(
    runId: string,
    approved: boolean,
    kind?: 'write' | 'browser-login',
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
    customerConnectionId: connection.connectionId || undefined,
    webmcpBaseUrl: connection.baseUrl || undefined,
    webmcpLoginUrl: connection.loginUrl || undefined,
    webmcpBearerToken: connection.bearerToken || undefined,
    chatAppUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
  }
}

function buildConfirmPayload(
  runId: string,
  approved: boolean,
  kind: 'write' | 'browser-login' | undefined,
  connection: ReturnType<typeof useWebMCPStore.getState>,
) {
  return {
    conversationId: runId,
    approved,
    kind,
    customerConnectionId: connection.connectionId || undefined,
    webmcpBaseUrl: connection.baseUrl || undefined,
    webmcpLoginUrl: connection.loginUrl || undefined,
    webmcpBearerToken: connection.bearerToken || undefined,
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
      loginUrl: connection.loginUrl,
      bearerToken: connection.bearerToken,
    })
    connection.setConnectionId(result.connectionId)
    connection.setToolCount(result.tools.length)
    connection.setAppInfo({ name: result.appName, description: result.appDescription })
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

async function readBrowserStatus(response: Response): Promise<BrowserSignInStatus> {
  const text = await response.text()
  if (!text) return { state: 'none' }

  try {
    return JSON.parse(text) as BrowserSignInStatus
  } catch {
    return { state: 'none', error: 'The local agent returned an invalid browser status.' }
  }
}
