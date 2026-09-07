import { BatchWriteCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./dynamo.ts";

export type BatchWriteRequest =
  | { PutRequest: { Item: Record<string, unknown> } }
  | { DeleteRequest: { Key: Record<string, unknown> } };

export interface BatchWriteOptions {
  /** UnprocessedItems の再送回数（初回送信は含まない）。 */
  maxRetries?: number;
  /** 指数バックオフの初回待機時間（ミリ秒）。 */
  baseDelayMs?: number;
  /** テスト等で送信・待機を差し替えるためのフック。 */
  client?: Pick<DynamoDBDocumentClient, "send">;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_BATCH_SIZE = 25;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 25;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * BatchWriteItemを25件ずつ送信し、UnprocessedItemsだけを指数バックオフで再送する。
 * 上限回数を超えて未処理が残る場合は、部分成功を黙って完了扱いにせず例外にする。
 */
export async function batchWrite(
  tableName: string,
  requests: BatchWriteRequest[],
  options: BatchWriteOptions = {},
): Promise<void> {
  if (requests.length === 0) return;

  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error("maxRetries must be a non-negative integer");
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new Error("baseDelayMs must be non-negative");
  }

  const client = options.client ?? ddb();
  const sleep = options.sleep ?? defaultSleep;

  for (let i = 0; i < requests.length; i += MAX_BATCH_SIZE) {
    let pending = requests.slice(i, i + MAX_BATCH_SIZE);
    let retryCount = 0;
    while (pending.length > 0) {
      const response = await client.send(
        new BatchWriteCommand({ RequestItems: { [tableName]: pending } }),
      );
      pending = (response.UnprocessedItems?.[tableName] ?? []) as BatchWriteRequest[];
      if (pending.length === 0) break;
      if (retryCount >= maxRetries) {
        throw new Error(
          `DynamoDB BatchWriteItem left ${pending.length} unprocessed item(s) after ${maxRetries} retries`,
        );
      }
      await sleep(baseDelayMs * 2 ** retryCount);
      retryCount += 1;
    }
  }
}
