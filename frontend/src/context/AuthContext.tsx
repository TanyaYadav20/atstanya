import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as authApi from "../lib/api";
import { TOKEN_STORAGE_KEY } from "../lib/tokenStorage";
import type { LoginPayload, RegisterPayload } from "../types/auth";

interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  login: (payload: LoginPayload, rememberMe: boolean) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () =>
      localStorage.getItem(TOKEN_STORAGE_KEY) ??
      sessionStorage.getItem(TOKEN_STORAGE_KEY)
  );

  const login = useCallback(async (payload: LoginPayload, rememberMe: boolean) => {
    const response = await authApi.login(payload);
    // "Remember me" decides where the token survives: localStorage
    // persists across browser restarts, sessionStorage clears on tab close.
    const storage = rememberMe ? localStorage : sessionStorage;
    const other = rememberMe ? sessionStorage : localStorage;
    other.removeItem(TOKEN_STORAGE_KEY);
    storage.setItem(TOKEN_STORAGE_KEY, response.token);
    setToken(response.token);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    // Backend register does not return a token — the user logs in
    // separately afterwards, matching the API as implemented.
    await authApi.register(payload);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      login,
      register,
      logout,
    }),
    [token, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
