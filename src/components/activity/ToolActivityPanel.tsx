import { Trash2, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { ScrollArea } from '@/components/ui/index';
import { formatTime, formatDuration } from '@/utils/format';
import type { ToolActivity, ActivityStatus } from '@/types/tool';

interface Props {
  activities: ToolActivity[];
  onClear: () => void;
}

export default function ToolActivityPanel({ activities, onClear }: Props) {
  return (
    <div className="flex w-64 flex-col border-l border-slate-200 bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200">
        <span className="text-sm font-semibold text-slate-700">Activity</span>
        {activities.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            title="Clear activity"
            className="h-6 w-6 text-slate-400"
          >
            <Trash2 size={13} />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 p-2">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Clock size={20} className="mb-2 opacity-40" />
            <p className="text-xs text-center">
              Tool executions will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {activities.map((a) => (
              <ActivityItem key={a.id} activity={a} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function ActivityItem({ activity }: { activity: ToolActivity }) {
  const { toolName, status, timestamp, duration } = activity;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-2.5">
      {/* Tool name + status icon */}
      <div className="flex items-center gap-1.5">
        <StatusIcon status={status} />
        <span className="text-xs font-mono font-medium text-slate-700 truncate flex-1">
          {toolName}
        </span>
      </div>

      {/* Meta */}
      <div className="mt-1.5 flex items-center gap-2">
        <StatusLabel status={status} />
        <span className="text-xs text-slate-400">{formatTime(timestamp)}</span>
        {duration !== undefined && (
          <span className="text-xs text-slate-400 ml-auto">
            {formatDuration(duration)}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: ActivityStatus }) {
  switch (status) {
    case 'pending':
      return <Clock size={13} className="text-slate-400 shrink-0" />;
    case 'executing':
      return <Loader2 size={13} className="text-amber-500 animate-spin shrink-0" />;
    case 'success':
      return <CheckCircle size={13} className="text-emerald-500 shrink-0" />;
    case 'error':
      return <XCircle size={13} className="text-red-500 shrink-0" />;
  }
}

function StatusLabel({ status }: { status: ActivityStatus }) {
  const map: Record<ActivityStatus, { label: string; class: string }> = {
    pending: { label: 'Pending', class: 'text-slate-500' },
    executing: { label: 'Running', class: 'text-amber-600' },
    success: { label: 'Success', class: 'text-emerald-600' },
    error: { label: 'Failed', class: 'text-red-600' },
  };
  const { label, class: cls } = map[status];
  return (
    <span className={cn('text-xs font-medium', cls)}>{label}</span>
  );
}
