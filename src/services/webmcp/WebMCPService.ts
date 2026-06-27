import type { Tool, ToolParameter, ParameterType, ToolIntent } from '@/types/tool';
import {
  registerSwaggerTools,
  executeSwaggerTool,
  type WebMCPToolDefinition,
  type AuthConfig,
} from '@/webmcp';

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/g, '');
}

function getSpecUrl(baseUrl: string) {
  return baseUrl.toLowerCase().endsWith('.json')
    ? baseUrl
    : `${baseUrl}/webapi.json`;
}

function inferParameterType(value: unknown): ParameterType {
  if (!value || typeof value !== 'object') return 'string';
  const type = (value as { type?: string }).type;
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'array') return 'array';
  if (type === 'object') return 'object';
  return 'string';
}

function mapToolDefinition(def: WebMCPToolDefinition): Tool {
  const properties = def.inputSchema?.properties ?? {};
  const required = def.inputSchema?.required ?? [];

  const parameters: ToolParameter[] = Object.entries(properties).map(
    ([name, schema]) => ({
      name,
      type: inferParameterType(schema),
      description: typeof schema === 'object' && schema && 'description' in schema
        ? (schema as Record<string, unknown>).description as string | undefined
        : undefined,
      required: required.includes(name),
      enum:
        typeof schema === 'object' && schema && 'enum' in schema && Array.isArray((schema as Record<string, unknown>).enum)
          ? ((schema as Record<string, unknown>).enum as unknown[]).map(String)
          : undefined,
    })
  );

  return {
    id: def.name,
    name: def.name,
    description: def.description,
    requiredRoles: def.securityMetadata?.requiredRoles ?? [],
    requiredScopes: def.securityMetadata?.requiredScopes ?? [],
    schema: { parameters },
    metadata: {
      intent: normalizeIntent(def.webMCPMetadata?.intent),
      filterable: def.webMCPMetadata?.filterable,
      searchable: def.webMCPMetadata?.searchable,
      recordIdField: def.webMCPMetadata?.recordIdField,
      displayField: def.webMCPMetadata?.displayField,
      resolveIdWith: def.webMCPMetadata?.resolveIdWith,
      requiresConfirmation: def.webMCPMetadata?.requiresConfirmation,
    },
  };
}

function normalizeIntent(value: string | undefined): ToolIntent | undefined {
  const allowed = new Set<ToolIntent>(['create', 'read', 'list', 'search', 'get', 'update', 'delete', 'approve', 'write']);
  return value && allowed.has(value as ToolIntent) ? (value as ToolIntent) : undefined;
}

export class WebMCPService {
  private baseUrl = '';
  private specUrl = '';
  private auth: AuthConfig | undefined;
  private userRole: string | undefined;
  private userScopes: string[] | undefined;

  constructor(baseUrl = '') {
    this.setBaseUrl(baseUrl);
  }

  // Allows the app to set invocation-time auth (bearer token, api key, or session)
  setAuth(auth: AuthConfig | undefined) {
    this.auth = auth;
  }

  // Convenience: set bearer token
  setBearerToken(token: string | undefined) {
    if (!token) this.auth = undefined;
    else this.auth = { type: 'bearer', token } as AuthConfig;
  }

  setBrowserSessionAuth() {
    this.auth = {
      type: 'session',
      credentials: 'include',
      validate: () => true,
    } as AuthConfig;
  }

  // Convenience: set api key header/value
  setApiKey(header: string, value: string) {
    this.auth = { type: 'apiKey', header, value } as AuthConfig;
  }

  // Set user role/scopes used for runtime permission checks
  setInvocationContext(opts: { userRole?: string; userScopes?: string[] }) {
    this.userRole = opts.userRole;
    this.userScopes = opts.userScopes;
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = normalizeUrl(baseUrl);
    this.specUrl = this.baseUrl ? getSpecUrl(this.baseUrl) : '';
  }

  private async registerTools(): Promise<{
    tools: WebMCPToolDefinition[];
    appName?: string;
    appDescription?: string;
  }> {
    if (!this.specUrl) {
      throw new Error('No WebMCP base URL configured. Connect your WebMCP base URL in Connections.');
    }

    const result = await registerSwaggerTools({
      spec: this.specUrl,
      baseUrl: this.baseUrl,
      secureMode: false,
      auth: this.auth,
    });

    if (result.errors.length > 0) {
      throw new Error(result.errors.join('; '));
    }

    return {
      tools: result.tools,
      appName: result.info?.title,
      appDescription: result.info?.description,
    };
  }

  async getTools(): Promise<Tool[]> {
    if (!this.baseUrl) {
      throw new Error('No WebMCP base URL configured. Connect your WebMCP base URL in Connections.');
    }

    const result = await this.registerTools();
    return result.tools.map(mapToolDefinition);
  }

  async testConnection(): Promise<{
    tools: Tool[];
    toolCount: number;
    appName?: string;
    appDescription?: string;
  }> {
    if (!this.baseUrl) {
      throw new Error('No WebMCP base URL configured. Connect your WebMCP base URL in Connections.');
    }

    const result = await this.registerTools();
    const tools = result.tools.map(mapToolDefinition);
    return {
      tools,
      toolCount: tools.length,
      appName: result.appName,
      appDescription: result.appDescription,
    };
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.baseUrl) {
      throw new Error('No WebMCP base URL configured. Connect your WebMCP base URL in Connections.');
    }
    try {
      return await executeSwaggerTool(toolName, params, {
        auth: this.auth,
        userRole: this.userRole,
        userScopes: this.userScopes,
      });
    } catch (err) {
      // If tool was not registered yet, try to register tools from the OpenAPI spec and retry once.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("is not registered") || msg.includes("has no execute function") || msg.includes('not registered')) {
        await this.registerTools();
        return executeSwaggerTool(toolName, params, {
          auth: this.auth,
          userRole: this.userRole,
          userScopes: this.userScopes,
        });
      }
      throw err;
    }
  }

}

export const webMCPService = new WebMCPService(import.meta.env.VITE_WEBMCP_BASE_URL ?? '');
