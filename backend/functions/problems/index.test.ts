import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ddb } from "../../shared/dynamo";
import { handler } from "./index";

vi.mock("../../shared/auth", () => ({
  requireAuth: () => ({ role: "admin", adminId: "admin-1" }),
}));

const send = vi.spyOn(ddb(), "send");
const resetEvent = {
  rawPath: "/api/admin/event/reset",
  requestContext: { http: { method: "POST", path: "/api/admin/event/reset" } },
};

let currentRunning: boolean;
let putInputs: PutCommand["input"][];

beforeEach(() => {
  process.env.TABLE_PROBLEMS = "problems";
  currentRunning = false;
  putInputs = [];
  send.mockImplementation(async (command: unknown) => {
    if (command instanceof GetCommand) {
      return {
        Item: {
          pk: "EVENT",
          sk: "STATE",
          running: currentRunning,
          startedAt: "2026-09-14T00:00:00.000Z",
          endedAt: currentRunning ? null : "2026-09-14T01:00:00.000Z",
        },
      };
    }
    if (command instanceof PutCommand) {
      putInputs.push(command.input);
      return {};
    }
    throw new Error("Unexpected command");
  });
});

describe("POST /api/admin/event/reset", () => {
  it("終了したイベントを未開始状態に戻す", async () => {
    const res = await handler(resetEvent as never);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).event).toEqual({ running: false, startedAt: null, endedAt: null });
    expect(putInputs).toHaveLength(1);
    expect(putInputs[0]).toMatchObject({
      TableName: "problems",
      Item: { pk: "EVENT", sk: "STATE", running: false, startedAt: null, endedAt: null },
    });
  });

  it("開催中は409を返し、状態を書き換えない", async () => {
    currentRunning = true;

    const res = await handler(resetEvent as never);

    expect(res.statusCode).toBe(409);
    expect(putInputs).toHaveLength(0);
  });
});
