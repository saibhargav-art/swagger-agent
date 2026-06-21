import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import ChatPage from '@/pages/ChatPage';
import ConnectionsPage from '@/pages/ConnectionsPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/connections" element={<ConnectionsPage />} />
      </Route>
    </Routes>
  );
}
