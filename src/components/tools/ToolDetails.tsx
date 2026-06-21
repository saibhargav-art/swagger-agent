import type { ReactNode } from 'react';
import { X, Shield, Key, Code } from 'lucide-react';
import { Badge } from '@/components/ui/index';
import { Button } from '@/components/ui/Button';
import { Separator } from '@/components/ui/index';
import type { Tool } from '@/types/tool';

interface Props {
  tool: Tool;
  onClose: () => void;
}

export default function ToolDetails({ tool, onClose }: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-slate-200">
        <div>
          <p className="font-mono text-sm font-semibold text-slate-800">
            {tool.name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{tool.description}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 -mt-1 -mr-1">
          <X size={15} />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin">
        {/* Required Roles */}
        <Section icon={<Shield size={13} />} title="Required Roles">
          {tool.requiredRoles.length === 0 ? (
            <p className="text-xs text-slate-400">None</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tool.requiredRoles.map((r) => (
                <Badge key={r} variant="default">{r}</Badge>
              ))}
            </div>
          )}
        </Section>

        <Separator />

        {/* Required Scopes */}
        <Section icon={<Key size={13} />} title="Required Scopes">
          {tool.requiredScopes.length === 0 ? (
            <p className="text-xs text-slate-400">None</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tool.requiredScopes.map((s) => (
                <Badge key={s} variant="outline">{s}</Badge>
              ))}
            </div>
          )}
        </Section>

        <Separator />

        {/* Parameters */}
        <Section icon={<Code size={13} />} title="Parameters">
          {tool.schema.parameters.length === 0 ? (
            <p className="text-xs text-slate-400">No parameters</p>
          ) : (
            <div className="space-y-2">
              {tool.schema.parameters.map((param) => (
                <div
                  key={param.name}
                  className="rounded-md border border-slate-200 bg-slate-50 p-2.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-semibold text-slate-800 font-mono">
                      {param.name}
                    </code>
                    <Badge variant="muted">{param.type}</Badge>
                    {param.required ? (
                      <Badge variant="error">required</Badge>
                    ) : (
                      <Badge variant="outline">optional</Badge>
                    )}
                  </div>
                  {param.description && (
                    <p className="text-xs text-slate-500 mt-1">{param.description}</p>
                  )}
                  {param.enum && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {param.enum.map((v) => (
                        <code
                          key={v}
                          className="text-xs bg-white border border-slate-200 rounded px-1 py-0.5 text-slate-600"
                        >
                          {v}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Separator />

        {/* Raw Schema */}
        <Section icon={<Code size={13} />} title="JSON Schema">
          <pre className="text-xs bg-slate-900 text-slate-100 rounded-md p-3 overflow-x-auto font-mono scrollbar-thin">
            {JSON.stringify(tool.schema, null, 2)}
          </pre>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
