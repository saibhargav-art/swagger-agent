import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { JSONValue } from '@strands-agents/sdk'

import type { BrowserToolDefinition, ToolRequestEvent, ToolResultRequest } from './protocol.js'

type PendingRequest = {
  sessionId: string
  resolve: (result: ToolResultRequest) => void
  timer: NodeJS.Timeout
}

const streams = new Map<string, ServerResponse>()
const pending = new Map<string, PendingRequest>()

export function subscribe(sessionId: string, response: ServerResponse): void {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })
  response.write(': connected\n\n')
  streams.get(sessionId)?.end()
  streams.set(sessionId, response)

  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 20_000)
  response.on('close', () => {
    clearInterval(heartbeat)
    if (streams.get(sessionId) === response) streams.delete(sessionId)
  })
}

export async function requestToolExecution(
  sessionId: string,
  executionId: string,
  tool: BrowserToolDefinition,
  input: Record<string, unknown>,
): Promise<JSONValue> {
  const stream = streams.get(sessionId)
  if (!stream || stream.destroyed) throw new Error('The browser extension is not connected to the agent service.')

  const requestId = randomUUID()
  const event: ToolRequestEvent = { type: 'tool_request', requestId, executionId, tool, input }
  stream.write(`event: tool_request\ndata: ${JSON.stringify(event)}\n\n`)

  const response = await new Promise<ToolResultRequest>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error(`Tool execution timed out: ${tool.name}`))
    }, 120_000)
    pending.set(requestId, { sessionId, resolve, timer })
  })

  if (!response.ok) throw new Error(response.error || `Tool execution failed: ${tool.name}`)
  return response.result ?? null
}

export function completeToolRequest(result: ToolResultRequest): void {
  const entry = pending.get(result.requestId)
  if (!entry || entry.sessionId !== result.sessionId) throw new Error('Unknown or expired tool request')
  clearTimeout(entry.timer)
  pending.delete(result.requestId)
  entry.resolve(result)
}
