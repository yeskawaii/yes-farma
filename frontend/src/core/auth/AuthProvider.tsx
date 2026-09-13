import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient } from '../api/client';
import { AUTH_INVALIDATED_EVENT } from './authEvents';

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
  clinicalSpecialty: 'DENTISTRY' | 'PEDIATRICS';
  clinicCapabilities: Record<'odontogram' | 'dentalClinicalTools' | 'patients' | 'appointments' | 'encounters' | 'documents' | 'prescriptions' | 'treatmentPlans' | 'budgets' | 'payments' | 'inventory', boolean>;
}

export interface AuthState {
  user: User | null;
  memberships: Membership[];
  activeClinicId: string | null;
  activeRole: string | null;
  clinicalSpecialties?: { code: Membership['clinicalSpecialty']; label: string }[];
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
        clinicalSpecialties: data.clinicalSpecialties,
        status: 'authenticated',
      });
    } catch {
      setState((s) => ({ ...s, status: 'unauthenticated' }));
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const handleAuthInvalidated = () => {
      setState({
        user: null,
        memberships: [],
        activeClinicId: null,
        activeRole: null,
        status: 'unauthenticated',
      });
    };

    window.addEventListener(AUTH_INVALIDATED_EVENT, handleAuthInvalidated);

    return () => {
      window.removeEventListener(AUTH_INVALIDATED_EVENT, handleAuthInvalidated);
    };
  }, []);

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

// Derive exclusively from the active clinic, including for assistants without a profile.
export function useClinicCapabilities() {
  const { memberships, activeClinicId } = useAuth();
  return memberships.find(m => m.clinicId === activeClinicId)?.clinicCapabilities;
}
