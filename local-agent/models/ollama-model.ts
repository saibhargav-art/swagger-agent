import {
  Model,
  type BaseModelConfig,
  type ContentBlock,
  type ModelStreamEvent,
  type Message,
  type StreamOptions,
  type ToolSpec,
  type ToolResultContent,
} from '@strands-agents/sdk'

type OllamaModelConfig = BaseModelConfig & {
  baseUrl: string
}

type OllamaMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_name?: string
  tool_calls?: Array<{
    type?: 'function'
    function: {
      index?: number
      name: string
      arguments: Record<string, unknown>
    }
  }>
}

type OllamaChatResponse = {
  message?: {
    content?: string
    tool_calls?: Array<{
      function?: {
        name?: string
        arguments?: Record<string, unknown>
      }
    }>
  }
  done?: boolean
  prompt_eval_count?: number
  eval_count?: number
}

export class OllamaModel extends Model<OllamaModelConfig> {
  private config: OllamaModelConfig

  constructor(config: OllamaModelConfig) {
    super()
    this.config = config
  }

  updateConfig(modelConfig: OllamaModelConfig): void {
    this.config = { ...this.config, ...modelConfig }
  }

  getConfig(): OllamaModelConfig {
    return this.config
  }

  async *stream(messages: Message[], options: StreamOptions = {}): AsyncIterable<ModelStreamEvent> {
    const startedAt = Date.now()
    const response = await fetch(`${normalizeOllamaBaseUrl(this.config.baseUrl).replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.modelId,
        stream: false,
        keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? '10m',
        messages: toOllamaMessages(messages, options.systemPrompt),
        tools: (options.toolSpecs ?? []).map(toOllamaTool),
        options: {
          temperature: this.config.temperature ?? 0.1,
          top_p: this.config.topP,
          num_predict: this.config.maxTokens ?? 768,
          num_ctx: Number(process.env.OLLAMA_NUM_CTX ?? 4096),
        },
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      if (/does not support tools/i.test(text)) {
        throw new Error(
          `Ollama model "${this.config.modelId}" does not support tool calling. Use a tools-capable model such as qwen2.5:7b, qwen3:8b, or llama3.1:8b.`,
        )
      }
      throw new Error(`Ollama request failed: HTTP ${response.status} ${text}`)
    }

    const payload = await response.json() as OllamaChatResponse
    const latencyMs = Date.now() - startedAt
    if (process.env.STRANDS_DEBUG_TIMING === 'true') {
      console.log(
        `[ollama] ${this.config.modelId} ${latencyMs}ms input=${payload.prompt_eval_count ?? 0} output=${payload.eval_count ?? 0}`,
      )
    }
    const content = payload.message?.content?.trim() ?? ''
    const toolCalls = payload.message?.tool_calls?.filter((call) => call.function?.name) ?? []

    yield { type: 'modelMessageStartEvent', role: 'assistant' }

    if (toolCalls.length > 0) {
      for (const [index, toolCall] of toolCalls.entries()) {
        const name = toolCall.function?.name ?? ''
        const input = toolCall.function?.arguments ?? {}
        const toolUseId = `ollama-tool-${Date.now()}-${index}`

        yield {
          type: 'modelContentBlockStartEvent',
          start: {
            type: 'toolUseStart',
            name,
            toolUseId,
          },
        }
        yield {
          type: 'modelContentBlockDeltaEvent',
          delta: {
            type: 'toolUseInputDelta',
            input: JSON.stringify(input),
          },
        }
        yield { type: 'modelContentBlockStopEvent' }
      }
      yield { type: 'modelMessageStopEvent', stopReason: 'toolUse' }
    } else {
      yield { type: 'modelContentBlockStartEvent' }
      if (content) {
        yield {
          type: 'modelContentBlockDeltaEvent',
          delta: { type: 'textDelta', text: content },
        }
      }
      yield { type: 'modelContentBlockStopEvent' }
      yield { type: 'modelMessageStopEvent', stopReason: 'endTurn' }
    }

    yield {
      type: 'modelMetadataEvent',
      usage: {
        inputTokens: payload.prompt_eval_count ?? 0,
        outputTokens: payload.eval_count ?? 0,
        totalTokens: (payload.prompt_eval_count ?? 0) + (payload.eval_count ?? 0),
      },
      metrics: {
        latencyMs,
      },
    }
  }
}

function normalizeOllamaBaseUrl(baseUrl: string): string {
  return baseUrl.replace('://localhost:', '://127.0.0.1:')
}

function toOllamaMessages(messages: Message[], systemPrompt?: StreamOptions['systemPrompt']): OllamaMessage[] {
  const result: OllamaMessage[] = []
  const toolNamesById = new Map<string, string>()

  const system = systemPromptToText(systemPrompt)
  if (system) result.push({ role: 'system', content: system })

  for (const message of messages) {
    const text = message.content
      .filter((block) => block.type === 'textBlock')
      .map(contentBlockToText)
      .filter(Boolean)
      .join('\n')

    const toolUses = message.content.filter(isToolUseBlock)
    const toolResults = message.content.filter(isToolResultBlock)

    if (toolUses.length > 0) {
      for (const toolUse of toolUses) {
        toolNamesById.set(toolUse.toolUseId, toolUse.name)
      }

      result.push({
        role: 'assistant',
        content: text,
        tool_calls: toolUses.map((toolUse, index) => ({
          type: 'function',
          function: {
            index,
            name: toolUse.name,
            arguments: asRecord(toolUse.input),
          },
        })),
      })
      continue
    }

    if (toolResults.length > 0) {
      for (const toolResult of toolResults) {
        result.push({
          role: 'tool',
          tool_name: toolNamesById.get(toolResult.toolUseId) ?? 'unknown_tool',
          content: toolResultContentToText(toolResult.content),
        })
      }
      continue
    }

    result.push({
      role: message.role,
      content: text,
    })
  }

  return result
}

function systemPromptToText(systemPrompt?: StreamOptions['systemPrompt']): string {
  if (!systemPrompt) return ''
  if (typeof systemPrompt === 'string') return systemPrompt
  return systemPrompt
    .map((block: ContentBlock) => ('text' in block ? String(block.text) : ''))
    .filter(Boolean)
    .join('\n')
}

function contentBlockToText(block: ContentBlock): string {
  if (block.type === 'textBlock' && 'text' in block) return String(block.text)
  return ''
}

function resultContentToText(block: ToolResultContent): string {
  if (block.type === 'textBlock' && 'text' in block) return String(block.text)
  if (block.type === 'jsonBlock' && 'json' in block) return JSON.stringify(block.json)
  return JSON.stringify(block)
}

type ToolUseLike = ContentBlock & {
  type: 'toolUseBlock'
  name: string
  toolUseId: string
  input: unknown
}

type ToolResultLike = ContentBlock & {
  type: 'toolResultBlock'
  toolUseId: string
  content: ToolResultContent[]
}

function isToolUseBlock(block: ContentBlock): block is ToolUseLike {
  return block.type === 'toolUseBlock'
}

function isToolResultBlock(block: ContentBlock): block is ToolResultLike {
  return block.type === 'toolResultBlock'
}

function toolResultContentToText(content: ToolResultContent[]): string {
  return content.map(resultContentToText).filter(Boolean).join('\n')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function toOllamaTool(spec: ToolSpec) {
  return {
    type: 'function',
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.inputSchema ?? {
        type: 'object',
        properties: {},
      },
    },
  }
}
