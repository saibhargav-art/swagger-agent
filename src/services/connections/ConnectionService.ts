import type { StrandsModelProvider } from '@/store/agentRuntimeStore';
import type { Tool } from '@/types/tool';

export interface AgentConnectionSettings {
  agentUrl: string;
  modelProvider: StrandsModelProvider;
  openAiApiKey: string;
  openAiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
}

export interface CustomerAppConnection {
  agentUrl: string;
  baseUrl: string;
  bearerToken: string;
}

export interface CustomerAppResult {
  connectionId: string;
  baseUrl: string;
  bearerToken: string;
  tools: Tool[];
  appName?: string;
  appDescription?: string;
  uiHints?: Record<string, unknown>;
}

export async function connectCustomerApp(input: CustomerAppConnection): Promise<CustomerAppResult> {
  const agentUrl = normalizeServiceUrl(input.agentUrl, 'Agent service URL');
  const baseUrl = normalizeCustomerAppUrl(input.baseUrl);
  const bearerToken = normalizeAccessToken(input.bearerToken);
  const tokenError = validateAccessToken(bearerToken);
  if (tokenError) throw new Error(tokenError);

  const result = await fetchJson<{
    connectionId?: string;
    baseUrl?: string;
    tools?: Tool[];
    appName?: string;
    appDescription?: string;
    uiHints?: Record<string, unknown>;
  }>(`${agentUrl}/connections/customer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl, bearerToken }),
  });

  if (!result.connectionId || !result.baseUrl || !Array.isArray(result.tools)) {
    throw new Error('The local agent returned an invalid customer connection response.');
  }

  return {
    connectionId: result.connectionId,
    baseUrl: result.baseUrl,
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
      openAiApiKey: settings.openAiApiKey,
      openAiModel: settings.openAiModel,
      anthropicApiKey: settings.anthropicApiKey,
      anthropicModel: settings.anthropicModel,
    }),
  });
  if (!model.ok) throw new Error(model.error ?? 'The selected model is not available.');

  const modelLabel = settings.modelProvider === 'openai'
    ? settings.openAiModel
    : settings.anthropicModel;

  return { agentUrl, message: `${modelLabel} is ready.` };
}

export function normalizeCustomerAppUrl(value: string): string {
  const parsed = parseHttpUrl(value, 'Enter the customer app base URL.');
  if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
    throw new Error('Enter the customer application URL, not this chat application URL.');
  }

  const lowerPath = parsed.pathname.toLowerCase();
  if (lowerPath.endsWith('.json')) {
    if (!lowerPath.endsWith('/webapi.json')) {
      throw new Error('Enter the customer app base URL or a supported entry URL.');
    }
    parsed.pathname = parsed.pathname.slice(0, -'/webapi.json'.length) || '/';
  }

  parsed.search = '';
  parsed.hash = '';
  return parsed.href.replace(/\/+$/g, '');
}

export function normalizeServiceUrl(value: string, label: string): string {
  return parseHttpUrl(value, `${label} must be a valid HTTP or HTTPS URL.`).href.replace(/\/+$/g, '');
}

export function normalizeAccessToken(value: string): string {
  return value.trim().replace(/^Bearer\s+/i, '').trim();
}

function validateModelSettings(settings: AgentConnectionSettings): void {
  if (settings.modelProvider === 'openai') {
    if (!settings.openAiApiKey.trim()) throw new Error('Enter an OpenAI API key.');
    if (!settings.openAiModel.trim()) throw new Error('Enter an OpenAI model name.');
  }
  if (settings.modelProvider === 'anthropic') {
    if (!settings.anthropicApiKey.trim()) throw new Error('Enter an Anthropic API key.');
    if (!settings.anthropicModel.trim()) throw new Error('Enter a Claude model name.');
  }
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
