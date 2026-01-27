import { useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { authApi, ApiError } from '../api';

export function MfaResetPage() {
  const search = useSearch({ from: '/auth/mfa-reset' });
  const token = (search as { token?: string }).token;
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const resetMutation = useMutation({
    mutationFn: () => authApi.mfaReset(token!, password),
    onSuccess: () => {
      setSuccess(true);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string };
        setError(data.error ?? 'Reset failed');
      } else {
        setError('An error occurred');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Invalid reset link');
      return;
    }

    resetMutation.mutate();
  };

  if (!token) {
    return (
      <div className="bg-surface-alt p-6 border border-border">
        <div className="text-center">
          <div className="w-12 h-12 bg-danger-bg flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text mb-2">Invalid link</h2>
          <p className="text-xs text-text-secondary mb-4">This MFA reset link is invalid or has expired.</p>
          <Link to="/mfa-reset-request" className="text-xs text-accent hover:text-accent-hover font-medium">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="bg-surface-alt p-6 border border-border">
        <div className="text-center">
          <div className="w-12 h-12 bg-success-bg flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text mb-2">MFA disabled</h2>
          <p className="text-xs text-text-secondary mb-4">
            Two-factor authentication has been disabled on your account.
            You'll need to set up MFA again when you log in.
          </p>
          <Link
            to="/login"
            className="inline-block py-2 px-4 bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-alt p-6 border border-border">
      <h2 className="text-lg font-semibold text-text mb-2">Reset two-factor authentication</h2>
      <p className="text-xs text-text-secondary mb-4">
        Enter your password to confirm and disable two-factor authentication on your account.
      </p>

      <div className="mb-4 p-3 bg-warning-bg border border-warning/20 text-xs text-warning">
        <strong>Security notice:</strong> After resetting, you'll need to set up two-factor authentication again before you can access your account.
      </div>

      {error && (
        <div className="mb-4 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={resetMutation.isPending}
          className="w-full py-2 px-4 bg-danger text-white text-sm font-medium hover:bg-danger/90 disabled:opacity-50 transition-colors"
        >
          {resetMutation.isPending ? 'Resetting...' : 'Disable MFA'}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-text-secondary">
        Changed your mind?{' '}
        <Link to="/login" className="text-accent hover:text-accent-hover font-medium">
          Back to login
        </Link>
      </p>
    </form>
  );
}
