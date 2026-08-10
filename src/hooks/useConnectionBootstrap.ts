import { useEffect, useRef } from 'react';
import { useAgentRuntimeStore } from '@/store/agentRuntimeStore';
import { useToolStore } from '@/store/toolStore';
import { useWebMCPStore } from '@/store/webMCPStore';
import { connectCustomerApp, testAgentConnection } from '@/services/connections/ConnectionService';

export function useConnectionBootstrap(): void {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void restoreConnections();
  }, []);
}

async function restoreConnections(): Promise<void> {
  const agent = useAgentRuntimeStore.getState();
  agent.setConnectionState('connecting');

  try {
    const result = await testAgentConnection(agent);
    agent.setAgentUrl(result.agentUrl);
    agent.setConnectionState('connected', result.message);
  } catch (error) {
    agent.setConnectionState('error', error instanceof Error ? error.message : 'Local agent is unavailable.');
    return;
  }

  const app = useWebMCPStore.getState();
  if (!app.baseUrl || !app.bearerToken) return;
  app.setStatus('connecting');
  useToolStore.getState().setLoading(true);
  useToolStore.getState().setError(null);

  try {
    const result = await connectCustomerApp({
      agentUrl: useAgentRuntimeStore.getState().agentUrl,
      baseUrl: app.baseUrl,
      loginUrl: app.loginUrl,
      bearerToken: app.bearerToken,
    });
    useToolStore.getState().setTools(result.tools);
    app.setConnectionId(result.connectionId);
    app.setToolCount(result.tools.length);
    app.setAppInfo({ name: result.appName, description: result.appDescription, uiHints: result.uiHints });
    app.setStatus('connected');
    app.setError(null);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Customer app connection failed.';
    useToolStore.getState().setTools([]);
    useToolStore.getState().setError(message);
    app.setStatus('error');
    app.setError(message);
  } finally {
    useToolStore.getState().setLoading(false);
  }
}
