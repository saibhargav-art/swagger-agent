import { ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/index';
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
        'w-full text-left rounded-lg border p-3 transition-colors',
        'hover:border-indigo-300 hover:bg-indigo-50/40',
        isSelected
          ? 'border-indigo-400 bg-indigo-50'
          : 'border-slate-200 bg-white'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 font-mono truncate">
            {tool.name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
            {tool.description}
          </p>

          {/* Roles */}
          {tool.requiredRoles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tool.requiredRoles.map((role) => (
                <Badge key={role} variant="muted">
                  {role}
                </Badge>
              ))}
            </div>
          )}
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
