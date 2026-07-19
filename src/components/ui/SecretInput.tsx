import { useState } from 'react';
import type { ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './Input';

type Props = Omit<ComponentProps<typeof Input>, 'type'>;

export function SecretInput(props: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={`${props.className ?? ''} pr-10`} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute right-1 top-1 flex h-7 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        title={visible ? 'Hide value' : 'Show value'}
        aria-label={visible ? 'Hide value' : 'Show value'}
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}
