import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { authApi, ApiError } from '../api';
import { useAuthStore } from '../stores/auth';

export function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<string | null>(null);

  const registerMutation = useMutation({
    mutationFn: () => authApi.register({ name, email, password }),
    onSuccess: (data) => {
      if (data.requiresEmailVerification) {
        setSuccess(data.message);
      } else if (data.user && data.token) {
        setAuth(data.user, data.token);
        navigate({ to: '/dashboard' });
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string };
        setError(data.error ?? 'Registration failed');
      } else {
        setError('An error occurred');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(null);
    registerMutation.mutate();
  };

  // Success state - show email verification message
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
            We've sent a verification link to <strong className="text-text">{email}</strong>. Click the link to verify your account.
          </p>
          <p className="text-2xs text-text-muted mb-3">
            Didn't receive the email? Check your spam folder or{' '}
            <button
              onClick={() => authApi.resendVerification(email)}
              className="text-accent hover:text-accent-hover font-medium"
            >
              resend verification email
            </button>
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
      <h2 className="text-lg font-semibold text-text mb-4">Create account</h2>

      {error && (
        <div className="mb-4 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label htmlFor="name" className="block text-xs font-medium text-text-secondary mb-1">
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none"
          />
        </div>

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
          <p className="mt-1 text-2xs text-text-muted">Minimum 8 characters</p>
        </div>

        <button
          type="submit"
          disabled={registerMutation.isPending}
          className="w-full py-2 px-4 bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {registerMutation.isPending ? 'Creating account...' : 'Create account'}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-text-secondary">
        Already have an account?{' '}
        <Link to="/login" className="text-accent hover:text-accent-hover font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
}
