import { NavLink } from 'react-router-dom';
import { MessageSquare, Wrench, Zap } from 'lucide-react';
import { cn } from '@/utils/cn';

const navItems = [
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/connections', icon: Wrench, label: 'Connections' },
];

export default function NavSidebar() {
  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-slate-800 bg-slate-950 py-3 sm:w-14 sm:py-4">
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-indigo-600" title="Local agent">
        <Zap size={18} className="text-white" />
      </div>

      <div className="flex flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              cn(
                'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              )
            }
          >
            <Icon size={18} />
            <span className="sr-only">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
