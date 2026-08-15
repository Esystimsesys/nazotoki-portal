import type { ApiErrorBody } from "./types";

/** APIベースURL。既定 `/api`（docs/01-api-contract.md）。VITE_API_BASE で切替可能 */
const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

const TEAM_TOKEN_KEY = "nazotoki.teamToken";
const ADMIN_TOKEN_KEY = "nazotoki.adminToken";

function readStoredToken(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // プライベートモード等でlocalStorageが使えない場合はメモリのみで動作させる
    return null;
  }
}

function writeStoredToken(key: string, token: string | null): void {
  try {
    if (token) window.localStorage.setItem(key, token);
    else window.localStorage.removeItem(key);
  } catch {
    // noop
  }
}

// 参加者トークンと管理者トークンは分離して保持する（同一ブラウザで双方のセッションを混同しないため）
let teamToken: string | null = readStoredToken(TEAM_TOKEN_KEY);
let adminToken: string | null = readStoredToken(ADMIN_TOKEN_KEY);

export function getTeamToken(): string | null {
  return teamToken;
}
export function getAdminToken(): string | null {
  return adminToken;
}
export function setTeamToken(token: string | null): void {
  teamToken = token;
  writeStoredToken(TEAM_TOKEN_KEY, token);
}
export function setAdminToken(token: string | null): void {
  adminToken = token;
  writeStoredToken(ADMIN_TOKEN_KEY, token);
}

export class ApiError extends Error {
  status: number;
  body?: ApiErrorBody;

  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export type AuthMode = "team" | "admin" | "none";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  auth?: AuthMode;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = "none" } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth === "team" && teamToken) headers.Authorization = `Bearer ${teamToken}`;
  if (auth === "admin" && adminToken) headers.Authorization = `Bearer ${adminToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // 開発中にバックエンドが起動していない場合でも画面が致命的に落ちないよう、
    // ネットワークエラーは分かりやすいメッセージのApiErrorに変換する
    throw new ApiError(0, "サーバーに接続できませんでした。しばらくしてから再度お試しください。");
  }

  if (!res.ok) {
    let parsedBody: ApiErrorBody | undefined;
    let message = `エラーが発生しました（${res.status}）`;
    try {
      parsedBody = (await res.json()) as ApiErrorBody;
      if (parsedBody?.error) message = parsedBody.error;
    } catch {
      // レスポンスボディが無い/JSONでない場合は既定メッセージを使う
    }
    throw new ApiError(res.status, message, parsedBody);
  }

  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    return undefined as T;
  }
}

export const apiClient = {
  get: <T>(path: string, auth: AuthMode = "none") => request<T>(path, { method: "GET", auth }),
  post: <T>(path: string, body?: unknown, auth: AuthMode = "none") => request<T>(path, { method: "POST", body, auth }),
  put: <T>(path: string, body?: unknown, auth: AuthMode = "none") => request<T>(path, { method: "PUT", body, auth }),
  delete: <T>(path: string, auth: AuthMode = "none") => request<T>(path, { method: "DELETE", auth }),
};
