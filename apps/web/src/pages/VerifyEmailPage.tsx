import { useEffect, useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { authApi, ApiError } from '../api';

export function VerifyEmailPage() {
  const search = useSearch({ from: '/auth/verify-email' });
  const token = (search as { token?: string }).token;
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  const verifyMutation = useMutation({
    mutationFn: (t: string) => authApi.verifyEmail(t),
    onSuccess: () => {
      setStatus('success');
    },
    onError: (err) => {
      setStatus('error');
      if (err instanceof ApiError) {
        const data = err.data as { error?: string };
        setError(data.error ?? 'Verification failed');
      } else {
        setError('An error occurred');
      }
    },
  });

  useEffect(() => {
    if (token) {
      verifyMutation.mutate(token);
    } else {
      setStatus('error');
      setError('No verification token provided');
    }
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="bg-surface-alt p-6 border border-border">
        <div className="text-center">
          <div className="w-12 h-12 bg-accent/10 flex items-center justify-center mx-auto mb-3 animate-pulse">
            <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text mb-2">Verifying your email...</h2>
          <p className="text-xs text-text-secondary">Please wait a moment.</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="bg-surface-alt p-6 border border-border">
        <div className="text-center">
          <div className="w-12 h-12 bg-success-bg flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text mb-2">Email verified!</h2>
          <p className="text-xs text-text-secondary mb-4">Your email has been successfully verified. You can now sign in to your account.</p>
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
    <div className="bg-surface-alt p-6 border border-border">
      <div className="text-center">
        <div className="w-12 h-12 bg-danger-bg flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-text mb-2">Verification failed</h2>
        <p className="text-xs text-text-secondary mb-4">{error}</p>
        <Link to="/login" className="text-xs text-accent hover:text-accent-hover font-medium">
          Back to login
        </Link>
      </div>
    </div>
  );
}
