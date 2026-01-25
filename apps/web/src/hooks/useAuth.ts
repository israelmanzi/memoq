import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth';
import { authApi } from '../api';

export function useAuthInit() {
  const { token, setAuth, logout, isAuthenticated, user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      // If we have a token but no user, fetch the user
      if (token && !user) {
        try {
          const userData = await authApi.me();
          setAuth(userData, token);
        } catch {
          // Token is invalid, clear it
          logout();
        }
      }
      setIsLoading(false);
    }

    init();
  }, [token, user, setAuth, logout]);

  return { isLoading, isAuthenticated: isAuthenticated && !!user };
}
