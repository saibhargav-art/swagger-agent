import { Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { useWebMCPStore } from '@/store/webMCPStore';
import { useAgentRuntimeStore } from '@/store/agentRuntimeStore';
import { Button } from '@/components/ui/Button';
import type { Conversation } from '@/types/chat';
import type { Tool } from '@/types/tool';

interface Props {
  conversation: Conversation | undefined;
  isStreaming: boolean;
  onSend: (content: string) => void;
  tools: Tool[];
  onOpenConversations: () => void;
}

export default function ChatPanel({ conversation, isStreaming, onSend, tools, onOpenConversations }: Props) {
  const navigate = useNavigate();
  const { status: webMCPStatus, appName } = useWebMCPStore();
  const agentStatus = useAgentRuntimeStore((state) => state.status);
  const modelProvider = useAgentRuntimeStore((state) => state.modelProvider);
  const websiteConnected = webMCPStatus === 'connected';
  const agentConnected = agentStatus === 'connected';
  const toolCount = tools.length;
  const title = conversation?.title ?? appName ?? 'AI Chat';
  const ready = agentConnected && websiteConnected;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-slate-200 px-3 py-3 sm:px-5">
        <div className="mx-auto flex min-h-10 w-full max-w-3xl items-center gap-3">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenConversations} title="Open conversations" aria-label="Open conversations">
            <Menu size={18} />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-slate-950">{title}</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{appName ?? 'No customer app connected'}</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Readiness label={modelProvider === 'ollama' ? 'Local agent' : modelProvider} ready={agentConnected} />
            <Readiness label={`${toolCount} tools`} ready={websiteConnected && toolCount > 0} />
          </div>
        </div>
      </div>

      <MessageList
        messages={conversation?.messages ?? []}
        isStreaming={isStreaming}
        agentConnected={agentConnected}
        websiteConnected={websiteConnected}
        tools={tools}
        onGoToConnections={() => navigate('/connections')}
        onSend={onSend}
      />

      <ChatInput
        onSend={onSend}
        disabled={isStreaming || !ready}
        placeholder={
          ready ? undefined : 'Connect the local agent and customer app first'
        }
      />
    </div>
  );
}

function Readiness({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        ready
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-50 text-slate-500'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {label}
    </span>
  );
}
