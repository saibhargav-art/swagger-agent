import { McpClient } from '@strands-agents/sdk'
import type { JSONValue } from '@strands-agents/sdk'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import type { LocalAgentConfig } from '../config.js'

export type McpServerDiagnostic = {
  name: string
  enabled: boolean
  configured: boolean
  connected: boolean
  browserSessionConnected?: boolean
  browserSessionError?: string
  tools: string[]
  error?: string
}

export function createMcpClients(config: LocalAgentConfig): McpClient[] {
  const clients: McpClient[] = []

  if (config.browserMcpEnabled && config.browserMcpCommand) {
    clients.push(createStdioClient('browser-mcp', config.browserMcpCommand, config.browserMcpArgs))
  }

  if (config.context7Enabled && config.context7Command) {
    clients.push(createStdioClient('context7', config.context7Command, config.context7Args))
  }

  return clients
}

export async function inspectMcpServers(config: LocalAgentConfig): Promise<McpServerDiagnostic[]> {
  const diagnostics: McpServerDiagnostic[] = []

  diagnostics.push(
    await inspectServer({
      name: 'browser-mcp',
      enabled: config.browserMcpEnabled,
      command: config.browserMcpCommand,
      args: config.browserMcpArgs,
    }),
  )

  diagnostics.push(
    await inspectServer({
      name: 'context7',
      enabled: config.context7Enabled,
      command: config.context7Command,
      args: config.context7Args,
    }),
  )

  return diagnostics
}

export async function navigateWithBrowserMcp(
  config: LocalAgentConfig,
  url: string,
): Promise<{ toolName: string; result: JSONValue }> {
  if (!config.browserMcpEnabled || !config.browserMcpCommand) {
    throw new Error('Browser MCP is not configured.')
  }

  const client = createStdioClient('browser-mcp', config.browserMcpCommand, config.browserMcpArgs)
  try {
    const tools = await client.listTools()
    const navigateTool = tools.find((tool) => tool.name === 'browser_navigate')
      ?? tools.find((tool) => /navigate|open/i.test(tool.name))

    if (!navigateTool) {
      throw new Error(`Browser MCP connected but no navigation tool was found. Tools: ${tools.map((tool) => tool.name).join(', ')}`)
    }

    const result = await client.callTool(navigateTool, { url } as Record<string, JSONValue>)
    return { toolName: navigateTool.name, result }
  } finally {
    await client.disconnect().catch(() => undefined)
  }
}

export async function disconnectMcpClients(clients: McpClient[]): Promise<void> {
  await Promise.allSettled(clients.map((client) => client.disconnect()))
}

async function inspectServer({
  name,
  enabled,
  command,
  args,
}: {
  name: string
  enabled: boolean
  command?: string
  args: string[]
}): Promise<McpServerDiagnostic> {
  if (!enabled) {
    return { name, enabled, configured: Boolean(command), connected: false, tools: [] }
  }

  if (!command) {
    return {
      name,
      enabled,
      configured: false,
      connected: false,
      tools: [],
      error: `${name} is enabled but no command is configured.`,
    }
  }

  const client = createStdioClient(name, command, args)
  try {
    const tools = await client.listTools()
    const toolNames = tools.map((tool) => tool.name)
    const sessionCheck = name === 'browser-mcp'
      ? await inspectBrowserSession(client, tools)
      : {}

    return {
      name,
      enabled,
      configured: true,
      connected: client.connectionState === 'connected',
      ...sessionCheck,
      tools: toolNames,
    }
  } catch (err) {
    return {
      name,
      enabled,
      configured: true,
      connected: false,
      tools: [],
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    await client.disconnect().catch(() => undefined)
  }
}

async function inspectBrowserSession(
  client: McpClient,
  tools: Awaited<ReturnType<McpClient['listTools']>>,
): Promise<Pick<McpServerDiagnostic, 'browserSessionConnected' | 'browserSessionError'>> {
  const snapshotTool = tools.find((tool) => tool.name === 'browser_snapshot')
  if (!snapshotTool) return {}

  try {
    const result = await client.callTool(snapshotTool, {})
    const isError = Boolean(result && typeof result === 'object' && !Array.isArray(result) && (result as { isError?: unknown }).isError)
    if (isError) {
      return {
        browserSessionConnected: false,
        browserSessionError: extractMcpText(result),
      }
    }

    return { browserSessionConnected: true }
  } catch (err) {
    return {
      browserSessionConnected: false,
      browserSessionError: err instanceof Error ? err.message : String(err),
    }
  }
}

function extractMcpText(result: unknown): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return String(result ?? '')
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) return JSON.stringify(result)

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const text = (item as { text?: unknown }).text
      return typeof text === 'string' ? text : ''
    })
    .filter(Boolean)
    .join(' ')
}

function createStdioClient(name: string, command: string, args: string[]): McpClient {
  return new McpClient({
    applicationName: `swagger-agent-${name}`,
    applicationVersion: '0.1.0',
    continueOnError: true,
    transport: new StdioClientTransport({ command, args }),
  })
}
