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
    // Reset height
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
    // Auto-grow
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  };

  return (
    <div className="border-t border-slate-200 p-4">
      <div className="flex items-end gap-2 rounded-lg border border-slate-300 bg-white p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-shadow">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? placeholder ?? 'Connect a provider first' : placeholder ?? 'Message…'}
          disabled={disabled}
          rows={1}
          className="flex-1 border-0 p-0 shadow-none focus-visible:ring-0 resize-none min-h-[28px]"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          className="shrink-0 h-8 w-8"
        >
          <Send size={15} />
        </Button>
      </div>
      <p className="mt-1.5 text-center text-xs text-slate-400">
        AI responses can be inaccurate. Verify tool results before acting.
      </p>
    </div>
  );
}
