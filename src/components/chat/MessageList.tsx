import { useEffect, useRef } from 'react';
import { Bot, CheckCircle2, Globe2, MessageSquare, Settings } from 'lucide-react';
import MessageBubble from './MessageBubble';
import type { Message } from '@/types/chat';
import type { Tool } from '@/types/tool';

interface Props {
  messages: Message[];
  isStreaming: boolean;
  providerConnected: boolean;
  websiteConnected: boolean;
  tools: Tool[];
  onGoToConnections: () => void;
}

export default function MessageList({
  messages,
  isStreaming,
  providerConnected,
  websiteConnected,
  tools,
  onGoToConnections,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const toolCount = tools.length;
  const examples = buildExamples(tools);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-900 text-white">
                <MessageSquare size={20} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-950">
                {websiteConnected ? 'Ready to use connected tools' : 'Connect a website to begin'}
              </h3>
              <p className="mt-1 max-w-xl text-sm text-slate-500">
                {websiteConnected
                  ? 'Ask for an action that matches one of the discovered tools.'
                  : 'The chat app will discover available actions from the connected website contract.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToConnections}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Settings size={15} />
              Connections
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <SetupStep label="AI provider" ready={providerConnected} icon={Bot} />
            <SetupStep label="Website session" ready={websiteConnected} icon={Globe2} />
            <SetupStep label={`${toolCount} tools discovered`} ready={toolCount > 0} icon={CheckCircle2} />
          </div>

          {examples.length > 0 ? (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {examples.map((example) => (
                <div key={example} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {example}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isStreaming && (
          <div className="flex items-center gap-2 text-slate-400">
            <Bot size={16} />
            <TypingIndicator />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function SetupStep({
  label,
  ready,
  icon: Icon,
}: {
  label: string;
  ready: boolean;
  icon: typeof Bot;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        ready ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon size={16} className={ready ? 'text-emerald-600' : 'text-slate-400'} />
        <span className={ready ? 'text-sm font-medium text-emerald-800' : 'text-sm font-medium text-slate-600'}>
          {label}
        </span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex h-5 items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

function buildExamples(tools: Tool[]) {
  return tools.slice(0, 4).map((tool) => humanizeToolName(tool.name));
}

function humanizeToolName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}
