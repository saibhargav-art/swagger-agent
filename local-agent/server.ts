import http from 'node:http'

import { readConfig } from './config.js'
import {
  clearCustomerConnections,
  connectCustomerApp,
  disconnectCustomerApp,
  getCustomerConnection,
} from './connections/customer-connections.js'
import { releaseCustomerConnection, resolvePendingAction, runAgent, shutdownAgents } from './agent-runtime.js'
import { getBrowserSignInStatus } from './runtime/browser-session.js'
import type { RunAgentInput } from './runtime/types.js'
import { inspectMcpServers } from './tools/mcp-clients.js'

const config = readConfig([])
const port = Number(process.env.STRANDS_AGENT_PORT ?? 8787)
const host = process.env.STRANDS_AGENT_HOST ?? '127.0.0.1'

const server = http.createServer(async (req, res) => {
  if (!isAllowedOrigin(req.headers.origin)) {
    sendJson(res, 403, { error: 'This origin is not allowed to call the local agent.' })
    return
  }

  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, {
      ok: true,
      runtime: 'strands-local',
      defaultModelProvider: config.modelProvider,
      ollamaBaseUrl: config.ollamaBaseUrl,
      ollamaModel: config.ollamaModel,
      mcpServers: {
        browser: {
          enabled: config.browserMcpEnabled,
          configured: Boolean(config.browserMcpCommand),
        },
        context7: {
          enabled: config.context7Enabled,
          configured: Boolean(config.context7Command),
        },
      },
    })
    return
  }

  if (req.method === 'POST' && req.url === '/connections/customer') {
    try {
      const body = await readJson<{ baseUrl?: string; loginUrl?: string; bearerToken?: string }>(req)
      const connection = await connectCustomerApp({
        baseUrl: body.baseUrl ?? '',
        loginUrl: body.loginUrl,
        bearerToken: body.bearerToken ?? '',
      })
      sendJson(res, 200, {
        ok: true,
        connectionId: connection.id,
        baseUrl: connection.baseUrl,
        loginUrl: connection.loginUrl,
        appName: connection.discovery.appName,
        appDescription: connection.discovery.appDescription,
        tools: connection.discovery.tools,
      })
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : 'Customer app connection failed' })
    }
    return
  }

  if (req.method === 'POST' && req.url === '/connections/customer/disconnect') {
    const body = await readJson<{ connectionId?: string }>(req)
    const disconnected = body.connectionId ? disconnectCustomerApp(body.connectionId) : false
    if (disconnected && body.connectionId) releaseCustomerConnection(body.connectionId)
    sendJson(res, 200, {
      ok: true,
      disconnected,
    })
    return
  }

  if (req.method === 'POST' && req.url === '/chat') {
    try {
      const startedAt = Date.now()
      const body = await readJson<RunAgentInput>(req)
      if (!body.message?.trim()) {
        sendJson(res, 400, { error: 'message is required' })
        return
      }

      const result = await runAgent(config, resolveCustomerConnection(body))
      logTiming('chat', startedAt, body.message)
      sendJson(res, 200, result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Strands agent failed'
      sendJson(res, 500, { error: message })
    }
    return
  }

  if (req.method === 'POST' && req.url === '/confirm') {
    try {
      const startedAt = Date.now()
      const body = await readJson<{
        conversationId?: string
        approved?: boolean
        kind?: 'write' | 'browser-login'
        webmcpBearerToken?: string
        webmcpAuthHeader?: string
        webmcpAuthValue?: string
        customerConnectionId?: string
      }>(req)
      const connection = body.customerConnectionId
        ? getCustomerConnection(body.customerConnectionId)
        : undefined
      const result = await resolvePendingAction({
        conversationId: body.conversationId ?? 'default',
        approved: Boolean(body.approved),
        kind: body.kind,
        webmcpBearerToken: connection?.bearerToken ?? body.webmcpBearerToken,
        webmcpAuthHeader: body.webmcpAuthHeader,
        webmcpAuthValue: body.webmcpAuthValue,
      })
      logTiming('confirm', startedAt)
      sendJson(res, 200, result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pending action confirmation failed'
      sendJson(res, 500, { error: message })
    }
    return
  }

  if (req.method === 'POST' && req.url === '/browser-session/status') {
    try {
      const body = await readJson<{ conversationId?: string }>(req)
      const result = await getBrowserSignInStatus(body.conversationId?.trim() || 'default')
      sendJson(res, 200, result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Browser session status check failed'
      sendJson(res, 500, { error: message })
    }
    return
  }

  if (req.method === 'POST' && req.url === '/model-health') {
    try {
      const body = await readJson<{
        modelProvider?: string
        ollamaBaseUrl?: string
        ollamaModel?: string
      }>(req)

      if ((body.modelProvider ?? config.modelProvider) === 'ollama') {
        const baseUrl = (body.ollamaBaseUrl ?? config.ollamaBaseUrl).replace('://localhost:', '://127.0.0.1:')
        const model = body.ollamaModel ?? config.ollamaModel
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [{ role: 'user', content: 'Call the ping tool.' }],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'ping',
                  description: 'Simple connectivity test tool.',
                  parameters: {
                    type: 'object',
                    properties: {},
                  },
                },
              },
            ],
          }),
        })

        const text = await response.text()
        if (!response.ok) {
          sendJson(res, 400, {
            ok: false,
            error: /does not support tools/i.test(text)
              ? `Ollama model "${model}" does not support tool calling. Use qwen2.5:7b, qwen3:8b, or llama3.1:8b.`
              : `Ollama model check failed: HTTP ${response.status} ${text}`,
          })
          return
        }

        sendJson(res, 200, { ok: true, modelProvider: 'ollama', model })
        return
      }

      sendJson(res, 200, { ok: true, modelProvider: body.modelProvider ?? config.modelProvider })
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'Model health check failed' })
    }
    return
  }

  if (req.method === 'POST' && req.url === '/mcp-health') {
    try {
      const body = await readJson<RunAgentInput>(req)
      const diagnostics = await inspectMcpServers({
        ...config,
        browserMcpEnabled: body.browserMcpEnabled ?? config.browserMcpEnabled,
        browserMcpCommand: body.browserMcpCommand ?? config.browserMcpCommand,
        browserMcpArgs: body.browserMcpArgs ?? config.browserMcpArgs,
        context7Enabled: body.context7Enabled ?? config.context7Enabled,
        context7Command: body.context7Command ?? config.context7Command,
        context7Args: body.context7Args ?? config.context7Args,
      })

      sendJson(res, 200, { ok: true, diagnostics })
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'MCP health check failed' })
    }
    return
  }

  if (req.method === 'POST' && req.url === '/shutdown') {
    if (!isLoopback(req.socket.remoteAddress)) {
      sendJson(res, 403, { ok: false, error: 'Shutdown is only available from the local machine.' })
      return
    }

    sendJson(res, 200, { ok: true })
    setTimeout(() => void shutdown(), 0)
    return
  }

  sendJson(res, 404, { error: 'Not found' })
})

server.listen(port, host, () => {
  console.log(`Strands local agent listening on http://${host}:${port}`)
})

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

async function shutdown() {
  await shutdownAgents()
  clearCustomerConnections()
  server.close(() => process.exit(0))
}

function resolveCustomerConnection(input: RunAgentInput): RunAgentInput {
  if (!input.customerConnectionId) return input
  const connection = getCustomerConnection(input.customerConnectionId)
  return {
    ...input,
    webmcpBaseUrl: connection.baseUrl,
    webmcpLoginUrl: connection.loginUrl,
    browserStartUrl: connection.loginUrl ?? connection.baseUrl,
    webmcpBearerToken: connection.bearerToken,
    allowWebMcpWrites: false,
  }
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = req.headers.origin
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  const configured = process.env.STRANDS_AGENT_CORS_ORIGIN
  if (configured === '*') return true

  const allowed = new Set(
    (configured
      ? configured.split(',')
      : ['http://localhost:5173', 'http://127.0.0.1:5173'])
      .map((value) => value.trim().replace(/\/$/, ''))
      .filter(Boolean),
  )
  return allowed.has(origin.replace(/\/$/, ''))
}

function sendJson(res: http.ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(value))
}

function logTiming(label: string, startedAt: number, message = '') {
  if (process.env.STRANDS_DEBUG_TIMING !== 'true') return
  const suffix = message ? ` "${message.slice(0, 80)}"` : ''
  console.log(`[agent] ${label} ${Date.now() - startedAt}ms${suffix}`)
}

async function readJson<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) as T : {} as T
}
