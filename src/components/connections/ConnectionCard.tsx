import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ConnectionStatus } from '@/types/connection';
import { cn } from '@/utils/cn';

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  status: ConnectionStatus;
  message?: string | null;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  onDisconnect?: () => void;
  children: ReactNode;
}

export function ConnectionCard({
  icon: Icon,
  title,
  subtitle,
  status,
  message,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  onDisconnect,
  children,
}: Props) {
  const busy = status === 'connecting';

  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white">
      <header className="flex items-start gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
          <Icon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-950">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-slate-500">{subtitle}</span>
        </span>
        <ConnectionBadge status={status} />
      </header>

      <div className="grid flex-1 content-start gap-4 px-4 py-4 sm:px-5">{children}</div>

      <footer className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className={cn(
          'min-w-0 break-words text-xs leading-5',
          status === 'error' ? 'text-rose-600' : 'text-slate-500',
        )}>
          {message ?? defaultStatusMessage(status)}
        </p>
        <div className="flex shrink-0 justify-end gap-2">
          {status === 'connected' && onDisconnect ? (
            <Button variant="ghost" size="sm" onClick={onDisconnect}>Disconnect</Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onPrimary} disabled={busy || primaryDisabled}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
            {busy ? 'Connecting...' : primaryLabel}
          </Button>
        </div>
      </footer>
    </section>
  );
}

export function ConnectionBadge({ status, prefix }: { status: ConnectionStatus; prefix?: string }) {
  const statusLabel = {
    'not-connected': 'Not connected',
    connecting: 'Connecting',
    connected: 'Connected',
    error: 'Failed',
  }[status];
  const colors = {
    'not-connected': 'border-slate-200 bg-slate-50 text-slate-600',
    connecting: 'border-sky-200 bg-sky-50 text-sky-700',
    connected: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    error: 'border-rose-200 bg-rose-50 text-rose-700',
  }[status];

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium', colors)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', {
        'bg-slate-400': status === 'not-connected',
        'animate-pulse bg-sky-500': status === 'connecting',
        'bg-emerald-500': status === 'connected',
        'bg-rose-500': status === 'error',
      })} />
      {prefix ? `${prefix}: ${statusLabel}` : statusLabel}
    </span>
  );
}

function defaultStatusMessage(status: ConnectionStatus): string {
  if (status === 'connected') return 'Connection verified.';
  if (status === 'connecting') return 'Checking the local services...';
  if (status === 'error') return 'Review the settings and try again.';
  return 'Connect when the required fields are complete.';
}
