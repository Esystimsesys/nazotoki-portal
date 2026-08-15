import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi } from "../../api/auth";
import { ApiError, getAdminToken, setAdminToken } from "../../api/client";
import { decodeJwt, isExpired } from "../../api/jwt";

export type AdminAuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AdminInfo {
  adminId: string;
  username: string;
}

interface AdminAuthContextValue {
  status: AdminAuthStatus;
  admin: AdminInfo | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

function restoreFromToken(): AdminInfo | null {
  const token = getAdminToken();
  if (!token) return null;
  const payload = decodeJwt(token);
  if (!payload || payload.role !== "admin" || !payload.adminId || isExpired(payload)) {
    setAdminToken(null);
    return null;
  }
  return { adminId: payload.adminId, username: payload.username ?? "" };
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminAuthStatus>("loading");
  const [admin, setAdmin] = useState<AdminInfo | null>(null);

  useEffect(() => {
    const restored = restoreFromToken();
    setAdmin(restored);
    setStatus(restored ? "authenticated" : "unauthenticated");
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const res = await authApi.adminLogin(username, password);
      setAdminToken(res.token);
      setAdmin(res.admin);
      setStatus("authenticated");
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, "ログインに失敗しました。時間をおいて再度お試しください。");
    }
  };

  const logout = () => {
    setAdminToken(null);
    setAdmin(null);
    setStatus("unauthenticated");
  };

  const value = useMemo<AdminAuthContextValue>(
    () => ({ status, admin, login, logout }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, admin],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
