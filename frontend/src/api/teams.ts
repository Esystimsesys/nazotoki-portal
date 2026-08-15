import { apiClient } from "./client";
import type { Team } from "./types";

export const teamsApi = {
  /** GET /api/admin/teams */
  list: () => apiClient.get<{ teams: Team[] }>("/admin/teams", "admin"),
  /** POST /api/admin/teams */
  create: (teamName: string) => apiClient.post<{ team: Team }>("/admin/teams", { teamName }, "admin"),
  /** DELETE /api/admin/teams/{teamId}（論理削除） */
  remove: (teamId: string) => apiClient.delete<{ ok: true }>(`/admin/teams/${teamId}`, "admin"),
  /** POST /api/admin/teams/{teamId}/regenerate-code */
  regenerateCode: (teamId: string) =>
    apiClient.post<{ team: Team }>(`/admin/teams/${teamId}/regenerate-code`, undefined, "admin"),
};
