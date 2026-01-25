import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { authApi, ApiError } from '../api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const forgotMutation = useMutation({
    mutationFn: () => authApi.forgotPassword(email),
    onSuccess: () => {
      setSuccess(true);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string };
        setError(data.error ?? 'Request failed');
      } else {
        setError('An error occurred');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    forgotMutation.mutate();
  };

  if (success) {
    return (
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Check your email</h2>
          <p className="text-gray-600 mb-6">
            If an account exists for <strong>{email}</strong>, we've sent a password reset link.
          </p>
          <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">Forgot password?</h2>
      <p className="text-sm text-gray-600 mb-6">
        Enter your email and we'll send you a link to reset your password.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          disabled={forgotMutation.isPending}
          className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {forgotMutation.isPending ? 'Sending...' : 'Send reset link'}
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-gray-600">
        Remember your password?{' '}
        <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
}
