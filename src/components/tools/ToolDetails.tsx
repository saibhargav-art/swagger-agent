import type { ReactNode } from 'react';
import { Code, Eye, Pencil, TriangleAlert, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Separator } from '@/components/ui/Separator';
import type { Tool } from '@/types/tool';

interface Props {
  tool: Tool;
  onClose: () => void;
}

export default function ToolDetails({ tool, onClose }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between border-b border-slate-200 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{humanizeToolName(tool.name)}</p>
          <code className="mt-0.5 block truncate text-[11px] text-slate-400">{tool.name}</code>
          <p className="mt-1 text-xs leading-5 text-slate-500">{tool.description}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="-mr-1 -mt-1 shrink-0" title="Close details">
          <X size={15} />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 scrollbar-thin">
        <Section icon={tool.annotations.readOnly ? <Eye size={13} /> : <Pencil size={13} />} title="Behavior">
          <div className="flex flex-wrap gap-2">
            <Badge variant={tool.annotations.readOnly ? 'success' : 'default'}>
              {tool.annotations.readOnly ? 'Read-only' : 'Confirmation required'}
            </Badge>
            {tool.annotations.destructive ? (
              <Badge variant="error"><TriangleAlert size={11} /> Destructive</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Authorization is enforced by the customer backend using the connected user session.
          </p>
        </Section>

        <Separator />

        <Section icon={<Code size={13} />} title="Parameters">
          {tool.schema.parameters.length === 0 ? (
            <p className="text-xs text-slate-400">No parameters</p>
          ) : (
            <div className="space-y-2">
              {tool.schema.parameters.map((parameter) => (
                <div key={parameter.name} className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-xs font-semibold text-slate-800">{parameter.name}</code>
                    <Badge variant="muted">{parameter.type}</Badge>
                    <Badge variant={parameter.required ? 'error' : 'outline'}>
                      {parameter.required ? 'required' : 'optional'}
                    </Badge>
                  </div>
                  {parameter.description ? <p className="mt-1 text-xs text-slate-500">{parameter.description}</p> : null}
                  {parameter.enum?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {parameter.enum.map((value) => (
                        <code key={value} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-600">
                          {value}
                        </code>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
        {icon}
        {title}
      </div>
      {children}
    </section>
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
