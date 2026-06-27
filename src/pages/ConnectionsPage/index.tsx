import { useEffect, useState, type KeyboardEvent } from 'react';
import { Bot, CheckCircle2, ExternalLink, Globe2, Loader2 } from 'lucide-react';
import { useProviderStore } from '@/store/providerStore';
import { providerManager } from '@/services/ai/ProviderManager';
import { useTools } from '@/hooks/useTools';
import { useWebMCPStore } from '@/store/webMCPStore';
import { useToolStore } from '@/store/toolStore';
import { webMCPService } from '@/services/webmcp/WebMCPService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import ToolExplorer from '@/components/tools/ToolExplorer';
import ToolDetails from '@/components/tools/ToolDetails';
import { useAuth } from '@/context/AuthContext';
import type { Tool } from '@/types/tool';
import type { ProviderId } from '@/types/provider';
import { PROVIDER_LABELS } from '@/types/provider';

const PROVIDERS: ProviderId[] = ['openai', 'claude', 'gemini', 'ollama'];

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

export default function ConnectionsPage() {
  const { tools, isLoading, error, reload } = useTools();
  const { setTools } = useToolStore();
  const { baseUrl, status, error: mcpError, toolCount, setBaseUrl, setStatus, setError, setToolCount, setAppInfo, disconnect } =
    useWebMCPStore();
  const {
    activeProviderId,
    configs,
    connectionStatus,
    connectionError,
    availableModels,
    setActiveProvider,
    updateConfig,
    setProviderConnectionStatus,
    setProviderConnectionError,
    setAvailableModels,
    disconnectProvider,
  } = useProviderStore();
  const { accessToken, login, logout } = useAuth();

  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [pendingBaseUrl, setPendingBaseUrl] = useState(baseUrl);
  const [loginUrl, setLoginUrl] = useState('');
  const [authMode, setAuthMode] = useState<'bearer' | 'browser-session'>('bearer');
  const [tokenInput, setTokenInput] = useState(accessToken ?? '');
  const [providerTesting, setProviderTesting] = useState(false);
  const [mcpTesting, setMCPTesting] = useState(false);

  const currentConfig = configs[activeProviderId];
  const providerOptions = availableModels[activeProviderId] ?? [];
  const providerStatus = connectionStatus[activeProviderId] ?? 'not-connected';
  const currentCredential =
    activeProviderId === 'ollama'
      ? (currentConfig as { baseUrl: string }).baseUrl
      : (currentConfig as { apiKey: string }).apiKey;
  const credentialLabel = activeProviderId === 'ollama' ? 'Base URL' : 'API key';
  const credentialPlaceholder = activeProviderId === 'ollama' ? 'http://localhost:11434' : 'sk-...';

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
    } else {
      webMCPService.setBrowserSessionAuth();
    }
    webMCPService.setBaseUrl(normalizedUrl);
    setBaseUrl(normalizedUrl);
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

  const handleTestProvider = async () => {
    setProviderTesting(true);
    setProviderConnectionError(activeProviderId, null);
    setProviderConnectionStatus(activeProviderId, 'not-connected');

    try {
      const provider = providerManager.getProvider(activeProviderId, configs);
      await provider.testConnection();
      const models = await provider.getAvailableModels();
      setAvailableModels(activeProviderId, models);
      if (models.length > 0 && !models.includes(currentConfig.model)) {
        updateConfig(activeProviderId, { model: models[0] } as never);
      }
      setProviderConnectionStatus(activeProviderId, 'connected');
    } catch (err) {
      setProviderConnectionStatus(activeProviderId, 'error');
      setProviderConnectionError(
        activeProviderId,
        err instanceof Error ? err.message : 'Provider connection failed'
      );
    } finally {
      setProviderTesting(false);
    }
  };

  const handleDisconnectProvider = () => {
    disconnectProvider(activeProviderId);
  };

  const handleDisconnectWebsite = () => {
    disconnect();
    webMCPService.setBaseUrl('');
    webMCPService.setBearerToken(undefined);
    logout();
    setTools([]);
    setSelectedTool(null);
    setPendingBaseUrl('');
    setLoginUrl('');
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
              Connect a model, verify a customer session, discover tools, then run app actions from chat.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:flex">
            <StatusPill label="AI" ready={providerStatus === 'connected'} />
            <StatusPill label="Website" ready={status === 'connected'} />
            <StatusPill label="Auth" ready={authMode === 'browser-session' || Boolean(tokenInput.trim())} />
            <StatusPill label="Tools" ready={tools.length > 0} />
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <Panel icon={Bot} title="1. AI provider" subtitle="Claude, Gemini, Ollama, or OpenAI">
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveProvider(id)}
                    className={`rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors ${
                      activeProviderId === id
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {PROVIDER_LABELS[id]}
                  </button>
                ))}
              </div>

              <Field label={credentialLabel}>
                <Input
                  type={activeProviderId === 'ollama' ? 'url' : 'password'}
                  value={currentCredential}
                  placeholder={credentialPlaceholder}
                  onChange={(event) =>
                    updateConfig(activeProviderId, {
                      ...(activeProviderId === 'ollama'
                        ? { baseUrl: event.target.value }
                        : { apiKey: event.target.value }),
                    } as never)
                  }
                />
              </Field>

              <Field label="Model">
                <ModelInput
                  model={currentConfig.model}
                  options={providerOptions}
                  onChange={(model) => updateConfig(activeProviderId, { model } as never)}
                />
              </Field>

              <ConnectionFooter
                status={providerStatus}
                message={connectionError[activeProviderId]}
                actionLabel={providerTesting ? 'Testing...' : 'Test provider'}
                loading={providerTesting}
                onAction={handleTestProvider}
                secondaryLabel={providerStatus === 'connected' ? 'Disconnect' : undefined}
                onSecondary={providerStatus === 'connected' ? handleDisconnectProvider : undefined}
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
                      value={loginUrl}
                      onChange={(event) => setLoginUrl(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Open login page"
                      disabled={!loginUrl.trim()}
                      onClick={() => window.open(loginUrl.trim(), '_blank', 'noopener,noreferrer')}
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

function ModelInput({
  model,
  options,
  onChange,
}: {
  model: string;
  options: string[];
  onChange: (model: string) => void;
}) {
  if (options.length > 0) {
    return (
      <select
        value={model}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return <Input value={model} placeholder="Model name" onChange={(event) => onChange(event.target.value)} />;
}
