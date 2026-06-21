import { NavLink } from 'react-router-dom';
import { MessageSquare, Wrench, Settings, Zap } from 'lucide-react';
import { cn } from '@/utils/cn';

const navItems = [
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/connections', icon: Wrench, label: 'Connections' },
];

export default function NavSidebar() {
  return (
    <nav className="flex w-14 flex-col items-center border-r border-slate-200 bg-slate-900 py-4 gap-1">
      {/* Logo */}
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
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
                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              )
            }
          >
            <Icon size={18} />
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
