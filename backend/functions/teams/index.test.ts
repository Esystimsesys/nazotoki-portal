import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../shared/dynamo";
import { handler } from "./index";

vi.mock("../../shared/auth", () => ({
  requireAuth: () => ({ role: "admin", adminId: "admin-1" }),
  signToken: () => "token",
}));

const send = vi.spyOn(ddb(), "send");

/** PUT /api/admin/teams/{teamId} のイベント */
const putEvent = (teamId: string, body: unknown) => ({
  rawPath: `/api/admin/teams/${teamId}`,
  body: JSON.stringify(body),
  requestContext: { http: { method: "PUT", path: `/api/admin/teams/${teamId}` } },
});

/** POST /api/auth/team-login のイベント */
const loginEvent = (loginCode: unknown) => ({
  rawPath: "/api/auth/team-login",
  body: JSON.stringify({ loginCode }),
  requestContext: { http: { method: "POST", path: "/api/auth/team-login" } },
});

/** PUT /api/admin/teams/{teamId}/active のイベント */
const activeEvent = (teamId: string, body: unknown) => ({
  rawPath: `/api/admin/teams/${teamId}/active`,
  body: JSON.stringify(body),
  requestContext: { http: { method: "PUT", path: `/api/admin/teams/${teamId}/active` } },
});

/** 更新されたアイテム。存在しないteamIdは条件チェック失敗として扱う */
let stored: Record<string, unknown> | null;
let updateInputs: UpdateCommand["input"][];
/** ログイン記録の更新で投げさせるエラー（nullなら成功させる） */
let loginUpdateError: Error | null;

beforeEach(() => {
  process.env.TABLE_TEAMS = "teams";
  updateInputs = [];
  loginUpdateError = null;
  stored = { pk: "TEAM#team-1", teamId: "team-1", teamName: "旧チーム名", loginCode: "ABC123", active: true, createdAt: "2026-01-01T00:00:00.000Z", note: "旧メモ" };
  send.mockImplementation(async (command: unknown) => {
    if (command instanceof UpdateCommand) {
      updateInputs.push(command.input);
      if (!stored) {
        throw Object.assign(new Error("not found"), { name: "ConditionalCheckFailedException" });
      }
      const values = command.input.ExpressionAttributeValues!;
      const next: Record<string, unknown> = { ...stored };
      if (command.input.UpdateExpression === "SET lastLoginAt = :now") {
        if (loginUpdateError) throw loginUpdateError;
        next.lastLoginAt = values[":now"];
      } else if (command.input.UpdateExpression === "SET active = :active") {
        next.active = values[":active"];
      } else {
        next.teamName = values[":teamName"];
        if (command.input.UpdateExpression?.includes("REMOVE note")) delete next.note;
        else next.note = values[":note"];
      }
      return { Attributes: next };
    }
    if (command instanceof QueryCommand) {
      // LoginCodeIndex（ProjectionType: ALL）でコード→チームを引く
      const loginCode = command.input.ExpressionAttributeValues![":loginCode"];
      return { Items: stored && stored.loginCode === loginCode ? [stored] : [] };
    }
    throw new Error("Unexpected command");
  });
});

describe("PUT /api/admin/teams/{teamId}", () => {
  it("チーム名とメモを更新して更新後のチームを返す", async () => {
    const res = await handler(putEvent("team-1", { teamName: "新チーム名", note: "山田 / 佐藤" }) as never);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).team).toEqual({
      teamId: "team-1",
      teamName: "新チーム名",
      loginCode: "ABC123",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      note: "山田 / 佐藤",
    });
  });

  it("loginCode と active には触らない（再発行・無効化と役割が分かれているため）", async () => {
    await handler(putEvent("team-1", { teamName: "新チーム名" }) as never);

    expect(updateInputs[0].UpdateExpression).not.toMatch(/loginCode|active/);
  });

  it.each([
    ["空文字", ""],
    ["空白のみ", "   "],
    ["未指定", undefined],
  ])("メモが%sなら属性ごと削除する", async (_label, note) => {
    const res = await handler(putEvent("team-1", { teamName: "新チーム名", note }) as never);

    expect(updateInputs[0].UpdateExpression).toBe("SET teamName = :teamName REMOVE note");
    expect(JSON.parse(res.body!).team.note).toBeUndefined();
  });

  it("チーム名とメモの前後の空白は落とす", async () => {
    await handler(putEvent("team-1", { teamName: "  新チーム名  ", note: "  メモ  " }) as never);

    expect(updateInputs[0].ExpressionAttributeValues).toMatchObject({
      ":teamName": "新チーム名",
      ":note": "メモ",
    });
  });

  it.each([
    ["チーム名が空", { teamName: "  " }],
    ["チーム名が文字列でない", { teamName: 123 }],
    ["メモが文字列でない", { teamName: "新チーム名", note: 123 }],
    ["メモが1000文字超", { teamName: "新チーム名", note: "あ".repeat(1001) }],
  ])("%s なら400を返し、DBへ書き込まない", async (_label, body) => {
    const res = await handler(putEvent("team-1", body) as never);

    expect(res.statusCode).toBe(400);
    expect(updateInputs).toHaveLength(0);
  });

  it("メモが1000文字ちょうどなら受け付ける", async () => {
    const res = await handler(putEvent("team-1", { teamName: "新チーム名", note: "あ".repeat(1000) }) as never);

    expect(res.statusCode).toBe(200);
  });

  it("存在しないteamIdなら404を返す", async () => {
    stored = null;

    const res = await handler(putEvent("missing", { teamName: "新チーム名" }) as never);

    expect(res.statusCode).toBe(404);
  });
});

describe("PUT /api/admin/teams/{teamId}/active", () => {
  it.each([
    ["再有効化", true],
    ["無効化", false],
  ])("チームを%sして更新後のチームを返す", async (_label, active) => {
    const res = await handler(activeEvent("team-1", { active }) as never);

    expect(res.statusCode).toBe(200);
    expect(updateInputs[0]).toMatchObject({
      UpdateExpression: "SET active = :active",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeValues: { ":active": active },
      ReturnValues: "ALL_NEW",
    });
    expect(JSON.parse(res.body!).team.active).toBe(active);
  });

  it.each([
    ["未指定", {}],
    ["文字列", { active: "true" }],
    ["数値", { active: 1 }],
  ])("activeが%sなら400を返し、DBへ書き込まない", async (_label, body) => {
    const res = await handler(activeEvent("team-1", body) as never);

    expect(res.statusCode).toBe(400);
    expect(updateInputs).toHaveLength(0);
  });

  it("存在しないteamIdなら404を返す", async () => {
    stored = null;

    const res = await handler(activeEvent("missing", { active: true }) as never);

    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/auth/team-login", () => {
  it("ログインに成功すると lastLoginAt を更新する（管理者が受付の進捗を見るため）", async () => {
    const res = await handler(loginEvent("ABC123") as never);

    expect(res.statusCode).toBe(200);
    expect(updateInputs).toHaveLength(1);
    expect(updateInputs[0]).toMatchObject({
      Key: { pk: "TEAM#team-1" },
      UpdateExpression: "SET lastLoginAt = :now",
      // 更新はチーム行が残っているときだけ。完全削除と競合しても幽霊行を作らない
      ConditionExpression: "attribute_exists(pk)",
    });
    expect(updateInputs[0].ExpressionAttributeValues![":now"]).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("小文字・前後の空白を正規化してから照合する", async () => {
    const res = await handler(loginEvent("  abc123  ") as never);

    expect(res.statusCode).toBe(200);
  });

  it("ログイン記録の更新に失敗してもログインは成功させる（記録は補助情報のため）", async () => {
    loginUpdateError = Object.assign(new Error("gone"), {
      name: "ConditionalCheckFailedException",
    });

    const res = await handler(loginEvent("ABC123") as never);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).token).toBe("token");
  });

  it.each([
    ["コードが一致しない", "ZZZ999"],
    ["無効化されたチーム", "ABC123"],
  ])("%s なら401を返し、記録を書き込まない", async (label, loginCode) => {
    if (label === "無効化されたチーム") stored!.active = false;

    const res = await handler(loginEvent(loginCode) as never);

    expect(res.statusCode).toBe(401);
    expect(updateInputs).toHaveLength(0);
  });
});
