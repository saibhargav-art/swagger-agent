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
  { id: 'ollama', label: 'Ollama' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'bedrock', label: 'Bedrock' },
];

export function AgentConnectionCard({ agent, onConnect, onDisconnect }: Props) {
  const canConnect = agent.modelProvider === 'ollama'
    ? Boolean(agent.ollamaModel.trim())
    : agent.modelProvider === 'openai'
      ? Boolean(agent.openAiApiKey.trim() && agent.openAiModel.trim())
      : true;

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
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Model provider">
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

      {agent.modelProvider === 'ollama' ? (
        <Field label="Ollama model" hint="A tool-capable model installed locally">
          <Input
            value={agent.ollamaModel}
            placeholder="qwen2.5:7b"
            onChange={(event) => agent.setOllamaConfig({ model: event.target.value })}
          />
        </Field>
      ) : null}

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

      {agent.modelProvider === 'bedrock' ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          Uses the AWS credentials configured for the local agent process.
        </p>
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
