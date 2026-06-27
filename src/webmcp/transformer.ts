import type {
  AuthConfig,
  InvocationContext,
  MCPToolWithExecute,
  OpenAPIOperation,
  OpenAPISchema,
  ParsedOpenAPISpec,
  SwaggerToolsResult,
} from './types';
import { getAllOperations, resolveBaseUrl } from './parser';

function operationName(operation: OpenAPIOperation, path: string, method: string) {
  if (operation.operationId) {
    return operation.operationId.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  return `${method}_${path}`
    .replace(/^\//, '')
    .replace(/[{}]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase();
}

function schemaProperties(schema: OpenAPISchema | undefined): Record<string, unknown> {
  if (!schema?.properties) return {};

  return Object.fromEntries(
    Object.entries(schema.properties).map(([name, prop]) => [
      name,
      {
        type: prop.type || 'object',
        ...(prop.description ? { description: prop.description } : {}),
        ...(prop.format ? { format: prop.format } : {}),
        ...(prop.enum ? { enum: prop.enum } : {}),
        ...(prop.items ? { items: prop.items } : {}),
      },
    ])
  );
}

function inputSchema(operation: OpenAPIOperation) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of operation.parameters || []) {
    if (param.in !== 'path' && param.in !== 'query') continue;

    properties[param.name] = {
      type: param.schema?.type || 'string',
      ...(param.description ? { description: param.description } : {}),
      ...(param.schema?.format ? { format: param.schema.format } : {}),
      ...(param.schema?.enum ? { enum: param.schema.enum } : {}),
    };

    if (param.required) required.push(param.name);
  }

  const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
  Object.assign(properties, schemaProperties(bodySchema));

  for (const name of bodySchema?.required || []) {
    if (!required.includes(name)) required.push(name);
  }

  return { properties, required };
}

function description(operation: OpenAPIOperation) {
  if (operation.summary && operation.description) {
    return `${operation.summary}\n\n${operation.description}`;
  }
  return operation.summary || operation.description || 'No description available';
}

async function resolveAuthValue(auth?: AuthConfig): Promise<string | undefined> {
  if (!auth || auth.type === 'session') return undefined;
  const value = auth.type === 'bearer' ? auth.token : auth.value;
  const resolved = typeof value === 'function' ? await value() : value;
  return typeof resolved === 'string' ? resolved.trim() || undefined : String(resolved);
}

async function authHeaders(auth?: AuthConfig): Promise<Record<string, string>> {
  if (!auth || auth.type === 'session') return {};

  const value = await resolveAuthValue(auth);
  if (!value) return {};

  if (auth.type === 'bearer') {
    return { Authorization: `Bearer ${value}` };
  }

  return { [auth.header]: value };
}

function createExecute(
  baseUrl: string,
  path: string,
  method: string,
  auth?: AuthConfig,
  staticHeaders: Record<string, string> = {}
) {
  return async (params: Record<string, unknown>, invocationContext?: InvocationContext): Promise<unknown> => {
    if (invocationContext?.dryRun) return { authorized: true };

    const finalAuth = invocationContext?.auth ?? auth;
    const headers = { ...staticHeaders, ...(await authHeaders(finalAuth)) };
    const pathParams: Record<string, string> = {};
    const queryParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (path.includes(`{${key}}`)) {
        pathParams[key] = String(value);
      } else if (['GET', 'DELETE'].includes(method)) {
        queryParams.set(key, String(value));
      }
    }

    let finalPath = path;
    for (const [key, value] of Object.entries(pathParams)) {
      finalPath = finalPath.replace(`{${key}}`, encodeURIComponent(value));
    }

    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
    if (!normalizedBaseUrl) {
      throw new Error('Cannot execute tool because the API server URL is missing.');
    }

    const url = new URL(finalPath.replace(/^\//, ''), `${normalizedBaseUrl}/`);
    queryParams.forEach((value, key) => url.searchParams.set(key, value));

    const body =
      ['POST', 'PUT', 'PATCH'].includes(method)
        ? Object.fromEntries(Object.entries(params).filter(([key]) => !pathParams[key]))
        : undefined;

    if (body && Object.keys(body).length > 0) {
      headers['Content-Type'] = 'application/json';
    }

    const request: RequestInit = {
      method,
      headers,
      mode: 'cors',
    };

    if (finalAuth?.type === 'session') {
      if (finalAuth.validate && !(await finalAuth.validate())) {
        throw new Error('Customer session is not available. Sign in and reconnect.');
      }
      request.credentials = finalAuth.credentials ?? 'include';
    } else if (finalAuth && !(await resolveAuthValue(finalAuth))) {
      throw new Error('Customer session token is missing. Sign in and reconnect.');
    }

    if (body && Object.keys(body).length > 0) {
      request.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), request);
    const text = await response.text();
    const data = text ? safeJson(text) : null;

    if (!response.ok) {
      const message = typeof data === 'object' && data && 'message' in data ? String(data.message) : text;
      throw new Error(`HTTP ${response.status}: ${message || response.statusText}`);
    }

    return data;
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function transformSpec(
  spec: ParsedOpenAPISpec,
  options: {
    auth?: AuthConfig;
    include?: string[];
    exclude?: string[];
    baseUrl?: string;
    secureMode?: boolean;
  }
): SwaggerToolsResult {
  const baseUrl = resolveBaseUrl(spec, options.baseUrl);
  const staticHeaders = spec['x-webmcp-headers'] ?? {};
  const operations = getAllOperations(spec).filter(({ operation }) => {
    const tags = operation.tags || [];
    if (options.include?.length && !tags.some((tag) => options.include?.includes(tag))) return false;
    if (options.exclude?.length && tags.some((tag) => options.exclude?.includes(tag))) return false;
    if (options.secureMode && !operation['x-webmcp-scopes']?.length && !operation['x-webmcp-roles']?.length) return false;
    return true;
  });

  const tools: MCPToolWithExecute[] = operations.map(({ path, method, operation }) => {
    const name = operationName(operation, path, method);
    const { properties, required } = inputSchema(operation);

    return {
      name,
      description: description(operation),
      inputSchema: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
      securityMetadata: {
        requiredScopes: operation['x-webmcp-scopes'],
        requiredRoles: operation['x-webmcp-roles'],
        secureMode: options.secureMode ?? false,
      },
      webMCPMetadata: {
        intent: operation['x-webmcp-intent'],
        filterable: operation['x-webmcp-filterable'],
        searchable: operation['x-webmcp-searchable'],
        recordIdField: operation['x-webmcp-record-id'],
        displayField: operation['x-webmcp-display-field'],
        resolveIdWith: operation['x-webmcp-resolve-id-with'],
        requiresConfirmation: operation['x-webmcp-requires-confirmation'],
      },
      execute: createExecute(baseUrl, path, method.toUpperCase(), options.auth, staticHeaders),
    };
  });

  return { tools, errors: [] };
}
