import { apiClient } from "./client";
import type { CsvImportResponse, Problem, ProblemInput } from "./types";

export const problemsApi = {
  /** GET /api/admin/problems */
  list: () => apiClient.get<{ problems: Problem[] }>("/admin/problems", "admin"),
  /** POST /api/admin/problems */
  create: (input: ProblemInput) => apiClient.post<{ problem: Problem }>("/admin/problems", input, "admin"),
  /** PUT /api/admin/problems/{problemId}（全置換） */
  update: (problemId: string, input: ProblemInput) =>
    apiClient.put<{ problem: Problem }>(`/admin/problems/${problemId}`, input, "admin"),
  /** DELETE /api/admin/problems/{problemId} */
  remove: (problemId: string) => apiClient.delete<{ ok: true }>(`/admin/problems/${problemId}`, "admin"),
  /** PUT /api/admin/problems/{problemId}/enabled */
  setEnabled: (problemId: string, enabled: boolean) =>
    apiClient.put<{ problem: Problem }>(`/admin/problems/${problemId}/enabled`, { enabled }, "admin"),
  /** PUT /api/admin/problems/enabled（一括） */
  setBulkEnabled: (enabled: boolean) =>
    apiClient.put<{ problems: Problem[] }>("/admin/problems/enabled", { enabled }, "admin"),
  /** POST /api/admin/problems/csv */
  importCsv: (csv: string) => apiClient.post<CsvImportResponse>("/admin/problems/csv", { csv }, "admin"),
};
