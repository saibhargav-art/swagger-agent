import { useState, useEffect } from 'react';
import { useProviderStore } from '@/store/providerStore';
import { providerManager } from '@/services/ai/ProviderManager';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { ProviderId } from '@/types/provider';
import { PROVIDER_LABELS } from '@/types/provider';

const PROVIDERS: ProviderId[] = ['openai', 'claude', 'gemini', 'ollama'];

export default function SettingsPage() {
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

  const [isTesting, setIsTesting] = useState(false);

  // Get the credential value for the current provider (stable value for dependencies)
  const currentProviderCredential =
    activeProviderId === 'ollama'
      ? configs[activeProviderId]?.baseUrl ?? ''
      : configs[activeProviderId]?.apiKey ?? '';

  // Create a stable credential key for dependency tracking
  const credentialKey = `${activeProviderId}:${currentProviderCredential}`;

  // Auto-fetch models when provider is selected or credentials change
  useEffect(() => {
    console.log(`[SettingsPage] Effect: credentialKey=${credentialKey}`);

    const fetchModels = async () => {
      console.log(`[SettingsPage] Effect: activeProviderId=${activeProviderId}, credential length=${currentProviderCredential.length}`);

      try {
        // Check if provider has credentials
        const hasCredentials = currentProviderCredential?.trim()?.length > 0;
        console.log(`[SettingsPage] Has credentials: ${hasCredentials}`);

        if (!hasCredentials) {
          console.log(`[SettingsPage] No credentials for ${activeProviderId}, skipping model fetch`);
          return;
        }

        console.log(`[SettingsPage] Fetching models for ${activeProviderId}...`);
        const provider = providerManager.getProvider(activeProviderId, configs);
        console.log(`[SettingsPage] Got provider instance`);

        const models = await provider.getAvailableModels();
        console.log(`[SettingsPage] Got ${models.length} models for ${activeProviderId}:`, models);
        setAvailableModels(activeProviderId, models);
      } catch (e) {
        console.error(`[SettingsPage] Failed to fetch models for ${activeProviderId}:`, e);
      }
    };

    fetchModels();
  }, [credentialKey, activeProviderId, setAvailableModels]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setProviderConnectionError(activeProviderId, null);
    setProviderConnectionStatus(activeProviderId, 'not-connected');

    const provider = providerManager.getProvider(activeProviderId, configs);
    try {
      await provider.testConnection();
      // Fetch models to ensure they're current
      const models = await provider.getAvailableModels();
      setAvailableModels(activeProviderId, models);
      setProviderConnectionStatus(activeProviderId, 'connected');
    } catch (error) {
      setProviderConnectionStatus(activeProviderId, 'error');
      setProviderConnectionError(
        activeProviderId,
        error instanceof Error ? error.message : 'Provider connection failed'
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = () => {
    setProviderConnectionStatus(activeProviderId, 'not-connected');
    setProviderConnectionError(activeProviderId, null);
    setAvailableModels(activeProviderId, []);
    updateConfig(activeProviderId, { model: '' } as any);
  };

  const isConnected = connectionStatus[activeProviderId] === 'connected';
  const apiKeyLabel = activeProviderId === 'ollama' ? 'Base URL' : 'API Key';
  const apiKeyPlaceholder = activeProviderId === 'ollama' ? 'http://localhost:11434' : 'sk-...';
  const currentConfig = configs[activeProviderId];
  const providerOptions = availableModels[activeProviderId] ?? [];

  return (
    <div className="flex flex-col flex-1 overflow-auto bg-white">
      <div className="w-full max-w-2xl mx-auto px-8 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-lg font-semibold text-slate-900">Connect AI Provider</h1>
          <p className="text-sm text-slate-500 mt-1">
            Select a provider, enter credentials, and test the connection to start chatting.
          </p>
        </div>

        {/* Card container */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-6">
          {/* Provider Select */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-3">
              AI Provider
            </label>
            <select
              value={activeProviderId}
              onChange={(e) => setActiveProvider(e.target.value as ProviderId)}
              className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {PROVIDERS.map((id) => (
                <option key={id} value={id}>
                  {PROVIDER_LABELS[id]}
                </option>
              ))}
            </select>
          </div>

          {/* API Key / Base URL */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">
              {apiKeyLabel}
            </label>
            <Input
              type={apiKeyLabel === 'Base URL' ? 'url' : 'password'}
              placeholder={apiKeyPlaceholder}
              value={currentProviderCredential}
              onChange={(e) =>
                updateConfig(activeProviderId, {
                  ...(activeProviderId === 'ollama'
                    ? { baseUrl: e.target.value }
                    : { apiKey: e.target.value }),
                } as any)
              }
              disabled={isConnected}
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">
              Model
            </label>
            {providerOptions.length > 0 ? (
              <select
                value={currentConfig.model}
                onChange={(e) => updateConfig(activeProviderId, { model: e.target.value })}
                className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Select a model --</option>
                {providerOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                type="text"
                placeholder="Loading models..."
                value=""
                disabled={true}
                className="text-slate-400 bg-slate-100"
              />
            )}
            {providerOptions.length === 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Loading available models from provider...
              </p>
            )}
          </div>

          {/* Status & Test Connection */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500 font-medium">Connection Status</p>
                <p className="text-sm font-semibold text-slate-700 mt-1">
                  {isConnected
                    ? '✓ Connected'
                    : connectionStatus[activeProviderId] === 'error'
                      ? '✗ Connection Failed'
                      : '○ Not Connected'}
                </p>
                {connectionError[activeProviderId] ? (
                  <p className="text-xs text-red-600 mt-2">{connectionError[activeProviderId]}</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleTestConnection}
                  disabled={isTesting || isConnected}
                  className={isConnected ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
                >
                  {isTesting ? 'Testing…' : isConnected ? 'Connected' : 'Test Connection'}
                </Button>
                {isConnected && (
                  <Button
                    onClick={handleDisconnect}
                    variant="outline"
                    className="text-slate-600 border-slate-300 hover:bg-slate-100"
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Helper text */}
          <p className="text-xs text-slate-500 border-t border-slate-200 pt-4">
            {activeProviderId === 'ollama'
              ? 'Ensure Ollama is running locally at the specified base URL.'
              : activeProviderId === 'claude'
                ? 'Requires a server-side proxy for browser-based use (set VITE_CLAUDE_PROXY_URL in .env).'
                : 'Enter your API key and select a model to connect.'}
          </p>
        </div>

        {/* Status message when connected */}
        {isConnected && (
          <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800">
              ✓ Provider connected successfully! You can now start chatting.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
