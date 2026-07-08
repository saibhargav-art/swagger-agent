import { tool, type JSONSchema, type JSONValue } from '@strands-agents/sdk'

import type {
  JsonObject,
  OpenApiDocument,
  OpenApiOperation,
  OpenApiParameter,
  WebMcpOperation,
} from './types.js'

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete'])

type WebMcpToolOptions = {
  baseUrl: string
  bearerToken?: string
  authHeader?: string
  authValue?: string
  allowWrites: boolean
  confirmationSessionId?: string
}

type PendingWrite = {
  operation: WebMcpOperation
  input: JsonObject
  options: WebMcpToolOptions
}

type WebMcpAuthOverride = Pick<WebMcpToolOptions, 'bearerToken' | 'authHeader' | 'authValue'>

const pendingWrites = new Map<string, PendingWrite>()

export async function createWebMcpTools(options: WebMcpToolOptions) {
  const contractUrl = resolveContractUrl(options.baseUrl)
  const contract = await fetchJson<OpenApiDocument>(contractUrl)
  const apiBaseUrl = resolveApiBaseUrl(contract, contractUrl)
  const operations = parseOperations(contract, apiBaseUrl, contract['x-webmcp-headers'])

  return operations.map((operation) =>
    tool({
      name: operation.name,
      description: describeOperation(operation),
      inputSchema: operation.inputSchema,
      callback: async (input) => executeOperation(operation, toRecord(input), options),
    }),
  )
}

export function hasPendingWebMcpWrite(sessionId: string): boolean {
  return pendingWrites.has(sessionId)
}

export function getPendingWebMcpWrite(sessionId: string) {
  const pending = pendingWrites.get(sessionId)
  if (!pending) return null

  return {
    toolName: pending.operation.originalOperationId,
    title: pending.operation.summary,
    input: pending.input,
  }
}

export async function approvePendingWebMcpWrite(
  sessionId: string,
  authOverride: WebMcpAuthOverride = {},
): Promise<JSONValue | null> {
  const pending = pendingWrites.get(sessionId)
  if (!pending) return null

  pendingWrites.delete(sessionId)
  return executeOperation(pending.operation, pending.input, {
    ...pending.options,
    ...definedAuthOverride(authOverride),
    allowWrites: true,
  })
}

export function clearPendingWebMcpWrite(sessionId: string): void {
  pendingWrites.delete(sessionId)
}

function resolveContractUrl(baseUrl: string): URL {
  const url = new URL(baseUrl)
  if (url.pathname.endsWith('.json')) return url
  url.pathname = `${url.pathname.replace(/\/$/, '')}/webapi.json`
  return url
}

function resolveApiBaseUrl(contract: OpenApiDocument, contractUrl: URL): URL {
  const serverUrl = contract.servers?.find((server) => server.url)?.url
  return new URL(serverUrl ?? contractUrl.origin, contractUrl)
}

function parseOperations(
  contract: OpenApiDocument,
  apiBaseUrl: URL,
  rootHeaders: Record<string, string> = {},
): WebMcpOperation[] {
  const operations: WebMcpOperation[] = []

  for (const [path, pathItem] of Object.entries(contract.paths ?? {})) {
    if (!isRecord(pathItem)) continue

    for (const [method, candidate] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase()) || !isRecord(candidate)) continue

      const operation = candidate as OpenApiOperation
      const originalOperationId = operation.operationId ?? `${method}_${path}`
      const inputSchema = buildInputSchema(operation, contract)

      operations.push({
        name: toToolName(originalOperationId),
        originalOperationId,
        method: method.toUpperCase(),
        path,
        url: new URL(path.replace(/^\//, ''), `${apiBaseUrl.toString().replace(/\/$/, '')}/`),
        summary: operation.summary ?? originalOperationId,
        description: operation.description ?? operation.summary ?? originalOperationId,
        inputSchema,
        requestBodyFields: requestBodyFieldNames(operation, contract),
        parameters: operation.parameters ?? [],
        staticHeaders: { ...rootHeaders, ...(operation['x-webmcp-headers'] ?? {}) },
        scopes: operation['x-webmcp-scopes'] ?? [],
        roles: operation['x-webmcp-roles'] ?? [],
        intent: operation['x-webmcp-intent'],
        requiresConfirmation: operation['x-webmcp-requires-confirmation'],
      })
    }
  }

  return operations
}

function buildInputSchema(operation: OpenApiOperation, contract: OpenApiDocument): JSONSchema {
  const properties: Record<string, JSONSchema> = {}
  const required = new Set<string>()

  for (const parameter of operation.parameters ?? []) {
    properties[parameter.name] = {
      ...(parameter.schema ?? { type: 'string' }),
      description: parameter.description,
    } as JSONSchema
    if (parameter.required || parameter.in === 'path') required.add(parameter.name)
  }

  const bodySchema = resolveSchema(getJsonBodySchema(operation), contract)
  if (bodySchema && isRecord(bodySchema)) {
    const bodyProperties = isRecord(bodySchema.properties) ? bodySchema.properties : {}
    for (const [name, schema] of Object.entries(bodyProperties)) {
      properties[name] = resolveSchema(schema as JSONSchema, contract) ?? (schema as JSONSchema)
    }
    if (Array.isArray(bodySchema.required)) {
      for (const name of bodySchema.required) required.add(String(name))
    }
  }

  return {
    type: 'object',
    properties,
    required: [...required],
    additionalProperties: false,
  } as JSONSchema
}

function requestBodyFieldNames(operation: OpenApiOperation, contract: OpenApiDocument): Set<string> {
  const bodySchema = resolveSchema(getJsonBodySchema(operation), contract)
  const names = new Set<string>()

  if (bodySchema && isRecord(bodySchema.properties)) {
    for (const name of Object.keys(bodySchema.properties)) names.add(name)
  }

  return names
}

function getJsonBodySchema(operation: OpenApiOperation): JSONSchema | undefined {
  return operation.requestBody?.content?.['application/json']?.schema
}

function resolveSchema(schema: JSONSchema | undefined, contract: OpenApiDocument): JSONSchema | undefined {
  if (!schema || !isRecord(schema)) return schema
  const ref = schema.$ref
  if (typeof ref !== 'string' || !ref.startsWith('#/components/schemas/')) return schema
  const schemaName = ref.replace('#/components/schemas/', '')
  return contract.components?.schemas?.[schemaName] ?? schema
}

async function executeOperation(
  operation: WebMcpOperation,
  input: JsonObject,
  options: WebMcpToolOptions,
): Promise<JSONValue> {
  const isWrite = isWriteOperation(operation)
  if (isWrite && !options.allowWrites) {
    if (options.confirmationSessionId) {
      pendingWrites.set(options.confirmationSessionId, { operation, input, options })
    }

    return {
      ok: false,
      needsConfirmation: true,
      message:
        'This action changes customer data and requires explicit confirmation. Ask the user to confirm before proceeding.',
      tool: operation.originalOperationId,
      method: operation.method,
      url: operation.url.toString(),
      input,
    }
  }

  const url = new URL(operation.url)
  const headers = buildHeaders(operation, options)
  const body = buildBody(operation, input)

  for (const parameter of operation.parameters) {
    const value = input[parameter.name]
    if (value == null || value === '') continue

    if (parameter.in === 'path') {
      url.pathname = url.pathname.replace(`{${parameter.name}}`, encodeURIComponent(String(value)))
    } else if (parameter.in === 'query') {
      url.searchParams.set(parameter.name, String(value))
    } else if (parameter.in === 'header') {
      headers[parameter.name] = String(value)
    }
  }

  if (!['GET', 'HEAD'].includes(operation.method) && body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, {
    method: operation.method,
    headers,
    body: !['GET', 'HEAD'].includes(operation.method) && body !== undefined ? JSON.stringify(body) : undefined,
  })
  const result = await parseResponse(response)

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      statusText: response.statusText,
      error: result,
    }
  }

  return result
}

function buildHeaders(operation: WebMcpOperation, options: WebMcpToolOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...operation.staticHeaders,
  }

  if (options.bearerToken) headers.Authorization = `Bearer ${options.bearerToken}`
  if (options.authHeader && options.authValue) headers[options.authHeader] = options.authValue

  return headers
}

function definedAuthOverride(authOverride: WebMcpAuthOverride): WebMcpAuthOverride {
  return Object.fromEntries(
    Object.entries(authOverride).filter(([, value]) => value !== undefined && value !== ''),
  ) as WebMcpAuthOverride
}

function buildBody(operation: WebMcpOperation, input: JsonObject): JsonObject | undefined {
  if (operation.requestBodyFields.size === 0) return undefined

  const body: JsonObject = {}
  for (const name of operation.requestBodyFields) {
    if (input[name] !== undefined) body[name] = input[name]
  }
  return body
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load ${url.toString()}: HTTP ${response.status}`)
  return (await response.json()) as T
}

async function parseResponse(response: Response): Promise<JSONValue> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as JSONValue
  } catch {
    return text
  }
}

function describeOperation(operation: WebMcpOperation): string {
  const parts = [
    operation.description,
    `HTTP ${operation.method} ${operation.path}.`,
    `Original operationId: ${operation.originalOperationId}.`,
  ]

  if (operation.scopes.length) parts.push(`Required scopes: ${operation.scopes.join(', ')}.`)
  if (operation.roles.length) parts.push(`Allowed roles: ${operation.roles.join(', ')}.`)
  if (isWriteOperation(operation)) {
    parts.push('This changes customer data. Ask for explicit user confirmation before invoking it.')
  } else {
    parts.push('This is a read-only tool. It can be invoked without write confirmation.')
  }

  return parts.join(' ')
}

function isWriteOperation(operation: WebMcpOperation): boolean {
  if (operation.requiresConfirmation !== undefined) return operation.requiresConfirmation

  if (operation.intent) {
    return ['create', 'update', 'delete', 'approve', 'write', 'mutate'].includes(operation.intent)
  }

  const scopeText = operation.scopes.join(' ')
  if (/\b(read|view|list|search|get)\b/i.test(scopeText)) return false
  if (/\b(write|delete|admin|mutate)\b/i.test(scopeText)) return true

  return !['GET', 'HEAD', 'OPTIONS'].includes(operation.method)
}

function toToolName(operationId: string): string {
  const name = operationId.replace(/[^a-zA-Z0-9_]/g, '_')
  return /^[a-zA-Z_]/.test(name) ? name : `tool_${name}`
}

function toRecord(value: unknown): JsonObject {
  return isRecord(value) ? (value as JsonObject) : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
