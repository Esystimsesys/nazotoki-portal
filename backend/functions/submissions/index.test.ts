import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetCommand, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../shared/dynamo";
import { handler } from "./index";

vi.mock("../../shared/auth", () => ({
  requireAuth: () => ({ role: "team", teamId: "team-1" }),
}));

const event = (code: string) => ({
  rawPath: "/api/submissions",
  body: JSON.stringify({ code }),
  requestContext: { http: { method: "POST", path: "/api/submissions" } },
});
const send = vi.spyOn(ddb(), "send");
let prize: number;
let stored: Map<string, Record<string, unknown>>;
let queryInputs: QueryCommand["input"][];
let laterPage: Record<string, unknown>[];
let failPut: boolean;

beforeEach(() => {
  process.env.TABLE_PROBLEMS = "problems";
  process.env.TABLE_SUBMISSIONS = "submissions";
  prize = 100;
  stored = new Map();
  queryInputs = [];
  laterPage = [];
  failPut = false;
  send.mockImplementation(async (command: unknown) => {
    if (command instanceof GetCommand) return { Item: { running: true } };
    if (command instanceof ScanCommand) return { Items: [
      { sk: "META", problemId: "p1", label: "問題1", enabled: true, createdAt: "2026-01-01" },
      { sk: "PATTERN#pt1", problemId: "p1", patternId: "pt1", code: "1234", isCorrect: prize > 0, prize },
    ] };
    if (command instanceof QueryCommand) {
      queryInputs.push(command.input);
      if (command.input.ExclusiveStartKey) return { Items: laterPage };
      return {
        Items: [...stored.values()],
        ...(laterPage.length ? { LastEvaluatedKey: { pk: "TEAM#team-1", sk: "page1" } } : {}),
      };
    }
    if (command instanceof PutCommand) {
      if (failPut) throw new Error("DB unavailable");
      const item = command.input.Item!;
      // 条件なし・異なるキーへの書込みなら両方受理するDBモデル。
      if (command.input.ConditionExpression === "attribute_not_exists(pk)" && stored.has(item.sk)) {
        throw Object.assign(new Error("Already exists"), { name: "ConditionalCheckFailedException" });
      }
      stored.set(item.sk, item);
      return {};
    }
    throw new Error("Unexpected command");
  });
});

describe("回答受付の重複防止", () => {
  it.each([100, -100])("同時回答でも賞金 %i を一度だけ記録する", async (amount) => {
    prize = amount;
    const responses = await Promise.all([handler(event("1234")), handler(event("1234"))]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    const bodies = responses.map((r) => JSON.parse(r.body!));
    expect(bodies.map((b) => b.alreadyAnswered).sort()).toEqual([false, true]);
    expect(stored.size).toBe(1);
    expect([...stored.values()].reduce((sum, row) => sum + Number(row.prizeAwarded), 0)).toBe(amount);
    expect(bodies.find((b) => b.alreadyAnswered).penalty).toBeNull();
    expect(bodies.find((b) => !b.alreadyAnswered).penalty).toBe(amount < 0 ? amount : null);
  });

  it("2ページ目にある旧形式の回答も検出し再加算しない", async () => {
    laterPage = [{ sk: "SUBMISSION#2026-01-01#old", code: "1234", patternId: "pt1", prizeAwarded: 100 }];
    const response = await handler(event("1234"));
    expect(JSON.parse(response.body!)).toMatchObject({ alreadyAnswered: true, penalty: null });
    expect(stored.size).toBe(0);
    expect(queryInputs).toHaveLength(2);
    expect(queryInputs.every((input) => input.ConsistentRead)).toBe(true);
    expect(queryInputs[1].ExclusiveStartKey).toEqual({ pk: "TEAM#team-1", sk: "page1" });
  });

  it("同チームの異なるコードは両方記録できる", async () => {
    await Promise.all([handler(event("1234")), handler(event("9999"))]);
    expect(stored.size).toBe(2);
  });

  it("DB障害を既回答の成功に変換しない", async () => {
    failPut = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try { expect((await handler(event("1234"))).statusCode).toBe(500); }
    finally { log.mockRestore(); }
  });
});
