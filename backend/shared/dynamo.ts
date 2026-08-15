import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

let doc: DynamoDBDocumentClient | undefined;

/** DynamoDB DocumentClient のシングルトン */
export function ddb(): DynamoDBDocumentClient {
  if (!doc) {
    doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return doc;
}

/** 必須環境変数の取得（未設定なら例外） */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** ページネーションを含めた全件Scan */
export async function scanAll(tableName: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb().send(
      new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastKey }),
    );
    items.push(...((res.Items ?? []) as Record<string, unknown>[]));
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items;
}

/** ページネーションを含めた全件Query */
export async function queryAll(
  input: ConstructorParameters<typeof QueryCommand>[0],
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb().send(new QueryCommand({ ...input, ExclusiveStartKey: lastKey }));
    items.push(...((res.Items ?? []) as Record<string, unknown>[]));
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items;
}
