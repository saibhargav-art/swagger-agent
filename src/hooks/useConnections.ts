import { useCallback, useEffect, useState } from 'react';
import {
  connectCustomerApp,
  disconnectCustomerApp,
  getManagedBrowserStatus,
  openManagedBrowser,
  resetManagedBrowser,
  testAgentConnection,
  type ManagedBrowserStatus,
} from '@/services/connections/ConnectionService';
import { useAgentRuntimeStore } from '@/store/agentRuntimeStore';
import { useToolStore } from '@/store/toolStore';
import { useWebMCPStore } from '@/store/webMCPStore';

export function useConnections() {
  const agent = useAgentRuntimeStore();
  const customer = useWebMCPStore();
  const { setTools, setLoading: setToolsLoading, setError: setToolsError } = useToolStore();
  const [customerUrl, setCustomerUrl] = useState(customer.baseUrl);
  const [signInUrl, setSignInUrl] = useState(customer.loginUrl);
  const [accessToken, setAccessToken] = useState(customer.bearerToken);
  const [connectingAll, setConnectingAll] = useState(false);
  const [browserStatus, setBrowserStatus] = useState<ManagedBrowserStatus | null>(null);
  const [browserBusy, setBrowserBusy] = useState(false);

  useEffect(() => setCustomerUrl(customer.baseUrl), [customer.baseUrl]);
  useEffect(() => setSignInUrl(customer.loginUrl), [customer.loginUrl]);
  useEffect(() => setAccessToken(customer.bearerToken), [customer.bearerToken]);

  const connectAgent = useCallback(async (): Promise<boolean> => {
    agent.setConnectionState('connecting');
    try {
      const result = await testAgentConnection(agent);
      agent.setAgentUrl(result.agentUrl);
      agent.setConnectionState('connected', result.message);
      return true;
    } catch (error) {
      agent.setConnectionState('error', error instanceof Error ? error.message : 'Could not connect to the local agent.');
      return false;
    }
  }, [agent]);

  const connectWebsite = useCallback(async (): Promise<boolean> => {
    customer.setStatus('connecting');
    customer.setError(null);
    setToolsLoading(true);
    setToolsError(null);
    try {
      const result = await connectCustomerApp({
        agentUrl: agent.agentUrl,
        baseUrl: customerUrl,
        loginUrl: signInUrl,
        bearerToken: accessToken,
      });
      customer.setBaseUrl(result.baseUrl);
      customer.setLoginUrl(result.loginUrl);
      customer.setBearerToken(result.bearerToken);
      customer.setConnectionId(result.connectionId);
      customer.setToolCount(result.tools.length);
      customer.setAppInfo({ name: result.appName, description: result.appDescription });
      setTools(result.tools);
      customer.setStatus('connected');
      customer.setError(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not connect to the customer app.';
      setTools([]);
      customer.setToolCount(0);
      customer.setStatus('error');
      customer.setError(message);
      setToolsError(message);
      return false;
    } finally {
      setToolsLoading(false);
    }
  }, [accessToken, agent.agentUrl, customer, customerUrl, setTools, setToolsError, setToolsLoading, signInUrl]);

  const connectAll = useCallback(async () => {
    setConnectingAll(true);
    try {
      const agentReady = await connectAgent();
      if (agentReady) await connectWebsite();
    } finally {
      setConnectingAll(false);
    }
  }, [connectAgent, connectWebsite]);

  const disconnectAgent = useCallback(() => agent.disconnect(), [agent]);

  const checkBrowser = useCallback(async () => {
    setBrowserBusy(true);
    try {
      setBrowserStatus(await getManagedBrowserStatus(agent));
    } catch (error) {
      setBrowserStatus({
        enabled: agent.browserMcpEnabled,
        configured: Boolean(agent.browserMcpCommand),
        connected: false,
        error: error instanceof Error ? error.message : 'Could not check the managed browser.',
      });
    } finally {
      setBrowserBusy(false);
    }
  }, [agent]);

  const openBrowser = useCallback(async () => {
    setBrowserBusy(true);
    try {
      setBrowserStatus(await openManagedBrowser(agent, {
        connectionId: customer.connectionId,
        baseUrl: customer.baseUrl || customerUrl,
        loginUrl: customer.loginUrl || signInUrl,
      }));
    } catch (error) {
      setBrowserStatus({
        enabled: agent.browserMcpEnabled,
        configured: Boolean(agent.browserMcpCommand),
        connected: false,
        error: error instanceof Error ? error.message : 'Could not open the managed browser.',
      });
    } finally {
      setBrowserBusy(false);
    }
  }, [agent, customer.baseUrl, customer.connectionId, customer.loginUrl, customerUrl, signInUrl]);

  const resetBrowser = useCallback(async () => {
    setBrowserBusy(true);
    try {
      setBrowserStatus(await resetManagedBrowser(agent));
    } catch (error) {
      setBrowserStatus({
        enabled: agent.browserMcpEnabled,
        configured: Boolean(agent.browserMcpCommand),
        connected: false,
        error: error instanceof Error ? error.message : 'Could not reset the managed browser.',
      });
    } finally {
      setBrowserBusy(false);
    }
  }, [agent]);

  const disconnectWebsite = useCallback(async () => {
    const connectionId = customer.connectionId;
    customer.disconnect();
    setTools([]);
    setToolsError(null);
    setCustomerUrl('');
    setSignInUrl('');
    setAccessToken('');
    if (connectionId) {
      await disconnectCustomerApp(agent.agentUrl, connectionId).catch(() => undefined);
    }
  }, [agent.agentUrl, customer, setTools, setToolsError]);

  return {
    agent,
    customer,
    customerUrl,
    setCustomerUrl,
    signInUrl,
    setSignInUrl,
    accessToken,
    setAccessToken,
    connectingAll,
    browserStatus,
    browserBusy,
    connectAgent,
    connectWebsite,
    connectAll,
    disconnectAgent,
    disconnectWebsite,
    checkBrowser,
    openBrowser,
    resetBrowser,
  };
}
