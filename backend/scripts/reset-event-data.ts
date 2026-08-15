/**
 * イベントデータのリセットスクリプト（本番イベント前のクリーンアップ用）。
 *
 * Teams / Problems / Submissions の全アイテムを削除する。
 * **Admins テーブルは触らない**（管理者アカウントは残す）。
 *
 * 実行方法:
 *   AWS_REGION=ap-northeast-1 \
 *   TABLE_TEAMS=nazotoki-teams \
 *   TABLE_PROBLEMS=nazotoki-problems \
 *   TABLE_SUBMISSIONS=nazotoki-submissions \
 *   node scripts/reset-event-data.ts --yes
 *
 * `--yes` を付けない場合は削除対象の件数を表示するだけで、何も削除しない（ドライラン）。
 */
import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, requiredEnv, scanAll } from "../shared/dynamo.ts";

const CONFIRM_FLAG = "--yes";

/** DynamoDBのBatchWriteItemは1回25件までのため分割して削除する */
async function deleteAll(tableName: string, keys: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    await ddb().send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: chunk.map((Key) => ({ DeleteRequest: { Key } })),
        },
      }),
    );
  }
}

async function resetTable(tableName: string, hasSortKey: boolean, apply: boolean): Promise<void> {
  const items = await scanAll(tableName);
  const keys = items.map((item) =>
    hasSortKey ? { pk: item.pk, sk: item.sk } : { pk: item.pk },
  );
  if (!apply) {
    console.log(`[dry-run] ${tableName}: ${keys.length} 件が削除対象`);
    return;
  }
  await deleteAll(tableName, keys);
  console.log(`${tableName}: ${keys.length} 件を削除しました`);
}

async function main(): Promise<void> {
  const apply = process.argv.includes(CONFIRM_FLAG);
  if (!apply) {
    console.log("ドライランです。実際に削除するには --yes を付けて実行してください。\n");
  }

  // Teams: PKのみ / Problems: PK+SK / Submissions: PK+SK
  await resetTable(requiredEnv("TABLE_TEAMS"), false, apply);
  await resetTable(requiredEnv("TABLE_PROBLEMS"), true, apply);
  await resetTable(requiredEnv("TABLE_SUBMISSIONS"), true, apply);

  if (apply) {
    console.log("\n完了しました。管理者アカウント（Adminsテーブル）は削除していません。");
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
