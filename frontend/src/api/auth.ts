import { apiClient } from "./client";
import type { AdminLoginResponse, TeamLoginResponse } from "./types";

export const authApi = {
  /** POST /api/auth/team-login */
  teamLogin: (loginCode: string) => apiClient.post<TeamLoginResponse>("/auth/team-login", { loginCode }),
  /** POST /api/admin/login */
  adminLogin: (username: string, password: string) =>
    apiClient.post<AdminLoginResponse>("/admin/login", { username, password }),
};
