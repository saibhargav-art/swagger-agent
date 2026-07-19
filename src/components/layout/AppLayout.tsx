import { Outlet } from 'react-router-dom';
import NavSidebar from './NavSidebar';
import { useConnectionBootstrap } from '@/hooks/useConnectionBootstrap';

export default function AppLayout() {
  useConnectionBootstrap();

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-white">
      <NavSidebar />
      <main className="flex min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
