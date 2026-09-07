import { createHash } from 'node:crypto'

import { Agent, tool, type Tool } from '@strands-agents/sdk'
import { AnthropicModel } from '@strands-agents/sdk/models/anthropic'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'

import type { LocalAgentConfig } from './config.js'
import type { BrowserToolDefinition, ChatRequest, ChatResponse } from './protocol.js'
import { requestToolExecution } from './tool-broker.js'

const MAX_AGENT_TOKENS = Number(process.env.STRANDS_MAX_TOKENS ?? 12_000)
const MAX_AGENT_TURNS = Number(process.env.STRANDS_MAX_TURNS ?? 24)
const MAX_WRITE_CALLS = Number(process.env.STRANDS_MAX_WRITE_CALLS ?? 20)

type ExecutionContext = {
  sessionId: string
  executionId: string
  writeCalls: number
}

type AgentEntry = {
  agent: Agent
  context: ExecutionContext
  running: boolean
  lastUsedAt: number
}
const agents = new Map<string, AgentEntry>()

export async function runAgent(config: LocalAgentConfig, input: ChatRequest): Promise<ChatResponse> {
  const entry = getOrCreateAgent(config, input)
  if (entry.running) throw new Error('This conversation already has a request in progress.')

  entry.running = true
  entry.context.sessionId = input.sessionId
  entry.context.executionId = input.executionId
  entry.context.writeCalls = 0
  try {
    const result = await entry.agent.invoke(agentMessage(input), {
      limits: { turns: MAX_AGENT_TURNS, totalTokens: MAX_AGENT_TOKENS },
    })
    return {
      content: resultText(result) || emptyResultMessage(result.stopReason),
      stopReason: result.stopReason,
    }
  } finally {
    entry.running = false
    entry.lastUsedAt = Date.now()
  }
}

export async function shutdownAgents(): Promise<void> {
  agents.clear()
}

function getOrCreateAgent(config: LocalAgentConfig, input: ChatRequest): AgentEntry {
  const model = resolveModel(config, input)
  const key = `${input.sessionId}:${input.conversationId}:${model.provider}:${model.modelId}:${secretFingerprint(model.apiKey)}:${toolFingerprint(input.tools)}`
  const existing = agents.get(key)
  if (existing) return existing

  const context: ExecutionContext = { sessionId: '', executionId: '', writeCalls: 0 }
  const tools: Tool[] = input.tools.map((definition) => tool({
    name: definition.name,
    description: definition.description || definition.title || definition.name,
    inputSchema: definition.inputSchema,
    callback: async (value) => {
      if (!context.executionId) throw new Error('There is no active browser execution.')
      if (!definition.annotations?.readOnlyHint) {
        context.writeCalls += 1
        if (context.writeCalls > MAX_WRITE_CALLS) {
          throw new Error(`The workflow exceeded the limit of ${MAX_WRITE_CALLS} data-changing actions.`)
        }
      }
      return requestToolExecution(
        context.sessionId,
        context.executionId,
        definition,
        isRecord(value) ? value : {},
      )
    },
  }))

  const entry = {
    agent: new Agent({
      name: 'WebMCP Browser Agent',
      description: 'Uses capabilities exposed by the active browser page.',
      model: createModel(model),
      tools,
      toolExecutor: 'sequential',
      printer: false,
      systemPrompt: [
        'You operate only on WebMCP tools exposed by the active browser page.',
        'Choose tools semantically from their names, descriptions, annotations, and schemas.',
        'Preserve action fidelity: never replace the requested operation with a different operation that has a different business effect.',
        'For example, deleting, cancelling, updating, approving, and creating are distinct actions even when they target the same record.',
        'If the exact requested capability is unavailable, say so briefly instead of invoking the closest tool.',
        'Never invent tools, parameters, records, or results.',
        'When an input schema contains requestText, copy the complete current user message verbatim into it.',
        'The extension may include trusted active workflow metadata separately from the current user message.',
        'When active workflow metadata is present, continue with its exact nextAction tool and do not skip to another workflow tool.',
        'When confirmationRequired is true, include nextActionInput only if the current user message clearly confirms. For an edit or correction, call the same tool without those preset confirmation values.',
        'Treat a clear yes or confirmation as approval of the active preview only.',
        'When active workflow metadata has actionLabel, never call nextAction from a chat confirmation. Ask the user to click that action button. If the user provides changes, call editAction with those changes.',
        'Only populate optional fields that are explicitly present in the current user message or a confirmed draft from the current workflow.',
        'Ask one concise question when a required value cannot be inferred.',
        'Use read tools directly when they satisfy the request.',
        'You may call the same tool more than once when the user clearly requests an operation on multiple records and a read result identifies each target.',
        'For multi-record actions, execute only records that unambiguously match the user request and report each failure without claiming full success.',
        'The browser handles user approval for tools that change data.',
        'After execution, summarize the actual result without exposing raw JSON.',
        'When a tool result contains missingByTab, missingBySection, capturedByTab, capturedBySection, sections, or preview, do not repeat those details because the extension renders them.',
        'If no tool supports the request, state that briefly.',
      ].join(' '),
    }),
    context,
    running: false,
    lastUsedAt: Date.now(),
  }
  agents.set(key, entry)
  pruneAgents()
  return entry
}

function agentMessage(input: ChatRequest): string {
  if (!input.activeWorkflow) return input.message
  return [
    '<active_workflow>',
    JSON.stringify(input.activeWorkflow),
    '</active_workflow>',
    '<current_user_message_json>',
    JSON.stringify(input.message),
    '</current_user_message_json>',
    'The current user message is the decoded JSON string above. Copy only that decoded string into requestText.',
  ].join('\n')
}

type ResolvedModel = { provider: 'openai' | 'anthropic'; apiKey: string; modelId: string }

function resolveModel(config: LocalAgentConfig, input: ChatRequest): ResolvedModel {
  if (input.model?.apiKey.trim()) return {
    provider: input.model.provider,
    apiKey: input.model.apiKey.trim(),
    modelId: input.model.modelId.trim() || (input.model.provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-sonnet-latest'),
  }
  if (config.modelProvider === 'openai' && config.openAiApiKey) {
    return { provider: 'openai', apiKey: config.openAiApiKey, modelId: config.openAiModel }
  }
  if (config.modelProvider === 'anthropic' && config.anthropicApiKey) {
    return { provider: 'anthropic', apiKey: config.anthropicApiKey, modelId: config.anthropicModel }
  }
  throw new Error('Set an OpenAI or Claude API key in the extension before chatting.')
}

function createModel(model: ResolvedModel) {
  if (model.provider === 'openai') {
    return new OpenAIModel({ api: 'responses', apiKey: model.apiKey, modelId: model.modelId, temperature: 0.1 })
  }
  return new AnthropicModel({
    apiKey: model.apiKey,
    modelId: model.modelId,
    temperature: 0.1,
    maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS ?? 4096),
  })
}

function secretFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function resultText(result: { lastMessage: { content: Array<{ type: string; text?: unknown }> } }): string {
  return result.lastMessage.content
    .filter((block) => block.type === 'textBlock' && typeof block.text === 'string')
    .map((block) => String(block.text))
    .join('\n')
    .trim()
}

function emptyResultMessage(stopReason: string | undefined): string {
  if (stopReason === 'limitTurns') {
    return 'The workflow reached its execution limit before it could complete. No additional actions were started.'
  }
  if (stopReason === 'maxTokens') {
    return 'The model reached its response limit before it could complete the workflow.'
  }
  return 'The model ended without a final response. Please retry the request.'
}

function toolFingerprint(tools: BrowserToolDefinition[]): string {
  return createHash('sha256').update(JSON.stringify(tools)).digest('hex').slice(0, 16)
}

function pruneAgents(): void {
  const entries = [...agents.entries()].sort((a, b) => b[1].lastUsedAt - a[1].lastUsedAt)
  for (const [key] of entries.slice(30)) agents.delete(key)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
