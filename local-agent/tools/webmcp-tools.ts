import { createHash } from 'node:crypto'

import { tool, type JSONSchema, type JSONValue } from '@strands-agents/sdk'

import type {
  JsonObject,
  OpenApiDocument,
  OpenApiOperation,
  WebMcpOperation,
} from '../types.js'

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete'])

type WebMcpToolOptions = {
  baseUrl: string
  bearerToken?: string
  authHeader?: string
  authValue?: string
  allowWrites: boolean
  confirmationSessionId?: string
  customerConnectionId?: string
}

type PendingWrite = {
  operation: WebMcpOperation
  input: JsonObject
  options: WebMcpToolOptions
  createdAt: number
}

type WebMcpAuthOverride = Pick<WebMcpToolOptions, 'bearerToken' | 'authHeader' | 'authValue'>

export type WebMcpToolSummary = {
  id: string
  name: string
  description: string
  schema: {
    parameters: Array<{
      name: string
      type: 'string' | 'number' | 'boolean' | 'array' | 'object'
      description?: string
      required: boolean
      enum?: string[]
    }>
  }
  annotations: {
    readOnly: boolean
    destructive: boolean
  }
}

export type WebMcpDiscovery = {
  appName?: string
  appDescription?: string
  tools: WebMcpToolSummary[]
}

type LoadedContract = {
  document: OpenApiDocument
  operations: WebMcpOperation[]
}

const CONTRACT_CACHE_TTL_MS = 5 * 60 * 1000
const PENDING_WRITE_TTL_MS = 10 * 60 * 1000
const contractCache = new Map<string, { loadedAt: number; value: LoadedContract }>()

const pendingWrites = new Map<string, PendingWrite>()

export async function createWebMcpTools(options: WebMcpToolOptions) {
  const { operations } = await loadContract(options)

  return operations.map((operation) =>
    tool({
      name: operation.name,
      description: describeOperation(operation),
      inputSchema: operation.inputSchema,
      callback: async (input) => executeOperation(operation, toRecord(input), options),
    }),
  )
}

export async function discoverWebMcpApp(
  options: Pick<WebMcpToolOptions, 'baseUrl' | 'bearerToken' | 'authHeader' | 'authValue'>,
): Promise<WebMcpDiscovery> {
  const { document, operations } = await loadContract(options, true)
  return {
    appName: document.info?.title,
    appDescription: document.info?.description,
    tools: operations.map(toToolSummary),
  }
}

export function clearWebMcpContractCache(): void {
  contractCache.clear()
}

export function hasPendingWebMcpWrite(sessionId: string): boolean {
  return Boolean(readPendingWrite(sessionId))
}

export function getPendingWebMcpWrite(sessionId: string) {
  const pending = readPendingWrite(sessionId)
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
  const pending = readPendingWrite(sessionId)
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

export function clearPendingWebMcpWritesForConnection(connectionId: string): void {
  for (const [sessionId, pending] of pendingWrites) {
    if (pending.options.customerConnectionId === connectionId) pendingWrites.delete(sessionId)
  }
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

async function loadContract(
  options: Pick<WebMcpToolOptions, 'baseUrl' | 'bearerToken' | 'authHeader' | 'authValue'>,
  refresh = false,
): Promise<LoadedContract> {
  const contractUrl = resolveContractUrl(options.baseUrl)
  const cacheKey = `${contractUrl.toString()}|${credentialFingerprint(options)}`
  const cached = contractCache.get(cacheKey)
  if (!refresh && cached && Date.now() - cached.loadedAt < CONTRACT_CACHE_TTL_MS) return cached.value

  const document = await fetchJson<OpenApiDocument>(contractUrl, options)
  const apiBaseUrl = resolveApiBaseUrl(document, contractUrl)
  const value = {
    document,
    operations: parseOperations(document, apiBaseUrl, document['x-webmcp-headers']),
  }
  contractCache.set(cacheKey, { loadedAt: Date.now(), value })
  return value
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
        readOnlyHint: operation['x-webmcp']?.readOnlyHint,
        destructiveHint: operation['x-webmcp']?.destructiveHint,
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
      pendingWrites.set(options.confirmationSessionId, { operation, input, options, createdAt: Date.now() })
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

function readPendingWrite(sessionId: string): PendingWrite | undefined {
  const pending = pendingWrites.get(sessionId)
  if (!pending) return undefined
  if (Date.now() - pending.createdAt <= PENDING_WRITE_TTL_MS) return pending
  pendingWrites.delete(sessionId)
  return undefined
}

function buildBody(operation: WebMcpOperation, input: JsonObject): JsonObject | undefined {
  if (operation.requestBodyFields.size === 0) return undefined

  const body: JsonObject = {}
  for (const name of operation.requestBodyFields) {
    if (input[name] !== undefined) body[name] = input[name]
  }
  return body
}

async function fetchJson<T>(
  url: URL,
  auth: Pick<WebMcpToolOptions, 'bearerToken' | 'authHeader' | 'authValue'>,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (auth.bearerToken) headers.Authorization = `Bearer ${auth.bearerToken}`
  if (auth.authHeader && auth.authValue) headers[auth.authHeader] = auth.authValue
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`Failed to load ${url.toString()}: HTTP ${response.status}`)
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`The customer app returned invalid JSON from ${url.toString()}.`)
  }
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
  ]
  if (isWriteOperation(operation)) {
    parts.push('This changes customer data. Ask for explicit user confirmation before invoking it.')
  } else {
    parts.push('This is a read-only tool. It can be invoked without write confirmation.')
  }

  return parts.join(' ')
}

function isWriteOperation(operation: WebMcpOperation): boolean {
  if (operation.readOnlyHint !== undefined) return !operation.readOnlyHint
  return !['GET', 'HEAD', 'OPTIONS'].includes(operation.method)
}

function toToolSummary(operation: WebMcpOperation): WebMcpToolSummary {
  const schema = isRecord(operation.inputSchema) ? operation.inputSchema : {}
  const properties = isRecord(schema.properties) ? schema.properties : {}
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : [])
  const readOnly = !isWriteOperation(operation)

  return {
    id: operation.name,
    name: operation.name,
    description: operation.summary || operation.description,
    schema: {
      parameters: Object.entries(properties).map(([name, value]) => {
        const property = isRecord(value) ? value : {}
        return {
          name,
          type: parameterType(property.type),
          description: typeof property.description === 'string' ? property.description : undefined,
          required: required.has(name),
          enum: Array.isArray(property.enum) ? property.enum.map(String) : undefined,
        }
      }),
    },
    annotations: {
      readOnly,
      destructive: operation.destructiveHint ?? /delete|remove|revoke/i.test(operation.originalOperationId),
    },
  }
}

function parameterType(value: unknown): WebMcpToolSummary['schema']['parameters'][number]['type'] {
  if (value === 'number' || value === 'integer') return 'number'
  if (value === 'boolean' || value === 'array' || value === 'object') return value
  return 'string'
}

function credentialFingerprint(
  options: Pick<WebMcpToolOptions, 'bearerToken' | 'authHeader' | 'authValue'>,
): string {
  const value = `${options.bearerToken ?? ''}|${options.authHeader ?? ''}|${options.authValue ?? ''}`
  return createHash('sha256').update(value).digest('hex')
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
