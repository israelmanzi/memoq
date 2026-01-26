import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import { useAuthInit } from './hooks/useAuth';

export function App() {
  const { isLoading } = useAuthInit();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}
