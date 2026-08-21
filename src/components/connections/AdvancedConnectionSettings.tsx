import { ChevronDown, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Field } from './AgentConnectionCard';
import { Input } from '@/components/ui/Input';
import type { useAgentRuntimeStore } from '@/store/agentRuntimeStore';

type AgentState = ReturnType<typeof useAgentRuntimeStore.getState>;

interface Props {
  agent: AgentState;
}

export function AdvancedConnectionSettings({ agent }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="border-y border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-4 text-left"
      >
        <Settings2 size={17} className="shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">Advanced settings</span>
          <span className="mt-0.5 block text-xs text-slate-500">Agent runtime endpoint</span>
        </span>
        <ChevronDown size={17} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="grid gap-5 border-t border-slate-200 py-5 md:grid-cols-2">
          <div className="grid content-start gap-4">
            <Field label="Agent service URL">
              <Input type="url" value={agent.agentUrl} onChange={(event) => agent.setAgentUrl(event.target.value)} />
            </Field>
          </div>
        </div>
      ) : null}
    </section>
  );
}
