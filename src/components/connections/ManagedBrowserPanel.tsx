import { ExternalLink, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ManagedBrowserStatus } from '@/services/connections/ConnectionService';
import { cn } from '@/utils/cn';

interface Props {
  status: ManagedBrowserStatus | null;
  busy: boolean;
  canOpen: boolean;
  onOpen: () => void;
  onCheck: () => void;
  onReset: () => void;
}

export function ManagedBrowserPanel({
  status,
  busy,
  canOpen,
  onOpen,
  onCheck,
  onReset,
}: Props) {
  const label = browserLabel(status);

  return (
    <section className="rounded-lg border border-slate-200 bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-950">Managed browser</h2>
            <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', label.className)}>
              {label.text}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Desktop browser session used by the local agent for login and UI-only actions.
          </p>
          {status?.pageUrl ? (
            <p className="mt-2 truncate text-xs text-slate-600" title={status.pageUrl}>
              Current page: {status.pageUrl}
            </p>
          ) : null}
          {status?.error ? <p className="mt-2 text-xs text-rose-600">{status.error}</p> : null}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCheck} disabled={busy}>
            <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
            Check
          </Button>
          <Button variant="outline" size="sm" onClick={onOpen} disabled={busy || !canOpen}>
            <ExternalLink size={13} />
            Open
          </Button>
          <Button variant="ghost" size="sm" onClick={onReset} disabled={busy}>
            <RotateCcw size={13} />
            Reset session
          </Button>
        </div>
      </div>
    </section>
  );
}

function browserLabel(status: ManagedBrowserStatus | null) {
  if (!status) return { text: 'Not checked', className: 'border-slate-200 bg-slate-50 text-slate-600' };
  if (!status.enabled) return { text: 'Disabled', className: 'border-slate-200 bg-slate-50 text-slate-600' };
  if (!status.configured) return { text: 'Not configured', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  if (status.error) return { text: 'Needs attention', className: 'border-rose-200 bg-rose-50 text-rose-700' };
  if (status.connected) return { text: 'Ready', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  return { text: 'Not opened', className: 'border-slate-200 bg-slate-50 text-slate-600' };
}
