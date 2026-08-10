import { Loader2, PlugZap } from 'lucide-react';
import { AdvancedConnectionSettings } from '@/components/connections/AdvancedConnectionSettings';
import { AgentConnectionCard } from '@/components/connections/AgentConnectionCard';
import { ConnectionBadge } from '@/components/connections/ConnectionCard';
import { CustomerAppConnectionCard } from '@/components/connections/CustomerAppConnectionCard';
import { DiscoveredToolsSection } from '@/components/connections/DiscoveredToolsSection';
import { ManagedBrowserPanel } from '@/components/connections/ManagedBrowserPanel';
import { Button } from '@/components/ui/Button';
import { useConnections } from '@/hooks/useConnections';
import { useTools } from '@/hooks/useTools';

export default function ConnectionsPage() {
  const connection = useConnections();
  const { tools, isLoading, error } = useTools();
  const modelConfigured = connection.agent.modelProvider === 'ollama'
    ? Boolean(connection.agent.ollamaModel.trim())
    : connection.agent.modelProvider === 'openai'
      ? Boolean(connection.agent.openAiApiKey.trim() && connection.agent.openAiModel.trim())
      : true;
  const canConnectAll = Boolean(connection.customerUrl.trim() && connection.accessToken.trim() && modelConfigured);

  return (
    <div className="flex min-w-0 flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-950">Connections</h1>
            <p className="mt-1 text-sm text-slate-500">
              Connect the local agent, then connect a customer app that registers WebMCP tools.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ConnectionBadge status={connection.agent.status} prefix="Agent" />
            <ConnectionBadge status={connection.customer.status} prefix="App" />
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
              {tools.length} tools
            </span>
            <Button
              onClick={connection.connectAll}
              disabled={!canConnectAll || connection.connectingAll}
              title={canConnectAll ? 'Connect the agent and customer app' : 'Enter the customer app URL and access token'}
            >
              {connection.connectingAll ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />}
              {connection.connectingAll ? 'Connecting...' : 'Connect all'}
            </Button>
          </div>
        </header>

        <div className="grid gap-4 py-5 lg:grid-cols-2">
          <AgentConnectionCard
            agent={connection.agent}
            onConnect={() => void connection.connectAgent()}
            onDisconnect={connection.disconnectAgent}
          />
          <CustomerAppConnectionCard
            status={connection.customer.status}
            message={connection.customer.error}
            toolCount={connection.customer.toolCount}
            url={connection.customerUrl}
            loginUrl={connection.loginUrl}
            token={connection.accessToken}
            onUrlChange={connection.setCustomerUrl}
            onLoginUrlChange={connection.setLoginUrl}
            onTokenChange={connection.setAccessToken}
            onConnect={() => void connection.connectWebsite()}
            onDisconnect={connection.disconnectWebsite}
          />
        </div>

        <AdvancedConnectionSettings
          agent={connection.agent}
        />

        <div className="py-5">
          <ManagedBrowserPanel
            status={connection.browserStatus}
            busy={connection.browserBusy}
            canOpen={Boolean(connection.customer.connectionId || connection.customerUrl.trim())}
            onOpen={() => void connection.openBrowser()}
            onCheck={() => void connection.checkBrowser()}
            onReset={() => void connection.resetBrowser()}
          />
        </div>

        <DiscoveredToolsSection
          tools={tools}
          isLoading={isLoading}
          error={error}
          onReload={() => void connection.connectWebsite()}
        />
      </div>
    </div>
  );
}
