/**
 * イベント全体の開始/終了状態（ゲームゲート）。
 *
 * 問題ごとの `enabled` とは独立した軸として持つ。
 * `enabled` は「その問題を出題対象に含めるか」、こちらは「いま回答を受け付ける時間帯か」を表す。
 * 分けている理由: 全問題をあらかじめ有効にしておき、開始時刻に一斉受付を始めたい一方で、
 * 特定の問題だけイベント途中から追加投入したいことがある。
 * 1つのフラグで兼ねると、開始/終了のたびに全問題のenabledを設定し直すことになり、
 * 「途中から出す予定だった問題」まで巻き込んで有効化されてしまう。
 *
 * 保存先は専用テーブルを作らずProblemsテーブルの単一アイテム（pk=EVENT / sk=STATE）。
 * 状態は常に1件しか無くアクセスパターンも単純なため、テーブル・IAM・環境変数を
 * 増やすコストに見合わない。sk が "META" でも "PATTERN#" 始まりでもないので、
 * 既存のScan（問題メタ行・パターン行だけを拾う）からは自然に除外される。
 */
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, requiredEnv } from "./dynamo";

export interface EventState {
  /** true の間だけ参加者の回答を受け付ける */
  running: boolean;
  /** 直近で開始した時刻（一度も開始していなければ null） */
  startedAt: string | null;
  /** 直近で終了した時刻（開始中・未開始なら null） */
  endedAt: string | null;
}

const EVENT_KEY = { pk: "EVENT", sk: "STATE" };

/**
 * 未開始（stopped）を既定とする。
 * 「開始する」は管理者の明示的な操作であるべきで、デプロイ直後や状態行が消えた場合に
 * 受付が開いている方が事故につながるため（開始前のフライング回答を許してしまう）。
 */
const INITIAL_STATE: EventState = { running: false, startedAt: null, endedAt: null };

export async function getEventState(): Promise<EventState> {
  const res = await ddb().send(
    new GetCommand({ TableName: requiredEnv("TABLE_PROBLEMS"), Key: EVENT_KEY }),
  );
  const item = res.Item as Record<string, unknown> | undefined;
  if (!item) return INITIAL_STATE;
  return {
    running: item.running === true,
    startedAt: (item.startedAt as string | null) ?? null,
    endedAt: (item.endedAt as string | null) ?? null,
  };
}

/**
 * 開始/終了を切り替える。
 * startedAt / endedAt は切り替えた側だけを更新し、もう一方は直前の値を残す
 * （「開始したのは何時か」を終了後も画面に出せるようにするため）。
 */
export async function setEventRunning(running: boolean): Promise<EventState> {
  const current = await getEventState();
  const now = new Date().toISOString();
  const next: EventState = {
    running,
    startedAt: running ? now : current.startedAt,
    endedAt: running ? null : now,
  };

  await ddb().send(
    new PutCommand({
      TableName: requiredEnv("TABLE_PROBLEMS"),
      Item: { ...EVENT_KEY, ...next, updatedAt: now },
    }),
  );
  return next;
}
