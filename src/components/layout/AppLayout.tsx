import { Outlet } from 'react-router-dom';
import NavSidebar from './NavSidebar';

export default function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <NavSidebar />
      <main className="flex flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
