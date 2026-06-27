import { ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { Tool } from '@/types/tool';

interface Props {
  tool: Tool;
  isSelected: boolean;
  onSelect: () => void;
}

export default function ToolCard({ tool, isSelected, onSelect }: Props) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border px-3 py-2 text-left transition-colors',
        'hover:border-indigo-300 hover:bg-indigo-50/40',
        isSelected
          ? 'border-indigo-400 bg-indigo-50'
          : 'border-slate-200 bg-white'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{humanizeToolName(tool.name)}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{tool.description}</p>
        </div>
        <ChevronRight
          size={14}
          className={cn(
            'shrink-0 mt-0.5 transition-colors',
            isSelected ? 'text-indigo-500' : 'text-slate-300'
          )}
        />
      </div>
    </button>
  );
}

function humanizeToolName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}
