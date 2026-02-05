import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, ApiError } from '../api';
import { useAuthStore } from '../stores/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showVerificationPrompt, setShowVerificationPrompt] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

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
        // Clear any cached data from previous user sessions
        queryClient.clear();
        setAuth(data.user, data.token);
        navigate({ to: '/dashboard' });
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string; code?: string };
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          setShowVerificationPrompt(true);
          setError('');
        } else {
          setError(data.error ?? 'Login failed');
        }
      } else {
        setError('An error occurred');
      }
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: () => authApi.resendVerification(email),
    onSuccess: () => {
      setVerificationSent(true);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string };
        setError(data.error ?? 'Failed to send verification email');
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
      // Clear any cached data from previous user sessions and store auth
      queryClient.clear();
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
      // Clear any cached data from previous user sessions
      queryClient.clear();
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
    setShowVerificationPrompt(false);
    setVerificationSent(false);
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
      <div className="bg-surface-alt p-6 border border-border">
        <h2 className="text-lg font-semibold text-text mb-2">Save your backup codes</h2>
        <p className="text-xs text-text-secondary mb-4">
          Store these codes in a safe place. You can use them to access your account if you lose your authenticator device.
        </p>

        <div className="bg-surface-panel border border-border p-3 mb-4">
          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            {backupCodes.map((code, index) => (
              <div key={index} className="text-center py-1 bg-surface-alt border border-border">
                {code}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-warning bg-warning-bg border border-warning/20 p-2 mb-4">
          Each backup code can only be used once. Keep them secure and do not share them.
        </p>

        <button
          onClick={handleContinueAfterBackupCodes}
          className="w-full py-2 px-4 bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          I've saved my codes, continue
        </button>
      </div>
    );
  }

  // Email verification prompt
  if (showVerificationPrompt) {
    return (
      <div className="bg-surface-alt p-6 border border-border">
        <h2 className="text-lg font-semibold text-text mb-2">Email verification required</h2>

        {verificationSent ? (
          <>
            <div className="mb-4 p-3 bg-success-bg border border-success/20 text-xs text-success">
              Verification email sent! Please check your inbox and click the verification link.
            </div>
            <p className="text-xs text-text-secondary mb-4">
              Didn't receive the email? Check your spam folder or try again.
            </p>
          </>
        ) : (
          <p className="text-xs text-text-secondary mb-4">
            Your email address <strong className="text-text">{email}</strong> has not been verified yet.
            Please check your inbox for a verification link, or request a new one.
          </p>
        )}

        {error && (
          <div className="mb-4 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => resendVerificationMutation.mutate()}
            disabled={resendVerificationMutation.isPending}
            className="w-full py-2 px-4 bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {resendVerificationMutation.isPending ? 'Sending...' : 'Resend verification email'}
          </button>

          <button
            type="button"
            onClick={handleBackToLogin}
            className="w-full py-2 px-4 text-text-secondary text-sm font-medium hover:text-text"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  // MFA setup step (for users without MFA)
  if (setupToken && setupQrCode) {
    return (
      <form onSubmit={handleSetupSubmit} className="bg-surface-alt p-6 border border-border">
        <h2 className="text-lg font-semibold text-text mb-2">Set up two-factor authentication</h2>
        <p className="text-xs text-text-secondary mb-4">
          Two-factor authentication is required. Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
        </p>

        {error && (
          <div className="mb-4 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="flex justify-center mb-4">
          <img src={setupQrCode} alt="MFA QR Code" className="w-40 h-40" />
        </div>

        {setupSecret && (
          <div className="mb-4">
            <p className="text-2xs text-text-muted text-center mb-1">Can't scan? Enter this code manually:</p>
            <p className="text-xs font-mono text-center bg-surface-panel py-2 px-3 select-all">
              {setupSecret}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="setupCode" className="block text-xs font-medium text-text-secondary mb-1">
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
              className="w-full px-3 py-2 bg-surface border border-border text-text focus:border-accent focus:outline-none text-center text-base tracking-widest"
            />
          </div>

          <button
            type="submit"
            disabled={mfaSetupVerifyMutation.isPending || setupCode.length !== 6}
            className="w-full py-2 px-4 bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {mfaSetupVerifyMutation.isPending ? 'Verifying...' : 'Enable two-factor authentication'}
          </button>

          <button
            type="button"
            onClick={handleBackToLogin}
            className="w-full py-2 px-4 text-text-secondary text-sm font-medium hover:text-text"
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
      <div className="bg-surface-alt p-6 border border-border text-center">
        <h2 className="text-lg font-semibold text-text mb-3">Setting up two-factor authentication</h2>
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  // MFA verification step
  if (mfaToken) {
    return (
      <form onSubmit={handleMFASubmit} className="bg-surface-alt p-6 border border-border">
        <h2 className="text-lg font-semibold text-text mb-2">Two-factor authentication</h2>
        <p className="text-xs text-text-secondary mb-4">
          Enter the 6-digit code from your authenticator app, or use a backup code.
        </p>

        {error && (
          <div className="mb-4 p-2 bg-danger-bg border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="mfaCode" className="block text-xs font-medium text-text-secondary mb-1">
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
              className="w-full px-3 py-2 bg-surface border border-border text-text focus:border-accent focus:outline-none text-center text-base tracking-widest"
            />
          </div>

          <button
            type="submit"
            disabled={mfaVerifyMutation.isPending || mfaCode.length < 6}
            className="w-full py-2 px-4 bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {mfaVerifyMutation.isPending ? 'Verifying...' : 'Verify'}
          </button>

          <button
            type="button"
            onClick={handleBackToLogin}
            className="w-full py-2 px-4 text-text-secondary text-sm font-medium hover:text-text"
          >
            Back to login
          </button>

          <div className="text-center pt-2 border-t border-border">
            <Link to="/mfa-reset-request" className="text-xs text-text-muted hover:text-accent">
              Lost access to authenticator?
            </Link>
          </div>
        </div>
      </form>
    );
  }

  // Login form
  return (
    <form onSubmit={handleSubmit} className="bg-surface-alt p-6 border border-border">
      <h2 className="text-lg font-semibold text-text mb-4">Sign in</h2>

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

        <div>
          <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border text-text focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs text-accent hover:text-accent-hover">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full py-2 px-4 bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-text-secondary">
        Don't have an account?{' '}
        <Link to="/register" className="text-accent hover:text-accent-hover font-medium">
          Sign up
        </Link>
      </p>
    </form>
  );
}
