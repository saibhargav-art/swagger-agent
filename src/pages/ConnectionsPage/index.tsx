import { useEffect, useState, type KeyboardEvent } from 'react';
import { Bot, CheckCircle2, ExternalLink, Globe2, Loader2 } from 'lucide-react';
import { useTools } from '@/hooks/useTools';
import { useWebMCPStore } from '@/store/webMCPStore';
import { useToolStore } from '@/store/toolStore';
import { useAgentRuntimeStore, type StrandsModelProvider } from '@/store/agentRuntimeStore';
import { webMCPService } from '@/services/webmcp/WebMCPService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import ToolExplorer from '@/components/tools/ToolExplorer';
import ToolDetails from '@/components/tools/ToolDetails';
import { useAuth } from '@/context/AuthContext';
import type { Tool } from '@/types/tool';

const statusClass: Record<'connected' | 'error' | 'not-connected', string> = {
  connected: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  'not-connected': 'border-slate-200 bg-slate-50 text-slate-600',
};

function validateWebsiteUrl(value: string): { url?: string; error?: string } {
  const trimmed = value.trim().replace(/\/+$/g, '');
  if (!trimmed) {
    return { error: 'Enter the customer app URL that hosts webapi.json.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: 'Enter a valid website base URL.' };
  }

  if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
    return {
      error:
        'That URL is the AI chat app itself. Enter the customer app base URL that hosts /webapi.json.',
    };
  }

  if (!parsed.pathname.toLowerCase().endsWith('.json') && parsed.pathname !== '/' && parsed.pathname !== '') {
    return {
      error: `Website URL should be the app base URL, not a page route. Use ${parsed.origin} so the chat app can fetch ${parsed.origin}/webapi.json.`,
    };
  }

  return { url: trimmed };
}

function validateAccessToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return 'Access token must be a JWT. Paste the customer app access_token, not the anon key or refresh token.';
  }

  try {
    const payload = JSON.parse(window.atob(parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '='))) as {
      exp?: number;
    };
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return 'This access token is expired. Log in to the customer app again and paste a fresh access_token.';
    }
  } catch {
    return 'Access token is not readable. Paste the customer app access_token.';
  }

  return null;
}

function parseArgs(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Support simple CLI-style args in the form field.
  }

  return trimmed.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, '')) ?? [];
}

export default function ConnectionsPage() {
  const { tools, isLoading, error, reload } = useTools();
  const { setTools } = useToolStore();
  const { baseUrl, loginUrl, status, error: mcpError, toolCount, setBaseUrl, setLoginUrl: setStoredLoginUrl, setStatus, setError, setToolCount, setAppInfo, disconnect } =
    useWebMCPStore();
  const { setAuthConfig } = useWebMCPStore();
  const {
    agentUrl,
    modelProvider,
    ollamaBaseUrl,
    ollamaModel,
    openAiApiKey,
    openAiModel,
    browserMcpEnabled,
    browserMcpCommand,
    browserMcpArgs,
    context7Enabled,
    context7Command,
    context7Args,
    setAgentUrl,
    setModelProvider,
    setOllamaConfig,
    setOpenAiConfig,
    setBrowserMcpConfig,
    setContext7Config,
  } = useAgentRuntimeStore();
  const { accessToken, login, logout } = useAuth();

  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [pendingBaseUrl, setPendingBaseUrl] = useState(baseUrl);
  const [loginUrlInput, setLoginUrlInput] = useState(loginUrl);
  const [authMode, setAuthMode] = useState<'bearer' | 'browser-session'>('bearer');
  const [tokenInput, setTokenInput] = useState(accessToken ?? '');
  const [mcpTesting, setMCPTesting] = useState(false);
  const [agentTesting, setAgentTesting] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'connected' | 'error' | 'not-connected'>('not-connected');
  const [agentError, setAgentError] = useState<string | null>(null);
  const customerTabUrl = (pendingBaseUrl.trim() || baseUrl.trim() || loginUrlInput.trim()).replace(/\/+$/g, '');

  const handleConnectWebsite = async () => {
    const validation = validateWebsiteUrl(pendingBaseUrl);
    const normalizedUrl = validation.url;
    const token = tokenInput.trim() || accessToken?.trim();

    if (!normalizedUrl) {
      setStatus('error');
      setError(validation.error ?? 'Enter the customer app URL that hosts webapi.json.');
      return;
    }

    if (authMode === 'bearer' && !token) {
      setStatus('error');
      setError('Paste the authenticated user bearer token from the customer app, or switch auth mode to browser session.');
      return;
    }

    if (authMode === 'bearer' && token) {
      const tokenError = validateAccessToken(token);
      if (tokenError) {
        setStatus('error');
        setError(tokenError);
        return;
      }
    }

    if (authMode === 'bearer') {
      const bearerToken = token ?? '';
      login(bearerToken);
      webMCPService.setBearerToken(bearerToken);
      setAuthConfig({ authMode, bearerToken });
    } else {
      webMCPService.setBrowserSessionAuth();
      setAuthConfig({ authMode });
    }
    webMCPService.setBaseUrl(normalizedUrl);
    setBaseUrl(normalizedUrl);
    setStoredLoginUrl(loginUrlInput);
    setStatus('not-connected');
    setError(null);
    setToolCount(0);
    setMCPTesting(true);

    try {
      const result = await webMCPService.testConnection();
      setTools(result.tools);
      setToolCount(result.tools.length);
      setAppInfo({ name: result.appName, description: result.appDescription });
      setStatus('connected');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'WebMCP connection failed');
    } finally {
      setMCPTesting(false);
    }
  };

  const handleTestAgent = async () => {
    setAgentTesting(true);
    setAgentStatus('not-connected');
    setAgentError(null);

    try {
      const response = await fetch(`${agentUrl.replace(/\/$/, '')}/health`);
      const payload = await response.json() as {
        ok?: boolean;
        runtime?: string;
        defaultModelProvider?: string;
        ollamaBaseUrl?: string;
        ollamaModel?: string;
        mcpServers?: {
          browser?: { enabled?: boolean; configured?: boolean };
          context7?: { enabled?: boolean; configured?: boolean };
        };
      };

      if (!response.ok || !payload.ok) {
        throw new Error(`Local agent health check failed with HTTP ${response.status}`);
      }

      if (payload.runtime !== 'strands-local') {
        throw new Error('This URL is not a Strands local agent service.');
      }

      if (!payload.defaultModelProvider) {
        throw new Error('Local agent is running an older build. Stop npm run agent:server and start it again.');
      }

      const modelResponse = await fetch(`${agentUrl.replace(/\/$/, '')}/model-health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelProvider,
          ollamaBaseUrl,
          ollamaModel,
        }),
      });
      const modelPayload = await modelResponse.json() as { ok?: boolean; error?: string };
      if (!modelResponse.ok || !modelPayload.ok) {
        throw new Error(modelPayload.error ?? 'Selected model cannot be used by the local agent.');
      }

      const mcpResponse = await fetch(`${agentUrl.replace(/\/$/, '')}/mcp-health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          browserMcpEnabled,
          browserMcpCommand: browserMcpCommand || undefined,
          browserMcpArgs: parseArgs(browserMcpArgs),
          context7Enabled,
          context7Command: context7Command || undefined,
          context7Args: parseArgs(context7Args),
        }),
      });
      const mcpPayload = await mcpResponse.json() as {
        ok?: boolean;
        error?: string;
        diagnostics?: Array<{
          name: string;
          enabled: boolean;
          configured: boolean;
          connected: boolean;
          browserSessionConnected?: boolean;
          browserSessionError?: string;
          tools: string[];
          error?: string;
        }>;
      };
      if (!mcpResponse.ok || !mcpPayload.ok) {
        throw new Error(mcpPayload.error ?? 'MCP health check failed.');
      }

      const browserDiagnostic = mcpPayload.diagnostics?.find((item) => item.name === 'browser-mcp');
      if (browserMcpEnabled) {
        if (!browserDiagnostic?.configured) {
          throw new Error('Browser MCP is enabled but no command is configured.');
        }
        if (!browserDiagnostic.connected) {
          throw new Error(`Browser MCP did not connect. ${browserDiagnostic.error ?? 'Install/connect the BrowserMCP extension and restart the local agent.'}`);
        }
        if (!browserDiagnostic.tools.some((tool) => /navigate|open|browser/i.test(tool))) {
          throw new Error(`Browser MCP connected, but no browser navigation tools were found. Tools: ${browserDiagnostic.tools.join(', ') || 'none'}`);
        }
        if (browserDiagnostic.browserSessionConnected === false) {
          throw new Error(
            `Browser MCP server is running, but no browser tab is connected. ${
              browserDiagnostic.browserSessionError
                ?? 'Open the Browser MCP extension in Chrome and click Connect for the active tab.'
            }`,
          );
        }
      }

      setAgentStatus('connected');
      const mcpSummary = [
        browserMcpEnabled && browserDiagnostic
          ? `Browser MCP connected (${browserDiagnostic.tools.length} tools${browserDiagnostic.browserSessionConnected ? ', tab connected' : ''})`
          : null,
        context7Enabled ? `Context7 ${payload.mcpServers?.context7?.configured || context7Command.trim() ? 'configured' : 'needs command'}` : null,
      ].filter(Boolean).join('. ');
      setAgentError(`Running. Server default: ${payload.defaultModelProvider}${
        payload.defaultModelProvider === 'ollama' ? ` (${payload.ollamaModel} at ${payload.ollamaBaseUrl})` : ''
      }. UI selected: ${modelProvider}.${mcpSummary ? ` ${mcpSummary}.` : ''}`);
    } catch (err) {
      setAgentStatus('error');
      setAgentError(err instanceof Error ? err.message : 'Could not reach local Strands agent.');
    } finally {
      setAgentTesting(false);
    }
  };

  const handleDisconnectWebsite = () => {
    disconnect();
    webMCPService.setBaseUrl('');
    webMCPService.setBearerToken(undefined);
    logout();
    setTools([]);
    setSelectedTool(null);
    setPendingBaseUrl('');
    setLoginUrlInput('');
    setTokenInput('');
    setAuthMode('bearer');
  };

  const handleEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleConnectWebsite();
    }
  };

  useEffect(() => setPendingBaseUrl(baseUrl), [baseUrl]);
  useEffect(() => setLoginUrlInput(loginUrl), [loginUrl]);
  useEffect(() => {
    setTokenInput(accessToken ?? '');
  }, [accessToken]);

  return (
    <div className="flex flex-1 overflow-auto bg-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-base font-semibold text-slate-950">AI chat setup</h1>
            <p className="mt-1 text-sm text-slate-500">
              Connect the local agent, verify a customer session, discover tools, then run app actions from chat.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:flex">
            <StatusPill label="Local agent" ready={agentStatus === 'connected'} />
            <StatusPill label="Website" ready={status === 'connected'} />
            <StatusPill label="Auth" ready={authMode === 'browser-session' || Boolean(tokenInput.trim())} />
            <StatusPill label="Browser MCP" ready={!browserMcpEnabled || (agentStatus === 'connected' && Boolean(browserMcpCommand.trim()))} />
            <StatusPill label="Tools" ready={tools.length > 0} />
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <Panel icon={Bot} title="1. Local Strands agent" subtitle="Model and MCP servers run outside the browser">
              <Field label="Agent service URL">
                <Input
                  type="url"
                  value={agentUrl}
                  placeholder="http://localhost:8787"
                  onChange={(event) => setAgentUrl(event.target.value)}
                />
                <p className="text-xs font-normal text-slate-500">
                  Start this once with <span className="font-mono">npm run agent:server</span>. Model settings below are sent to it from the UI.
                </p>
              </Field>

              <Field label="Model provider">
                <div className="grid grid-cols-3 gap-2">
                  {(['ollama', 'openai', 'bedrock'] as StrandsModelProvider[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setModelProvider(id)}
                      className={`rounded-md border px-3 py-2 text-sm font-medium capitalize ${
                        modelProvider === id
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </Field>

              {modelProvider === 'ollama' ? (
                <>
                  <Field label="Ollama URL">
                    <Input
                      type="url"
                      value={ollamaBaseUrl}
                      placeholder="http://127.0.0.1:11434"
                      onChange={(event) => setOllamaConfig({ baseUrl: event.target.value })}
                    />
                  </Field>
                  <Field label="Ollama model">
                    <Input
                      value={ollamaModel}
                      placeholder="qwen2.5:7b"
                      onChange={(event) => setOllamaConfig({ model: event.target.value })}
                    />
                    <p className="text-xs font-normal text-slate-500">
                      Use a tool-capable Ollama model. <span className="font-mono">gemma3:1b</span> does not support tools.
                    </p>
                  </Field>
                </>
              ) : null}

              {modelProvider === 'openai' ? (
                <>
                  <Field label="OpenAI API key">
                    <Input
                      type="password"
                      value={openAiApiKey}
                      placeholder="sk-..."
                      onChange={(event) => setOpenAiConfig({ apiKey: event.target.value })}
                    />
                  </Field>
                  <Field label="OpenAI model">
                    <Input
                      value={openAiModel}
                      placeholder="gpt-4o-mini"
                      onChange={(event) => setOpenAiConfig({ model: event.target.value })}
                    />
                  </Field>
                </>
              ) : null}

              {modelProvider === 'bedrock' ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Bedrock uses AWS credentials from the local agent process environment.
                </div>
              ) : null}

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-800">Browser MCP</div>
                    <p className="mt-1 text-xs text-slate-500">
                      Optional. Requires the Browser MCP extension to be installed and connected to a tab. The agent can then open pages, click, type, and inspect visible UI.
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      onClick={() =>
                        setBrowserMcpConfig({
                          enabled: true,
                          command: 'npx',
                          args: '@browsermcp/mcp@latest',
                        })
                      }
                    >
                      Reset to BrowserMCP default
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={browserMcpEnabled}
                      onChange={(event) => setBrowserMcpConfig({ enabled: event.target.checked })}
                    />
                    Enable
                  </label>
                </div>
                {browserMcpEnabled ? (
                  <div className="mt-3 grid gap-3">
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Connect the Browser MCP extension in the customer app tab, not this chat tab. BrowserMCP controls the tab where you click Connect.
                    </div>
                    <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-slate-500">
                        Open the customer app in a separate tab, then click the Browser MCP extension and Connect there.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!customerTabUrl}
                        onClick={() => window.open(customerTabUrl, '_blank', 'noopener,noreferrer')}
                      >
                        <ExternalLink size={13} />
                        Open customer tab
                      </Button>
                    </div>
                    <Field label="Browser MCP command">
                      <Input
                        value={browserMcpCommand}
                        placeholder="npx"
                        onChange={(event) => setBrowserMcpConfig({ command: event.target.value })}
                      />
                    </Field>
                    <Field label="Browser MCP args">
                      <Input
                        value={browserMcpArgs}
                        placeholder="@browsermcp/mcp@latest"
                        onChange={(event) => setBrowserMcpConfig({ args: event.target.value })}
                      />
                      <p className="text-xs font-normal text-slate-500">
                        Standard setup: command <span className="font-mono">npx</span>, args <span className="font-mono">@browsermcp/mcp@latest</span>.
                      </p>
                    </Field>
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-800">Context7 MCP</div>
                    <p className="mt-1 text-xs text-slate-500">
                      Optional documentation lookup for implementation/debug tasks. Keep disabled for normal customer app actions.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={context7Enabled}
                      onChange={(event) => setContext7Config({ enabled: event.target.checked })}
                    />
                    Enable
                  </label>
                </div>
                {context7Enabled ? (
                  <div className="mt-3 grid gap-3">
                    <Field label="Context7 command">
                      <Input
                        value={context7Command}
                        placeholder="Command from your Context7 MCP setup"
                        onChange={(event) => setContext7Config({ command: event.target.value })}
                      />
                    </Field>
                    <Field label="Context7 args">
                      <Input
                        value={context7Args}
                        placeholder="Optional args from the same setup"
                        onChange={(event) => setContext7Config({ args: event.target.value })}
                      />
                    </Field>
                  </div>
                ) : null}
              </div>

              <ConnectionFooter
                status={agentStatus}
                message={agentError}
                actionLabel={agentTesting ? 'Checking...' : 'Test local agent'}
                loading={agentTesting}
                onAction={handleTestAgent}
              />
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              <Panel icon={Globe2} title="2. Customer website" subtitle="Login first, then connect the site that hosts /webapi.json">
                <Field label="Customer login URL">
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      placeholder="https://customer-app.com/login"
                      value={loginUrlInput}
                      onChange={(event) => setLoginUrlInput(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Open login page"
                      disabled={!loginUrlInput.trim()}
                      onClick={() => window.open(loginUrlInput.trim(), '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink size={15} />
                    </Button>
                  </div>
                  <p className="text-xs font-normal text-slate-500">
                    Page where the customer signs in. This is only used to open the login page.
                  </p>
                </Field>

                <Field label="Website base URL">
                  <Input
                    type="url"
                    placeholder="https://customer-app.com"
                    value={pendingBaseUrl}
                    onChange={(event) => setPendingBaseUrl(event.target.value)}
                    onKeyDown={handleEnter}
                  />
                  <p className="text-xs font-normal text-slate-500">
                    Base site URL that serves <span className="font-mono">/webapi.json</span>. Do not enter a page route like dashboard.
                  </p>
                </Field>

                <Field label="Auth mode">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthMode('bearer')}
                      className={`rounded-md border px-3 py-2 text-sm font-medium ${
                        authMode === 'bearer'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      Bearer token
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('browser-session')}
                      className={`rounded-md border px-3 py-2 text-sm font-medium ${
                        authMode === 'browser-session'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      Browser session
                    </button>
                  </div>
                </Field>

                {authMode === 'bearer' ? (
                  <Field label="Access token">
                    <Input
                      type="password"
                      placeholder="JWT/session access token from the logged-in customer app"
                      value={tokenInput}
                      onChange={(event) => setTokenInput(event.target.value)}
                      onKeyDown={handleEnter}
                    />
                  </Field>
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Browser session mode sends cookies with tool calls. The customer backend must allow CORS credentials and cookies must be usable cross-site.
                  </div>
                )}

                <ConnectionFooter
                  status={status}
                  message={mcpError ?? (status === 'connected' ? `${toolCount} tools discovered` : undefined)}
                  actionLabel={mcpTesting ? 'Connecting...' : 'Connect website'}
                  loading={mcpTesting}
                  onAction={handleConnectWebsite}
                  secondaryLabel={status === 'connected' || pendingBaseUrl || tokenInput ? 'Disconnect' : undefined}
                  onSecondary={status === 'connected' || pendingBaseUrl || tokenInput ? handleDisconnectWebsite : undefined}
                />
              </Panel>

            </div>

            <Panel icon={CheckCircle2} title="3. Discovered tools" subtitle="Available to chat after connection" className="min-h-[520px]">
              <div className="min-h-0 flex-1 rounded-md border border-slate-200 bg-white">
                <ToolExplorer
                  tools={tools}
                  isLoading={isLoading}
                  error={error}
                  selectedTool={selectedTool}
                  onSelect={(tool) => setSelectedTool((prev) => (prev?.id === tool.id ? null : tool))}
                  onReload={reload}
                />
              </div>
              {selectedTool ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <ToolDetails tool={selectedTool} onClose={() => setSelectedTool(null)} />
                </div>
              ) : null}
            </Panel>
          </div>
        </section>
      </div>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  subtitle,
  children,
  className,
}: {
  icon: typeof Bot;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className ?? ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
          <Icon size={17} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}

function StatusPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border px-2.5 py-1 font-medium ${
        ready ? statusClass.connected : statusClass['not-connected']
      }`}
    >
      {label}
    </span>
  );
}

function ConnectionFooter({
  status,
  message,
  actionLabel,
  loading,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  status: 'connected' | 'error' | 'not-connected';
  message?: string | null;
  actionLabel: string;
  loading: boolean;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass[status]}`}>
          {status === 'connected' ? 'Connected' : status === 'error' ? 'Failed' : 'Not connected'}
        </span>
        {message ? <p className="mt-2 break-words text-xs text-slate-500">{message}</p> : null}
      </div>
      <div className="flex shrink-0 gap-2">
        {secondaryLabel && onSecondary ? (
          <Button variant="ghost" size="sm" onClick={onSecondary} disabled={loading}>
            {secondaryLabel}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={onAction} disabled={loading}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : null}
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
