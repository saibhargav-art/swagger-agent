import { useNavigate } from 'react-router-dom';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ProviderSelector from '@/components/providers/ProviderSelector';
import { useProviderStore } from '@/store/providerStore';
import { useWebMCPStore } from '@/store/webMCPStore';
import { PROVIDER_LABELS } from '@/types/provider';
import type { Conversation } from '@/types/chat';
import type { Tool } from '@/types/tool';

interface Props {
  conversation: Conversation | undefined;
  isStreaming: boolean;
  onSend: (content: string) => void;
  tools: Tool[];
}

export default function ChatPanel({ conversation, isStreaming, onSend, tools }: Props) {
  const navigate = useNavigate();
  const { activeProviderId, connectionStatus } = useProviderStore();
  const { status: webMCPStatus, appName } = useWebMCPStore();
  const providerConnected = connectionStatus[activeProviderId] === 'connected';
  const websiteConnected = webMCPStatus === 'connected';
  const toolCount = tools.length;
  const title = conversation?.title ?? appName ?? 'AI Chat';

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-slate-200 px-4 py-3">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-950">{title}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
              <Readiness label="AI" ready={providerConnected} />
              <Readiness label="Website" ready={websiteConnected} />
              <Readiness label={`${toolCount} tools`} ready={toolCount > 0} />
            </div>
          </div>
          <div className="shrink-0">
            <ProviderSelector />
          </div>
        </div>
      </div>

      <MessageList
        messages={conversation?.messages ?? []}
        isStreaming={isStreaming}
        providerConnected={providerConnected}
        websiteConnected={websiteConnected}
        tools={tools}
        onGoToConnections={() => navigate('/connections')}
      />

      <ChatInput
        onSend={onSend}
        disabled={isStreaming || !providerConnected || !websiteConnected}
        placeholder={
          providerConnected
            ? websiteConnected
              ? undefined
              : 'Connect a website to use its tools'
            : `Connect ${PROVIDER_LABELS[activeProviderId]} in Connections`
        }
      />
    </div>
  );
}

function Readiness({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 font-medium ${
        ready
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-50 text-slate-500'
      }`}
    >
      {label}
    </span>
  );
}
