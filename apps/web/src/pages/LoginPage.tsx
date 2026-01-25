import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { authApi, ApiError } from '../api';
import { useAuthStore } from '../stores/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  // MFA Setup state (for users without MFA)
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [setupQrCode, setSetupQrCode] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const loginMutation = useMutation({
    mutationFn: () => authApi.login({ email, password }),
    onSuccess: (data) => {
      if (data.requiresMFASetup && data.setupToken) {
        // User needs to set up MFA before logging in
        setSetupToken(data.setupToken);
        setError('');
        // Trigger MFA setup to get QR code
        mfaSetupMutation.mutate(data.setupToken);
      } else if (data.requiresMFA && data.mfaToken) {
        setMfaToken(data.mfaToken);
        setError('');
      } else if (data.user && data.token) {
        setAuth(data.user, data.token);
        navigate({ to: '/dashboard' });
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string; code?: string };
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          setError('Please verify your email before logging in. Check your inbox for a verification link.');
        } else {
          setError(data.error ?? 'Login failed');
        }
      } else {
        setError('An error occurred');
      }
    },
  });

  const mfaSetupMutation = useMutation({
    mutationFn: (token: string) => authApi.mfaSetup(token),
    onSuccess: (data) => {
      setSetupQrCode(data.qrCode);
      setSetupSecret(data.secret);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string };
        setError(data.error ?? 'Failed to start MFA setup');
      } else {
        setError('An error occurred');
      }
    },
  });

  const mfaSetupVerifyMutation = useMutation({
    mutationFn: () => authApi.mfaSetupVerify(setupToken!, setupCode),
    onSuccess: (data) => {
      // Show backup codes first, then allow user to continue
      setBackupCodes(data.backupCodes);
      // Store auth for when user clicks continue
      setAuth(data.user, data.token);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string };
        setError(data.error ?? 'Invalid code');
      } else {
        setError('An error occurred');
      }
    },
  });

  const mfaVerifyMutation = useMutation({
    mutationFn: () => authApi.verifyMFA(mfaToken!, mfaCode),
    onSuccess: (data) => {
      setAuth(data.user, data.token);
      navigate({ to: '/dashboard' });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string };
        setError(data.error ?? 'Invalid code');
      } else {
        setError('An error occurred');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation.mutate();
  };

  const handleMFASubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    mfaVerifyMutation.mutate();
  };

  const handleBackToLogin = () => {
    setMfaToken(null);
    setMfaCode('');
    setSetupToken(null);
    setSetupQrCode(null);
    setSetupSecret(null);
    setSetupCode('');
    setBackupCodes(null);
    setError('');
  };

  const handleSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    mfaSetupVerifyMutation.mutate();
  };

  const handleContinueAfterBackupCodes = () => {
    navigate({ to: '/dashboard' });
  };

  // Backup codes display (after MFA setup)
  if (backupCodes) {
    return (
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Save your backup codes</h2>
        <p className="text-sm text-gray-600 mb-6">
          Store these codes in a safe place. You can use them to access your account if you lose your authenticator device.
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-6">
          <div className="grid grid-cols-2 gap-2 font-mono text-sm">
            {backupCodes.map((code, index) => (
              <div key={index} className="text-center py-1 bg-white rounded border border-gray-200">
                {code}
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3 mb-6">
          Each backup code can only be used once. Keep them secure and do not share them.
        </p>

        <button
          onClick={handleContinueAfterBackupCodes}
          className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          I've saved my codes, continue
        </button>
      </div>
    );
  }

  // MFA setup step (for users without MFA)
  if (setupToken && setupQrCode) {
    return (
      <form onSubmit={handleSetupSubmit} className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Set up two-factor authentication</h2>
        <p className="text-sm text-gray-600 mb-6">
          Two-factor authentication is required. Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex justify-center mb-4">
          <img src={setupQrCode} alt="MFA QR Code" className="w-48 h-48" />
        </div>

        {setupSecret && (
          <div className="mb-6">
            <p className="text-xs text-gray-500 text-center mb-1">Can't scan? Enter this code manually:</p>
            <p className="text-sm font-mono text-center bg-gray-100 py-2 px-4 rounded-md select-all">
              {setupSecret}
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="setupCode" className="block text-sm font-medium text-gray-700 mb-1">
              Enter the 6-digit code from your app
            </label>
            <input
              id="setupCode"
              type="text"
              required
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-lg tracking-widest"
            />
          </div>

          <button
            type="submit"
            disabled={mfaSetupVerifyMutation.isPending || setupCode.length !== 6}
            className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {mfaSetupVerifyMutation.isPending ? 'Verifying...' : 'Enable two-factor authentication'}
          </button>

          <button
            type="button"
            onClick={handleBackToLogin}
            className="w-full py-2 px-4 text-gray-600 font-medium hover:text-gray-800"
          >
            Back to login
          </button>
        </div>
      </form>
    );
  }

  // MFA setup loading (waiting for QR code)
  if (setupToken && !setupQrCode) {
    return (
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Setting up two-factor authentication</h2>
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // MFA verification step
  if (mfaToken) {
    return (
      <form onSubmit={handleMFASubmit} className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Two-factor authentication</h2>
        <p className="text-sm text-gray-600 mb-6">
          Enter the 6-digit code from your authenticator app, or use a backup code.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="mfaCode" className="block text-sm font-medium text-gray-700 mb-1">
              Authentication code
            </label>
            <input
              id="mfaCode"
              type="text"
              required
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9A-Za-z\-]*"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="000000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-lg tracking-widest"
            />
          </div>

          <button
            type="submit"
            disabled={mfaVerifyMutation.isPending || mfaCode.length < 6}
            className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {mfaVerifyMutation.isPending ? 'Verifying...' : 'Verify'}
          </button>

          <button
            type="button"
            onClick={handleBackToLogin}
            className="w-full py-2 px-4 text-gray-600 font-medium hover:text-gray-800"
          >
            Back to login
          </button>
        </div>
      </form>
    );
  }

  // Login form
  return (
    <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Sign in</h2>

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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-gray-600">
        Don't have an account?{' '}
        <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium">
          Sign up
        </Link>
      </p>
    </form>
  );
}
