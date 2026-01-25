import { Outlet } from '@tanstack/react-router';

export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">OXY</h1>
          <p className="mt-2 text-gray-600">Translation Management System</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
