import {
  AfterToolsEvent,
  Agent,
  BeforeToolsEvent,
  InvokeModelStage,
  type Message,
  type Tool,
} from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'

import {
  createMcpTools,
  shutdownMcpClients,
} from './tools/mcp-clients.js'
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
import { OllamaModel } from './models/ollama-model.js'
import {
  extractTrace,
  hasFailedToolResult,
  isSuccessfulToolResult,
  toolResultText,
} from './runtime/agent-trace.js'
import {
  browserNavigationResult,
  captureBrowserSignIn,
  clearBrowserSessions,
  handlePendingBrowserMessage,
  openCustomerPageFromChat,
  resolvePendingBrowserSignIn,
} from './runtime/browser-session.js'
import { isApproval, isCancellation } from './runtime/confirmation.js'
import type {
  ConfirmPendingActionInput,
  RunAgentInput,
  RunAgentResult,
} from './runtime/types.js'
import { ToolPlanner } from './runtime/tool-planner.js'

const AGENT_CACHE_TTL_MS = 60 * 60 * 1000
const MAX_CACHED_AGENTS = 50
type AgentEntry = {
  agent: Agent
  planner: ToolPlanner
  availableTools: Tool[]
  selectedToolNames: string[]
  connectionId?: string
  lastUsedAt: number
}

const agents = new Map<string, AgentEntry>()
const MAX_AGENT_TURNS = Number(process.env.STRANDS_MAX_TURNS ?? 3)
const MAX_AGENT_TOKENS = Number(process.env.STRANDS_MAX_TOKENS ?? 6000)
const MAX_HISTORY_MESSAGES = Number(process.env.STRANDS_MAX_HISTORY_MESSAGES ?? 6)
const browserNavigationInvocations = new WeakSet<object>()

export async function runAgent(config: LocalAgentConfig, input: RunAgentInput): Promise<RunAgentResult> {
  const conversationId = input.conversationId?.trim() || 'default'
  const effectiveConfig = mergeRuntimeConfig(config, input)
  const pendingBrowserResult = await handlePendingBrowserMessage(conversationId, input.message)
  if (pendingBrowserResult) return pendingBrowserResult

  const browserPageResult = await openCustomerPageFromChat(effectiveConfig, {
    ...input,
    conversationId,
  })
  if (browserPageResult) return browserPageResult

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
  const pureBrowserNavigation = isPureBrowserNavigationRequest(input.message)
  const mixedBrowserWorkflow = isMixedBrowserWorkflowRequest(input.message)
  const selection = await entry.planner.select(
    entry.availableTools,
    input.message,
    entry.selectedToolNames,
    recentConversationText(entry.agent),
  )
  if (mixedBrowserWorkflow && selection.names.some(isBrowserToolName)) {
    addMissingBrowserTools(selection, entry.availableTools)
  }
  entry.agent.toolRegistry.clear()
  if (selection.tools.length > 0) entry.agent.toolRegistry.add(selection.tools)
  entry.selectedToolNames = selection.names
  const agent = entry.agent
  trimAgentHistory(agent)
  const beforeMessageCount = agent.messages.length
  const result = await agent.invoke(withRuntimeContext(
    input.message,
    effectiveConfig,
    input,
    selection.names,
  ), {
    invocationState: {
      plannedToolNames: selection.names,
      forcePlannedTool: selection.names.length > 0,
      pureBrowserNavigation,
    },
    limits: {
      turns: MAX_AGENT_TURNS,
      totalTokens: MAX_AGENT_TOKENS,
    },
  })
  const content = result.toString().trim()
  const trace = extractTrace(agent.messages.slice(beforeMessageCount))
  const browserSignInResult = captureBrowserSignIn(conversationId, trace, input, effectiveConfig)
  if (browserSignInResult) return browserSignInResult
  const completedBrowserNavigation = pureBrowserNavigation ? browserNavigationResult(trace) : null
  if (completedBrowserNavigation) return completedBrowserNavigation
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
        'The local model reached its tool-call limit before completing the request. Try a stronger tool-capable model or make the request more specific.',
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

export async function resolvePendingAction(
  input: ConfirmPendingActionInput,
): Promise<RunAgentResult> {
  const browserResult = await resolvePendingBrowserSignIn(input)
  if (browserResult) return browserResult

  if (input.kind === 'browser-login') {
    return {
      content: 'This browser sign-in request is already resolved. Send your next request normally.',
      stopReason: 'endTurn',
      trace: [],
    }
  }

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

export async function shutdownAgents(): Promise<void> {
  await shutdownMcpClients()
  agents.clear()
  clearBrowserSessions()
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

  pruneAgentCache()
  const existing = agents.get(cacheKey)
  if (existing) {
    existing.lastUsedAt = Date.now()
    return existing
  }

  const availableTools: Tool[] = [...await createMcpTools(config)]
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
  const planner = new ToolPlanner(config, model)

  const agent = new Agent({
    name: 'Swagger Local Agent',
    description: 'Local Strands agent that can use browser MCP and WebMCP customer tools.',
    model,
    tools: [],
    toolExecutor: 'sequential',
    printer: false,
    systemPrompt: systemPrompt(),
  })

  // Enforce the model-selected first step. Later turns remain agentic so the
  // model can inspect results, call another planned tool, or answer the user.
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

  // Browser navigation already returns the final page state. Ending this turn
  // avoids another expensive model pass whose only job would be summarization.
  agent.addHook(BeforeToolsEvent, (event) => {
    if (isBrowserNavigationBatch(event.message)) {
      browserNavigationInvocations.add(event.invocationState)
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
    if (event.invocationState.pureBrowserNavigation === true && browserNavigationInvocations.delete(event.invocationState)) {
      event.endTurn = 'Browser navigation completed.'
    }
  })

  const entry: AgentEntry = {
    agent,
    planner,
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
  if (/no connection to browser extension/i.test(text)) {
    return 'Browser automation is not connected to a browser tab. Connect the Browser MCP extension to the customer-app tab, then retry.'
  }
  if (/target page|browser context|browser has been closed/i.test(text)) {
    return 'The managed browser session was closed. Retry once to start a fresh browser session.'
  }
  if (/does not match any elements|could not find.*element/i.test(text)) {
    return 'Browser automation could not find that page or control in the current browser view. Open the destination page first, then retry the interaction.'
  }

  const concise = text.replace(/\s+/g, ' ').trim()
  return concise
    ? `The connected tool failed: ${concise.slice(0, 500)}`
    : 'The connected tool failed without returning an error message.'
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

function withRuntimeContext(
  message: string,
  config: LocalAgentConfig,
  input: RunAgentInput,
  plannedToolNames: string[],
): string {
  const browserEnabled = config.browserMcpEnabled && Boolean(config.browserMcpCommand)
  const context = [
    input.webmcpBaseUrl ? `Connected website base URL: ${input.webmcpBaseUrl}.` : '',
    input.webmcpLoginUrl ? `Customer login URL: ${input.webmcpLoginUrl}.` : '',
    input.browserStartUrl ? `Browser start URL: ${input.browserStartUrl}.` : '',
    browserEnabled
      ? 'Browser MCP is available for visible browser actions.'
      : 'Browser MCP is not available in this run; use WebMCP API tools or explain that browser automation is not configured.',
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

function isBrowserNavigationBatch(message: Message): boolean {
  const toolUses = message.content.filter((block) => block.type === 'toolUseBlock')
  if (toolUses.length === 0) return false

  return toolUses.every((block) => {
    const toolUse = block as { name: string; input?: unknown }
    if (/^browser_(?:navigate|open)$/i.test(toolUse.name)) return true
    if (toolUse.name !== 'browser_tabs' || !isRecord(toolUse.input)) return false
    return toolUse.input.action === 'new'
  })
}

function isPureBrowserNavigationRequest(message: string): boolean {
  const text = message.toLowerCase()
  if (/\b(?:and|then)\b.*\b(?:approve|book|cancel|create|delete|fill|press|select|submit|type|update)\b/i.test(text)) {
    return false
  }
  if (/\b(?:from there|instead of .*tools|using the website|through the website)\b/i.test(text)) {
    return false
  }
  return /\b(?:open|go|goto|navigate|visit|launch|show)\b/i.test(text)
    && /\b(?:website|site|app|page|url|browser|portal|dashboard|admin|orders?)\b/i.test(text)
}

function isMixedBrowserWorkflowRequest(message: string): boolean {
  const text = message.toLowerCase()
  return /\b(?:browser|website|site|app|portal|page|ui|there)\b/i.test(text)
    && /\b(?:approve|book|cancel|create|delete|fill|press|select|submit|type|update)\b/i.test(text)
}

function isBrowserToolName(name: string): boolean {
  return /^browser_/i.test(name)
}

function addMissingBrowserTools(selection: { tools: Tool[]; names: string[] }, availableTools: Tool[]): void {
  const selected = new Set(selection.names)
  const browserTools = availableTools.filter((tool) => isBrowserToolName(tool.name))

  for (const tool of browserTools) {
    if (selected.has(tool.name)) continue
    selection.tools.push(tool)
    selection.names.push(tool.name)
    selected.add(tool.name)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function systemPrompt(): string {
  return [
    'You are a local desktop agent for connected customer applications.',
    'The user speaks naturally and may use imperfect wording. Infer intent from meaning, not exact keyword matching.',
    'First decide whether the request is supported by available tools. If not supported, say what connected app actions are available.',
    'Use WebMCP API tools for customer app data/actions when available.',
    'Use Browser MCP when the user asks to open the site, navigate pages, click/type in the UI, inspect visible page state, or handle login/OTP/browser-only interaction.',
    'If Browser MCP is available and the user asks to use the website UI, open the connected website/login URL first, inspect the visible page, navigate through visible links or controls, then complete the requested UI action.',
    'When the user says to do something from there, through the website, in the UI, or instead of tools, do not stop after opening the site; continue with browser inspection/click/type actions until the task is completed or blocked.',
    'For browser navigation, start from the connected website URL and derive or discover routes from the request and visible page; do not rely on application-specific route names.',
    'Prefer WebMCP API tools over browser clicking for direct data actions unless the user specifically asks to use the website UI or no API tool is available.',
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
