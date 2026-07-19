import { randomUUID } from 'node:crypto'

import { discoverWebMcpApp, type WebMcpDiscovery } from '../tools/webmcp-tools.js'

const CONNECTION_TTL_MS = 60 * 60 * 1000
const MAX_CONNECTIONS = 20

export type CustomerConnectionInput = {
  baseUrl: string
  loginUrl?: string
  bearerToken: string
}

export type CustomerConnection = {
  id: string
  baseUrl: string
  loginUrl?: string
  bearerToken: string
  discovery: WebMcpDiscovery
  createdAt: number
  lastUsedAt: number
}

const connections = new Map<string, CustomerConnection>()

export async function connectCustomerApp(input: CustomerConnectionInput): Promise<CustomerConnection> {
  pruneConnections()
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const loginUrl = normalizeOptionalUrl(input.loginUrl, 'Customer sign-in URL')
  const bearerToken = normalizeToken(input.bearerToken)
  validateToken(bearerToken)

  const discovery = await discoverWebMcpApp({ baseUrl, bearerToken })
  if (discovery.tools.length === 0) {
    throw new Error('The customer contract does not expose any supported operations.')
  }

  const now = Date.now()
  const existing = [...connections.values()].find((connection) =>
    connection.baseUrl === baseUrl
    && connection.loginUrl === loginUrl
    && connection.bearerToken === bearerToken,
  )
  if (existing) {
    existing.discovery = discovery
    existing.lastUsedAt = now
    return existing
  }

  const connection: CustomerConnection = {
    id: randomUUID(),
    baseUrl,
    loginUrl,
    bearerToken,
    discovery,
    createdAt: now,
    lastUsedAt: now,
  }
  connections.set(connection.id, connection)
  trimConnectionCount()
  return connection
}

export function getCustomerConnection(connectionId: string): CustomerConnection {
  pruneConnections()
  const connection = connections.get(connectionId)
  if (!connection) {
    throw new Error('The customer connection is no longer available. Reconnect the customer app.')
  }
  connection.lastUsedAt = Date.now()
  return connection
}

export function disconnectCustomerApp(connectionId: string): boolean {
  return connections.delete(connectionId)
}

export function clearCustomerConnections(): void {
  connections.clear()
}

function normalizeBaseUrl(value: string): string {
  const parsed = parseHttpUrl(value, 'Enter the customer app URL that publishes /webapi.json.')
  if (parsed.pathname.toLowerCase().endsWith('/webapi.json')) {
    parsed.pathname = parsed.pathname.slice(0, -'/webapi.json'.length) || '/'
  } else if (parsed.pathname.toLowerCase().endsWith('.json')) {
    throw new Error('Enter the customer app URL or its /webapi.json URL.')
  }
  parsed.search = ''
  parsed.hash = ''
  return parsed.href.replace(/\/+$/, '')
}

function normalizeOptionalUrl(value: string | undefined, label: string): string | undefined {
  if (!value?.trim()) return undefined
  const parsed = parseHttpUrl(value, `${label} must be a valid HTTP or HTTPS URL.`)
  parsed.hash = ''
  return parsed.href
}

function parseHttpUrl(value: string, message: string): URL {
  try {
    const parsed = new URL(value.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
    return parsed
  } catch {
    throw new Error(message)
  }
}

function normalizeToken(value: string): string {
  return value.trim().replace(/^Bearer\s+/i, '').trim()
}

function validateToken(token: string): void {
  if (!token) throw new Error('Enter the logged-in customer user access token.')
  const parts = token.split('.')
  if (parts.length !== 3) return

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      exp?: number
      role?: string
    }
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      throw new Error('The customer access token has expired. Paste a fresh user token.')
    }
    if (payload.role === 'anon') {
      throw new Error('This is an anonymous project key. Paste the logged-in user access token.')
    }
  } catch (error) {
    if (error instanceof Error && /expired|anonymous project key/.test(error.message)) throw error
    throw new Error('The JWT access token is malformed. Paste the complete logged-in user token.')
  }
}

function pruneConnections(): void {
  const cutoff = Date.now() - CONNECTION_TTL_MS
  for (const [id, connection] of connections) {
    if (connection.lastUsedAt < cutoff) connections.delete(id)
  }
}

function trimConnectionCount(): void {
  if (connections.size <= MAX_CONNECTIONS) return
  const oldest = [...connections.values()].sort((left, right) => left.lastUsedAt - right.lastUsedAt)
  for (const connection of oldest.slice(0, connections.size - MAX_CONNECTIONS)) {
    connections.delete(connection.id)
  }
}
