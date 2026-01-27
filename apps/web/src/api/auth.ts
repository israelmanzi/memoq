import { api } from './client';
import type { AuthUser, AuthResponse } from '@oxy/shared';

export interface LoginInput {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface RegisterResponse {
  user?: AuthUser;
  token?: string;
  message: string;
  requiresEmailVerification?: boolean;
}

export interface LoginResponse {
  user?: AuthUser;
  token?: string;
  requiresMFA?: boolean;
  mfaToken?: string;
  requiresMFASetup?: boolean;
  setupToken?: string;
}

export interface MFASetupLoginResponse {
  message: string;
  backupCodes: string[];
  user: AuthUser;
  token: string;
}

export interface MFASetupResponse {
  secret: string;
  qrCode: string;
  uri: string;
}

export interface MFAVerifySetupResponse {
  message: string;
  backupCodes: string[];
}

export interface MFAStatusResponse {
  mfaEnabled: boolean;
  hasBackupCodes: boolean;
  backupCodesCount: number;
}

export const authApi = {
  login: (data: LoginInput) => api.post<LoginResponse>('/auth/login', data),

  register: (data: RegisterInput) => api.post<RegisterResponse>('/auth/register', data),

  me: () => api.get<AuthUser>('/auth/me'),

  // Email verification
  verifyEmail: (token: string) =>
    api.post<{ message: string }>('/auth/verify-email', { token }),

  resendVerification: (email: string) =>
    api.post<{ message: string }>('/auth/resend-verification', { email }),

  // Password reset
  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    api.post<{ message: string }>('/auth/reset-password', { token, password }),

  // MFA verification during login
  verifyMFA: (mfaToken: string, code: string) =>
    api.post<AuthResponse>('/auth/verify-mfa', { mfaToken, code }),

  // MFA setup during login (for users without MFA)
  mfaSetup: (setupToken: string) =>
    api.post<MFASetupResponse>('/auth/mfa-setup', { setupToken }),

  mfaSetupVerify: (setupToken: string, code: string) =>
    api.post<MFASetupLoginResponse>('/auth/mfa-setup-verify', { setupToken, code }),

  // MFA reset (for users who lost their authenticator)
  mfaResetRequest: (email: string) =>
    api.post<{ message: string }>('/auth/mfa-reset-request', { email }),

  mfaReset: (token: string, password: string) =>
    api.post<{ message: string }>('/auth/mfa-reset', { token, password }),

  // MFA management
  mfa: {
    getStatus: () => api.get<MFAStatusResponse>('/mfa/status'),

    setup: () => api.post<MFASetupResponse>('/mfa/setup', {}),

    verifySetup: (code: string) =>
      api.post<MFAVerifySetupResponse>('/mfa/verify-setup', { code }),

    disable: (password: string) =>
      api.post<{ message: string }>('/mfa/disable', { password }),

    regenerateBackupCodes: (password: string) =>
      api.post<{ message: string; backupCodes: string[] }>('/mfa/backup-codes', { password }),
  },
};
