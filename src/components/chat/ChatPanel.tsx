import { useNavigate } from 'react-router-dom';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ProviderSelector from '@/components/providers/ProviderSelector';
import { useProviderStore } from '@/store/providerStore';
import { PROVIDER_LABELS } from '@/types/provider';
import type { Conversation } from '@/types/chat';

interface Props {
  conversation: Conversation | undefined;
  isStreaming: boolean;
  onSend: (content: string) => void;
}

export default function ChatPanel({ conversation, isStreaming, onSend }: Props) {
  const navigate = useNavigate();
  const { activeProviderId, connectionStatus } = useProviderStore();
  const providerConnected = connectionStatus[activeProviderId] === 'connected';

  return (
    <div className="flex flex-1 flex-col min-w-0">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 h-12 shrink-0">
        <h2 className="text-sm font-semibold text-slate-700 truncate">
          {conversation?.title ?? 'New Chat'}
        </h2>
        <ProviderSelector />
      </div>

      {/* Messages */}
      <MessageList
        messages={conversation?.messages ?? []}
        isStreaming={isStreaming}
        providerConnected={providerConnected}
        onGoToConnections={() => navigate('/connections')}
      />

      {/* Input */}
      <ChatInput
        onSend={onSend}
        disabled={isStreaming || !providerConnected}
        placeholder={providerConnected ? undefined : `Connect ${PROVIDER_LABELS[activeProviderId]} in Connections`}
      />
    </div>
  );
}
