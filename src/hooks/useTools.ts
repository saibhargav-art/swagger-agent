import { useEffect } from 'react';
import { useToolStore } from '@/store/toolStore';
import { webMCPService } from '@/services/webmcp/WebMCPService';
import { useWebMCPStore } from '@/store/webMCPStore';

export function useTools() {
  const { tools, isLoading, error, setTools, setLoading, setError } = useToolStore();
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
    if (!baseUrl.trim() || status !== 'connected') {
      setTools([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, status]);

  return { tools, isLoading, error, reload: loadTools };
}
