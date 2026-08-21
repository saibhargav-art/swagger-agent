import { useCallback, useEffect, useState } from 'react';
import {
  connectCustomerApp,
  disconnectCustomerApp,
  testAgentConnection,
} from '@/services/connections/ConnectionService';
import { useAgentRuntimeStore } from '@/store/agentRuntimeStore';
import { useToolStore } from '@/store/toolStore';
import { useWebMCPStore } from '@/store/webMCPStore';

export function useConnections() {
  const agent = useAgentRuntimeStore();
  const customer = useWebMCPStore();
  const { setTools, setLoading: setToolsLoading, setError: setToolsError } = useToolStore();
  const [customerUrl, setCustomerUrl] = useState(customer.baseUrl);
  const [accessToken, setAccessToken] = useState(customer.bearerToken);
  const [connectingAll, setConnectingAll] = useState(false);

  useEffect(() => setCustomerUrl(customer.baseUrl), [customer.baseUrl]);
  useEffect(() => setAccessToken(customer.bearerToken), [customer.bearerToken]);

  useEffect(() => {
    if (agent.status === 'connected' || customer.status === 'not-connected') return;
    customer.setConnectionId('');
    customer.setStatus('not-connected');
    customer.setError(null);
    customer.setAppName(null);
    setTools([]);
    setToolsError(null);
  }, [agent.status, customer, setTools, setToolsError]);

  const invalidateCustomerConnection = useCallback(() => {
    if (customer.status === 'not-connected' && !customer.connectionId) return;
    customer.setConnectionId('');
    customer.setStatus('not-connected');
    customer.setError(null);
    customer.setAppName(null);
    setTools([]);
    setToolsError(null);
  }, [customer, setTools, setToolsError]);

  const updateCustomerUrl = useCallback((value: string) => {
    setCustomerUrl(value);
    if (value.trim() !== customer.baseUrl) invalidateCustomerConnection();
  }, [customer.baseUrl, invalidateCustomerConnection]);

  const updateAccessToken = useCallback((value: string) => {
    setAccessToken(value);
    if (value.trim() !== customer.bearerToken) invalidateCustomerConnection();
  }, [customer.bearerToken, invalidateCustomerConnection]);

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
    if (agent.status !== 'connected') {
      const agentReady = await connectAgent();
      if (!agentReady) return false;
    }

    customer.setStatus('connecting');
    customer.setError(null);
    setToolsLoading(true);
    setToolsError(null);
    try {
      const result = await connectCustomerApp({
        agentUrl: agent.agentUrl,
        baseUrl: customerUrl,
        bearerToken: accessToken,
      });
      customer.setBaseUrl(result.baseUrl);
      customer.setBearerToken(result.bearerToken);
      customer.setConnectionId(result.connectionId);
      customer.setAppName(result.appName);
      setTools(result.tools);
      customer.setStatus('connected');
      customer.setError(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not connect to the customer app.';
      setTools([]);
      customer.setStatus('error');
      customer.setError(message);
      setToolsError(message);
      return false;
    } finally {
      setToolsLoading(false);
    }
  }, [accessToken, agent.status, agent.agentUrl, connectAgent, customer, customerUrl, setTools, setToolsError, setToolsLoading]);

  const connectAll = useCallback(async () => {
    setConnectingAll(true);
    try {
      await connectWebsite();
    } finally {
      setConnectingAll(false);
    }
  }, [connectWebsite]);

  const disconnectAgent = useCallback(() => {
    const connectionId = customer.connectionId;
    customer.disconnect();
    setTools([]);
    setToolsError(null);
    agent.disconnect();
    if (connectionId) {
      void disconnectCustomerApp(agent.agentUrl, connectionId).catch(() => undefined);
    }
  }, [agent, customer, setTools, setToolsError]);

  const disconnectWebsite = useCallback(async () => {
    const connectionId = customer.connectionId;
    customer.disconnect();
    setTools([]);
    setToolsError(null);
    setCustomerUrl('');
    setAccessToken('');
    if (connectionId) {
      await disconnectCustomerApp(agent.agentUrl, connectionId).catch(() => undefined);
    }
  }, [agent.agentUrl, customer, setTools, setToolsError]);

  return {
    agent,
    customer,
    customerUrl,
    setCustomerUrl: updateCustomerUrl,
    accessToken,
    setAccessToken: updateAccessToken,
    connectingAll,
    connectAgent,
    connectWebsite,
    connectAll,
    disconnectAgent,
    disconnectWebsite,
  };
}
