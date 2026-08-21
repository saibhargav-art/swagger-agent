import { useState, useRef, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';

interface Props {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled, placeholder }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (v: string) => {
    setValue(v);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  };

  return (
    <div className="shrink-0 bg-white px-3 pb-3 pt-2 sm:px-6 sm:pb-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex min-h-12 items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2.5 shadow-sm transition-shadow focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-indigo-100">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? placeholder ?? 'Complete connections first' : placeholder ?? 'Message the connected app'}
            disabled={disabled}
            rows={1}
            aria-label="Chat message"
            className="min-h-7 flex-1 resize-none border-0 bg-transparent p-0 leading-7 shadow-none focus-visible:ring-0"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className="h-8 w-8 shrink-0 rounded-lg"
            title="Send message"
            aria-label="Send message"
          >
            <Send size={15} />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-xs text-slate-400">
          Confirmed write actions can change data in the connected app.
        </p>
      </div>
    </div>
  );
}
