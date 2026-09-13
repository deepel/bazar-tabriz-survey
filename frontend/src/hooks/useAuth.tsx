import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { api } from '../api/client';
import type { SessionInfo, User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo>({ user: null, loading: true });

  const refresh = useCallback(async () => {
    try {
      const result = await api.get<{ user: User | null }>('/api/auth/me');
      setSession({ user: result.user, loading: false });
    } catch {
      setSession({ user: null, loading: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<{ user: User }>('/api/auth/login', { username, password });
    setSession({ user: result.user, loading: false });
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setSession({ user: null, loading: false });
    }
  }, []);

  const value = useMemo(
    () => ({ user: session.user, loading: session.loading, login, logout, refresh }),
    [session.user, session.loading, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}