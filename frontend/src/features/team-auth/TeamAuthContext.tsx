import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi } from "../../api/auth";
import { ApiError, getTeamToken, setTeamToken } from "../../api/client";
import { decodeJwt, isExpired } from "../../api/jwt";

export type TeamAuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface TeamInfo {
  teamId: string;
  teamName: string;
}

interface TeamAuthContextValue {
  status: TeamAuthStatus;
  team: TeamInfo | null;
  /** チーム共有コードでログインする。失敗時はApiErrorをthrowするので呼び出し側でcatchしてメッセージ表示する */
  login: (loginCode: string) => Promise<void>;
  logout: () => void;
}

const TeamAuthContext = createContext<TeamAuthContextValue | undefined>(undefined);

function restoreFromToken(): TeamInfo | null {
  const token = getTeamToken();
  if (!token) return null;
  const payload = decodeJwt(token);
  if (!payload || payload.role !== "team" || !payload.teamId || isExpired(payload)) {
    setTeamToken(null);
    return null;
  }
  return { teamId: payload.teamId, teamName: payload.teamName ?? "" };
}

export function TeamAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TeamAuthStatus>("loading");
  const [team, setTeam] = useState<TeamInfo | null>(null);

  useEffect(() => {
    const restored = restoreFromToken();
    setTeam(restored);
    setStatus(restored ? "authenticated" : "unauthenticated");
  }, []);

  const login = async (loginCode: string) => {
    try {
      const res = await authApi.teamLogin(loginCode);
      setTeamToken(res.token);
      setTeam(res.team);
      setStatus("authenticated");
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, "ログインに失敗しました。時間をおいて再度お試しください。");
    }
  };

  const logout = () => {
    setTeamToken(null);
    setTeam(null);
    setStatus("unauthenticated");
  };

  const value = useMemo<TeamAuthContextValue>(
    () => ({ status, team, login, logout }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, team],
  );

  return <TeamAuthContext.Provider value={value}>{children}</TeamAuthContext.Provider>;
}

export function useTeamAuth(): TeamAuthContextValue {
  const ctx = useContext(TeamAuthContext);
  if (!ctx) throw new Error("useTeamAuth must be used within TeamAuthProvider");
  return ctx;
}
