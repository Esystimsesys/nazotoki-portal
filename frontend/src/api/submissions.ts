import { apiClient } from "./client";
import type {
  SubmissionResult,
  SummaryResponse,
  TeamSubmissionsResponse,
  TimelineResponse,
  AnalysisResponse,
} from "./types";

export const submissionsApi = {
  /** POST /api/submissions（賞金額は返らない。参加者には正誤のみ） */
  submit: (code: string) => apiClient.post<SubmissionResult>("/submissions", { code }, "team"),
  /** GET /api/admin/summary */
  summary: () => apiClient.get<SummaryResponse>("/admin/summary", "admin"),
  /** GET /api/admin/analysis（問題の到達状況・誤答の状況） */
  analysis: () => apiClient.get<AnalysisResponse>("/admin/analysis", "admin"),
  /** GET /api/admin/timeline（チームごとの賞金推移） */
  timeline: () => apiClient.get<TimelineResponse>("/admin/timeline", "admin"),
  /** DELETE /api/admin/submissions（全回答記録を削除。チーム・問題は残る） */
  clearAll: () => apiClient.delete<{ ok: true; deleted: number }>("/admin/submissions", "admin"),
  /** GET /api/admin/teams/{teamId}/submissions */
  teamSubmissions: (teamId: string) =>
    apiClient.get<TeamSubmissionsResponse>(`/admin/teams/${teamId}/submissions`, "admin"),
};
