import { User, Bot, CheckCircle, XCircle, Loader2, Wrench } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/index';
import { formatTime, formatDuration } from '@/utils/format';
import type { Message, ToolCall } from '@/types/chat';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white mt-0.5',
          isUser ? 'bg-indigo-600' : 'bg-slate-700'
        )}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'flex flex-col gap-2 max-w-[75%]',
          isUser && 'items-end'
        )}
      >
        <div
          className={cn(
            'rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-indigo-600 text-white rounded-tr-sm'
              : 'bg-slate-100 text-slate-800 rounded-tl-sm'
          )}
        >
          {message.content || (message.isStreaming ? null : <em className="text-slate-400">Empty response</em>)}
        </div>

        {/* Tool call card */}
        {message.toolCall && <ToolCallCard toolCall={message.toolCall} />}

        {/* Timestamp */}
        <span className="text-xs text-slate-400">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const { toolName, status, result, error, startedAt, completedAt } = toolCall;
  const duration = completedAt ? completedAt - startedAt : undefined;

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white text-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
        <Wrench size={13} className="text-slate-500 shrink-0" />
        <span className="font-medium text-slate-700 font-mono text-xs">{toolName}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <StatusBadge status={status} />
          {duration !== undefined && (
            <span className="text-xs text-slate-400">{formatDuration(duration)}</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {status === 'executing' && (
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <Loader2 size={13} className="animate-spin" />
            Executing…
          </div>
        )}

        {status === 'success' && result !== undefined && (
          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono bg-slate-50 rounded p-2 mt-1 overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}

        {status === 'error' && error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ToolCall['status'] }) {
  switch (status) {
    case 'pending':
      return <Badge variant="muted">Pending</Badge>;
    case 'executing':
      return <Badge variant="warning">Executing</Badge>;
    case 'success':
      return (
        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
          <CheckCircle size={12} /> Success
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
          <XCircle size={12} /> Failed
        </span>
      );
  }
}
