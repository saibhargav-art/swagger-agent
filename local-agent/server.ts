import http from 'node:http'

import { readConfig } from './config.js'
import { resolvePendingWrite, runAgent, shutdownAgents, type RunAgentInput } from './agent-runtime.js'
import { inspectMcpServers } from './tools/mcp-clients.js'

const config = readConfig([])
const port = Number(process.env.STRANDS_AGENT_PORT ?? 8787)

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res)

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

  if (req.method === 'POST' && req.url === '/chat') {
    try {
      const startedAt = Date.now()
      const body = await readJson<RunAgentInput>(req)
      if (!body.message?.trim()) {
        sendJson(res, 400, { error: 'message is required' })
        return
      }

      const result = await runAgent(config, body)
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
        webmcpBearerToken?: string
        webmcpAuthHeader?: string
        webmcpAuthValue?: string
      }>(req)
      const result = await resolvePendingWrite({
        conversationId: body.conversationId ?? 'default',
        approved: Boolean(body.approved),
        webmcpBearerToken: body.webmcpBearerToken,
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

  sendJson(res, 404, { error: 'Not found' })
})

server.listen(port, () => {
  console.log(`Strands local agent listening on http://localhost:${port}`)
})

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

async function shutdown() {
  await shutdownAgents()
  server.close(() => process.exit(0))
}

function setCorsHeaders(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.STRANDS_AGENT_CORS_ORIGIN ?? '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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
