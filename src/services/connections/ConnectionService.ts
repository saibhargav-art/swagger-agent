import type { StrandsModelProvider } from '@/store/agentRuntimeStore';
import type { Tool } from '@/types/tool';

export interface AgentConnectionSettings {
  agentUrl: string;
  modelProvider: StrandsModelProvider;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openAiApiKey: string;
  openAiModel: string;
  browserMcpEnabled: boolean;
  browserMcpCommand: string;
  browserMcpArgs: string;
  context7Enabled: boolean;
  context7Command: string;
  context7Args: string;
}

export interface CustomerAppConnection {
  agentUrl: string;
  baseUrl: string;
  loginUrl: string;
  bearerToken: string;
}

export interface CustomerAppResult {
  connectionId: string;
  baseUrl: string;
  loginUrl: string;
  bearerToken: string;
  tools: Tool[];
  appName?: string;
  appDescription?: string;
  uiHints?: Record<string, unknown>;
}

export interface ManagedBrowserStatus {
  ok?: boolean;
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  pageUrl?: string;
  profileDir?: string;
  error?: string;
}

export async function connectCustomerApp(input: CustomerAppConnection): Promise<CustomerAppResult> {
  const agentUrl = normalizeServiceUrl(input.agentUrl, 'Agent service URL');
  const baseUrl = normalizeCustomerAppUrl(input.baseUrl);
  const loginUrl = normalizeOptionalUrl(input.loginUrl, 'Sign-in URL');
  const bearerToken = normalizeAccessToken(input.bearerToken);
  const tokenError = validateAccessToken(bearerToken);
  if (tokenError) throw new Error(tokenError);

  const result = await fetchJson<{
    connectionId?: string;
    baseUrl?: string;
    loginUrl?: string;
    tools?: Tool[];
    appName?: string;
    appDescription?: string;
    uiHints?: Record<string, unknown>;
  }>(`${agentUrl}/connections/customer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl, loginUrl: loginUrl || undefined, bearerToken }),
  });

  if (!result.connectionId || !result.baseUrl || !Array.isArray(result.tools)) {
    throw new Error('The local agent returned an invalid customer connection response.');
  }

  return {
    connectionId: result.connectionId,
    baseUrl: result.baseUrl,
    loginUrl: result.loginUrl ?? loginUrl,
    bearerToken,
    tools: result.tools,
    appName: result.appName,
    appDescription: result.appDescription,
    uiHints: result.uiHints,
  };
}

export async function disconnectCustomerApp(agentUrl: string, connectionId: string): Promise<void> {
  if (!connectionId) return;
  const baseUrl = normalizeServiceUrl(agentUrl, 'Agent service URL');
  await fetchJson(`${baseUrl}/connections/customer/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId }),
  });
}

export async function testAgentConnection(
  settings: AgentConnectionSettings,
): Promise<{ agentUrl: string; message: string }> {
  const agentUrl = normalizeServiceUrl(settings.agentUrl, 'Agent service URL');
  validateModelSettings(settings);

  const health = await fetchJson<{
    ok?: boolean;
    runtime?: string;
    defaultModelProvider?: string;
  }>(`${agentUrl}/health`);
  if (!health.ok || health.runtime !== 'strands-local') {
    throw new Error('The configured URL is not a running Strands local agent.');
  }
  if (!health.defaultModelProvider) {
    throw new Error('The local agent is running an older build. Restart it and try again.');
  }

  const model = await fetchJson<{ ok?: boolean; error?: string }>(`${agentUrl}/model-health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelProvider: settings.modelProvider,
      ollamaBaseUrl: settings.ollamaBaseUrl,
      ollamaModel: settings.ollamaModel,
      openAiModel: settings.openAiModel,
    }),
  });
  if (!model.ok) throw new Error(model.error ?? 'The selected model is not available.');

  const modelLabel = settings.modelProvider === 'ollama'
    ? settings.ollamaModel
    : settings.modelProvider === 'openai'
      ? settings.openAiModel
      : 'Amazon Bedrock';

  return { agentUrl, message: `${modelLabel} is ready.` };
}

export async function getManagedBrowserStatus(
  settings: AgentConnectionSettings,
): Promise<ManagedBrowserStatus> {
  const agentUrl = normalizeServiceUrl(settings.agentUrl, 'Agent service URL');
  return fetchJson<ManagedBrowserStatus>(`${agentUrl}/browser/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(browserPayload(settings)),
  });
}

export async function openManagedBrowser(
  settings: AgentConnectionSettings,
  connection: { connectionId?: string; baseUrl?: string; loginUrl?: string },
): Promise<ManagedBrowserStatus> {
  const agentUrl = normalizeServiceUrl(settings.agentUrl, 'Agent service URL');
  return fetchJson<ManagedBrowserStatus>(`${agentUrl}/browser/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...browserPayload(settings),
      customerConnectionId: connection.connectionId || undefined,
      webmcpBaseUrl: connection.baseUrl || undefined,
      webmcpLoginUrl: connection.loginUrl || undefined,
      chatAppUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
    }),
  });
}

export async function resetManagedBrowser(settings: AgentConnectionSettings): Promise<ManagedBrowserStatus> {
  const agentUrl = normalizeServiceUrl(settings.agentUrl, 'Agent service URL');
  return fetchJson<ManagedBrowserStatus>(`${agentUrl}/browser/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(browserPayload(settings)),
  });
}

export function normalizeCustomerAppUrl(value: string): string {
  const parsed = parseHttpUrl(value, 'Enter the customer app URL that publishes /webapi.json.');
  if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
    throw new Error('Enter the customer application URL, not this chat application URL.');
  }

  const lowerPath = parsed.pathname.toLowerCase();
  if (lowerPath.endsWith('.json')) {
    if (!lowerPath.endsWith('/webapi.json')) {
      throw new Error('Enter the customer app URL or its /webapi.json URL.');
    }
    parsed.pathname = parsed.pathname.slice(0, -'/webapi.json'.length) || '/';
  }

  parsed.search = '';
  parsed.hash = '';
  return parsed.href.replace(/\/+$/g, '');
}

export function normalizeOptionalUrl(value: string, label: string): string {
  if (!value.trim()) return '';
  const parsed = parseHttpUrl(value, `${label} must be a valid HTTP or HTTPS URL.`);
  if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
    throw new Error(`${label} must belong to the customer app, not the chat app.`);
  }
  parsed.hash = '';
  return parsed.href;
}

export function normalizeServiceUrl(value: string, label: string): string {
  return parseHttpUrl(value, `${label} must be a valid HTTP or HTTPS URL.`).href.replace(/\/+$/g, '');
}

export function normalizeAccessToken(value: string): string {
  return value.trim().replace(/^Bearer\s+/i, '').trim();
}

function validateModelSettings(settings: AgentConnectionSettings): void {
  if (settings.modelProvider === 'ollama') {
    normalizeServiceUrl(settings.ollamaBaseUrl, 'Ollama URL');
    if (!settings.ollamaModel.trim()) throw new Error('Enter an Ollama model name.');
  }
  if (settings.modelProvider === 'openai') {
    if (!settings.openAiApiKey.trim()) throw new Error('Enter an OpenAI API key.');
    if (!settings.openAiModel.trim()) throw new Error('Enter an OpenAI model name.');
  }
  if (settings.browserMcpEnabled && (!settings.browserMcpCommand.trim() || !settings.browserMcpArgs.trim())) {
    throw new Error('Playwright browser automation is enabled but not configured.');
  }
}

function browserPayload(settings: AgentConnectionSettings) {
  return {
    browserMcpEnabled: settings.browserMcpEnabled,
    browserMcpCommand: settings.browserMcpEnabled ? settings.browserMcpCommand || undefined : undefined,
    browserMcpArgs: settings.browserMcpEnabled ? parseArgs(settings.browserMcpArgs) : [],
  };
}

function parseArgs(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Support command-line style args in the UI.
  }

  return trimmed.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, '')) ?? [];
}

function validateAccessToken(token: string): string | null {
  if (!token) return 'Enter the logged-in customer user access token.';
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '='))) as {
      exp?: number;
      role?: string;
    };
    if (payload.exp && payload.exp * 1000 < Date.now()) return 'The customer access token has expired. Paste a fresh user token.';
    if (payload.role === 'anon') return 'This is an anonymous project key. Paste the logged-in user access token.';
  } catch {
    return 'The JWT access token is malformed. Paste the complete logged-in user token.';
  }
  return null;
}

function parseHttpUrl(value: string, message: string): URL {
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return parsed;
  } catch {
    throw new Error(message);
  }
}

async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error(`Could not reach ${new URL(url).origin}. Check that the local agent is running.`);
  }

  const text = await response.text();
  let payload: T;
  try {
    payload = (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error(`The local agent returned an invalid response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const error = (payload as { error?: string }).error;
    throw new Error(error ?? `Request failed with HTTP ${response.status}.`);
  }
  return payload;
}
