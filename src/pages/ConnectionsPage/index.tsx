import { useEffect, useState, type KeyboardEvent } from 'react';
import { useProviderStore } from '@/store/providerStore';
import { providerManager } from '@/services/ai/ProviderManager';
import { useTools } from '@/hooks/useTools';
import { useWebMCPStore } from '@/store/webMCPStore';
import { webMCPService } from '../../services/webmcp/WebMCPService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import ToolExplorer from '@/components/tools/ToolExplorer';
import ToolDetails from '@/components/tools/ToolDetails';
import type { Tool } from '@/types/tool';
import type { ProviderId } from '@/types/provider';
import { PROVIDER_LABELS } from '@/types/provider';

const PROVIDERS: ProviderId[] = ['openai', 'claude', 'gemini', 'ollama'];

export default function ConnectionsPage() {
    const { tools, isLoading, error, reload } = useTools();
    const { baseUrl, status, error: mcpError, toolCount, setBaseUrl, setStatus, setError, setToolCount } =
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
    } = useProviderStore();

    const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
    const [pendingBaseUrl, setPendingBaseUrl] = useState(baseUrl);
    const [providerTesting, setProviderTesting] = useState(false);
    const [mcpTesting, setMCPTesting] = useState(false);

    const providerOptions = availableModels[activeProviderId] ?? [];
    const currentConfig = configs[activeProviderId];
    const currentApiKey =
        activeProviderId === 'ollama'
            ? (currentConfig as { baseUrl: string }).baseUrl
            : (currentConfig as { apiKey: string }).apiKey;
    const apiKeyLabel = activeProviderId === 'ollama' ? 'Base URL' : 'API Key';
    const apiKeyPlaceholder = activeProviderId === 'ollama' ? 'http://localhost:11434' : 'sk-...';

    const handleSelect = (tool: Tool) => {
        setSelectedTool((prev) => (prev?.id === tool.id ? null : tool));
    };

    const handleConnect = async () => {
        const normalizedUrl = pendingBaseUrl.trim();
        if (!normalizedUrl) {
            setStatus('error');
            setError('Enter a WebMCP base URL to connect.');
            return;
        }

        setBaseUrl(normalizedUrl);
        webMCPService.setBaseUrl(normalizedUrl);
        setStatus('not-connected');
        setError(null);
        setToolCount(0);
        setMCPTesting(true);

        try {
            const result = await webMCPService.testConnection();
            setStatus('connected');
            setToolCount(result.toolCount);
            await reload();
        } catch (connectionError) {
            setStatus('error');
            setError(connectionError instanceof Error ? connectionError.message : 'Connection failed');
        } finally {
            setMCPTesting(false);
        }
    };

    const handleTestProviderConnection = async () => {
        setProviderTesting(true);
        setProviderConnectionError(activeProviderId, null);
        setProviderConnectionStatus(activeProviderId, 'not-connected');

        const provider = providerManager.getProvider(activeProviderId, configs);
        try {
            await provider.testConnection();
            const models = await provider.getAvailableModels();
            setAvailableModels(activeProviderId, models);
            if (models.length > 0 && !models.includes(currentConfig.model)) {
                updateConfig(activeProviderId, { model: models[0] } as any);
            }
            setProviderConnectionStatus(activeProviderId, 'connected');
        } catch (connectionError) {
            setProviderConnectionStatus(activeProviderId, 'error');
            setProviderConnectionError(
                activeProviderId,
                connectionError instanceof Error ? connectionError.message : 'Provider connection failed'
            );
        } finally {
            setProviderTesting(false);
        }
    };

    const handleConnectKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleConnect();
        }
    };

    useEffect(() => {
        setPendingBaseUrl(baseUrl);
    }, [baseUrl]);

    const isConnected = status === 'connected';

    return (
        <div className="flex flex-col flex-1 overflow-auto bg-white">
            <div className="w-full max-w-6xl mx-auto px-8 py-8 min-h-screen">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900">Connections</h1>
                        <p className="text-sm text-slate-500 mt-1">
                            Configure AI providers and connect to WebMCP tool sources.
                        </p>
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
                    <div className="space-y-6">
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                            <Section title="Active Provider">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {PROVIDERS.map((id) => (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setActiveProvider(id)}
                                            className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${activeProviderId === id
                                                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                                }`}
                                        >
                                            {PROVIDER_LABELS[id]}
                                        </button>
                                    ))}
                                </div>
                            </Section>
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                            <Section title={`${PROVIDER_LABELS[activeProviderId]} configuration`}>
                                <ProviderConfigSection
                                    title={PROVIDER_LABELS[activeProviderId]}
                                    description={
                                        activeProviderId === 'openai'
                                            ? 'Use your OpenAI API key and select a model.'
                                            : activeProviderId === 'claude'
                                                ? 'Anthropic may require a proxy for browser-based use.'
                                                : activeProviderId === 'gemini'
                                                    ? 'Google Gemini API configuration.'
                                                    : 'Local Ollama endpoint. Ensure the base URL is reachable.'
                                    }
                                    apiKey={currentApiKey}
                                    model={currentConfig.model}
                                    options={providerOptions}
                                    onApiKeyChange={(value) =>
                                        updateConfig(activeProviderId, {
                                            ...(activeProviderId === 'ollama' ? { baseUrl: value } : { apiKey: value }),
                                        } as any)
                                    }
                                    onModelChange={(value) => updateConfig(activeProviderId, { model: value })}
                                    apiKeyLabel={apiKeyLabel}
                                    apiKeyPlaceholder={apiKeyPlaceholder}
                                    status={connectionStatus[activeProviderId]}
                                    statusMessage={connectionError[activeProviderId]}
                                    onTest={handleTestProviderConnection}
                                    testDisabled={providerTesting}
                                />
                            </Section>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h2 className="text-sm font-semibold text-slate-900">WebMCP server</h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Connect to your website’s WebMCP tool source.
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span
                                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${status === 'connected'
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : status === 'error'
                                                    ? 'bg-rose-100 text-rose-800'
                                                    : 'bg-slate-100 text-slate-700'
                                            }`}
                                    >
                                        {status === 'connected'
                                            ? 'Connected'
                                            : status === 'error'
                                                ? 'Disconnected'
                                                : 'Not connected'}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                        {status === 'connected'
                                            ? `${toolCount} tools available`
                                            : mcpError ?? 'No WebMCP connection configured.'}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-5 space-y-4">
                                <Field label="Base URL">
                                    <div className="flex gap-2">
                                        <Input
                                            type="url"
                                            placeholder="https://example.com/webmcp"
                                            value={pendingBaseUrl}
                                            onChange={(e) => setPendingBaseUrl(e.target.value)}
                                            onKeyDown={handleConnectKey}
                                            className="flex-1"
                                        />
                                        <Button variant="outline" size="sm" onClick={handleConnect} disabled={mcpTesting}>
                                            {mcpTesting ? 'Connecting…' : 'Connect'}
                                        </Button>
                                    </div>
                                </Field>
                                <p className="text-xs text-slate-500">
                                    Enter the URL and press Connect to discover tools. This prevents automatic requests while typing.
                                </p>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-white p-6">
                            <Section title="Discovered Tools">
                                <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
                                    <div className="rounded-2xl border border-slate-200 bg-white">
                                        <ToolExplorer
                                            tools={tools}
                                            isLoading={isLoading}
                                            error={error}
                                            selectedTool={selectedTool}
                                            onSelect={handleSelect}
                                            onReload={reload}
                                        />
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        {selectedTool ? (
                                            <ToolDetails tool={selectedTool} onClose={() => setSelectedTool(null)} />
                                        ) : (
                                            <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-slate-400">
                                                <p className="text-sm font-medium">Select a tool to view details.</p>
                                                <p className="text-xs mt-2 text-slate-500">
                                                    Tools are loaded after the WebMCP connection is established.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Section>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">{title}</h2>
            {children}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <label className="text-right text-slate-500 font-normal">{label}</label>
            {children}
        </div>
    );
}

function ProviderConfigSection({
    title,
    description,
    apiKey,
    apiKeyLabel = 'API Key',
    apiKeyPlaceholder = 'sk-...',
    model,
    options,
    onApiKeyChange,
    onModelChange,
    status,
    statusMessage,
    onTest,
    testDisabled,
}: {
    title: string;
    description: string;
    apiKey: string;
    apiKeyLabel?: string;
    apiKeyPlaceholder?: string;
    model: string;
    options: string[];
    onApiKeyChange: (value: string) => void;
    onModelChange: (value: string) => void;
    status?: 'connected' | 'error' | 'not-connected';
    statusMessage?: string;
    onTest: () => void;
    testDisabled: boolean;
}) {
    const [custom, setCustom] = useState(options.length === 0 || !options.includes(model));

    useEffect(() => {
        setCustom(options.length === 0 || !options.includes(model));
    }, [options, model]);

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                        <p className="text-xs text-slate-500">{description}</p>
                    </div>
                </div>

                <Field label={apiKeyLabel}>
                    <Input
                        type={apiKeyLabel === 'Base URL' ? 'url' : 'password'}
                        placeholder={apiKeyPlaceholder}
                        value={apiKey}
                        onChange={(e) => onApiKeyChange(e.target.value)}
                    />
                </Field>

                <Field label="Model">
                    <div className="flex gap-2">
                        {custom ? (
                            <Input
                                value={model}
                                onChange={(e) => onModelChange(e.target.value)}
                                placeholder="Model name"
                                className="flex-1"
                            />
                        ) : (
                            <select
                                value={model}
                                onChange={(e) => onModelChange(e.target.value)}
                                className="flex-1 h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {options.map((o) => (
                                    <option key={o} value={o}>
                                        {o}
                                    </option>
                                ))}
                            </select>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCustom((c) => !c)}
                            className="shrink-0"
                        >
                            {custom ? 'Preset' : 'Custom'}
                        </Button>
                    </div>
                </Field>

                {options.length === 0 ? (
                    <p className="text-xs text-slate-500">No models loaded yet. Test the provider connection to fetch available models.</p>
                ) : null}

                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div>
                        <p className="text-xs text-slate-500">Connection status</p>
                        <p className="text-sm font-medium text-slate-700">
                            {status === 'connected'
                                ? 'Connected'
                                : status === 'error'
                                    ? 'Connection failed'
                                    : 'Not connected'}
                        </p>
                        {statusMessage ? (
                            <p className="text-xs text-slate-500 mt-1">{statusMessage}</p>
                        ) : null}
                    </div>
                    <Button variant="outline" size="sm" onClick={onTest} disabled={testDisabled}>
                        {testDisabled ? 'Testing…' : 'Test connection'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
