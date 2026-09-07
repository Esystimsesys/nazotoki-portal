import type { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";
import { batchWrite, type BatchWriteRequest } from "./batch-write";

const deletes = (count: number): BatchWriteRequest[] =>
  Array.from({ length: count }, (_, i) => ({ DeleteRequest: { Key: { pk: `PK#${i}` } } }));

describe("batchWrite", () => {
  it("25件ずつに分割して送信する", async () => {
    const send = vi.fn(async (_command: BatchWriteCommand) => ({}));

    await batchWrite("Table", deletes(26), { client: { send }, sleep: vi.fn() });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].input.RequestItems!.Table).toHaveLength(25);
    expect(send.mock.calls[1][0].input.RequestItems!.Table).toHaveLength(1);
  });

  it("部分成功後は未処理項目だけを再送する", async () => {
    const requests = deletes(3);
    const send = vi
      .fn()
      .mockResolvedValueOnce({ UnprocessedItems: { Table: [requests[1], requests[2]] } })
      .mockResolvedValueOnce({ UnprocessedItems: {} });
    const sleep = vi.fn(async () => {});

    await batchWrite("Table", requests, { client: { send }, baseDelayMs: 7, sleep });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].input.RequestItems.Table).toEqual(requests);
    expect(send.mock.calls[1][0].input.RequestItems.Table).toEqual([requests[1], requests[2]]);
    expect(sleep).toHaveBeenCalledWith(7);
  });

  it("再試行回数の上限に達したら例外にする", async () => {
    const send = vi.fn(async () => ({ UnprocessedItems: { Table: deletes(1) } }));
    const sleep = vi.fn(async () => {});

    await expect(
      batchWrite("Table", deletes(1), { client: { send }, maxRetries: 2, sleep }),
    ).rejects.toThrow(/left 1 unprocessed item\(s\) after 2 retries/);
    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
