import { Globe2 } from 'lucide-react';
import { ConnectionCard } from './ConnectionCard';
import { Field } from './AgentConnectionCard';
import { Input } from '@/components/ui/Input';
import { SecretInput } from '@/components/ui/SecretInput';
import type { ConnectionStatus } from '@/types/connection';

interface Props {
  status: ConnectionStatus;
  message?: string | null;
  toolCount: number;
  url: string;
  token: string;
  onUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function CustomerAppConnectionCard({
  status,
  message,
  toolCount,
  url,
  token,
  onUrlChange,
  onTokenChange,
  onConnect,
  onDisconnect,
}: Props) {
  const statusMessage = message ?? (status === 'connected' ? `${toolCount} tools discovered.` : null);

  return (
    <ConnectionCard
      icon={Globe2}
      title="Customer app"
      subtitle="WebMCP contract and user session"
      status={status}
      message={statusMessage}
      primaryLabel={status === 'connected' ? 'Reconnect' : 'Connect app'}
      onPrimary={onConnect}
      primaryDisabled={!url.trim() || !token.trim()}
      onDisconnect={onDisconnect}
    >
      <Field label="Customer app URL" hint="Publishes /webapi.json">
        <Input
          type="url"
          value={url}
          autoComplete="url"
          placeholder="https://customer-app.com"
          onChange={(event) => onUrlChange(event.target.value)}
        />
      </Field>
      <Field label="User access token" hint="Kept for this browser tab">
        <SecretInput
          value={token}
          autoComplete="off"
          placeholder="Logged-in user access token"
          onChange={(event) => onTokenChange(event.target.value)}
        />
      </Field>
    </ConnectionCard>
  );
}
