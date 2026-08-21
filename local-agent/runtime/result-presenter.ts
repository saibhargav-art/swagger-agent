import { Agent, type AgentConfig } from '@strands-agents/sdk'

import type { AgentTraceStep } from './types.js'

const MAX_RESULT_CONTEXT_CHARS = 30_000

export class ResultPresenter {
  private readonly agent: Agent

  constructor(model: AgentConfig['model']) {
    this.agent = new Agent({
      name: 'Tool Result Presenter',
      description: 'Turns connected-app tool results into precise user-facing answers.',
      model,
      tools: [],
      printer: false,
      systemPrompt: [
        'Answer the user request using only the supplied connected-app tool results.',
        'Apply the exact condition the user asked for rather than returning every record.',
        'For analytical requests, filter, group, compare, count, or identify matching records as needed.',
        'For duplicate detection, infer the comparison fields from the request and report only duplicate groups.',
        'State clearly when no records satisfy the condition.',
        'Keep useful names, statuses, amounts, and identifiers, but do not expose raw JSON.',
        'Do not invent records or claim that another action was executed.',
      ].join(' '),
    })
  }

  async present(userRequest: string, trace: AgentTraceStep[]): Promise<string> {
    this.agent.messages.splice(0)
    const resultContext = JSON.stringify(trace.map(({ name, input, result, ok }) => ({
      tool: name,
      input,
      result,
      ok,
    })))

    const prompt = [
      `User request: ${JSON.stringify(userRequest)}`,
      `Connected-app tool results:\n${truncate(resultContext, MAX_RESULT_CONTEXT_CHARS)}`,
      'Return the final answer for the user.',
    ].join('\n\n')

    const result = await this.agent.invoke(prompt, {
      limits: {
        turns: 1,
        outputTokens: 800,
        totalTokens: 8_000,
      },
    })

    return messageText(result.lastMessage).trim()
  }
}

function messageText(message: { content: Array<{ type: string; text?: unknown }> }): string {
  return message.content
    .filter((block) => block.type === 'textBlock' && typeof block.text === 'string')
    .map((block) => String(block.text))
    .join('\n')
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}\n[Result truncated for model context]`
}
