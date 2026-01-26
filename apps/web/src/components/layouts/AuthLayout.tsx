import { Outlet } from '@tanstack/react-router';

export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface py-12 px-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text">OXY</h1>
          <p className="mt-1 text-sm text-text-secondary">Translation Management System</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
