import type { HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

type BadgeVariant = 'default' | 'error' | 'outline' | 'muted' | 'success';

const variants: Record<BadgeVariant, string> = {
  default: 'bg-indigo-100 text-indigo-700',
  error: 'bg-rose-100 text-rose-700',
  outline: 'border border-slate-300 text-slate-600',
  muted: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-100 text-emerald-700',
};

interface Props extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'default', ...props }: Props) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', variants[variant], className)} {...props} />;
}
