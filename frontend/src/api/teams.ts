import { apiClient } from "./client";
import type { Team } from "./types";

export const teamsApi = {
  /** GET /api/admin/teams */
  list: () => apiClient.get<{ teams: Team[] }>("/admin/teams", "admin"),
  /** POST /api/admin/teams */
  create: (teamName: string) => apiClient.post<{ team: Team }>("/admin/teams", { teamName }, "admin"),
  /** DELETE /api/admin/teams/{teamId}（論理削除。ログイン不可になるが集計には残る） */
  remove: (teamId: string) => apiClient.delete<{ ok: true }>(`/admin/teams/${teamId}`, "admin"),
  /** DELETE /api/admin/teams/{teamId}/purge（完全削除。回答記録ごと消える） */
  purge: (teamId: string) =>
    apiClient.delete<{ ok: true; deletedSubmissions: number }>(
      `/admin/teams/${teamId}/purge`,
      "admin",
    ),
  /** POST /api/admin/teams/{teamId}/regenerate-code */
  regenerateCode: (teamId: string) =>
    apiClient.post<{ team: Team }>(`/admin/teams/${teamId}/regenerate-code`, undefined, "admin"),
};
