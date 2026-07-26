import { homedir } from 'node:os'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'

import { McpClient } from '@strands-agents/sdk'
import type { JSONValue } from '@strands-agents/sdk'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import type { LocalAgentConfig } from '../config.js'

export type BrowserMcpConfig = Pick<
  LocalAgentConfig,
  'browserMcpEnabled' | 'browserMcpCommand' | 'browserMcpArgs'
>

export type McpServerDiagnostic = {
  name: string
  enabled: boolean
  configured: boolean
  connected: boolean
  tools: string[]
  error?: string
}

export type BrowserSessionDiagnostic = {
  enabled: boolean
  configured: boolean
  connected: boolean
  pageUrl?: string
  profileDir?: string
  error?: string
}

type ManagedMcpClient = {
  client: McpClient
}

type BrowserNavigationResult = {
  toolName: string
  result: JSONValue
  openedInNewTab: boolean
  managedBrowser: boolean
  pageUrl?: string
}

const BROWSER_AGENT_TOOLS = new Set([
  'browser_navigate',
  'browser_navigate_back',
  'browser_tabs',
  'browser_snapshot',
  'browser_click',
  'browser_type',
  'browser_fill_form',
  'browser_select_option',
  'browser_press_key',
  'browser_wait_for',
  'browser_handle_dialog',
  'browser_file_upload',
  'browser_take_screenshot',
  'browser_hover',
  'browser_drag',
])

// MCP subprocesses are server-scoped. Health checks and agent calls reuse the
// same client instead of launching a browser runtime for every request.
const managedClients = new Map<string, ManagedMcpClient>()

export async function createMcpTools(config: LocalAgentConfig) {
  const tools = []

  if (config.browserMcpEnabled && config.browserMcpCommand) {
    const client = getManagedClient('browser-mcp', config.browserMcpCommand, config.browserMcpArgs)
    const browserTools = await client.listTools()
    tools.push(...browserTools.filter((tool) => BROWSER_AGENT_TOOLS.has(tool.name)))
  }

  if (config.context7Enabled && config.context7Command) {
    const client = getManagedClient('context7', config.context7Command, config.context7Args)
    tools.push(...await client.listTools())
  }

  return tools
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
  config: BrowserMcpConfig,
  url: string,
  options: { protectedOrigin?: string } = {},
): Promise<BrowserNavigationResult> {
  if (!config.browserMcpEnabled || !config.browserMcpCommand) {
    throw new Error('Browser automation is not configured.')
  }

  try {
    const result = await performBrowserNavigation(config, url, options)
    if (!isClosedBrowserSession(result.result)) return result
  } catch (error) {
    if (!isClosedBrowserSession(error)) throw error
  }

  await resetManagedClient('browser-mcp')
  return performBrowserNavigation(config, url, options)
}

export async function readBrowserPageUrl(config: BrowserMcpConfig): Promise<string | null> {
  if (!config.browserMcpEnabled || !config.browserMcpCommand) return null

  try {
    return await performBrowserPageRead(config)
  } catch (error) {
    if (!isClosedBrowserSession(error)) throw error
  }

  await resetManagedClient('browser-mcp')
  return performBrowserPageRead(config)
}

export async function inspectBrowserSession(config: BrowserMcpConfig): Promise<BrowserSessionDiagnostic> {
  const profileDir = browserProfileDir(config)
  if (!config.browserMcpEnabled) {
    return { enabled: false, configured: Boolean(config.browserMcpCommand), connected: false, profileDir }
  }
  if (!config.browserMcpCommand) {
    return { enabled: true, configured: false, connected: false, profileDir, error: 'Managed browser is not configured.' }
  }

  try {
    const pageUrl = await readBrowserPageUrl(config)
    return {
      enabled: true,
      configured: true,
      connected: Boolean(pageUrl),
      ...(pageUrl ? { pageUrl } : {}),
      profileDir,
    }
  } catch (error) {
    return {
      enabled: true,
      configured: true,
      connected: false,
      profileDir,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function resetBrowserSession(config: BrowserMcpConfig): Promise<BrowserSessionDiagnostic> {
  await resetManagedClient('browser-mcp')
  const profileDir = browserProfileDir(config)
  if (profileDir) await rm(profileDir, { recursive: true, force: true }).catch(() => undefined)
  return inspectBrowserSession(config)
}

async function performBrowserPageRead(config: BrowserMcpConfig): Promise<string | null> {
  const client = getManagedClient('browser-mcp', config.browserMcpCommand!, config.browserMcpArgs)
  const tools = await client.listTools()
  return readConnectedPageUrl(client, tools)
}

async function performBrowserNavigation(
  config: BrowserMcpConfig,
  url: string,
  options: { protectedOrigin?: string },
): Promise<BrowserNavigationResult> {
  const client = getManagedClient('browser-mcp', config.browserMcpCommand!, config.browserMcpArgs)
  const tools = await client.listTools()
  const navigateTool = tools.find((tool) => tool.name === 'browser_navigate')
    ?? tools.find((tool) => /navigate|open/i.test(tool.name))
  const tabsTool = tools.find((tool) => tool.name === 'browser_tabs')

  if (isManagedPlaywright(config) && navigateTool) {
    const result = await client.callTool(navigateTool, { url } as Record<string, JSONValue>)
    return {
      toolName: navigateTool.name,
      result,
      openedInNewTab: false,
      managedBrowser: true,
      pageUrl: extractPageUrl(result) ?? undefined,
    }
  }

  if (tabsTool) {
    const result = await client.callTool(tabsTool, {
      action: 'new',
      url,
    } as Record<string, JSONValue>)
    return {
      toolName: tabsTool.name,
      result,
      openedInNewTab: true,
      managedBrowser: false,
      pageUrl: extractPageUrl(result) ?? undefined,
    }
  }

  if (options.protectedOrigin) {
    const currentUrl = await readConnectedPageUrl(client, tools)
    if (currentUrl && sameOrigin(currentUrl, options.protectedOrigin)) {
      throw new Error(
        'The browser provider is attached to the chat app tab. Navigation was stopped to keep the chat open. Use a provider with tab management or connect it to a separate customer-app tab.',
      )
    }
  }

  if (!navigateTool) {
    throw new Error(`The browser provider has no navigation tool. Tools: ${tools.map((tool) => tool.name).join(', ')}`)
  }

  const result = await client.callTool(navigateTool, { url } as Record<string, JSONValue>)
  return {
    toolName: navigateTool.name,
    result,
    openedInNewTab: false,
    managedBrowser: false,
    pageUrl: extractPageUrl(result) ?? undefined,
  }
}

export async function shutdownMcpClients(): Promise<void> {
  const clients = [...managedClients.values()]
  managedClients.clear()
  await Promise.allSettled(clients.map((entry) => entry.client.disconnect()))
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

  const client = getManagedClient(name, command, args)
  try {
    const tools = await client.listTools()
    const toolNames = tools.map((tool) => tool.name)

    return {
      name,
      enabled,
      configured: true,
      connected: client.connectionState === 'connected',
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

async function readConnectedPageUrl(
  client: McpClient,
  tools: Awaited<ReturnType<McpClient['listTools']>>,
): Promise<string | null> {
  const snapshotTool = tools.find((tool) => tool.name === 'browser_snapshot')
  if (!snapshotTool) return null

  const snapshot = await client.callTool(snapshotTool, {})
  return extractPageUrl(snapshot)
}

function extractPageUrl(result: unknown): string | null {
  return extractMcpText(result).match(/-\s*Page URL:\s*(\S+)/i)?.[1] ?? null
}

function isClosedBrowserSession(value: unknown): boolean {
  const message = value instanceof Error
    ? value.message
    : typeof value === 'string'
      ? value
      : extractMcpText(value) || JSON.stringify(value)

  return /(?:target page|browser context|browser|page|context).*(?:has been closed|is closed|was closed)|(?:connection|transport).*(?:closed|ended)/i.test(message)
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin
  } catch {
    return false
  }
}

function isManagedPlaywright(config: BrowserMcpConfig): boolean {
  return config.browserMcpArgs.some((arg) => arg.includes('@playwright/mcp') || arg === '--user-data-dir')
}

function createStdioClient(name: string, command: string, args: string[]): McpClient {
  const runtimeArgs = name === 'browser-mcp' ? normalizeBrowserArgs(args) : args
  return new McpClient({
    applicationName: `swagger-agent-${name}`,
    applicationVersion: '0.1.0',
    continueOnError: true,
    transport: new StdioClientTransport({ command, args: runtimeArgs }),
  })
}

function normalizeBrowserArgs(args: string[]): string[] {
  if (!args.some((arg) => arg.includes('@playwright/mcp'))) return args

  const normalized = [...args]
  const runtimeHome = join(homedir(), '.swagger-agent')
  if (!normalized.includes('--browser')) normalized.push('--browser', 'chrome')
  if (!normalized.includes('--shared-browser-context')) normalized.push('--shared-browser-context')
  if (!normalized.includes('--save-session')) normalized.push('--save-session')
  if (!normalized.includes('--user-data-dir') && !normalized.includes('--isolated') && !normalized.includes('--extension')) {
    normalized.push('--user-data-dir', join(runtimeHome, 'playwright-profile'))
  }
  if (!normalized.includes('--output-dir')) normalized.push('--output-dir', join(runtimeHome, 'playwright-output'))
  return normalized
}

function browserProfileDir(config: BrowserMcpConfig): string | undefined {
  if (!config.browserMcpArgs.some((arg) => arg.includes('@playwright/mcp'))) return undefined
  const index = config.browserMcpArgs.indexOf('--user-data-dir')
  if (index >= 0 && config.browserMcpArgs[index + 1]) return config.browserMcpArgs[index + 1]
  return join(homedir(), '.swagger-agent', 'playwright-profile')
}

function getManagedClient(name: string, command: string, args: string[]): McpClient {
  const existing = managedClients.get(name)

  if (existing && existing.client.connectionState !== 'failed') {
    return existing.client
  }

  const client = createStdioClient(name, command, args)
  managedClients.set(name, { client })
  return client
}

async function resetManagedClient(name: string): Promise<void> {
  const existing = managedClients.get(name)
  managedClients.delete(name)
  if (existing) await existing.client.disconnect().catch(() => undefined)
}
