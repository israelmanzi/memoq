import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import { useAuthInit } from './hooks/useAuth';

export function App() {
  const { isLoading } = useAuthInit();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}
