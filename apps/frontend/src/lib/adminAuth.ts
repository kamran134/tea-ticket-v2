import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { CurrentAdmin, PermissionCode } from '../types';

const TOKEN_KEY = 'admin_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Cheap client-side expiry check so a stale tab shows the login form instead of
 * flashing the panel. It proves nothing on its own — the backend re-validates
 * the token, the account status and the permissions on every request.
 */
export function hasUnexpiredToken(): boolean {
  const token = getStoredToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

/**
 * Mirrors backend can(): a super admin passes everything, everyone else is
 * checked against the list issued by GET /api/auth/me. Used purely to decide
 * what to render — never as a security boundary.
 */
export function can(admin: CurrentAdmin | null, code: PermissionCode): boolean {
  if (!admin) return false;
  return admin.isSuperAdmin || admin.permissions.includes(code);
}

export type AuthState = 'loading' | 'anonymous' | 'authenticated';

export interface AdminAuth {
  state: AuthState;
  admin: CurrentAdmin | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (code: PermissionCode) => boolean;
}

/**
 * Single source of admin session state for both /manage and /admin, replacing
 * the copy of the login form and token check each of them used to carry.
 */
export function useAdminAuth(): AdminAuth {
  const [admin, setAdmin] = useState<CurrentAdmin | null>(null);
  const [state, setState] = useState<AuthState>(() =>
    hasUnexpiredToken() ? 'loading' : 'anonymous',
  );

  const refresh = useCallback(async () => {
    if (!hasUnexpiredToken()) {
      setAdmin(null);
      setState('anonymous');
      return;
    }
    try {
      const me = await api.me();
      setAdmin(me);
      setState('authenticated');
    } catch {
      // Covers a revoked token, a deactivated account and a bumped
      // tokenVersion — all of which come back as 401.
      clearToken();
      setAdmin(null);
      setState('anonymous');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.login(email, password);
    storeToken(token);
    setAdmin(user);
    setState('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      // Bumps tokenVersion server-side, so the token cannot be reused even if
      // it was copied out of localStorage.
      await api.logout();
    } catch {
      // Already invalid server-side — dropping it locally is enough.
    }
    clearToken();
    setAdmin(null);
    setState('anonymous');
  }, []);

  return {
    state,
    admin,
    login,
    logout,
    refresh,
    can: useCallback((code: PermissionCode) => can(admin, code), [admin]),
  };
}
