import { Bot } from 'lucide-react';
import type { ReactNode } from 'react';
import { ConnectionCard } from './ConnectionCard';
import { Input } from '@/components/ui/Input';
import { SecretInput } from '@/components/ui/SecretInput';
import type { useAgentRuntimeStore } from '@/store/agentRuntimeStore';
import type { StrandsModelProvider } from '@/store/agentRuntimeStore';
import { cn } from '@/utils/cn';

type AgentState = ReturnType<typeof useAgentRuntimeStore.getState>;

interface Props {
  agent: AgentState;
  onConnect: () => void;
  onDisconnect: () => void;
}

const providers: Array<{ id: StrandsModelProvider; label: string }> = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Claude' },
];

export function AgentConnectionCard({ agent, onConnect, onDisconnect }: Props) {
  const canConnect = agent.modelProvider === 'openai'
    ? Boolean(agent.openAiApiKey.trim() && agent.openAiModel.trim())
    : Boolean(agent.anthropicApiKey.trim() && agent.anthropicModel.trim());

  return (
    <ConnectionCard
      icon={Bot}
      title="Local agent"
      subtitle="Strands runtime and model"
      status={agent.status}
      message={agent.statusMessage}
      primaryLabel={agent.status === 'connected' ? 'Test again' : 'Connect agent'}
      onPrimary={onConnect}
      primaryDisabled={!canConnect}
      onDisconnect={onDisconnect}
    >
      <Field label="Model provider">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Model provider">
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => agent.setModelProvider(provider.id)}
              aria-pressed={agent.modelProvider === provider.id}
              className={cn(
                'h-9 rounded-md border px-2 text-sm font-medium transition-colors',
                agent.modelProvider === provider.id
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {provider.label}
            </button>
          ))}
        </div>
      </Field>

      {agent.modelProvider === 'openai' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="OpenAI API key">
            <SecretInput
              value={agent.openAiApiKey}
              autoComplete="off"
              placeholder="sk-..."
              onChange={(event) => agent.setOpenAiConfig({ apiKey: event.target.value })}
            />
          </Field>
          <Field label="OpenAI model">
            <Input
              value={agent.openAiModel}
              placeholder="gpt-4o-mini"
              onChange={(event) => agent.setOpenAiConfig({ model: event.target.value })}
            />
          </Field>
        </div>
      ) : null}

      {agent.modelProvider === 'anthropic' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Anthropic API key">
            <SecretInput
              value={agent.anthropicApiKey}
              autoComplete="off"
              placeholder="sk-ant-..."
              onChange={(event) => agent.setAnthropicConfig({ apiKey: event.target.value })}
            />
          </Field>
          <Field label="Claude model">
            <Input
              value={agent.anthropicModel}
              placeholder="claude-3-5-sonnet-latest"
              onChange={(event) => agent.setAnthropicConfig({ model: event.target.value })}
            />
          </Field>
        </div>
      ) : null}
    </ConnectionCard>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-700">
      <span className="flex flex-wrap items-baseline justify-between gap-1">
        <span>{label}</span>
        {hint ? <span className="font-normal text-slate-400">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
