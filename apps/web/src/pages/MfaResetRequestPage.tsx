import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { authApi, ApiError } from '../api';

export function MfaResetRequestPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const requestMutation = useMutation({
    mutationFn: () => authApi.mfaResetRequest(email),
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
    requestMutation.mutate();
  };

  if (success) {
    return (
      <div className="bg-surface-alt p-6 border border-border">
        <div className="text-center">
          <div className="w-12 h-12 bg-success-bg flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text mb-2">Check your email</h2>
          <p className="text-xs text-text-secondary mb-4">
            If an account exists for <strong className="text-text">{email}</strong> with MFA enabled, we've sent a reset link.
          </p>
          <Link to="/login" className="text-xs text-accent hover:text-accent-hover font-medium">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-alt p-6 border border-border">
      <h2 className="text-lg font-semibold text-text mb-2">Lost access to authenticator?</h2>
      <p className="text-xs text-text-secondary mb-4">
        Enter your email and we'll send you a link to reset your two-factor authentication.
        You'll need to verify your password to complete the reset.
      </p>

      {error && (
        <div className="mb-4 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-text-secondary mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={requestMutation.isPending}
          className="w-full py-2 px-4 bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {requestMutation.isPending ? 'Sending...' : 'Send reset link'}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-text-secondary">
        Remember your authenticator?{' '}
        <Link to="/login" className="text-accent hover:text-accent-hover font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
}
