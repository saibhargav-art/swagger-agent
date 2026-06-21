import { useState } from 'react';
import { useTools } from '@/hooks/useTools';
import ToolExplorer from '@/components/tools/ToolExplorer';
import ToolDetails from '@/components/tools/ToolDetails';
import type { Tool } from '@/types/tool';

export default function ToolExplorerPage() {
  const { tools, isLoading, error, reload } = useTools();
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  const handleSelect = (tool: Tool) => {
    setSelectedTool((prev) => (prev?.id === tool.id ? null : tool));
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: tool list + search */}
      <div className="flex w-80 flex-col border-r border-slate-200 bg-white">
        {/* Page header */}
        <div className="px-4 py-3 border-b border-slate-200">
          <h1 className="text-sm font-semibold text-slate-800">Tool Explorer</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Browse tools exposed by WebMCP
          </p>
        </div>

        <ToolExplorer
          tools={tools}
          isLoading={isLoading}
          error={error}
          selectedTool={selectedTool}
          onSelect={handleSelect}
          onReload={reload}
        />
      </div>

      {/* Right: tool details */}
      <div className="flex flex-1 overflow-hidden bg-white">
        {selectedTool ? (
          <ToolDetails
            tool={selectedTool}
            onClose={() => setSelectedTool(null)}
          />
        ) : (
          <EmptyState toolCount={tools.length} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ toolCount }: { toolCount: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-slate-400 select-none">
      <div className="text-center">
        <p className="text-sm font-medium text-slate-500">
          {toolCount === 0 ? 'No tools loaded' : 'Select a tool'}
        </p>
        <p className="text-xs mt-1">
          {toolCount === 0
            ? 'Tools will appear once WebMCP responds.'
            : 'Click a tool on the left to view its schema.'}
        </p>
      </div>
    </div>
  );
}
