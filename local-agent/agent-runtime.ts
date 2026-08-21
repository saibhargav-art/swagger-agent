import {
  AfterToolsEvent,
  Agent,
  InvokeModelStage,
  type Tool,
  type JSONValue,
} from '@strands-agents/sdk'
import { AnthropicModel } from '@strands-agents/sdk/models/anthropic'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'

import {
  approvePendingWebMcpWrite,
  clearPendingWebMcpWrite,
  clearPendingWebMcpWritesForConnection,
  clearWebMcpContractCache,
  createWebMcpTools,
  getPendingWebMcpWrite,
  hasPendingWebMcpWrite,
} from './tools/webmcp-tools.js'
import type { LocalAgentConfig } from './config.js'
import {
  extractTrace,
  hasFailedToolResult,
  isSuccessfulToolResult,
  toolResultText,
} from './runtime/agent-trace.js'
import { isApproval, isCancellation } from './runtime/confirmation.js'
import type {
  ConfirmPendingActionInput,
  AgentTraceStep,
  RunAgentInput,
  RunAgentResult,
} from './runtime/types.js'
import {
  expandSelectionForExecutionMode,
  toolsForExecutionMode,
} from './runtime/tool-policy.js'
import { ToolPlanner } from './runtime/tool-planner.js'
import { ResultPresenter } from './runtime/result-presenter.js'

const AGENT_CACHE_TTL_MS = 60 * 60 * 1000
const MAX_CACHED_AGENTS = 50
type AgentEntry = {
  agent: Agent
  planner: ToolPlanner
  presenter: ResultPresenter
  availableTools: Tool[]
  selectedToolNames: string[]
  connectionId?: string
  lastUsedAt: number
}

const agents = new Map<string, AgentEntry>()
const MAX_AGENT_TURNS = Number(process.env.STRANDS_MAX_TURNS ?? 3)
const MAX_AGENT_TOKENS = Number(process.env.STRANDS_MAX_TOKENS ?? 6000)
const MAX_HISTORY_MESSAGES = Number(process.env.STRANDS_MAX_HISTORY_MESSAGES ?? 6)

export async function runAgent(config: LocalAgentConfig, input: RunAgentInput): Promise<RunAgentResult> {
  return runAgentAttempt(config, input)
}

async function runAgentAttempt(
  config: LocalAgentConfig,
  input: RunAgentInput,
): Promise<RunAgentResult> {
  const conversationId = input.conversationId?.trim() || 'default'
  const effectiveConfig = mergeRuntimeConfig(config, input)

  if (hasPendingWebMcpWrite(conversationId)) {
    if (isCancellation(input.message)) {
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

  const entry = await getOrCreateAgent(effectiveConfig, conversationId, input)
  const executionPlan = { mode: 'tools', browserWorkflow: false, pureBrowserNavigation: false } as const
  const candidateTools = toolsForExecutionMode(entry.availableTools, executionPlan)
  const selection = await entry.planner.select(
    candidateTools,
    input.message,
    entry.selectedToolNames,
    recentConversationText(entry.agent),
  )
  expandSelectionForExecutionMode(selection, entry.availableTools, executionPlan)
  entry.agent.toolRegistry.clear()
  if (selection.tools.length > 0) entry.agent.toolRegistry.add(selection.tools)
  entry.selectedToolNames = selection.names
  const agent = entry.agent
  repairToolCallHistory(agent)
  trimAgentHistory(agent)
  const beforeMessageCount = agent.messages.length
  const result = await agent.invoke(withRuntimeContext(
    input.message,
    input,
    selection.names,
  ), {
    invocationState: {
      plannedToolNames: selection.names,
      forcePlannedTool: selection.names.length > 0,
    },
    limits: {
      turns: MAX_AGENT_TURNS,
      totalTokens: MAX_AGENT_TOKENS,
    },
  })
  let content = agentResultText(result)
  const newMessages = agent.messages.slice(beforeMessageCount)
  let trace = extractTrace(newMessages)
  if (trace.length === 0 && selection.tools.length > 0) {
    const fallbackTrace = await executeUnresolvedToolUse(newMessages, selection.tools)
    if (fallbackTrace) {
      trace = [fallbackTrace]
      removeMessagesFrom(agent, beforeMessageCount)
      if (fallbackTrace.ok && !isConfirmationResult(fallbackTrace.result)) {
        content = await entry.presenter.present(input.message, trace)
      }
    }
  }
  const pendingWrite = getPendingWebMcpWrite(conversationId)
  if (pendingWrite) {
    return {
      content: confirmationPrompt(pendingWrite.title, pendingWrite.input),
      stopReason: result.stopReason,
      trace: trace.map((step) => step.name === pendingWrite.toolName || step.name === pendingWrite.toolName.replace(/[^a-zA-Z0-9_]/g, '_')
        ? { ...step, ok: true, status: 'attention' as const, result: confirmationTraceResult(step.result) }
        : step),
      confirmationRequired: {
        runId: conversationId,
        toolName: pendingWrite.toolName,
        title: pendingWrite.title,
        details: pendingWrite.input,
        confirmLabel: actionConfirmLabel(pendingWrite.title),
        cancelLabel: 'Cancel',
      },
    }
  }
  const failedTool = trace.find((step) => !step.ok)
  if (failedTool) {
    return {
      content: summarizeToolFailure(failedTool.result),
      stopReason: result.stopReason,
      trace,
    }
  }

  if (result.stopReason === 'limitTurns') {
    return {
      content:
        'The model reached its tool-call limit before completing the request. Try a stronger model or make the request more specific.',
      stopReason: result.stopReason,
      trace,
    }
  }

  return {
    content: content || summarizeFallbackTrace(trace) || 'I could not produce a response.',
    stopReason: result.stopReason,
    trace,
  }
}

export async function resolvePendingAction(
  input: ConfirmPendingActionInput,
): Promise<RunAgentResult> {
  return resolvePendingWebMcpWrite(input)
}

export function releaseCustomerConnection(connectionId: string): void {
  for (const [key, entry] of agents) {
    if (entry.connectionId === connectionId) agents.delete(key)
  }
  clearPendingWebMcpWritesForConnection(connectionId)
}

async function resolvePendingWebMcpWrite(
  input: ConfirmPendingActionInput,
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

function confirmationTraceResult(result: unknown): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result
  const record = result as Record<string, unknown>
  if (record.needsConfirmation) {
    return {
      state: 'Waiting for confirmation',
      action: record.tool,
    }
  }
  return result
}

function actionConfirmLabel(title: string): string {
  if (/create/i.test(title)) return 'Create'
  if (/delete|remove/i.test(title)) return 'Delete'
  if (/update/i.test(title)) return 'Update'
  if (/approve/i.test(title)) return 'Approve'
  return 'Confirm'
}

export async function shutdownAgents(): Promise<void> {
  agents.clear()
  clearWebMcpContractCache()
}

async function getOrCreateAgent(
  config: LocalAgentConfig,
  conversationId: string,
  input: RunAgentInput,
): Promise<AgentEntry> {
  const cacheKey = [
    conversationId,
    config.modelProvider,
    config.openAiModel,
    tokenFingerprint(config.openAiApiKey ?? ''),
    config.anthropicModel,
    tokenFingerprint(config.anthropicApiKey ?? ''),
    input.webmcpBaseUrl ?? config.webmcpBaseUrl ?? '',
    tokenFingerprint(input.webmcpBearerToken ?? config.webmcpBearerToken ?? ''),
    input.webmcpAuthHeader ?? config.webmcpAuthHeader ?? '',
    tokenFingerprint(input.webmcpAuthValue ?? config.webmcpAuthValue ?? ''),
    input.allowWebMcpWrites ?? config.allowWebMcpWrites,
  ].join('|')

  pruneAgentCache()
  const existing = agents.get(cacheKey)
  if (existing) {
    existing.lastUsedAt = Date.now()
    return existing
  }

  const availableTools: Tool[] = []
  const baseUrl = input.webmcpBaseUrl ?? config.webmcpBaseUrl

  if (baseUrl) {
    availableTools.push(
      ...await createWebMcpTools({
        baseUrl,
        bearerToken: input.webmcpBearerToken ?? config.webmcpBearerToken,
        authHeader: input.webmcpAuthHeader ?? config.webmcpAuthHeader,
        authValue: input.webmcpAuthValue ?? config.webmcpAuthValue,
        allowWrites: input.allowWebMcpWrites ?? config.allowWebMcpWrites,
        confirmationSessionId: conversationId,
        customerConnectionId: input.customerConnectionId,
      }),
    )
  }

  const model = createModel(config)
  const planner = new ToolPlanner(model)
  const presenter = new ResultPresenter(model)

  const agent = new Agent({
    name: 'Swagger Local Agent',
    description: 'Local Strands agent that executes connected customer app WebMCP tools.',
    model,
    tools: [],
    toolExecutor: 'sequential',
    printer: false,
    systemPrompt: systemPrompt(),
  })

  // Force the first planner-selected tool so the model does not drift into
  // generic conversation when a connected app action is available.
  agent.addMiddleware(InvokeModelStage.Input, async (context) => {
    const plannedToolNames = Array.isArray(context.invocationState.plannedToolNames)
      ? context.invocationState.plannedToolNames.filter((name): name is string => typeof name === 'string')
      : []
    if (context.invocationState.forcePlannedTool !== true || plannedToolNames.length === 0) {
      return context
    }

    context.invocationState.forcePlannedTool = false
    return {
      ...context,
      toolChoice: { tool: { name: plannedToolNames[0] } },
    }
  })

  agent.addHook(AfterToolsEvent, (event) => {
    if (hasPendingWebMcpWrite(conversationId)) {
      event.endTurn = 'Write confirmation required.'
      return
    }
    if (hasFailedToolResult(event.message)) {
      event.endTurn = 'The tool call failed.'
      return
    }
  })

  const entry: AgentEntry = {
    agent,
    planner,
    presenter,
    availableTools,
    selectedToolNames: [],
    connectionId: input.customerConnectionId,
    lastUsedAt: Date.now(),
  }
  agents.set(cacheKey, entry)
  pruneAgentCache()
  return entry
}

function pruneAgentCache(): void {
  const cutoff = Date.now() - AGENT_CACHE_TTL_MS
  for (const [key, entry] of agents) {
    if (entry.lastUsedAt < cutoff) agents.delete(key)
  }

  if (agents.size <= MAX_CACHED_AGENTS) return
  const oldest = [...agents.entries()].sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt)
  for (const [key] of oldest.slice(0, agents.size - MAX_CACHED_AGENTS)) agents.delete(key)
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

function summarizeToolFailure(result: unknown): string {
  const text = toolResultText(result)
  if (/invalid session|jwt|expired|unauthorized|\b401\b/i.test(text)) {
    return 'The customer session is invalid or expired. Sign in to the customer app again, update the access token in Connections, and reconnect.'
  }
  const concise = text.replace(/\s+/g, ' ').trim()
  return concise
    ? `The connected tool failed: ${concise.slice(0, 500)}`
    : 'The connected tool failed without returning an error message.'
}

async function executeUnresolvedToolUse(
  messages: Agent['messages'],
  selectedTools: Tool[],
): Promise<AgentTraceStep | null> {
  const unresolved = lastToolUse(messages, selectedTools.map((tool) => tool.name))
  if (!unresolved) return null

  const selectedTool = selectedTools.find((tool) => tool.name === unresolved.name)
  if (!selectedTool || !isInvokableTool(selectedTool)) return null

  const result = await selectedTool.invoke(unresolved.input ?? {})
  return {
    type: 'tool',
    name: selectedTool.name,
    input: unresolved.input,
    result,
    ok: isSuccessfulToolResult(result),
    status: isSuccessfulToolResult(result) ? 'success' : 'error',
  }
}

function lastToolUse(
  messages: Agent['messages'],
  allowedNames: string[],
): { name: string; input?: JSONValue } | null {
  const allowed = new Set(allowedNames)
  let latest: { name: string; input?: JSONValue } | null = null

  for (const message of messages) {
    for (const block of message.content) {
      if (block.type !== 'toolUseBlock') continue
      const candidate = block as { name?: unknown; input?: JSONValue }
      if (typeof candidate.name !== 'string' || !allowed.has(candidate.name)) continue
      latest = { name: candidate.name, input: candidate.input }
    }
  }

  return latest
}

function isInvokableTool(tool: Tool): tool is Tool & { invoke: (input: unknown) => Promise<JSONValue> } {
  return 'invoke' in tool && typeof (tool as { invoke?: unknown }).invoke === 'function'
}

function summarizeFallbackTrace(trace: RunAgentResult['trace'] | undefined): string {
  const step = trace?.[0]
  if (!step) return ''
  if (!step.ok) return summarizeToolFailure(step.result)

  const result = step.result
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const record = result as Record<string, unknown>
    if (record.needsConfirmation) return confirmationPrompt(String(record.tool ?? step.name), step.input as Record<string, unknown>)
    const id = record.id ?? record.order_id ?? record.orderId
    if (id !== undefined) return `Success. ${humanizeToolName(step.name)} completed for id ${String(id)}.`
  }

  if (Array.isArray(result)) return `Found ${result.length} records.`
  return `${humanizeToolName(step.name)} completed.`
}

function agentResultText(result: { lastMessage: { content: Array<{ type: string; text?: unknown }> } }): string {
  return result.lastMessage.content
    .filter((block) => block.type === 'textBlock' && typeof block.text === 'string')
    .map((block) => String(block.text))
    .join('\n')
    .trim()
}

function isConfirmationResult(result: unknown): boolean {
  return Boolean(
    result
    && typeof result === 'object'
    && !Array.isArray(result)
    && (result as Record<string, unknown>).needsConfirmation === true,
  )
}

function humanizeToolName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase())
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
    anthropicApiKey: input.anthropicApiKey ?? config.anthropicApiKey,
    anthropicModel: input.anthropicModel ?? config.anthropicModel,
  }
}

function createModel(config: LocalAgentConfig) {
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

  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is required when STRANDS_MODEL_PROVIDER=anthropic')
  }

  return new AnthropicModel({
    apiKey: config.anthropicApiKey,
    modelId: config.anthropicModel,
    temperature: 0.1,
    maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS ?? 4096),
  })
}

function trimAgentHistory(agent: Agent): void {
  const overflow = agent.messages.length - MAX_HISTORY_MESSAGES
  if (overflow > 0) agent.messages.splice(0, overflow)
}

function removeMessagesFrom(agent: Agent, startIndex: number): void {
  if (startIndex < agent.messages.length) agent.messages.splice(startIndex)
}

function repairToolCallHistory(agent: Agent): void {
  const resolvedToolUseIds = new Set<string>()
  for (const message of agent.messages) {
    for (const block of message.content) {
      if (block.type !== 'toolResultBlock') continue
      const toolUseId = (block as { toolUseId?: unknown }).toolUseId
      if (typeof toolUseId === 'string') resolvedToolUseIds.add(toolUseId)
    }
  }

  const withoutDanglingToolUses = agent.messages.filter((message) => {
    const toolUseIds = message.content
      .filter((block) => block.type === 'toolUseBlock')
      .map((block) => (block as { toolUseId?: unknown }).toolUseId)
      .filter((toolUseId): toolUseId is string => typeof toolUseId === 'string')

    return toolUseIds.length === 0 || toolUseIds.every((toolUseId) => resolvedToolUseIds.has(toolUseId))
  })

  const validToolUseIds = new Set<string>()
  for (const message of withoutDanglingToolUses) {
    for (const block of message.content) {
      if (block.type !== 'toolUseBlock') continue
      const toolUseId = (block as { toolUseId?: unknown }).toolUseId
      if (typeof toolUseId === 'string') validToolUseIds.add(toolUseId)
    }
  }

  const repaired = withoutDanglingToolUses.filter((message) => {
    const resultIds = message.content
      .filter((block) => block.type === 'toolResultBlock')
      .map((block) => (block as { toolUseId?: unknown }).toolUseId)
      .filter((toolUseId): toolUseId is string => typeof toolUseId === 'string')

    return resultIds.length === 0 || resultIds.every((toolUseId) => validToolUseIds.has(toolUseId))
  })

  if (repaired.length !== agent.messages.length) {
    agent.messages.splice(0, agent.messages.length, ...repaired)
  }
}

function withRuntimeContext(
  message: string,
  input: RunAgentInput,
  plannedToolNames: string[],
): string {
  const context = [
    input.webmcpBaseUrl ? `Connected website base URL: ${input.webmcpBaseUrl}.` : '',
    'Execution mode: tools-only.',
    'Use only connected app WebMCP tools. Browser automation is disabled for this demo path.',
    plannedToolNames.length > 0
      ? `The structured planner selected these tools in execution order: ${plannedToolNames.join(', ')}. Start by calling the first tool; do not claim completion without a tool result.`
      : '',
  ].filter(Boolean).join(' ')

  return context ? `${message}\n\nRuntime context:\n${context}` : message
}

function recentConversationText(agent: Agent): string {
  return agent.messages
    .slice(-4)
    .map((message) => {
      const text = message.content
        .filter((block) => block.type === 'textBlock')
        .map((block) => 'text' in block ? String(block.text) : '')
        .filter(Boolean)
        .join(' ')
      return text ? `${message.role}: ${text}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function systemPrompt(): string {
  return [
    'You are a local desktop agent for connected customer applications.',
    'The user speaks naturally and may use imperfect wording. Infer intent from meaning, not exact keyword matching.',
    'First decide whether the request is supported by available tools. If not supported, say what connected app actions are available.',
    'Use WebMCP API tools for customer app data/actions when available.',
    'Browser automation is disabled in this build. If the user asks to operate the visible website UI, explain that this demo currently executes connected app tools only.',
    'For read-only questions, call list/search/get tools as needed, inspect returned records, filter/group/count them, and answer in plain language.',
    'For questions like duplicates, comparisons, counts, or conditions, retrieve a broad record list first, then analyze returned rows yourself.',
    'Never pass the whole user sentence as a search query unless the user clearly gave that exact text as the search value.',
    'For missing identifiers, do not ask the user for internal IDs first. Use read/search/list tools to resolve records from names, status, amount, or other natural fields.',
    'If multiple records match, present a concise numbered choice list and ask which record to use.',
    'Read, list, search, and status tools never require write confirmation.',
    'When all required parameters for a write tool are available, invoke it once. The runtime intercepts it and presents the user confirmation; do not ask for a second text confirmation.',
    'After a tool call, summarize the result clearly. Do not expose raw JSON unless the user asks for raw data.',
  ].join(' ')
}
