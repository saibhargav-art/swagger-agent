import type { Message } from '@strands-agents/sdk'
import type { AgentTraceStep } from './types.js'

export function extractTrace(messages: Message[]): AgentTraceStep[] {
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

export function isSuccessfulToolResult(result: unknown): boolean {
  if (typeof result === 'string') {
    return !/\b(error|failed|not connected|client closed|timed out|timeout|unable|cannot)\b/i.test(result)
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) return true
  const record = result as Record<string, unknown>
  return record.ok !== false && record.isError !== true && !record.error
}

export function toolResultText(result: unknown): string {
  if (typeof result === 'string') return result
  if (Array.isArray(result)) return result.map(toolResultText).filter(Boolean).join(' ')
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

export function hasFailedToolResult(message: Message): boolean {
  return message.content.some((block) => {
    if (block.type !== 'toolResultBlock') return false
    const status = (block as { status?: unknown }).status
    if (status === 'error') return true
    const values = extractToolResultValues(block)
    return values.some((value) => !isSuccessfulToolResult(value))
  })
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
