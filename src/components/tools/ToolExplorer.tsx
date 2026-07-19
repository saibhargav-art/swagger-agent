import { useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ScrollArea } from '@/components/ui/ScrollArea';
import ToolCard from './ToolCard';
import type { Tool } from '@/types/tool';

const TOOL_RENDER_LIMIT = 100;

interface Props {
  tools: Tool[];
  isLoading: boolean;
  error: string | null;
  selectedTool: Tool | null;
  onSelect: (tool: Tool) => void;
  onReload: () => void;
}

export default function ToolExplorer({
  tools,
  isLoading,
  error,
  selectedTool,
  onSelect,
  onReload,
}: Props) {
  const [query, setQuery] = useState('');
  const [behaviorFilter, setBehaviorFilter] = useState('');

  const filtered = tools.filter((t) => {
    const matchesQuery =
      !query ||
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.description.toLowerCase().includes(query.toLowerCase());

    const matchesBehavior = !behaviorFilter
      || (behaviorFilter === 'read' && t.annotations.readOnly)
      || (behaviorFilter === 'write' && !t.annotations.readOnly);

    return matchesQuery && matchesBehavior;
  });
  const visibleTools = filtered.slice(0, TOOL_RENDER_LIMIT);

  return (
    <div className="flex flex-col h-full">
      {/* Search and filters */}
      <div className="p-3 space-y-2 border-b border-slate-200">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <Input
            placeholder="Search tools..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        <select
          value={behaviorFilter}
          onChange={(e) => setBehaviorFilter(e.target.value)}
          className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All actions</option>
          <option value="read">Read-only</option>
          <option value="write">Changes data</option>
        </select>
      </div>

      {/* Tool list */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <span className="text-xs text-slate-500">
          {isLoading ? 'Loading...' : `${filtered.length} of ${tools.length} tools`}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onReload}
          disabled={isLoading}
          title="Reload tools"
          className="h-6 w-6"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-2">
        {error ? (
          <div className="p-3 text-xs text-red-600 bg-red-50 rounded-md">
            {error}
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">
            No tools match your search.
          </p>
        ) : (
          <div className="space-y-1.5">
            {filtered.length > TOOL_RENDER_LIMIT ? (
              <p className="px-2 py-1 text-xs text-slate-500">
                Showing the first {TOOL_RENDER_LIMIT} matches. Refine your search to find another tool.
              </p>
            ) : null}
            {visibleTools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                isSelected={selectedTool?.id === tool.id}
                onSelect={() => onSelect(tool)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
