import { Agent, type Message, type ToolList } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'

import { createMcpClients, disconnectMcpClients, navigateWithBrowserMcp } from './tools/mcp-clients.js'
import {
  approvePendingWebMcpWrite,
  clearPendingWebMcpWrite,
  createWebMcpTools,
  getPendingWebMcpWrite,
  hasPendingWebMcpWrite,
} from './tools/webmcp-tools.js'
import type { LocalAgentConfig } from './config.js'
import { OllamaModel } from './models/ollama-model.js'

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
  webmcpBaseUrl?: string
  webmcpLoginUrl?: string
  browserStartUrl?: string
  webmcpBearerToken?: string
  webmcpAuthHeader?: string
  webmcpAuthValue?: string
  allowWebMcpWrites?: boolean
}

export type ConfirmPendingWriteInput = {
  conversationId: string
  approved: boolean
  webmcpBearerToken?: string
  webmcpAuthHeader?: string
  webmcpAuthValue?: string
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
  }
}

export type AgentTraceStep = {
  type: 'tool'
  name: string
  input?: unknown
  result?: unknown
  ok: boolean
}

const agents = new Map<string, Agent>()
const clientCleanup = new Map<string, ReturnType<typeof createMcpClients>>()
const MAX_AGENT_TURNS = Number(process.env.STRANDS_MAX_TURNS ?? 4)
const MAX_AGENT_TOKENS = Number(process.env.STRANDS_MAX_TOKENS ?? 6000)
const MAX_HISTORY_MESSAGES = Number(process.env.STRANDS_MAX_HISTORY_MESSAGES ?? 6)

export async function runAgent(config: LocalAgentConfig, input: RunAgentInput): Promise<RunAgentResult> {
  const conversationId = input.conversationId?.trim() || 'default'
  const effectiveConfig = mergeRuntimeConfig(config, input)

  if (browserOnlyRequest(input.message)) {
    const url = resolveBrowserTargetUrl(input)
    if (!url) {
      return {
        content: 'I need a connected website URL before I can open a page in the browser. Connect the website first, then try again.',
        stopReason: 'endTurn',
      }
    }

    if (!effectiveConfig.browserMcpEnabled) {
      return {
        content: 'Browser MCP is disabled. Enable Browser MCP in Connections, use the BrowserMCP preset, click Test local agent, then try this browser action again.',
        stopReason: 'endTurn',
      }
    }

    if (!effectiveConfig.browserMcpCommand) {
      return {
        content: 'Browser MCP is enabled but no command is configured. In Connections, click Use BrowserMCP preset or enter the Browser MCP command and args.',
        stopReason: 'endTurn',
      }
    }

    try {
      const result = await navigateWithBrowserMcp(effectiveConfig, url)
      const ok = isSuccessfulToolResult(result.result)
      return {
        content: ok
          ? `Opened ${url} in the connected browser session.`
          : `Browser MCP could not open ${url}. ${toolResultText(result.result)}`,
        stopReason: 'endTurn',
        trace: [
          {
            type: 'tool',
            name: result.toolName,
            input: { url },
            result: result.result,
            ok,
          },
        ],
      }
    } catch (err) {
      return {
        content: `Browser MCP could not navigate to ${url}. ${err instanceof Error ? err.message : String(err)}`,
        stopReason: 'endTurn',
        trace: [
          {
            type: 'tool',
            name: 'browser_navigate',
            input: { url },
            result: err instanceof Error ? err.message : String(err),
            ok: false,
          },
        ],
      }
    }
  }

  if (hasPendingWebMcpWrite(conversationId)) {
    if (isCancel(input.message)) {
      clearPendingWebMcpWrite(conversationId)
      return {
        content: 'Cancelled the pending action.',
        stopReason: 'endTurn',
      }
    }

    if (isApproval(input.message)) {
      const pending = getPendingWebMcpWrite(conversationId)
      const result = await approvePendingWebMcpWrite(conversationId, {
        bearerToken: input.webmcpBearerToken,
        authHeader: input.webmcpAuthHeader,
        authValue: input.webmcpAuthValue,
      })
      return {
        content: summarizeApprovedWrite(result),
        stopReason: 'endTurn',
        trace: [
          {
            type: 'tool',
            name: pending?.toolName ?? 'confirmed_action',
            input: pending?.input,
            result,
            ok: isSuccessfulToolResult(result),
          },
        ],
      }
    }
  }

  const agent = await getOrCreateAgent(effectiveConfig, conversationId, input)
  trimAgentHistory(agent)
  const beforeMessageCount = agent.messages.length
  const result = await agent.invoke(withRuntimeContext(input.message, effectiveConfig, input), {
    limits: {
      turns: browserOnlyRequest(input.message) ? 2 : MAX_AGENT_TURNS,
      totalTokens: MAX_AGENT_TOKENS,
    },
  })
  const content = result.toString().trim()
  const trace = extractTrace(agent.messages.slice(beforeMessageCount))
  const pendingWrite = getPendingWebMcpWrite(conversationId)
  if (pendingWrite) {
    return {
      content: confirmationPrompt(pendingWrite.title, pendingWrite.input),
      stopReason: result.stopReason,
      trace,
      confirmationRequired: {
        runId: conversationId,
        toolName: pendingWrite.toolName,
        title: pendingWrite.title,
        details: pendingWrite.input,
      },
    }
  }

  if (result.stopReason === 'limitTurns') {
    const fallback = synthesizeFromToolResults(agent.messages, input.message)
    if (fallback) {
      return {
        content: fallback,
        stopReason: result.stopReason,
        trace,
      }
    }

    return {
      content:
        'The local model kept calling tools and did not produce a final answer. Try a stronger Ollama tool model, or narrow the request.',
      stopReason: result.stopReason,
      trace,
    }
  }

  return {
    content: content || 'I could not produce a response.',
    stopReason: result.stopReason,
    trace,
  }
}

export async function resolvePendingWrite(
  input: ConfirmPendingWriteInput,
): Promise<RunAgentResult> {
  const { conversationId, approved } = input
  const sessionId = conversationId.trim() || 'default'
  const pending = getPendingWebMcpWrite(sessionId)

  if (!pending) {
    return {
      content: 'There is no pending action to confirm.',
      stopReason: 'endTurn',
      trace: [],
    }
  }

  if (!approved) {
    clearPendingWebMcpWrite(sessionId)
    return {
      content: 'Cancelled the pending action.',
      stopReason: 'endTurn',
      trace: [],
    }
  }

  const pendingTrace = {
    type: 'tool' as const,
    name: pending.toolName,
    input: pending.input,
  }
  const result = await approvePendingWebMcpWrite(sessionId, {
    bearerToken: input.webmcpBearerToken,
    authHeader: input.webmcpAuthHeader,
    authValue: input.webmcpAuthValue,
  })
  return {
    content: summarizeApprovedWrite(result),
    stopReason: 'endTurn',
    trace: [
      {
        ...pendingTrace,
        result,
        ok: isSuccessfulToolResult(result),
      },
    ],
  }
}

function confirmationPrompt(title: string, details: Record<string, unknown>): string {
  const populated = Object.entries(details).filter(([, value]) => value !== undefined && value !== null && value !== '')
  if (populated.length === 0) return `Confirm ${title} before I proceed.`
  return `Confirm ${title} with these details.`
}

function synthesizeFromToolResults(messages: Message[], prompt: string): string | null {
  const toolResults = [...messages]
    .reverse()
    .flatMap((message) => message.content)
    .filter((block) => block.type === 'toolResultBlock')

  for (const block of toolResults) {
    const values = extractToolResultValues(block)
    for (const value of values) {
      const records = recordsFromValue(value)
      if (records.length === 0) continue

      const duplicateSummary = duplicateAnswer(records, prompt)
      if (duplicateSummary) return duplicateSummary

      const filtered = filterRecords(records, prompt)
      if (filtered.length !== records.length) {
        return recordsAnswer(filtered, 'matching')
      }

      return recordsAnswer(records, '')
    }
  }

  return null
}

function extractToolResultValues(block: unknown): unknown[] {
  const content = (block as { content?: unknown[] }).content ?? []
  return content.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    if ('json' in item) return [(item as { json: unknown }).json]
    if ('text' in item) {
      const text = String((item as { text: unknown }).text)
      try {
        return [JSON.parse(text)]
      } catch {
        return [text]
      }
    }
    return []
  })
}

function extractTrace(messages: Message[]): AgentTraceStep[] {
  const toolUses = new Map<string, { name: string; input?: unknown }>()
  const trace: AgentTraceStep[] = []

  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === 'toolUseBlock') {
        const toolUse = block as { toolUseId: string; name: string; input?: unknown }
        toolUses.set(toolUse.toolUseId, { name: toolUse.name, input: toolUse.input })
      }

      if (block.type === 'toolResultBlock') {
        const toolResult = block as { toolUseId: string }
        const toolUse = toolUses.get(toolResult.toolUseId)
        const values = extractToolResultValues(block)
        const result = values.length === 1 ? values[0] : values
        trace.push({
          type: 'tool',
          name: toolUse?.name ?? 'unknown_tool',
          input: toolUse?.input,
          result,
          ok: isSuccessfulToolResult(result),
        })
      }
    }
  }

  return trace
}

function isSuccessfulToolResult(result: unknown): boolean {
  if (typeof result === 'string') {
    return !/\b(error|failed|not connected|client closed|timed out|timeout|unable|cannot)\b/i.test(result)
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) return true
  const record = result as Record<string, unknown>
  return record.ok !== false && record.isError !== true && !record.error
}

function toolResultText(result: unknown): string {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return ''

  const record = result as Record<string, unknown>
  const content = Array.isArray(record.content) ? record.content : []
  const text = content
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const maybeText = (item as Record<string, unknown>).text
      return typeof maybeText === 'string' ? maybeText : ''
    })
    .filter(Boolean)
    .join(' ')

  return text || JSON.stringify(result)
}

function recordsFromValue(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap(recordsFromValue)
  }

  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const nested = ['data', 'records', 'items', 'results', 'rows'].flatMap((key) => recordsFromValue(record[key]))
  const looksLikeRecord = Object.keys(record).some((key) => /id|name|title|status|state|amount|created/i.test(key))
  return looksLikeRecord ? [record, ...nested] : nested
}

function duplicateAnswer(records: Array<Record<string, unknown>>, prompt: string): string | null {
  if (!/\b(duplicate|duplicates|duplicated|repeated|same)\b/i.test(prompt)) return null

  const keys = [
    ...new Set(
      records.flatMap((record) =>
        Object.keys(record).filter((key) => /name|customer|account|user|email|title/i.test(key)),
      ),
    ),
  ]

  for (const key of keys) {
    const groups = new Map<string, Array<Record<string, unknown>>>()
    for (const record of records) {
      const raw = record[key]
      if (raw === undefined || raw === null || String(raw).trim() === '') continue
      const normalized = String(raw).trim().toLowerCase()
      groups.set(normalized, [...(groups.get(normalized) ?? []), record])
    }

    const duplicates = [...groups.entries()].filter(([, group]) => group.length > 1)
    if (duplicates.length > 0) {
      const lines = duplicates.slice(0, 8).map(([value, group]) => {
        const label = group[0]?.[key] ?? value
        return `- ${String(label)}: ${group.length} records`
      })
      const total = duplicates.reduce((sum, [, group]) => sum + group.length, 0)
      return `I found ${duplicates.length} duplicate ${humanize(key)} value${duplicates.length === 1 ? '' : 's'} across ${total} records:\n${lines.join('\n')}`
    }
  }

  return 'I checked the returned records and did not find duplicate names or customer-like fields.'
}

function filterRecords(records: Array<Record<string, unknown>>, prompt: string): Array<Record<string, unknown>> {
  const words = new Set(prompt.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean))
  const ignored = new Set(['can', 'you', 'check', 'find', 'get', 'list', 'show', 'if', 'we', 'have', 'any', 'order', 'orders', 'with', 'status'])
  const candidates = [...words].filter((word) => !ignored.has(word))
  if (candidates.length === 0) return records

  const filtered = records.filter((record) =>
    Object.entries(record).some(([key, value]) => {
      if (!/status|state|type|category|name|customer|account|user/i.test(key)) return false
      const text = String(value ?? '').toLowerCase().replace(/_/g, ' ')
      return candidates.some((word) => text.includes(word))
    }),
  )

  return filtered.length > 0 ? filtered : records
}

function recordsAnswer(records: Array<Record<string, unknown>>, qualifier: string): string {
  if (records.length === 0) return `No ${qualifier ? `${qualifier} ` : ''}records found.`

  const rows = records.slice(0, 8).map((record) => {
    const name = record.customer_name ?? record.customerName ?? record.name ?? record.title ?? record.id ?? 'Record'
    const status = record.status ?? record.state
    const amount = record.amount
    return `- ${String(name)}${status ? ` | ${String(status)}` : ''}${amount !== undefined ? ` | amount ${String(amount)}` : ''}`
  })

  return `Found ${records.length} ${qualifier ? `${qualifier} ` : ''}record${records.length === 1 ? '' : 's'}:\n${rows.join('\n')}`
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, ' ')
}

export async function shutdownAgents(): Promise<void> {
  await Promise.allSettled([...clientCleanup.values()].map(disconnectMcpClients))
  agents.clear()
  clientCleanup.clear()
}

async function getOrCreateAgent(
  config: LocalAgentConfig,
  conversationId: string,
  input: RunAgentInput,
): Promise<Agent> {
  const cacheKey = [
    conversationId,
    config.modelProvider,
    config.openAiModel,
    config.ollamaBaseUrl,
    config.ollamaModel,
    input.webmcpBaseUrl ?? config.webmcpBaseUrl ?? '',
    input.webmcpLoginUrl ?? '',
    input.browserStartUrl ?? '',
    tokenFingerprint(input.webmcpBearerToken ?? config.webmcpBearerToken ?? ''),
    input.webmcpAuthHeader ?? config.webmcpAuthHeader ?? '',
    tokenFingerprint(input.webmcpAuthValue ?? config.webmcpAuthValue ?? ''),
    input.allowWebMcpWrites ?? config.allowWebMcpWrites,
    config.browserMcpEnabled,
    config.browserMcpCommand ?? '',
    config.browserMcpArgs.join(','),
    config.context7Enabled,
    config.context7Command,
    config.context7Args.join(','),
  ].join('|')

  const existing = agents.get(cacheKey)
  if (existing) return existing

  const mcpClients = createMcpClients(config)
  clientCleanup.set(cacheKey, mcpClients)

  const tools: ToolList = [...mcpClients]
  const baseUrl = input.webmcpBaseUrl ?? config.webmcpBaseUrl

  if (baseUrl) {
    tools.push(
      await createWebMcpTools({
        baseUrl,
        bearerToken: input.webmcpBearerToken ?? config.webmcpBearerToken,
        authHeader: input.webmcpAuthHeader ?? config.webmcpAuthHeader,
        authValue: input.webmcpAuthValue ?? config.webmcpAuthValue,
        allowWrites: input.allowWebMcpWrites ?? config.allowWebMcpWrites,
        confirmationSessionId: conversationId,
      }),
    )
  }

  const model = createModel(config)

  const agent = new Agent({
    name: 'Swagger Local Agent',
    description: 'Local Strands agent that can use Browser MCP and WebMCP customer tools.',
    model,
    tools,
    toolExecutor: 'sequential',
    printer: false,
    systemPrompt: systemPrompt(),
  })

  agents.set(cacheKey, agent)
  return agent
}

function isApproval(message: string): boolean {
  return /^(yes|yes please|confirm|confirmed|approve|approved|proceed|go ahead|do it|ok|okay)$/i.test(message.trim())
}

function isCancel(message: string): boolean {
  return /^(no|cancel|stop|do not|don't|dont|never mind|nevermind)$/i.test(message.trim())
}

function summarizeApprovedWrite(result: unknown): string {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const record = result as Record<string, unknown>
    if (record.ok === false) {
      const errorText = JSON.stringify(record.error ?? record)
      if (/invalid session|jwt|expired|unauthorized|forbidden/i.test(errorText)) {
        return 'The approved action failed because the customer session is invalid or expired. Log in to the customer app again, paste a fresh access token in Connections, reconnect the website, then retry.'
      }

      return `The approved action failed: ${errorText}`
    }

    const id = record.id ?? record.order_id ?? record.orderId
    const name = record.customer_name ?? record.name ?? record.title
    const status = record.status ?? record.state
    const parts = [
      id !== undefined ? `id: ${String(id)}` : '',
      name !== undefined ? `name: ${String(name)}` : '',
      status !== undefined ? `status: ${String(status)}` : '',
    ].filter(Boolean)

    return `Confirmed. The action completed successfully.${parts.length ? ` ${parts.join(' | ')}` : ''}`
  }

  return `Confirmed. The action completed successfully.${result ? ` ${String(result)}` : ''}`
}

function tokenFingerprint(value: string): string {
  if (!value) return ''
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return `${value.length}:${hash.toString(16)}`
}

function mergeRuntimeConfig(config: LocalAgentConfig, input: RunAgentInput): LocalAgentConfig {
  return {
    ...config,
    modelProvider: input.modelProvider ?? config.modelProvider,
    openAiApiKey: input.openAiApiKey ?? config.openAiApiKey,
    openAiModel: input.openAiModel ?? config.openAiModel,
    ollamaBaseUrl: input.ollamaBaseUrl ?? config.ollamaBaseUrl,
    ollamaModel: input.ollamaModel ?? config.ollamaModel,
    browserMcpEnabled: input.browserMcpEnabled ?? config.browserMcpEnabled,
    browserMcpCommand: input.browserMcpCommand ?? config.browserMcpCommand,
    browserMcpArgs: input.browserMcpArgs ?? config.browserMcpArgs,
    context7Enabled: input.context7Enabled ?? config.context7Enabled,
    context7Command: input.context7Command ?? config.context7Command,
    context7Args: input.context7Args ?? config.context7Args,
  }
}

function createModel(config: LocalAgentConfig) {
  if (config.modelProvider === 'ollama') {
    return new OllamaModel({
      baseUrl: config.ollamaBaseUrl,
      modelId: config.ollamaModel,
      temperature: 0.1,
      maxTokens: Number(process.env.OLLAMA_NUM_PREDICT ?? 768),
    })
  }

  if (config.modelProvider === 'openai') {
    if (!config.openAiApiKey) {
      throw new Error('OPENAI_API_KEY is required when STRANDS_MODEL_PROVIDER=openai')
    }

    return new OpenAIModel({
      api: 'chat',
      apiKey: config.openAiApiKey,
      modelId: config.openAiModel,
      temperature: 0.1,
    })
  }

  return undefined
}

function trimAgentHistory(agent: Agent): void {
  const overflow = agent.messages.length - MAX_HISTORY_MESSAGES
  if (overflow > 0) agent.messages.splice(0, overflow)
}

function withRuntimeContext(message: string, config: LocalAgentConfig, input: RunAgentInput): string {
  const browserEnabled = config.browserMcpEnabled && Boolean(config.browserMcpCommand)
  const isBrowserOnly = browserOnlyRequest(message)
  const context = [
    input.webmcpBaseUrl ? `Connected website base URL: ${input.webmcpBaseUrl}.` : '',
    input.webmcpLoginUrl ? `Customer login URL: ${input.webmcpLoginUrl}.` : '',
    input.browserStartUrl ? `Browser start URL: ${input.browserStartUrl}.` : '',
    browserEnabled
      ? 'Browser MCP is available for visible browser actions.'
      : 'Browser MCP is not available in this run; use WebMCP API tools or explain that browser automation is not configured.',
    isBrowserOnly
      ? 'This is a browser-only navigation or page-inspection request. Use Browser MCP only, do not call WebMCP data/list/search tools, and stop after reporting the page action result.'
      : '',
  ].filter(Boolean).join(' ')

  return context ? `${message}\n\nRuntime context:\n${context}` : message
}

function browserOnlyRequest(message: string): boolean {
  const text = message.toLowerCase()
  const asksForBrowser = /\b(open|navigate|go to|launch|inspect|view|show)\b/.test(text)
  const targetsPage = /\b(browser|website|site|page|screen|ui|orders page|dashboard|login)\b/.test(text)
  const asksForDataAction = /\b(create|delete|update|list|get|search|find|check|status|duplicate)\b/.test(text)
  return asksForBrowser && targetsPage && !asksForDataAction
}

function resolveBrowserTargetUrl(input: RunAgentInput): string | null {
  const text = input.message.toLowerCase()
  const baseUrl = input.webmcpBaseUrl?.replace(/\/+$/g, '')
  const loginUrl = input.webmcpLoginUrl?.trim()

  if (/\blogin|sign in|signin\b/.test(text) && loginUrl) return loginUrl
  if (!baseUrl) return input.browserStartUrl ?? loginUrl ?? null

  const path =
    /\borders?\b/.test(text) ? '/orders'
      : /\bdashboard\b/.test(text) ? '/dashboard'
        : /\badmin\b/.test(text) ? '/admin'
          : ''

  return `${baseUrl}${path}`
}

function systemPrompt(): string {
  return [
    'You are a local desktop agent for connected customer applications.',
    'The user speaks naturally and may use imperfect wording. Infer intent from meaning, not exact keyword matching.',
    'First decide whether the request is supported by available tools. If not supported, say what connected app actions are available.',
    'Use WebMCP API tools for customer app data/actions when available.',
    'Use Browser MCP when the user asks to open the site, navigate pages, click/type in the UI, inspect visible page state, or handle login/OTP/browser-only interaction.',
    'If Browser MCP is available and the user asks to use the website UI, open the connected website/login URL first and continue from the visible page.',
    'Prefer WebMCP API tools over browser clicking for direct data actions unless the user specifically asks to use the website UI or no API tool is available.',
    'For read-only questions, call list/search/get tools as needed, inspect returned records, filter/group/count them, and answer in plain language.',
    'For questions like duplicates, comparisons, counts, or conditions, retrieve a broad record list first, then analyze returned rows yourself.',
    'Never pass the whole user sentence as a search query unless the user clearly gave that exact text as the search value.',
    'For missing identifiers, do not ask the user for internal IDs first. Use read/search/list tools to resolve records from names, status, amount, or other natural fields.',
    'If multiple records match, present a concise numbered choice list and ask which record to use.',
    'For create, update, delete, payment, booking, or destructive actions, ask for explicit confirmation with details before invoking write tools.',
    'After a tool call, summarize the result clearly. Do not expose raw JSON unless the user asks for raw data.',
  ].join(' ')
}
