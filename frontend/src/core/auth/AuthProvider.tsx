import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient } from '../api/client';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface Membership {
  id: string;
  clinicId: string;
  clinicName: string;
  role: string;
  specialtyCode?: string;
}

export interface AuthState {
  user: User | null;
  memberships: Membership[];
  activeClinicId: string | null;
  activeRole: string | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    memberships: [],
    activeClinicId: null,
    activeRole: null,
    status: 'loading',
  });

  const checkAuth = useCallback(async () => {
    try {
      const data = await apiClient.get<any>('/auth/me');
      setState({
        user: data.user,
        memberships: data.memberships,
        activeClinicId: data.activeClinicId,
        activeRole: data.activeRole,
        status: 'authenticated',
      });
    } catch {
      setState((s) => ({ ...s, status: 'unauthenticated' }));
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    await apiClient.post('/auth/login', { email, password });
    await checkAuth();
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setState({
        user: null,
        memberships: [],
        activeClinicId: null,
        activeRole: null,
        status: 'unauthenticated',
      });
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
