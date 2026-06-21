import { useEffect, useRef } from 'react';
import { Bot, MessageSquare } from 'lucide-react';
import MessageBubble from './MessageBubble';
import type { Message } from '@/types/chat';

interface Props {
  messages: Message[];
  isStreaming: boolean;
  providerConnected: boolean;
  onGoToConnections: () => void;
}

export default function MessageList({ messages, isStreaming, providerConnected, onGoToConnections }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    if (!providerConnected) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-500 select-none">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <MessageSquare size={24} className="text-slate-400" />
          </div>
          <div className="text-center max-w-sm">
            <p className="text-base font-semibold text-slate-700">Connect an AI provider to start chatting</p>
            <p className="text-sm text-slate-500 mt-2">
              Select a provider and verify credentials in Connections to enable the chat input.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToConnections}
            className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Go to connections
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400 select-none">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <MessageSquare size={22} className="text-slate-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-600">Start a conversation</p>
          <p className="text-xs mt-0.5">
            Ask anything or describe a task — available tools will run automatically.
          </p>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2 max-w-sm">
          {EXAMPLES.map((ex) => (
            <span
              key={ex}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500"
            >
              {ex}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
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
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center h-5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

const EXAMPLES = [
  'Create order for Vijay worth $500',
  'Get shipment status for TRK-001',
  'Get customer details for Priya',
];
