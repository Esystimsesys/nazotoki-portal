/**
 * 自前JWT（HS256、共有シークレット env.JWT_SECRET）の署名・検証。
 * Cognitoは使わない。各Lambdaが `requireAuth` でBearerトークンを検証し、role/teamId等を復元する。
 */
import jwt from "jsonwebtoken";
import { requiredEnv } from "./dynamo";
import { HttpError, type ApiEvent } from "./http";

export type Role = "team" | "admin";

/** JWTペイロード（01-api-contract.md 準拠） */
export interface AuthPayload {
  role: Role;
  teamId?: string;
  teamName?: string;
  adminId?: string;
  username?: string;
  iat: number;
  exp: number;
}

export interface TeamTokenClaims {
  role: "team";
  teamId: string;
  teamName: string;
}

export interface AdminTokenClaims {
  role: "admin";
  adminId: string;
  username: string;
}

const JWT_EXPIRES_IN = "24h";

/** JWTを署名する（有効期限24時間） */
export function signToken(claims: TeamTokenClaims | AdminTokenClaims): string {
  return jwt.sign(claims, requiredEnv("JWT_SECRET"), {
    algorithm: "HS256",
    expiresIn: JWT_EXPIRES_IN,
  });
}

function extractBearerToken(event: ApiEvent): string | undefined {
  const header = event.headers?.authorization ?? event.headers?.Authorization;
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim();
}

/**
 * Authorization: Bearer <JWT> を検証し、ペイロードを返す。
 * role を指定した場合、ペイロードの role と一致しなければ403相当のHttpErrorをthrowする。
 * トークンが無い/無効/期限切れの場合は401相当のHttpErrorをthrowする。
 */
export function requireAuth(event: ApiEvent, role?: Role): AuthPayload {
  const token = extractBearerToken(event);
  if (!token) {
    throw new HttpError(401, "認証が必要です");
  }

  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, requiredEnv("JWT_SECRET"), {
      algorithms: ["HS256"],
    }) as AuthPayload;
  } catch {
    throw new HttpError(401, "認証が無効です。再度ログインしてください");
  }

  if (role && payload.role !== role) {
    throw new HttpError(403, "この操作を行う権限がありません");
  }

  return payload;
}
