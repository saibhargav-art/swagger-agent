import { useState } from 'react';
import { AlertCircle, Bot, CheckCircle, ChevronDown, ChevronRight, Loader2, User, Wrench, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AgentText } from './AgentText';
import { strandsLocalRuntime } from '@/services/runtime';
import { useChatStore } from '@/store/chatStore';
import { cn } from '@/utils/cn';
import { formatTime } from '@/utils/format';
import type { Message, RuntimeConfirmation, RuntimeTraceStep } from '@/types/chat';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const visibleContent = stripToolPayload(message.content);

  if (!isUser && message.isStreaming && !visibleContent && !message.runtimeConfirmation && !message.runtimeTrace?.length) {
    return null;
  }

  return (
    <div className={cn('flex min-w-0 gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white',
          isUser ? 'bg-indigo-600' : 'bg-slate-900',
        )}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      <div className={cn('flex min-w-0 max-w-[88%] flex-col gap-2 sm:max-w-[82%]', !isUser && 'w-full', isUser && 'items-end')}>
        {!isUser && message.runtimeConfirmation ? (
          <RuntimeConfirmationCard
            messageId={message.id}
            content={visibleContent}
            confirmation={message.runtimeConfirmation}
          />
        ) : visibleContent ? (
          isUser ? (
            <div className="whitespace-pre-wrap rounded-2xl rounded-tr-md bg-indigo-600 px-4 py-2.5 text-sm leading-6 text-white">
              {visibleContent}
            </div>
          ) : (
            <div className="pr-2 text-sm leading-6 text-slate-800">
              <AgentText content={visibleContent} />
            </div>
          )
        ) : null}

        {!isUser && message.runtimeTrace?.length ? <RuntimeTraceCard steps={message.runtimeTrace} /> : null}

        {!visibleContent && !message.runtimeConfirmation && !message.isStreaming ? (
          <div className="text-sm text-slate-500">
            I could not produce a usable response. Try again or check Connections.
          </div>
        ) : null}

        <span className="text-xs text-slate-400">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}

function RuntimeConfirmationCard({
  messageId,
  content,
  confirmation,
}: {
  messageId: string;
  content: string;
  confirmation: RuntimeConfirmation;
}) {
  const { activeConversationId, updateMessage } = useChatStore();
  const [status, setStatus] = useState<'idle' | 'executing'>('idle');
  const [error, setError] = useState('');
  const rows = Object.entries(confirmation.details).filter(
    ([, value]) => value !== undefined && value !== null && String(value).trim() !== '',
  );

  const finish = async (approved: boolean) => {
    if (!activeConversationId || status === 'executing') return;
    setStatus('executing');
    setError('');

    try {
      const result = await strandsLocalRuntime.confirm(confirmation.runId, approved);
      updateMessage(activeConversationId, messageId, {
        content: result.content ?? (approved ? 'Action completed.' : 'Cancelled the pending action.'),
        runtimeTrace: result.trace,
        runtimeConfirmation: result.confirmationRequired
          ? {
              runId: result.confirmationRequired.runId,
              title: result.confirmationRequired.title,
              details: result.confirmationRequired.details,
              kind: result.confirmationRequired.kind,
              confirmLabel: result.confirmationRequired.confirmLabel,
              cancelLabel: result.confirmationRequired.cancelLabel,
            }
          : undefined,
        isStreaming: false,
      });
      if (result.confirmationRequired) setStatus('idle');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'Could not resolve the pending action.');
    }
  };

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
      {content ? <div className="leading-6 text-slate-800"><AgentText content={content} /></div> : null}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="font-medium text-slate-900">{confirmation.title}</div>
        {rows.length ? (
          <div className="mt-3 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            {rows.map(([key, value]) => (
              <div key={key} className="grid gap-0.5 text-xs sm:grid-cols-[120px_1fr] sm:gap-2">
                <span className="font-medium text-slate-500">{humanizeFieldName(key)}</span>
                <span className="break-words text-slate-900">{formatCell(value)}</span>
              </div>
            ))}
          </div>
        ) : null}
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => finish(false)} disabled={status === 'executing'}>
            {confirmation.cancelLabel ?? 'Cancel'}
          </Button>
          <Button size="sm" onClick={() => finish(true)} disabled={status === 'executing'}>
            {status === 'executing' ? <Loader2 size={13} className="animate-spin" /> : null}
            {confirmation.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RuntimeTraceCard({ steps }: { steps: RuntimeTraceStep[] }) {
  const [open, setOpen] = useState(false);
  const visibleSteps = steps.filter((step) => step.type === 'tool');
  if (visibleSteps.length === 0) return null;
  const hasError = visibleSteps.some((step) => (step.status ?? (step.ok ? 'success' : 'error')) === 'error');
  const needsAttention = visibleSteps.some((step) => step.status === 'attention');

  return (
    <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-left"
      >
        {open ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
        <Wrench size={13} className="text-slate-500" />
        <span className="font-medium text-slate-800">
          {visibleSteps.length === 1 ? '1 tool action' : `${visibleSteps.length} tool actions`}
        </span>
        <span className="ml-auto text-xs text-slate-500">
          {hasError ? 'Needs attention' : needsAttention ? 'Sign-in required' : 'Completed'}
        </span>
      </button>

      {open ? (
        <div className="grid gap-3 px-3 py-3">
          {visibleSteps.map((step, index) => (
            <div key={`${step.name}-${index}`} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <StatusBadge status={step.status ?? (step.ok ? 'success' : 'error')} />
                <span className="font-mono text-xs font-medium text-slate-800">{step.name}</span>
              </div>
              {isDisplayable(step.input) ? (
                <div className="mt-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Input</div>
                  <ResultPreview result={step.input} />
                </div>
              ) : null}
              {isDisplayable(step.result) ? (
                <div className="mt-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Result</div>
                  <ResultPreview result={step.result} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: 'success' | 'error' | 'attention' }) {
  const classes = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    error: 'border-red-200 bg-red-50 text-red-700',
    attention: 'border-amber-200 bg-amber-50 text-amber-700',
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${classes}`}>
      {status === 'success' ? <CheckCircle size={12} /> : null}
      {status === 'error' ? <XCircle size={12} /> : null}
      {status === 'attention' ? <AlertCircle size={12} /> : null}
      {status === 'attention' ? 'sign-in' : status}
    </span>
  );
}

function ResultPreview({ result }: { result: unknown }) {
  if (!result) return null;

  if (typeof result === 'string') {
    return (
      <div className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700">
        {result}
      </div>
    );
  }

  if (Array.isArray(result)) {
    const records = result.filter(isRecord);
    if (records.length === 0) return null;
    const columns = displayColumns(records);
    const visibleRows = records.slice(0, 20);

    return (
      <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-white text-xs text-slate-700">
        <div className="max-h-80 overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="border-b border-slate-200 px-3 py-2 font-semibold">
                    {humanizeFieldName(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={index} className="border-b border-slate-100 last:border-0">
                  {columns.map((column) => (
                    <td key={column} className="max-w-56 truncate px-3 py-2 text-slate-800" title={formatCell(row[column])}>
                      {formatCell(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!isRecord(result)) return null;
  const entries = Object.entries(result).filter(([key, value]) => shouldDisplayField(key) && value !== undefined && value !== null);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2 grid gap-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
      {entries.map(([key, value]) => (
        <div key={key} className="grid gap-0.5 sm:grid-cols-[120px_1fr] sm:gap-2">
          <span className="font-medium text-slate-500">{humanizeFieldName(key)}</span>
          <span className="break-words text-slate-900">{formatCell(value)}</span>
        </div>
      ))}
    </div>
  );
}

function stripToolPayload(content: string) {
  return content
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/^\s*\{[\s\S]*"tool"\s*:\s*"[^"]+"[\s\S]*"params"\s*:\s*\{[\s\S]*\}\s*\}\s*$/i, '')
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isDisplayable(value: unknown) {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function shouldDisplayField(key: string) {
  return !/^(id|.*_id|uuid|created_by|updated_by)$/i.test(key);
}

function displayColumns(records: Array<Record<string, unknown>>) {
  const preferred = ['name', 'customer_name', 'title', 'email', 'amount', 'status', 'state', 'created_at', 'updated_at'];
  const available = new Set(records.flatMap((record) => Object.keys(record).filter((key) => shouldDisplayField(key))));
  const ordered = preferred.filter((key) => available.has(key));
  const rest = [...available].filter((key) => !ordered.includes(key)).slice(0, Math.max(0, 6 - ordered.length));
  const columns = [...ordered, ...rest].slice(0, 6);
  return columns.length > 0 ? columns : Object.keys(records[0] ?? {}).slice(0, 4);
}

function humanizeFieldName(name: string) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatCell(value: unknown) {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  const parsedDate = /^\d{4}-\d{2}-\d{2}T/.test(text) ? new Date(text) : null;
  if (parsedDate && !Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  }
  return text;
}
