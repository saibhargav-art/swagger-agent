import { useEffect, useState } from 'react';
import { User, Bot, CheckCircle, XCircle, Loader2, Wrench } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/index';
import { Button } from '@/components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { formatTime, formatDuration } from '@/utils/format';
import { webMCPService } from '@/services/webmcp/WebMCPService';
import { useChatStore } from '@/store/chatStore';
import type { Message, ToolCall, ToolForm, ToolOption } from '@/types/chat';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const { activeConversationId, setPendingToolRequest } = useChatStore();
  const [selectedForm, setSelectedForm] = useState<ToolForm | null>(message.toolForm ?? null);
  const [cancelled, setCancelled] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [hideToolOptions, setHideToolOptions] = useState(false);
  const visibleContent = cancelled ? "Okay, I won't proceed with that request." : stripToolPayload(message.content);
  const visibleToolOptions = hideToolOptions ? [] : message.toolOptions ?? [];
  const hasActionCard = !isUser && !cancelled && Boolean(visibleToolOptions.length || selectedForm || actionNotice);

  useEffect(() => {
    setSelectedForm(message.toolForm ?? null);
    setCancelled(false);
    setActionNotice('');
    setHideToolOptions(false);
  }, [message.id, message.toolForm]);

  const handleToolOptionSelect = (option: ToolOption) => {
    if (option.fields.some((field) => field.name === 'id')) {
      if (activeConversationId) {
        setPendingToolRequest(activeConversationId, {
          toolName: option.toolName,
          params: option.initialParams ?? {},
        });
      }
      setSelectedForm(null);
      setHideToolOptions(true);
      setActionNotice(
        `Selected ${option.title}. Which record should I use? Enter a name or search text from the connected app, and I will look it up.`
      );
      return;
    }

    setActionNotice('');
    setHideToolOptions(true);
    setSelectedForm({
      toolName: option.toolName,
      title: option.title,
      description: option.description,
      fields: option.fields,
      initialParams: option.initialParams,
    });
  };

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white',
          isUser ? 'bg-indigo-600' : 'bg-slate-700'
        )}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      <div className={cn('flex max-w-[88%] flex-col gap-2 sm:max-w-[78%]', isUser && 'items-end')}>
        {hasActionCard ? (
          <ToolActionsCard
            content={visibleContent}
            notice={actionNotice}
            options={visibleToolOptions}
            selectedForm={selectedForm}
            onSelect={handleToolOptionSelect}
            onCancel={() => {
              setSelectedForm(null);
              setCancelled(true);
              setActionNotice('');
              setHideToolOptions(true);
            }}
          />
        ) : visibleContent ? (
          <div
            className={cn(
              'whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed',
              isUser
                ? 'rounded-tr-md bg-indigo-600 text-white'
                : 'rounded-tl-md bg-slate-100 text-slate-800'
            )}
          >
            {visibleContent}
          </div>
        ) : null}

        {message.toolCall ? <ToolCallCard toolCall={message.toolCall} /> : null}

        {!visibleContent && !message.toolCall && !hasActionCard && !message.isStreaming ? (
          <div className="rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3 text-sm text-slate-500">
            I could not produce a usable response. Try again or check Connections.
          </div>
        ) : null}

        <span className="text-xs text-slate-400">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}

function ToolActionsCard({
  content,
  notice,
  options,
  selectedForm,
  onSelect,
  onCancel,
}: {
  content: string;
  notice?: string;
  options: ToolOption[];
  selectedForm: ToolForm | null;
  onSelect: (option: ToolOption) => void;
  onCancel: () => void;
}) {
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      {content ? <div className="whitespace-pre-wrap leading-relaxed text-slate-800">{content}</div> : null}
      {options.length ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <ToolOptions options={options} onSelect={onSelect} />
        </div>
      ) : null}
      {notice ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {notice}
        </div>
      ) : null}
      {selectedForm ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <ToolFormCard form={selectedForm} onCancel={onCancel} framed={false} />
        </div>
      ) : null}
    </div>
  );
}

function ToolOptions({
  options,
  onSelect,
}: {
  options: ToolOption[];
  onSelect: (option: ToolOption) => void;
}) {
  const [selectedToolName, setSelectedToolName] = useState(options[0]?.toolName ?? '');
  const selected = options.find((option) => option.toolName === selectedToolName);

  useEffect(() => {
    setSelectedToolName(options[0]?.toolName ?? '');
  }, [options]);

  return (
    <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <select
        value={selectedToolName}
        onChange={(event) => setSelectedToolName(event.target.value)}
        className="h-10 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {options.map((option) => (
          <option key={option.toolName} value={option.toolName}>
            {option.title}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        size="sm"
        disabled={!selected}
        onClick={() => selected && onSelect(selected)}
      >
        Continue
      </Button>
      {selected?.description ? (
        <div className="text-xs text-slate-500 sm:col-span-2">{selected.description}</div>
      ) : null}
    </div>
  );
}

function ToolFormCard({ form, onCancel, framed = true }: { form: ToolForm; onCancel: () => void; framed?: boolean }) {
  const { activeConversationId, setPendingToolRequest } = useChatStore();
  const isConfirmation = form.mode === 'confirm';
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      form.fields.map((field) => [field.name, form.initialParams?.[field.name]?.toString() ?? ''])
    )
  );
  const [status, setStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [readyToConfirm, setReadyToConfirm] = useState(false);
  const isCreateAction = /\b(create|add|new)\b/i.test(`${form.toolName} ${form.description ?? ''}`);
  const isWriteAction = /\b(create|update|delete|approve|write|refund|quota|admin|mutate|set|remove)\b/i.test(
    `${form.toolName} ${form.description ?? ''}`
  );
  const confirmAction = actionVerb(form.title);

  const missing = form.fields
    .filter((field) => {
      if (field.required || field.name === 'id') return true;
      if (isWriteAction && field.enum?.length) return true;
      return isCreateAction && /\b(name|title|email|customer|account|user)\b/i.test(`${field.name} ${field.description ?? ''}`);
    })
    .filter((field) => !values[field.name]?.trim())
    .map((field) => field.name);
  const needsInputInConfirmation = isConfirmation && (
    missing.length > 0 || form.fields.some((field) => field.options?.length)
  );
  const showReadOnlyConfirmation = isConfirmation && (!needsInputInConfirmation || readyToConfirm);
  const confirmationRows = Object.entries({
    ...(form.confirmationDetails ?? {}),
    ...values,
  }).filter(
    ([, value]) => value !== undefined && value !== null && String(value).trim() !== ''
  );

  useEffect(() => {
    setValues(
      Object.fromEntries(
        form.fields.map((field) => [field.name, form.initialParams?.[field.name]?.toString() ?? ''])
      )
    );
    setStatus('idle');
    setResult(null);
    setError('');
    setReadyToConfirm(false);
  }, [form]);

  const execute = async () => {
    if (missing.length > 0) {
      const missingText = missing.map((name) => {
        const field = form.fields.find((item) => item.name === name);
        if (field?.enum?.length) return `${name} (${field.enum.join(', ')})`;
        if (/status|state/i.test(`${name} ${field?.description ?? ''}`)) {
          return `${name} (allowed values were not provided by the connected app)`;
        }
        return name;
      });
      setError(`Enter required fields: ${missingText.join(', ')}`);
      return;
    }

    if (isConfirmation && needsInputInConfirmation && !readyToConfirm) {
      setError('');
      setReadyToConfirm(true);
      return;
    }

    const params = Object.fromEntries(
      form.fields
        .filter((field) => values[field.name]?.trim())
        .map((field) => [field.name, coerceValue(values[field.name], field.type)])
    );

    setStatus('executing');
    setError('');
    setResult(null);

    try {
      const response = await webMCPService.executeTool(form.toolName, params);
      if (activeConversationId) {
        setPendingToolRequest(activeConversationId, null);
      }
      setResult(response);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : 'Tool execution failed.');
      setStatus('error');
    }
  };

  const cancel = () => {
    if (activeConversationId) {
      setPendingToolRequest(activeConversationId, null);
    }
    onCancel();
  };

  return (
    <div className={framed ? 'w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm' : 'w-full text-sm'}>
      <div className="mb-3">
        <div className="font-medium text-slate-900">{form.title}</div>
        {form.description ? <div className="mt-0.5 text-xs text-slate-500">{form.description}</div> : null}
      </div>

      {showReadOnlyConfirmation ? (
        <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {confirmationRows.map(([key, value]) => (
              <div key={key} className="grid grid-cols-[120px_1fr] gap-2 text-xs">
                <span className="font-medium text-slate-500">{key}</span>
                <span className="break-words text-slate-900">{String(value)}</span>
              </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          {isConfirmation && confirmationRows.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              {confirmationRows.map(([key, value]) => (
                <div key={key} className="grid grid-cols-[120px_1fr] gap-2 text-xs">
                  <span className="font-medium text-slate-500">{key}</span>
                  <span className="break-words text-slate-900">{String(value)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {form.fields.map((field) => (
            <label key={field.name} className="grid gap-1 text-xs font-medium text-slate-600">
              {field.name === 'id' && field.options?.length ? 'Record' : field.name}
              {field.options?.length || field.enum?.length ? (
                <select
                  value={values[field.name] ?? ''}
                  onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select...</option>
                  {field.options?.length
                    ? field.options.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))
                    : field.enum?.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                </select>
              ) : (
                <input
                  value={values[field.name] ?? ''}
                  onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                  type={field.type === 'number' ? 'number' : 'text'}
                  placeholder={field.description || field.name}
                  className="h-10 rounded-xl border border-slate-300 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
              {!field.enum?.length && !field.options?.length && /status|state/i.test(`${field.name} ${field.description ?? ''}`) ? (
                <span className="text-[11px] font-normal text-amber-700">
                  The connected app did not provide allowed values for this field.
                </span>
              ) : null}
            </label>
          ))}
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {status === 'success' ? (
        <div className="mt-2 text-xs font-medium text-emerald-700">
          {summarizeResult(form.toolName, result)}
          <ResultPreview result={result} />
        </div>
      ) : null}

      {status !== 'success' ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={cancel} disabled={status === 'executing'}>
            Cancel
          </Button>
          <Button size="sm" onClick={execute} disabled={status === 'executing'}>
            {status === 'executing' ? <Loader2 size={13} className="animate-spin" /> : null}
            {isConfirmation
              ? (needsInputInConfirmation && !readyToConfirm ? 'Continue' : `Confirm ${confirmAction}`)
              : 'Execute'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function coerceValue(value: string, type: string) {
  if (type === 'number') return Number(value);
  if (type === 'boolean') return value === 'true';
  return value;
}

function actionVerb(title: string) {
  const first = title.trim().split(/\s+/)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : 'Action';
}

function stripToolPayload(content: string) {
  return content
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/^\s*\{[\s\S]*"tool"\s*:\s*"[^"]+"[\s\S]*"params"\s*:\s*\{[\s\S]*\}\s*\}\s*$/i, '')
    .trim();
}

function summarizeResult(toolName: string, result: unknown): string {
  const action = humanizeToolName(toolName);

  if (Array.isArray(result)) {
    if (result.length === 0) return 'No matching records found.';
    return `Found ${result.length} record${result.length === 1 ? '' : 's'}.`;
  }

  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    const id = record.order_id ?? record.orderId ?? record.id ?? record.ID;

    if (typeof record.message === 'string') return record.message;
    if (id !== undefined) return `Success. ${action} completed: ${String(id)}`;
  }

  if (typeof result === 'string' && result.trim()) return result;
  return `Success. ${action} completed.`;
}

function humanizeToolName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const navigate = useNavigate();
  const { toolName, status, result, error, startedAt, completedAt } = toolCall;
  const duration = completedAt ? completedAt - startedAt : undefined;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <Wrench size={13} className="shrink-0 text-slate-500" />
        <span className="font-mono text-xs font-medium text-slate-700">{toolName}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <StatusBadge status={status} />
          {duration !== undefined ? <span className="text-xs text-slate-400">{formatDuration(duration)}</span> : null}
        </div>
      </div>

      <div className="px-3 py-2">
        {status === 'pending' ? <ToolStep label={`Found tool: ${toolName}`} /> : null}
        {status === 'executing' ? (
          <div className="space-y-2">
            <ToolStep label={`Found tool: ${toolName}`} done />
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Loader2 size={13} className="animate-spin" />
              Executing {toolName}
            </div>
          </div>
        ) : null}

        {status === 'success' ? (
          <div className="space-y-2">
            <ToolStep label={`Found tool: ${toolName}`} done />
            <ToolStep label={`Executed ${toolName}`} done />
            <p className="text-xs font-medium text-emerald-700">{summarizeResult(toolName, result)}</p>
            <ResultPreview result={result} />
          </div>
        ) : null}

        {status === 'error' && error ? (
          <div className="flex flex-col gap-2">
            <ToolStep label={`Found tool: ${toolName}`} done />
            <p className="text-xs text-red-600">{friendlyError(error)}</p>
            <div>
              <Button variant="outline" size="sm" onClick={() => navigate('/connections')}>
                Open Connections
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolStep({ label, done }: { label: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      {done ? <CheckCircle size={13} className="text-emerald-600" /> : <Loader2 size={13} className="animate-spin" />}
      {label}
    </div>
  );
}

function ResultPreview({ result }: { result: unknown }) {
  if (!result || typeof result === 'string') return null;

  if (Array.isArray(result)) {
    const records = result.filter(isRecord);
    if (records.length === 0) return null;
    const columns = displayColumns(records);
    const visibleRows = records.slice(0, 20);

    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white text-xs text-slate-700">
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
        {records.length > visibleRows.length ? (
          <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            Showing {visibleRows.length} of {records.length} records.
          </div>
        ) : null}
      </div>
    );
  }

  if (!isRecord(result)) return null;
  const entries = Object.entries(result).filter(([key, value]) => shouldDisplayField(key) && value !== undefined && value !== null);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2 grid gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[120px_1fr] gap-2">
          <span className="font-medium text-slate-500">{humanizeFieldName(key)}</span>
          <span className="break-words text-slate-900">{formatCell(value)}</span>
        </div>
      ))}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function shouldDisplayField(key: string) {
  return !/^(id|.*_id|uuid|created_by|updated_by)$/i.test(key);
}

function displayColumns(records: Array<Record<string, unknown>>) {
  const preferred = [
    'name',
    'customer_name',
    'title',
    'email',
    'amount',
    'status',
    'state',
    'created_at',
    'updated_at',
  ];
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
    return parsedDate.toLocaleString();
  }
  return text;
}

function friendlyError(error: string) {
  if (/failed to fetch|network|cors/i.test(error)) {
    return 'Tool execution failed because the backend request could not be reached. Check the API server URL, CORS settings, and required headers in webapi.json.';
  }
  if (/401|session|sign in|auth/i.test(error)) {
    return 'Tool execution failed because the customer session is invalid or expired. Paste the Supabase access_token for the same customer app, not the anon key or refresh token, then reconnect.';
  }
  if (/403|permission|role|scope/i.test(error)) {
    return 'Tool execution failed because this user does not have the required role or scope.';
  }
  return error;
}

function StatusBadge({ status }: { status: ToolCall['status'] }) {
  switch (status) {
    case 'pending':
      return <Badge variant="muted">Found</Badge>;
    case 'executing':
      return <Badge variant="warning">Executing</Badge>;
    case 'success':
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
          <CheckCircle size={12} /> Success
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-red-600">
          <XCircle size={12} /> Failed
        </span>
      );
  }
}
