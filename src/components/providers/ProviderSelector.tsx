import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, CircleDot } from 'lucide-react';
import { useProviderStore } from '@/store/providerStore';
import type { ProviderId } from '@/types/provider';
import { PROVIDER_LABELS } from '@/types/provider';

const PROVIDERS: ProviderId[] = ['openai', 'claude', 'gemini', 'ollama'];

const statusDotClass: Record<'connected' | 'error' | 'not-connected', string> = {
  connected: 'bg-emerald-500',
  error: 'bg-rose-500',
  'not-connected': 'bg-slate-400',
};

export default function ProviderSelector() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { activeProviderId, configs, connectionStatus, setActiveProvider } = useProviderStore();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeProvider = activeProviderId;
  const activeModel = configs[activeProvider].model;
  const activeStatus = connectionStatus[activeProvider] ?? 'not-connected';

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${statusDotClass[activeStatus]}`}
        />
        <span className="truncate">{PROVIDER_LABELS[activeProvider]} · {activeModel}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-slate-200 bg-white shadow-lg">
          {PROVIDERS.map((id) => {
            const status = connectionStatus[id] ?? 'not-connected';
            const model = configs[id].model;
            const isUnavailable = status === 'not-connected';
            const onClick = () => {
              setOpen(false);
              if (isUnavailable) {
                setActiveProvider(id);
                navigate('/connections');
                return;
              }
              setActiveProvider(id);
            };

            return (
              <button
                key={id}
                type="button"
                onClick={onClick}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left text-sm transition-colors ${id === activeProvider ? 'bg-slate-50' : 'hover:bg-slate-100'
                  }`}
              >
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${statusDotClass[status]}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800">{PROVIDER_LABELS[id]}</div>
                  <div className="text-xs text-slate-500 truncate">{model}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
