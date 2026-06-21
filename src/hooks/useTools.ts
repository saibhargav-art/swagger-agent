import { useEffect } from 'react';
import { useToolStore } from '@/store/toolStore';
import { webMCPService } from '@/services/webmcp/WebMCPService';
import { useWebMCPStore } from '@/store/webMCPStore';

export function useTools() {
  const { tools, activities, isLoading, error, setTools, setLoading, setError, clearActivities } =
    useToolStore();
  const { baseUrl, status } = useWebMCPStore();

  const loadTools = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await webMCPService.getTools();
      setTools(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    webMCPService.setBaseUrl(baseUrl);
    // Do not automatically load tools on every base URL change.
    // Connections page will call reload() explicitly when the user tests the connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  useEffect(() => {
    if (!baseUrl.trim() || status !== 'connected' || tools.length > 0) return;
    loadTools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, status, tools.length]);

  return { tools, activities, isLoading, error, reload: loadTools, clearActivities };
}
