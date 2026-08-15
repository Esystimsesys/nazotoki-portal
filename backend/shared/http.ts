/**
 * API Gateway HTTP API (payload format v2.0) のイベント/レスポンス型とヘルパー。
 * エラー形式は 01-api-contract.md 準拠: { "error": "<message>", ...extra } + HTTPステータス。
 */

export interface ApiEvent {
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  pathParameters?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: {
    http: { method: string; path: string };
  };
}

export interface ApiResult {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

// ローカル開発用にCORSヘッダーを全レスポンスへ付与する（本番は同一オリジン配信のため実質無害）。
const RESPONSE_HEADERS = {
  "content-type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

/** 成功レスポンス整形 */
export function ok(body: unknown, statusCode = 200): ApiResult {
  return { statusCode, headers: RESPONSE_HEADERS, body: JSON.stringify(body) };
}

/** エラーレスポンス整形: { "error": message, ...extra } */
export function err(
  statusCode: number,
  message: string,
  extra?: Record<string, unknown>,
): ApiResult {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify({ error: message, ...extra }),
  };
}

/** CORSプリフライト用の204レスポンス（ローカル開発用） */
export function noContent(): ApiResult {
  return { statusCode: 204, headers: RESPONSE_HEADERS };
}

/**
 * ハンドラ内から throw することでエラーレスポンスに変換される例外。
 * requireAuth 等の共通ミドルウェアが認証・認可エラーをこの形で投げる。
 */
export class HttpError extends Error {
  statusCode: number;
  extra?: Record<string, unknown>;

  constructor(statusCode: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.extra = extra;
  }
}

/** リクエストボディをテキストとして取得（base64対応） */
export function getTextBody(event: ApiEvent): string {
  if (!event.body) return "";
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf-8")
    : event.body;
}

/** リクエストボディをJSONオブジェクトとして取得。パース不能・非オブジェクトはnull */
export function getJsonBody(event: ApiEvent): Record<string, unknown> | null {
  const raw = getTextBody(event);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** パスパラメータ取得（URLデコード済み） */
export function getPathParam(event: ApiEvent, name: string): string | undefined {
  const value = event.pathParameters?.[name];
  return value !== undefined ? decodeURIComponent(value) : undefined;
}

/**
 * 各Lambdaのハンドラ本体を共通のtry/catchで包む。
 * HttpError はそのステータス/メッセージへ変換し、それ以外は500として握りつぶしログ出力する。
 */
export async function withErrorHandling(fn: () => Promise<ApiResult>): Promise<ApiResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) {
      return err(e.statusCode, e.message, e.extra);
    }
    console.error(e);
    return err(500, "サーバーエラーが発生しました");
  }
}
