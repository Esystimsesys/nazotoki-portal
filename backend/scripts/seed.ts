/**
 * 開発用シードスクリプト: 既定管理者（username: admin / password: admin）をAdminsテーブルに投入する。
 *
 * 実行方法（Node.js 24.x はネイティブでTypeScriptを実行できるため追加の依存は不要）:
 *   TABLE_ADMINS=nazotoki-admins AWS_REGION=ap-northeast-1 node scripts/seed.ts
 *
 * 既に同名ユーザーが存在する場合は何もしない（重複作成を防ぐ）。
 */
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb, requiredEnv } from "../shared/dynamo.ts";
import { hashPassword } from "../shared/password.ts";

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "admin";

async function main(): Promise<void> {
  const tableName = requiredEnv("TABLE_ADMINS");

  const existing = await ddb().send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "UsernameIndex",
      KeyConditionExpression: "username = :username",
      ExpressionAttributeValues: { ":username": DEFAULT_USERNAME },
      Limit: 1,
    }),
  );
  if (existing.Items && existing.Items.length > 0) {
    console.log(`既定管理者 "${DEFAULT_USERNAME}" は既に存在します。何もしません。`);
    return;
  }

  const adminId = randomUUID();
  const item = {
    pk: `ADMIN#${adminId}`,
    adminId,
    username: DEFAULT_USERNAME,
    passwordHash: hashPassword(DEFAULT_PASSWORD),
    createdAt: new Date().toISOString(),
  };
  await ddb().send(new PutCommand({ TableName: tableName, Item: item }));
  console.log(
    `既定管理者を作成しました: username="${DEFAULT_USERNAME}" password="${DEFAULT_PASSWORD}" (adminId=${adminId})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
