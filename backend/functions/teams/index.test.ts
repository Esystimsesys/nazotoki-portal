import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
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

/** 更新されたアイテム。存在しないteamIdは条件チェック失敗として扱う */
let stored: Record<string, unknown> | null;
let updateInputs: UpdateCommand["input"][];

beforeEach(() => {
  process.env.TABLE_TEAMS = "teams";
  updateInputs = [];
  stored = { pk: "TEAM#team-1", teamId: "team-1", teamName: "旧チーム名", loginCode: "ABC123", active: true, createdAt: "2026-01-01T00:00:00.000Z", note: "旧メモ" };
  send.mockImplementation(async (command: unknown) => {
    if (command instanceof UpdateCommand) {
      updateInputs.push(command.input);
      if (!stored) {
        throw Object.assign(new Error("not found"), { name: "ConditionalCheckFailedException" });
      }
      const values = command.input.ExpressionAttributeValues!;
      const next: Record<string, unknown> = { ...stored, teamName: values[":teamName"] };
      if (command.input.UpdateExpression?.includes("REMOVE note")) delete next.note;
      else next.note = values[":note"];
      return { Attributes: next };
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
