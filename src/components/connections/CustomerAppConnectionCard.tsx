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
  loginUrl: string;
  token: string;
  onUrlChange: (value: string) => void;
  onLoginUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function CustomerAppConnectionCard({
  status,
  message,
  toolCount,
  url,
  loginUrl,
  token,
  onUrlChange,
  onLoginUrlChange,
  onTokenChange,
  onConnect,
  onDisconnect,
}: Props) {
  const statusMessage = message ?? (status === 'connected' ? `${toolCount} tools ready from the customer app.` : null);

  return (
    <ConnectionCard
      icon={Globe2}
      title="Customer app"
      subtitle="WebMCP tools and authenticated user session"
      status={status}
      message={statusMessage}
      primaryLabel={status === 'connected' ? 'Reconnect' : 'Connect website'}
      onPrimary={onConnect}
      primaryDisabled={!url.trim() || !token.trim()}
      onDisconnect={onDisconnect}
    >
      <Field label="Customer app base URL" hint="Use the app root URL">
        <Input
          type="url"
          value={url}
          autoComplete="url"
          placeholder="https://customer-app.com"
          onChange={(event) => onUrlChange(event.target.value)}
        />
      </Field>
      <Field label="Login page URL" hint="Optional, used to resume sign-in">
        <Input
          type="url"
          value={loginUrl}
          autoComplete="url"
          placeholder="https://customer-app.com/login"
          onChange={(event) => onLoginUrlChange(event.target.value)}
        />
      </Field>
      <Field label="User access token" hint="Kept for this browser tab only">
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
