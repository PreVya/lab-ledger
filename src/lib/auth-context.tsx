import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, AuthState, AuthUser, clearAuth, loadAuth, saveAuth, Role } from "./api";

interface Ctx {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState | null>(() => loadAuth());

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await api<AuthState>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
        auth: false,
      });
      saveAuth(res);
      setState(res);
      return;
    } catch (err) {
      const { tryDemoLogin } = await import("./demo-mode");
      const demo = tryDemoLogin(username, password);
      if (demo) {
        saveAuth(demo);
        setState(demo);
        return;
      }
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setState(null);
  }, []);

  const value = useMemo<Ctx>(() => ({
    user: state?.user ?? null,
    isAuthenticated: !!state,
    login,
    logout,
    hasRole: (...roles) => !!state && roles.includes(state.user.role),
  }), [state, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
