import { ChevronDown, ListFilter } from 'lucide-react';
import { useState } from 'react';
import ToolDetails from '@/components/tools/ToolDetails';
import ToolExplorer from '@/components/tools/ToolExplorer';
import type { Tool } from '@/types/tool';

interface Props {
  tools: Tool[];
  isLoading: boolean;
  error: string | null;
  onReload: () => void;
}

export function DiscoveredToolsSection({ tools, isLoading, error, onReload }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  return (
    <section className="py-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={tools.length === 0}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
          <ListFilter size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">Discovered tools</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {tools.length ? `${tools.length} actions available to the agent` : 'Connect a customer app to discover actions'}
          </span>
        </span>
        <ChevronDown size={17} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className={`mt-3 grid min-h-0 gap-3 ${selectedTool ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
          <div className="h-[min(58vh,520px)] min-h-80 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <ToolExplorer
              tools={tools}
              isLoading={isLoading}
              error={error}
              selectedTool={selectedTool}
              onSelect={(tool) => setSelectedTool((current) => current?.id === tool.id ? null : tool)}
              onReload={onReload}
            />
          </div>
          {selectedTool ? (
            <div className="h-[min(58vh,520px)] min-h-80 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <ToolDetails tool={selectedTool} onClose={() => setSelectedTool(null)} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
