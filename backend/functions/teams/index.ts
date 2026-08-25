/**
 * nazotoki-teams
 * - POST   /api/auth/team-login                    チーム共有コードでログイン（team JWT発行、認証不要）
 * - GET    /api/admin/teams                         チーム一覧（admin）
 * - POST   /api/admin/teams                         チーム新規登録（admin）。loginCodeはサーバー自動生成
 * - DELETE /api/admin/teams/{teamId}                論理削除（active=false、admin）
 * - DELETE /api/admin/teams/{teamId}/purge          完全削除（回答記録ごと物理削除、admin）
 * - POST   /api/admin/teams/{teamId}/regenerate-code ログインコード再発行（admin）
 */
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { requireAuth, signToken } from "../../shared/auth";
import { ddb, queryAll, requiredEnv, scanAll } from "../../shared/dynamo";
import {
  err,
  getJsonBody,
  noContent,
  ok,
  withErrorHandling,
  type ApiEvent,
  type ApiResult,
} from "../../shared/http";

interface TeamItem {
  pk: string; // TEAM#<teamId>
  teamId: string;
  teamName: string;
  loginCode: string;
  active: boolean;
  createdAt: string;
}

interface Team {
  teamId: string;
  teamName: string;
  loginCode: string;
  active: boolean;
  createdAt: string;
}

function toTeam(item: TeamItem): Team {
  return {
    teamId: item.teamId,
    teamName: item.teamName,
    loginCode: item.loginCode,
    active: item.active,
    createdAt: item.createdAt,
  };
}

const LOGIN_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const LOGIN_CODE_LENGTH = 6;
const LOGIN_CODE_MAX_RETRIES = 10;

function randomLoginCode(): string {
  let code = "";
  for (let i = 0; i < LOGIN_CODE_LENGTH; i++) {
    code += LOGIN_CODE_CHARS[Math.floor(Math.random() * LOGIN_CODE_CHARS.length)];
  }
  return code;
}

async function findTeamById(teamId: string): Promise<TeamItem | null> {
  const res = await ddb().send(
    new GetCommand({ TableName: requiredEnv("TABLE_TEAMS"), Key: { pk: `TEAM#${teamId}` } }),
  );
  return (res.Item as TeamItem | undefined) ?? null;
}

async function findTeamByLoginCode(loginCode: string): Promise<TeamItem | null> {
  const res = await ddb().send(
    new QueryCommand({
      TableName: requiredEnv("TABLE_TEAMS"),
      IndexName: "LoginCodeIndex",
      KeyConditionExpression: "loginCode = :loginCode",
      ExpressionAttributeValues: { ":loginCode": loginCode },
      Limit: 1,
    }),
  );
  return (res.Items?.[0] as TeamItem | undefined) ?? null;
}

/** 6桁英大文字+数字のログインコードを衝突チェックしながら生成する */
async function generateUniqueLoginCode(): Promise<string> {
  for (let attempt = 0; attempt < LOGIN_CODE_MAX_RETRIES; attempt++) {
    const candidate = randomLoginCode();
    const existing = await findTeamByLoginCode(candidate);
    if (!existing) return candidate;
  }
  throw new Error("ログインコードの生成に失敗しました（衝突が続きました）");
}

/** POST /api/auth/team-login（認証不要） */
async function teamLogin(event: ApiEvent): Promise<ApiResult> {
  const body = getJsonBody(event);
  const rawLoginCode = body?.loginCode;
  if (typeof rawLoginCode !== "string" || !rawLoginCode.trim()) {
    return err(400, "loginCode を指定してください");
  }

  // コードは英大文字＋数字で生成されるため、前後の空白を落として大文字化してから
  // 照合する。受付で配ったコードを小文字で打ったり、コピペで空白が混ざったりしても
  // ログインできるようにするための正規化（フロントエンド側でも同じ整形をしているが、
  // 別クライアントから叩かれた場合にも効くようサーバー側でも行う）。
  const loginCode = rawLoginCode.trim().toUpperCase();

  const team = await findTeamByLoginCode(loginCode);
  if (!team || !team.active) {
    return err(401, "ログインコードが正しくないか、無効化されたチームです");
  }

  const token = signToken({ role: "team", teamId: team.teamId, teamName: team.teamName });
  return ok({ token, team: { teamId: team.teamId, teamName: team.teamName } });
}

/** GET /api/admin/teams */
async function listTeams(): Promise<ApiResult> {
  const items = (await scanAll(requiredEnv("TABLE_TEAMS"))) as unknown as TeamItem[];
  const teams = items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(toTeam);
  return ok({ teams });
}

/** POST /api/admin/teams */
async function createTeam(event: ApiEvent): Promise<ApiResult> {
  const body = getJsonBody(event);
  const teamName = body?.teamName;
  if (typeof teamName !== "string" || !teamName.trim()) {
    return err(400, "teamName を指定してください");
  }

  const loginCode = await generateUniqueLoginCode();
  const teamId = randomUUID();
  const item: TeamItem = {
    pk: `TEAM#${teamId}`,
    teamId,
    teamName: teamName.trim(),
    loginCode,
    active: true,
    createdAt: new Date().toISOString(),
  };
  await ddb().send(new PutCommand({ TableName: requiredEnv("TABLE_TEAMS"), Item: item }));
  return ok({ team: toTeam(item) }, 201);
}

/** DELETE /api/admin/teams/{teamId}（論理削除） */
async function deleteTeam(teamId: string): Promise<ApiResult> {
  const res = await ddb()
    .send(
      new UpdateCommand({
        TableName: requiredEnv("TABLE_TEAMS"),
        Key: { pk: `TEAM#${teamId}` },
        UpdateExpression: "SET active = :active",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeValues: { ":active": false },
      }),
    )
    .catch((e) => {
      if (e?.name === "ConditionalCheckFailedException") return null;
      throw e;
    });
  if (!res) return err(404, "チームが見つかりません");
  return ok({ ok: true });
}

/**
 * DELETE /api/admin/teams/{teamId}/purge（完全削除）
 *
 * チーム行と、そのチームの回答記録をまとめて物理削除する。
 * 論理削除（active=false）はログインを止めるだけで集計には残り続けるため、
 * 「順位からも消したい」「テストで作ったチームを片付けたい」場合はこちらを使う。
 *
 * 回答記録も一緒に消すのは、チーム行だけ消すと参照先を失った回答が
 * Submissionsテーブルに残り、ランキングには出ないのに総回答数だけが
 * 増えたままになるため（数字が合わなくなる）。
 */
async function purgeTeam(teamId: string): Promise<ApiResult> {
  const team = await findTeamById(teamId);
  if (!team) return err(404, "チームが見つかりません");

  const submissions = await queryAll({
    TableName: requiredEnv("TABLE_SUBMISSIONS"),
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": `TEAM#${teamId}` },
    ProjectionExpression: "pk, sk",
  });

  // BatchWriteItem は1回25件まで
  for (let i = 0; i < submissions.length; i += 25) {
    await ddb().send(
      new BatchWriteCommand({
        RequestItems: {
          [requiredEnv("TABLE_SUBMISSIONS")]: submissions
            .slice(i, i + 25)
            .map((item) => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } })),
        },
      }),
    );
  }

  // 回答を消してからチーム行を消す。逆順だと途中で失敗したときに
  // 参照先を失った回答だけが残る（総回答数がずれた状態になる）。
  await ddb().send(
    new DeleteCommand({ TableName: requiredEnv("TABLE_TEAMS"), Key: { pk: `TEAM#${teamId}` } }),
  );

  return ok({ ok: true, deletedSubmissions: submissions.length });
}

/** POST /api/admin/teams/{teamId}/regenerate-code */
async function regenerateCode(teamId: string): Promise<ApiResult> {
  const loginCode = await generateUniqueLoginCode();
  const res = await ddb()
    .send(
      new UpdateCommand({
        TableName: requiredEnv("TABLE_TEAMS"),
        Key: { pk: `TEAM#${teamId}` },
        UpdateExpression: "SET loginCode = :loginCode",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeValues: { ":loginCode": loginCode },
        ReturnValues: "ALL_NEW",
      }),
    )
    .catch((e) => {
      if (e?.name === "ConditionalCheckFailedException") return null;
      throw e;
    });
  if (!res) return err(404, "チームが見つかりません");
  return ok({ team: toTeam(res.Attributes as TeamItem) });
}

export const handler = async (event: ApiEvent): Promise<ApiResult> =>
  withErrorHandling(async () => {
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === "OPTIONS") return noContent();

    if (method === "POST" && path === "/api/auth/team-login") return teamLogin(event);

    if (method === "GET" && path === "/api/admin/teams") {
      requireAuth(event, "admin");
      return listTeams();
    }
    if (method === "POST" && path === "/api/admin/teams") {
      requireAuth(event, "admin");
      return createTeam(event);
    }

    const regenerateMatch = path.match(/^\/api\/admin\/teams\/([^/]+)\/regenerate-code$/);
    if (method === "POST" && regenerateMatch) {
      requireAuth(event, "admin");
      return regenerateCode(decodeURIComponent(regenerateMatch[1]));
    }

    // /purge は {teamId} 単体の正規表現より先に判定する
    const purgeMatch = path.match(/^\/api\/admin\/teams\/([^/]+)\/purge$/);
    if (method === "DELETE" && purgeMatch) {
      requireAuth(event, "admin");
      return purgeTeam(decodeURIComponent(purgeMatch[1]));
    }

    const teamIdMatch = path.match(/^\/api\/admin\/teams\/([^/]+)$/);
    if (method === "DELETE" && teamIdMatch) {
      requireAuth(event, "admin");
      return deleteTeam(decodeURIComponent(teamIdMatch[1]));
    }

    return err(404, "ルートが見つかりません");
  });
