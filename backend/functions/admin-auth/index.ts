/**
 * nazotoki-admin-auth
 * - POST /api/admin/login  管理者ログイン（username/password）。成功でadmin JWTを発行する。
 */
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { signToken } from "../../shared/auth";
import { ddb, requiredEnv } from "../../shared/dynamo";
import {
  err,
  getJsonBody,
  noContent,
  ok,
  withErrorHandling,
  type ApiEvent,
  type ApiResult,
} from "../../shared/http";
import { verifyPassword } from "../../shared/password";

interface AdminItem {
  pk: string;
  adminId: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

async function findAdminByUsername(username: string): Promise<AdminItem | null> {
  const res = await ddb().send(
    new QueryCommand({
      TableName: requiredEnv("TABLE_ADMINS"),
      IndexName: "UsernameIndex",
      KeyConditionExpression: "username = :username",
      ExpressionAttributeValues: { ":username": username },
      Limit: 1,
    }),
  );
  return (res.Items?.[0] as AdminItem | undefined) ?? null;
}

/** POST /api/admin/login */
async function login(event: ApiEvent): Promise<ApiResult> {
  const body = getJsonBody(event);
  const username = body?.username;
  const password = body?.password;
  if (typeof username !== "string" || !username || typeof password !== "string" || !password) {
    return err(400, "username と password を指定してください");
  }

  const admin = await findAdminByUsername(username);
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    return err(401, "ユーザー名またはパスワードが正しくありません");
  }

  const token = signToken({ role: "admin", adminId: admin.adminId, username: admin.username });
  return ok({ token, admin: { adminId: admin.adminId, username: admin.username } });
}

export const handler = async (event: ApiEvent): Promise<ApiResult> =>
  withErrorHandling(async () => {
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === "OPTIONS") return noContent();
    if (method === "POST" && path === "/api/admin/login") return login(event);

    return err(404, "ルートが見つかりません");
  });
