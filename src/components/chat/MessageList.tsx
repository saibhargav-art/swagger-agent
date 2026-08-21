import { useEffect, useRef } from 'react';
import { ArrowRight, Bot, Globe2, Settings, Sparkles } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { Button } from '@/components/ui/Button';
import type { Message } from '@/types/chat';
import type { Tool } from '@/types/tool';

interface Props {
  messages: Message[];
  isStreaming: boolean;
  agentConnected: boolean;
  websiteConnected: boolean;
  tools: Tool[];
  onGoToConnections: () => void;
  onSend: (content: string) => void;
}

export default function MessageList({
  messages,
  isStreaming,
  agentConnected,
  websiteConnected,
  tools,
  onGoToConnections,
  onSend,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 overflow-y-auto px-4 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-900 text-white">
            <Sparkles size={18} />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-slate-950">
            {websiteConnected ? 'What should the connected app do?' : 'Connect an app to start'}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            {websiteConnected
              ? `${tools.length} tools are available. Ask naturally and the local agent will choose the appropriate action.`
              : 'Connect the local agent and a customer app that exposes WebMCP tools. The current demo executes those tools directly.'}
          </p>

          {!agentConnected || !websiteConnected ? (
            <div className="mt-6 border-y border-slate-200 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <ConnectionRow icon={Bot} label="Local agent" ready={agentConnected} />
                <ConnectionRow icon={Globe2} label="Customer app" ready={websiteConnected} />
              </div>
              <Button className="mt-4" onClick={onGoToConnections}>
                <Settings size={15} />
                Open connections
              </Button>
            </div>
          ) : (
            <div className="mt-7 grid gap-2 sm:grid-cols-2">
              {buildExamples(tools).map((example) => (
                <button
                  key={example.prompt}
                  type="button"
                  onClick={() => onSend(example.prompt)}
                  className="group flex min-h-16 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300 hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{example.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{example.description}</span>
                  </span>
                  <ArrowRight size={15} className="shrink-0 text-slate-400 group-hover:text-slate-700" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-6 scrollbar-thin sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {messages.map((message) => <MessageBubble key={message.id} message={message} />)}

        {isStreaming ? (
          <div className="flex min-h-8 items-center gap-3 text-sm text-slate-500">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white">
              <Bot size={14} />
            </span>
            <span>Working</span>
            <TypingIndicator />
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function ConnectionRow({ icon: Icon, label, ready }: { icon: typeof Bot; label: string; ready: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-700">
      <Icon size={16} className="text-slate-500" />
      <span className="flex-1">{label}</span>
      <span className={`text-xs font-medium ${ready ? 'text-emerald-600' : 'text-slate-400'}`}>
        {ready ? 'Ready' : 'Required'}
      </span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <span className="flex h-5 items-center gap-1" aria-label="Agent is working">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
          style={{ animationDelay: `${index * 150}ms` }}
        />
      ))}
    </span>
  );
}

function buildExamples(tools: Tool[]) {
  return tools.slice(0, 4).map((tool) => {
    const label = humanizeToolName(tool.name);
    return {
      label,
      description: tool.description || 'Run this connected app action',
      prompt: label,
    };
  });
}

function humanizeToolName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}
