import { Agent, type Tool } from '@strands-agents/sdk'
import { AnthropicModel } from '@strands-agents/sdk/models/anthropic'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'

import type { LocalAgentConfig } from './config.js'
import { extractTrace, isSuccessfulToolResult, toolResultText } from './runtime/agent-trace.js'
import { isApproval, isCancellation } from './runtime/confirmation.js'
import type {
  AgentTraceStep,
  ConfirmPendingActionInput,
  ResolvedRunAgentInput,
  RunAgentResult,
} from './runtime/types.js'
import {
  approvePendingWebMcpWrite,
  clearPendingWebMcpWrite,
  clearPendingWebMcpWritesForConnection,
  clearWebMcpContractCache,
  createWebMcpTools,
  getPendingWebMcpWrite,
  hasPendingWebMcpWrite,
} from './tools/webmcp-tools.js'

const AGENT_CACHE_TTL_MS = 60 * 60 * 1000
const MAX_CACHED_AGENTS = 50
const MAX_AGENT_TOKENS = Number(process.env.STRANDS_MAX_TOKENS ?? 12_000)
const MAX_AGENT_TURNS = Number(process.env.STRANDS_MAX_TURNS ?? 8)

type AgentEntry = {
  agent: Agent
  conversationId: string
  connectionId: string
  lastUsedAt: number
}

const agents = new Map<string, AgentEntry>()

export async function runAgent(
  config: LocalAgentConfig,
  input: ResolvedRunAgentInput,
): Promise<RunAgentResult> {
  const conversationId = input.conversationId?.trim() || 'default'
  const pendingResult = await handlePendingWrite(conversationId, input)
  if (pendingResult) return pendingResult

  const entry = await getOrCreateAgent(mergeRuntimeConfig(config, input), conversationId, input)
  const messageStart = entry.agent.messages.length
  const result = await entry.agent.invoke(input.message, {
    limits: { turns: MAX_AGENT_TURNS, totalTokens: MAX_AGENT_TOKENS },
  })
  entry.lastUsedAt = Date.now()

  const trace = extractTrace(entry.agent.messages.slice(messageStart))
  const pendingWrite = getPendingWebMcpWrite(conversationId)
  if (pendingWrite) return confirmationResult(conversationId, pendingWrite, trace)

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
      content: 'The connected-app workflow reached its execution limit before it completed.',
      stopReason: result.stopReason,
      trace,
    }
  }

  return {
    content: agentResultText(result) || summarizeTrace(trace) || 'I could not produce a response.',
    stopReason: result.stopReason,
    trace,
  }
}

export async function resolvePendingAction(
  input: ConfirmPendingActionInput,
): Promise<RunAgentResult> {
  const conversationId = input.conversationId.trim() || 'default'
  const pending = getPendingWebMcpWrite(conversationId)
  if (!pending) {
    return { content: 'There is no pending action to confirm.', stopReason: 'endTurn', trace: [] }
  }

  if (!input.approved) {
    clearPendingWebMcpWrite(conversationId)
    resetConversation(conversationId)
    return { content: 'Cancelled the pending action.', stopReason: 'endTurn', trace: [] }
  }

  const result = await approvePendingWebMcpWrite(conversationId, {
    bearerToken: input.webmcpBearerToken,
  })
  resetConversation(conversationId)
  return approvedWriteResult(pending.toolName, pending.input, result)
}

export function releaseCustomerConnection(connectionId: string): void {
  for (const [key, entry] of agents) {
    if (entry.connectionId === connectionId) agents.delete(key)
  }
  clearPendingWebMcpWritesForConnection(connectionId)
}

export async function shutdownAgents(): Promise<void> {
  agents.clear()
  clearWebMcpContractCache()
}

async function handlePendingWrite(
  conversationId: string,
  input: ResolvedRunAgentInput,
): Promise<RunAgentResult | undefined> {
  if (!hasPendingWebMcpWrite(conversationId)) return undefined

  if (isCancellation(input.message)) {
    clearPendingWebMcpWrite(conversationId)
    resetConversation(conversationId)
    return { content: 'Cancelled the pending action.', stopReason: 'endTurn' }
  }

  if (isApproval(input.message)) {
    const pending = getPendingWebMcpWrite(conversationId)
    const result = await approvePendingWebMcpWrite(conversationId, {
      bearerToken: input.webmcpBearerToken,
    })
    resetConversation(conversationId)
    return approvedWriteResult(
      pending?.toolName ?? 'confirmed_action',
      pending?.input ?? {},
      result,
    )
  }

  clearPendingWebMcpWrite(conversationId)
  resetConversation(conversationId)
  return undefined
}

async function getOrCreateAgent(
  config: LocalAgentConfig,
  conversationId: string,
  input: ResolvedRunAgentInput,
): Promise<AgentEntry> {
  const cacheKey = agentCacheKey(config, conversationId, input)
  pruneAgentCache()
  const existing = agents.get(cacheKey)
  if (existing) {
    existing.lastUsedAt = Date.now()
    return existing
  }

  const tools: Tool[] = await createWebMcpTools({
    baseUrl: input.webmcpBaseUrl,
    bearerToken: input.webmcpBearerToken,
    allowWrites: false,
    confirmationSessionId: conversationId,
    customerConnectionId: input.customerConnectionId,
  })
  const entry: AgentEntry = {
    agent: new Agent({
      name: 'Connected App Agent',
      description: 'Executes capabilities exposed by the connected customer application.',
      model: createModel(config),
      tools,
      toolExecutor: 'sequential',
      printer: false,
      systemPrompt: systemPrompt(),
    }),
    conversationId,
    connectionId: input.customerConnectionId,
    lastUsedAt: Date.now(),
  }
  agents.set(cacheKey, entry)
  pruneAgentCache()
  return entry
}

function systemPrompt(): string {
  return [
    'You are an agent for one connected customer application.',
    'Use only registered tools and their schemas; never invent tools, fields, records, or results.',
    'Interpret natural language semantically, including minor spelling mistakes.',
    'Choose the tool that directly fulfills the request.',
    'Do not run searches, lists, or existence checks unless requested or another action requires unavailable data.',
    'When an action requires an internal identifier the user did not provide, resolve it through an appropriate read tool using natural attributes.',
    'If one record matches, continue. If multiple records match, ask the user to choose. If none match, explain that clearly.',
    'When all declared parameters for a write action are available, invoke it exactly once. The runtime stages it for explicit confirmation.',
    'Do not ask for confirmation in prose and do not treat confirmation as a tool parameter.',
    'Read operations execute immediately and never require confirmation.',
    'After tools finish, answer concisely without exposing raw JSON.',
    'If no registered tool supports the request, state that and briefly list relevant available actions.',
  ].join(' ')
}

function confirmationResult(
  conversationId: string,
  pending: { toolName: string; title: string; input: Record<string, unknown> },
  trace: AgentTraceStep[],
): RunAgentResult {
  return {
    content: confirmationPrompt(pending.title, pending.input),
    stopReason: 'endTurn',
    trace: trace.map((step) => step.name === pending.toolName
      ? { ...step, ok: true, status: 'attention' as const, result: { state: 'Waiting for confirmation' } }
      : step),
    confirmationRequired: {
      runId: conversationId,
      toolName: pending.toolName,
      title: pending.title,
      details: pending.input,
      confirmLabel: actionConfirmLabel(pending.title),
      cancelLabel: 'Cancel',
    },
  }
}

function approvedWriteResult(
  toolName: string,
  input: Record<string, unknown>,
  result: unknown,
): RunAgentResult {
  return {
    content: summarizeApprovedWrite(result),
    stopReason: 'endTurn',
    trace: [{ type: 'tool', name: toolName, input, result, ok: isSuccessfulToolResult(result) }],
  }
}

function confirmationPrompt(title: string, details: Record<string, unknown>): string {
  const hasDetails = Object.values(details).some((value) => value !== undefined && value !== null && value !== '')
  return hasDetails ? `Confirm ${title} with these details.` : `Confirm ${title} before I proceed.`
}

function actionConfirmLabel(title: string): string {
  if (/create/i.test(title)) return 'Create'
  if (/delete|remove/i.test(title)) return 'Delete'
  if (/update/i.test(title)) return 'Update'
  if (/approve/i.test(title)) return 'Approve'
  return 'Confirm'
}

function summarizeApprovedWrite(result: unknown): string {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const record = result as Record<string, unknown>
    if (record.ok === false) return summarizeToolFailure(result)
    const id = record.id ?? record.order_id ?? record.orderId
    return `Confirmed. The action completed successfully.${id === undefined ? '' : ` ID: ${String(id)}`}`
  }
  return 'Confirmed. The action completed successfully.'
}

function summarizeToolFailure(result: unknown): string {
  const { status, message } = toolFailureDetails(result)
  if (status === 401 || /invalid session|jwt|expired|unauthorized/i.test(message)) {
    return 'The customer session is invalid or expired. Sign in again, update the access token, and reconnect the app.'
  }
  if (status === 403) {
    return message
      ? `The connected app denied this request: ${message}`
      : 'The connected app denied this request. Check the user role and application account.'
  }
  const concise = message.replace(/\s+/g, ' ').trim()
  return concise ? `The connected tool failed: ${concise.slice(0, 500)}` : 'The connected tool failed.'
}

function toolFailureDetails(result: unknown): { status?: number; message: string } {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { message: toolResultText(result) }
  }

  const record = result as Record<string, unknown>
  const status = typeof record.status === 'number' ? record.status : undefined
  const error = record.error
  if (typeof error === 'string') return { status, message: error }
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const nested = error as Record<string, unknown>
    const message = nested.error ?? nested.message ?? nested.detail
    if (typeof message === 'string') return { status, message }
  }
  return { status, message: toolResultText(result) }
}

function summarizeTrace(trace: AgentTraceStep[]): string {
  const last = trace.at(-1)
  if (!last) return ''
  if (Array.isArray(last.result)) return `Found ${last.result.length} records.`
  return `${humanize(last.name)} completed.`
}

function agentResultText(result: { lastMessage: { content: Array<{ type: string; text?: unknown }> } }): string {
  return result.lastMessage.content
    .filter((block) => block.type === 'textBlock' && typeof block.text === 'string')
    .map((block) => String(block.text))
    .join('\n')
    .trim()
}

function createModel(config: LocalAgentConfig) {
  if (config.modelProvider === 'openai') {
    if (!config.openAiApiKey) throw new Error('OPENAI_API_KEY is required for OpenAI.')
    return new OpenAIModel({ api: 'responses', apiKey: config.openAiApiKey, modelId: config.openAiModel, temperature: 0.1 })
  }

  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is required for Claude.')
  return new AnthropicModel({
    apiKey: config.anthropicApiKey,
    modelId: config.anthropicModel,
    temperature: 0.1,
    maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS ?? 4096),
  })
}

function mergeRuntimeConfig(config: LocalAgentConfig, input: ResolvedRunAgentInput): LocalAgentConfig {
  return {
    ...config,
    modelProvider: input.modelProvider ?? config.modelProvider,
    openAiApiKey: input.openAiApiKey ?? config.openAiApiKey,
    openAiModel: input.openAiModel ?? config.openAiModel,
    anthropicApiKey: input.anthropicApiKey ?? config.anthropicApiKey,
    anthropicModel: input.anthropicModel ?? config.anthropicModel,
  }
}

function agentCacheKey(config: LocalAgentConfig, conversationId: string, input: ResolvedRunAgentInput): string {
  return [
    conversationId,
    config.modelProvider,
    config.openAiModel,
    fingerprint(config.openAiApiKey ?? ''),
    config.anthropicModel,
    fingerprint(config.anthropicApiKey ?? ''),
    input.customerConnectionId,
  ].join('|')
}

function resetConversation(conversationId: string): void {
  for (const [key, entry] of agents) {
    if (entry.conversationId === conversationId) agents.delete(key)
  }
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

function fingerprint(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  return `${value.length}:${hash.toString(16)}`
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (character) => character.toUpperCase())
}
