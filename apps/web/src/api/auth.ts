import { api } from './client';
import type { AuthUser, AuthResponse } from '@memoq/shared';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export const authApi = {
  login: (data: LoginInput) => api.post<AuthResponse>('/auth/login', data),

  register: (data: RegisterInput) => api.post<AuthResponse>('/auth/register', data),

  me: () => api.get<AuthUser>('/auth/me'),
};
