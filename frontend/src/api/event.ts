import { apiClient } from "./client";
import type { AuthMode } from "./client";
import type { EventState } from "./types";

export const eventApi = {
  /**
   * GET /api/event
   * 参加者・管理者の双方が呼ぶため、どちらのトークンを載せるか呼び出し側が指定する。
   */
  get: (auth: AuthMode) => apiClient.get<{ event: EventState }>("/event", auth),
  /** PUT /api/admin/event（開始/終了切替） */
  setRunning: (running: boolean) =>
    apiClient.put<{ event: EventState }>("/admin/event", { running }, "admin"),
  /** POST /api/admin/event/reset（開始前の状態に戻す。回答記録等は保持） */
  reset: () => apiClient.post<{ event: EventState }>("/admin/event/reset", undefined, "admin"),
};
