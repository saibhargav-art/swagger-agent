import type { JSONSchema, JSONValue } from '@strands-agents/sdk'

export type JsonObject = Record<string, JSONValue>

export type OpenApiDocument = {
  openapi?: string
  swagger?: string
  info?: {
    title?: string
    version?: string
    description?: string
  }
  servers?: Array<{ url?: string }>
  paths?: Record<string, Record<string, OpenApiOperation | unknown>>
  components?: {
    schemas?: Record<string, JSONSchema>
  }
  'x-webmcp-headers'?: Record<string, string>
}

export type OpenApiOperation = {
  operationId?: string
  summary?: string
  description?: string
  parameters?: OpenApiParameter[]
  requestBody?: {
    required?: boolean
    content?: Record<string, { schema?: JSONSchema }>
  }
  responses?: Record<string, unknown>
  security?: Array<Record<string, string[]>>
  'x-webmcp-headers'?: Record<string, string>
  'x-webmcp'?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
  }
}

export type OpenApiParameter = {
  name: string
  in: 'query' | 'path' | 'header' | 'cookie'
  required?: boolean
  description?: string
  schema?: JSONSchema
}

export type WebMcpOperation = {
  name: string
  originalOperationId: string
  method: string
  path: string
  url: URL
  summary: string
  description: string
  inputSchema: JSONSchema
  requestBodyFields: Set<string>
  parameters: OpenApiParameter[]
  staticHeaders: Record<string, string>
  readOnlyHint?: boolean
  destructiveHint?: boolean
}
