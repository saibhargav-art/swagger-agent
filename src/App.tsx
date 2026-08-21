import { BrowserRouter } from 'react-router-dom';
import AppRoutes from '@/routes';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </BrowserRouter>
  );
}
