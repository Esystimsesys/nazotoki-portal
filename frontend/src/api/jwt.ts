import type { JwtPayload } from "./types";

/**
 * JWTのペイロード部分だけをデコードする（署名検証はしない）。
 * サーバーが発行した直後のトークンをクライアント側の表示・期限チェックに使うだけなので、
 * 検証はサーバー側（backend/shared/auth.ts）に一任する低セキュリティ方針でよい。
 */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return null;
    const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function isExpired(payload: JwtPayload): boolean {
  return payload.exp * 1000 <= Date.now();
}
