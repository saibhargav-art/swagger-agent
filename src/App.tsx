import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from '@/routes';
import { AuthProvider } from '@/context/AuthContext';

export default function App() {
  useEffect(() => {
    try {
      localStorage.removeItem('swagger-agent-webmcp');
    } catch {
      // ignore storage errors
    }
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
