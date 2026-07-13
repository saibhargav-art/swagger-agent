import { McpClient } from '@strands-agents/sdk'
import type { JSONValue } from '@strands-agents/sdk'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import type { LocalAgentConfig } from '../config.js'

export type McpServerDiagnostic = {
  name: string
  enabled: boolean
  configured: boolean
  connected: boolean
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
    return {
      name,
      enabled,
      configured: true,
      connected: client.connectionState === 'connected',
      tools: tools.map((tool) => tool.name),
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

function createStdioClient(name: string, command: string, args: string[]): McpClient {
  return new McpClient({
    applicationName: `swagger-agent-${name}`,
    applicationVersion: '0.1.0',
    continueOnError: true,
    transport: new StdioClientTransport({ command, args }),
  })
}
