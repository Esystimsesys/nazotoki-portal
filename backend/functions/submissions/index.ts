/**
 * nazotoki-submissions
 * - POST /api/submissions                        回答受付・判定（team）
 * - GET  /api/admin/summary                       集計（ランキング・問題別正誤・全体統計）（admin）
 * - GET  /api/admin/teams/{teamId}/submissions     チーム別回答履歴（admin）
 * - DELETE /api/admin/submissions                  全回答記録の削除（admin）
 */
import { BatchWriteCommand, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../../shared/auth";
import {
  isDisabledProblemCode,
  matchSubmission,
  type ExistingSubmission,
  type PatternRecord,
  type ProblemRecord,
} from "../../shared/answer-matching";
import { ddb, requiredEnv, scanAll } from "../../shared/dynamo";
import { getEventState } from "../../shared/event-state";
import {
  err,
  getJsonBody,
  noContent,
  ok,
  withErrorHandling,
  type ApiEvent,
  type ApiResult,
} from "../../shared/http";

interface SubmissionItem {
  pk: string; // TEAM#<teamId>
  sk: string; // SUBMISSION#<submittedAt>#<submissionId>
  submissionId: string;
  teamId: string;
  code: string;
  problemId: string | null;
  patternId: string | null;
  isCorrect: boolean;
  prizeAwarded: number;
  submittedAt: string;
}

interface TeamItem {
  pk: string;
  teamId: string;
  teamName: string;
  loginCode: string;
  active: boolean;
  createdAt: string;
}

/** Problemsテーブルを全件Scanし、有効な問題(META)と全パターン(PATTERN)に分けて返す */
async function loadEnabledProblemsAndPatterns(): Promise<{
  enabledProblems: ProblemRecord[];
  patterns: PatternRecord[];
}> {
  const items = await scanAll(requiredEnv("TABLE_PROBLEMS"));
  const enabledProblems: ProblemRecord[] = [];
  const patterns: PatternRecord[] = [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const sk = item.sk as string;
    if (sk === "META") {
      if (item.enabled === true) {
        enabledProblems.push({
          problemId: item.problemId as string,
          label: item.label as string,
          enabled: true,
          createdAt: item.createdAt as string,
        });
      }
    } else if (typeof sk === "string" && sk.startsWith("PATTERN#")) {
      patterns.push({
        problemId: item.problemId as string,
        patternId: item.patternId as string,
        code: item.code as string,
        isCorrect: item.isCorrect as boolean,
        prize: item.prize as number,
        note: item.note as string | undefined,
      });
    }
  }
  return { enabledProblems, patterns };
}

/** 全問題（META行）＋全パターン（PATTERN行）を1回のScanでまとめて取得する */
async function loadAllProblemsWithPatterns(): Promise<{
  problems: ProblemRecord[];
  patterns: PatternRecord[];
}> {
  const items = await scanAll(requiredEnv("TABLE_PROBLEMS"));
  const problems: ProblemRecord[] = [];
  const patterns: PatternRecord[] = [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const sk = item.sk as string;
    if (sk === "META") {
      problems.push({
        problemId: item.problemId as string,
        label: item.label as string,
        enabled: item.enabled as boolean,
        createdAt: item.createdAt as string,
      });
    } else if (typeof sk === "string" && sk.startsWith("PATTERN#")) {
      patterns.push({
        problemId: item.problemId as string,
        patternId: item.patternId as string,
        code: item.code as string,
        isCorrect: item.isCorrect as boolean,
        prize: item.prize as number,
        note: item.note as string | undefined,
      });
    }
  }
  return { problems, patterns };
}

async function queryTeamSubmissions(teamId: string): Promise<SubmissionItem[]> {
  const items = await ddb().send(
    new QueryCommand({
      TableName: requiredEnv("TABLE_SUBMISSIONS"),
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `TEAM#${teamId}` },
    }),
  );
  return (items.Items ?? []) as unknown as SubmissionItem[];
}

/** POST /api/submissions（team） */
async function submitCode(event: ApiEvent, teamId: string): Promise<ApiResult> {
  const body = getJsonBody(event);
  const code = body?.code;
  if (typeof code !== "string" || !/^\d{4}$/.test(code)) {
    return err(400, "4桁の数字を指定してください");
  }

  // イベント全体のゲート。問題ごとのenabledより先に見る（開始前・終了後は
  // 有効な問題が何問あろうと受け付けない、という関係のため）。
  // 未開始と終了後でメッセージを分けるのは、参加者が「まだ始まっていない」のか
  // 「もう締め切られた」のか画面から判断できるようにするため。
  const eventState = await getEventState();
  if (!eventState.running) {
    return err(
      403,
      eventState.endedAt ? "イベントは終了しました" : "イベントはまだ開始されていません",
    );
  }

  const { enabledProblems, patterns } = await loadEnabledProblemsAndPatterns();
  if (enabledProblems.length === 0) {
    return err(400, "現在受付中の問題はありません");
  }

  // 無効な問題にだけ存在するコードは、記録せずに不正解として返す。
  // 記録してしまうと、あとでその問題を有効化したときに「同じコードの2回目以降は
  // 記録しない」という二重取り防止に引っかかり、先に入力していたチームだけが
  // 永久に得点できなくなるため（詳細は isDisabledProblemCode のコメント）。
  // 未登録コード（どの問題にも存在しないもの）はこれまでどおり不正解として記録する。
  if (isDisabledProblemCode(code, enabledProblems, patterns)) {
    return ok({ isCorrect: false, alreadyAnswered: false });
  }

  // 回答の試行回数に制限は設けない（レート制限もしない）。
  // 4桁コードの機械的な総当たりに対する抑止は、アプリ側の制限ではなく
  // ゲームデザイン側（不正解パターンにマイナス賞金を設定できること）で行う方針。
  // 複数端末でチームコードを共有して同時に回答する運用を妨げないことを優先している。
  const teamSubmissions = await queryTeamSubmissions(teamId);

  // 同じ4桁を過去に送信済みかどうか（自チームの履歴のみで判定）。
  // 一度試した番号をもう一度打ってしまったときに気づけるようにするためのフラグで、
  // 正解済みの番号を打ち直しても賞金が増えないこと（重複加算防止）とも整合する。
  // 履歴は賞金の重複加算防止のために元々取得しているため追加のDynamoDB読み取りはない。
  // 未登録コード（どの問題にも一致しない番号）も対象にする。
  const alreadyAnswered = teamSubmissions.some((s) => s.code === code);

  const existingSubmissions: ExistingSubmission[] = teamSubmissions.map((s) => ({
    patternId: s.patternId,
  }));

  const result = matchSubmission(code, enabledProblems, patterns, existingSubmissions);

  // 実際に減額された額（マイナス賞金のパターンを踏んだときだけ入る）。
  // レコードを書いたときにだけ設定する。書かなかった回（同じ番号の2回目以降）は
  // 賞金が動いていないので、金額を出すと「また減らされた」と誤解させるため。
  let penalty: number | null = null;

  // 同じ番号の2回目以降はレコードを作らない。
  // 賞金は重複加算防止により2回目以降どのみち0で、記録しても履歴が同じ番号で
  // 埋まって管理画面が見づらくなるだけのため。判定結果は通常どおり返す。
  // 結果として管理画面の回答数・試行回数は「試した番号の種類数」を表す。
  if (!alreadyAnswered) {
    const submissionId = randomUUID();
    const submittedAt = new Date().toISOString();
    const item: SubmissionItem = {
      pk: `TEAM#${teamId}`,
      sk: `SUBMISSION#${submittedAt}#${submissionId}`,
      submissionId,
      teamId,
      code,
      problemId: result.problemId,
      patternId: result.patternId,
      isCorrect: result.isCorrect,
      prizeAwarded: result.prizeAwarded,
      submittedAt,
    };
    await ddb().send(new PutCommand({ TableName: requiredEnv("TABLE_SUBMISSIONS"), Item: item }));
    if (result.prizeAwarded < 0) penalty = result.prizeAwarded;
  }

  // 参加者に返すのは正誤と「その番号を既に送信済みか」、そして減額された場合のみ その額。
  // 賞金額を見せない方針の例外として、マイナス賞金だけは金額を返す。減点は
  // 「いくら減ったか」が分からないと理不尽に感じられ、トラップというゲーム上の
  // 仕掛けが機能しないため。加点側は伏せたまま（合計賞金・達成状況は管理者だけが見る）。
  return ok({ isCorrect: result.isCorrect, alreadyAnswered, penalty });
}

/**
 * 問題を表示順（問題番号順）に並べる比較関数。
 * labelは「問題1「鏡の中の数字」」のような自由入力のため、数字を数値として扱う
 * 自然順ソートにする（単純な文字列比較だと 問題10 が 問題2 より前に来てしまう）。
 * labelが同じ場合はcreatedAtで安定させる。
 */
function compareProblemsForDisplay(
  a: { label: string; createdAt: string },
  b: { label: string; createdAt: string },
): number {
  const byLabel = a.label.localeCompare(b.label, "ja", { numeric: true, sensitivity: "base" });
  return byLabel !== 0 ? byLabel : a.createdAt.localeCompare(b.createdAt);
}

/** GET /api/admin/summary（admin） */
async function summary(): Promise<ApiResult> {
  // イベント状態も一緒に返す。管理ダッシュボード・大画面表示はどちらもこの1本を
  // ポーリングしているので、開始/終了の表示のために別のリクエストを増やさずに済む。
  const [teamsRaw, { problems, patterns }, submissionsRaw, eventState] = await Promise.all([
    scanAll(requiredEnv("TABLE_TEAMS")),
    loadAllProblemsWithPatterns(),
    scanAll(requiredEnv("TABLE_SUBMISSIONS")),
    getEventState(),
  ]);
  const teams = teamsRaw as unknown as TeamItem[];
  const submissions = submissionsRaw as unknown as SubmissionItem[];

  const submissionsByTeam = new Map<string, SubmissionItem[]>();
  const submissionsByProblem = new Map<string, SubmissionItem[]>();
  for (const s of submissions) {
    const teamList = submissionsByTeam.get(s.teamId) ?? [];
    teamList.push(s);
    submissionsByTeam.set(s.teamId, teamList);
    if (s.problemId) {
      const problemList = submissionsByProblem.get(s.problemId) ?? [];
      problemList.push(s);
      submissionsByProblem.set(s.problemId, problemList);
    }
  }

  const ranking = teams
    .map((team) => {
      const teamSubmissions = submissionsByTeam.get(team.teamId) ?? [];
      const correctCount = teamSubmissions.filter((s) => s.isCorrect).length;
      const incorrectCount = teamSubmissions.filter((s) => !s.isCorrect).length;
      const totalPrize = teamSubmissions.reduce((sum, s) => sum + s.prizeAwarded, 0);
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        correctCount,
        incorrectCount,
        totalPrize,
      };
    })
    .sort((a, b) => b.totalPrize - a.totalPrize);

  const problemStats = [...problems].sort(compareProblemsForDisplay).map((p) => {
    const list = submissionsByProblem.get(p.problemId) ?? [];
    return {
      problemId: p.problemId,
      label: p.label,
      enabled: p.enabled,
      correctCount: list.filter((s) => s.isCorrect).length,
      incorrectCount: list.filter((s) => !s.isCorrect).length,
    };
  });

  // maxPrize: 全問題（有効/無効問わず）について、正解パターンの賞金の最大値を合計した
  // 「全問正解した場合に得られる最大賞金」の目安。正解パターンが無い問題は0として扱う。
  const maxPrizeByProblem = new Map<string, number>();
  for (const pattern of patterns) {
    if (!pattern.isCorrect) continue;
    const current = maxPrizeByProblem.get(pattern.problemId) ?? Number.NEGATIVE_INFINITY;
    maxPrizeByProblem.set(pattern.problemId, Math.max(current, pattern.prize));
  }
  const maxPrize = [...maxPrizeByProblem.values()]
    .filter((v) => Number.isFinite(v))
    .reduce((sum, v) => sum + v, 0);

  return ok({
    event: eventState,
    ranking,
    problemStats,
    stats: {
      teamCount: teams.length,
      submissionCount: submissions.length,
      enabledProblemCount: problems.filter((p) => p.enabled).length,
      totalProblemCount: problems.length,
      maxPrize,
    },
  });
}

/** GET /api/admin/teams/{teamId}/submissions（admin） */
async function teamSubmissions(teamId: string): Promise<ApiResult> {
  const teamRes = await ddb().send(
    new GetCommand({ TableName: requiredEnv("TABLE_TEAMS"), Key: { pk: `TEAM#${teamId}` } }),
  );
  const team = teamRes.Item as TeamItem | undefined;
  if (!team) return err(404, "チームが見つかりません");

  const [submissions, { problems, patterns }] = await Promise.all([
    queryTeamSubmissions(teamId),
    loadAllProblemsWithPatterns(),
  ]);

  const submissionsByProblem = new Map<string, SubmissionItem[]>();
  for (const s of submissions) {
    if (!s.problemId) continue;
    const list = submissionsByProblem.get(s.problemId) ?? [];
    list.push(s);
    submissionsByProblem.set(s.problemId, list);
  }
  const patternById = new Map(patterns.map((pt) => [pt.patternId, pt]));

  // 問題ごとに「正解したか」に加えて、そのチームが実際に踏んだ登録パターン（hits）を返す。
  // マイナス賞金の不正解パターンを踏んだかどうかまで管理画面で追えるようにするため。
  // 未登録コード（problemId が null）はどの問題にも紐づかないのでここには現れない。
  // 挑戦回数は返さない: 未登録コードを計上できない以上「その問題のパターンを何種類
  // 踏んだか」にしかならず、苦戦の度合いと誤解されるため（hits を見れば実態が分かる）。
  const perProblem = [...problems].sort(compareProblemsForDisplay).map((p) => {
    const list = submissionsByProblem.get(p.problemId) ?? [];
    const hits = list
      .slice()
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
      .map((s) => {
        const pattern = s.patternId ? patternById.get(s.patternId) : undefined;
        return {
          code: s.code,
          isCorrect: s.isCorrect,
          // pattern.prize はそのパターン本来の賞金、prizeAwarded は実際に加算された額
          // （同一パターンの2回目以降は0）。両方返して差分が分かるようにする。
          prize: pattern?.prize ?? 0,
          prizeAwarded: s.prizeAwarded,
          note: pattern?.note,
          submittedAt: s.submittedAt,
        };
      });
    return {
      problemId: p.problemId,
      label: p.label,
      enabled: p.enabled,
      solved: hits.some((h) => h.isCorrect),
      // この問題で実際に増減した賞金の合計（マイナスパターンを踏んでいれば負になりうる）
      earnedPrize: hits.reduce((sum, h) => sum + h.prizeAwarded, 0),
      hits,
    };
  });

  // 回答ログは登録済みコードに一致したものだけを返す（未登録コードは運用上ノイズのため除外）
  const log = [...submissions]
    .filter((s) => s.problemId !== null)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map((s) => ({
      submittedAt: s.submittedAt,
      code: s.code,
      isCorrect: s.isCorrect,
      problemId: s.problemId,
      prizeAwarded: s.prizeAwarded,
    }));

  // 画面側で再計算しなくて済むよう、チーム単位の集計もまとめて返す
  const registered = submissions.filter((s) => s.problemId !== null);
  const totals = {
    solvedCount: perProblem.filter((p) => p.solved).length,
    problemCount: perProblem.length,
    // マイナス賞金パターンを踏んだ回数（登録済みの不正解パターンに一致したもの）
    penaltyCount: registered.filter((s) => !s.isCorrect).length,
    gainedPrize: registered.reduce((sum, s) => sum + Math.max(s.prizeAwarded, 0), 0),
    lostPrize: registered.reduce((sum, s) => sum + Math.min(s.prizeAwarded, 0), 0),
    totalPrize: submissions.reduce((sum, s) => sum + s.prizeAwarded, 0),
  };

  return ok({
    team: { teamId: team.teamId, teamName: team.teamName },
    totals,
    perProblem,
    log,
  });
}

/**
 * DELETE /api/admin/submissions（全回答記録の削除）
 *
 * チームと問題は残したまま、回答記録だけを空にする。
 * 同じ問題・同じチームで本番をやり直すとき（リハーサル後の片付けなど）に使う。
 * 消すと復元できないので、画面側では確認ダイアログを必須にしている。
 */
async function clearSubmissions(): Promise<ApiResult> {
  const items = await scanAll(requiredEnv("TABLE_SUBMISSIONS"));

  // BatchWriteItem は1回25件まで
  for (let i = 0; i < items.length; i += 25) {
    await ddb().send(
      new BatchWriteCommand({
        RequestItems: {
          [requiredEnv("TABLE_SUBMISSIONS")]: items
            .slice(i, i + 25)
            .map((item) => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } })),
        },
      }),
    );
  }

  return ok({ ok: true, deleted: items.length });
}

export const handler = async (event: ApiEvent): Promise<ApiResult> =>
  withErrorHandling(async () => {
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === "OPTIONS") return noContent();

    if (method === "POST" && path === "/api/submissions") {
      const auth = requireAuth(event, "team");
      if (!auth.teamId) return err(401, "認証が無効です");
      return submitCode(event, auth.teamId);
    }

    if (method === "DELETE" && path === "/api/admin/submissions") {
      requireAuth(event, "admin");
      return clearSubmissions();
    }

    if (method === "GET" && path === "/api/admin/summary") {
      requireAuth(event, "admin");
      return summary();
    }

    const teamSubmissionsMatch = path.match(/^\/api\/admin\/teams\/([^/]+)\/submissions$/);
    if (method === "GET" && teamSubmissionsMatch) {
      requireAuth(event, "admin");
      return teamSubmissions(decodeURIComponent(teamSubmissionsMatch[1]));
    }

    return err(404, "ルートが見つかりません");
  });
