import { McpClient } from '@strands-agents/sdk'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import type { LocalAgentConfig } from '../config.js'

export function createMcpClients(config: LocalAgentConfig): McpClient[] {
  const clients: McpClient[] = []

  if (config.browserMcpCommand) {
    clients.push(createStdioClient('browser-mcp', config.browserMcpCommand, config.browserMcpArgs))
  }

  if (config.context7Enabled) {
    clients.push(createStdioClient('context7', config.context7Command, config.context7Args))
  }

  return clients
}

export async function disconnectMcpClients(clients: McpClient[]): Promise<void> {
  await Promise.allSettled(clients.map((client) => client.disconnect()))
}

function createStdioClient(name: string, command: string, args: string[]): McpClient {
  return new McpClient({
    applicationName: `swagger-agent-${name}`,
    applicationVersion: '0.1.0',
    continueOnError: true,
    transport: new StdioClientTransport({ command, args }),
  })
}
