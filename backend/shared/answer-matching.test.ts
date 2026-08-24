import { describe, expect, it, vi } from "vitest";
import {
  findDuplicateCodesAcrossProblems,
  findDuplicateCodesWithinPatterns,
  isDisabledProblemCode,
  matchSubmission,
  validateNoDuplicateCodes,
  type PatternRecord,
  type ProblemRecord,
} from "./answer-matching";

function problem(overrides: Partial<ProblemRecord> = {}): ProblemRecord {
  return {
    problemId: "p1",
    label: "問題1",
    enabled: true,
    createdAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

function pattern(overrides: Partial<PatternRecord> = {}): PatternRecord {
  return {
    problemId: "p1",
    patternId: "pat1",
    code: "0001",
    isCorrect: true,
    prize: 100,
    ...overrides,
  };
}

describe("matchSubmission", () => {
  it("一致0件: 未登録回答として不正解・賞金0で記録する", () => {
    const problems = [problem()];
    const patterns = [pattern({ code: "0001" })];
    const result = matchSubmission("9999", problems, patterns, []);
    expect(result).toEqual({
      problemId: null,
      patternId: null,
      isCorrect: false,
      prizeAwarded: 0,
    });
  });

  it("一致1件: そのパターンで判定し、初回一致は賞金を加算する", () => {
    const problems = [problem()];
    const patterns = [pattern({ code: "0001", isCorrect: true, prize: 500 })];
    const result = matchSubmission("0001", problems, patterns, []);
    expect(result).toEqual({
      problemId: "p1",
      patternId: "pat1",
      isCorrect: true,
      prizeAwarded: 500,
    });
  });

  it("不正解パターンに一致した場合もisCorrect:falseで正しく記録する", () => {
    const problems = [problem()];
    const patterns = [
      pattern({ patternId: "pat-wrong", code: "0002", isCorrect: false, prize: -50 }),
    ];
    const result = matchSubmission("0002", problems, patterns, []);
    expect(result).toEqual({
      problemId: "p1",
      patternId: "pat-wrong",
      isCorrect: false,
      prizeAwarded: -50,
    });
  });

  it("enabled=falseの問題のパターンとは一致しない（未登録回答扱い）", () => {
    const problems = [problem({ problemId: "p1", enabled: false })];
    const patterns = [pattern({ problemId: "p1", code: "0001" })];
    const result = matchSubmission("0001", problems, patterns, []);
    expect(result.problemId).toBeNull();
    expect(result.isCorrect).toBe(false);
  });

  it("一致複数件: createdAtが最も早い問題の一致を採用し、console.warnで警告する", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const problems = [
      problem({ problemId: "p1", createdAt: "2026-07-24T10:00:00.000Z" }),
      problem({ problemId: "p2", createdAt: "2026-07-24T05:00:00.000Z" }),
    ];
    const patterns = [
      pattern({ problemId: "p1", patternId: "pat-p1", code: "1234", prize: 100 }),
      pattern({ problemId: "p2", patternId: "pat-p2", code: "1234", prize: 200 }),
    ];
    const result = matchSubmission("1234", problems, patterns, []);
    // p2 の方が createdAt が早いので p2/pat-p2 が採用される
    expect(result.problemId).toBe("p2");
    expect(result.patternId).toBe("pat-p2");
    expect(result.prizeAwarded).toBe(200);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("賞金の重複加算防止: 同一patternIdへの再一致は2回目以降prizeAwarded=0（isCorrectは維持）", () => {
    const problems = [problem()];
    const patterns = [pattern({ code: "0001", isCorrect: true, prize: 300 })];
    const existing = [{ patternId: "pat1" }];
    const result = matchSubmission("0001", problems, patterns, existing);
    expect(result.isCorrect).toBe(true);
    expect(result.prizeAwarded).toBe(0);
  });

  it("賞金の重複加算防止: 別patternIdの既存Submissionがあっても今回の一致には影響しない", () => {
    const problems = [problem()];
    const patterns = [pattern({ code: "0001", isCorrect: true, prize: 300 })];
    const existing = [{ patternId: "other-pattern" }];
    const result = matchSubmission("0001", problems, patterns, existing);
    expect(result.prizeAwarded).toBe(300);
  });
});

describe("findDuplicateCodesWithinPatterns", () => {
  it("同一問題内の重複コードを検出する", () => {
    expect(findDuplicateCodesWithinPatterns(["0001", "0002", "0001"])).toEqual(["0001"]);
  });

  it("重複が無ければ空配列", () => {
    expect(findDuplicateCodesWithinPatterns(["0001", "0002"])).toEqual([]);
  });
});

describe("findDuplicateCodesAcrossProblems", () => {
  it("複数問題にまたがる同一コードを検出する", () => {
    const dup = findDuplicateCodesAcrossProblems([
      { problemId: "p1", codes: ["0001", "0002"] },
      { problemId: "p2", codes: ["0002", "0003"] },
    ]);
    expect(dup).toEqual(["0002"]);
  });

  it("重複が無ければ空配列", () => {
    const dup = findDuplicateCodesAcrossProblems([
      { problemId: "p1", codes: ["0001"] },
      { problemId: "p2", codes: ["0002"] },
    ]);
    expect(dup).toEqual([]);
  });
});

describe("validateNoDuplicateCodes（登録時コード重複バリデーション）", () => {
  it("新規登録: 他の問題とコードが重複する場合は重複として検出する", () => {
    const dup = validateNoDuplicateCodes("new-problem", ["0001", "0005"], [
      { problemId: "p1", codes: ["0001", "0002"] },
    ]);
    expect(dup).toEqual(["0001"]);
  });

  it("新規登録: 無効な問題であっても他問題との重複は検出する", () => {
    // 以前は enabled=false ならチェックを飛ばしていたため、無効なうちは重複を
    // 登録でき、有効化しようとした瞬間に初めて409になっていた。
    const dup = validateNoDuplicateCodes("new-problem", ["0001"], [
      { problemId: "p1", codes: ["0001"] },
    ]);
    expect(dup).toEqual(["0001"]);
  });

  it("同一問題内の重複コードも検出する", () => {
    const dup = validateNoDuplicateCodes("new-problem", ["0001", "0001"], []);
    expect(dup).toEqual(["0001"]);
  });

  it("編集時: 自分自身のコードは重複判定から除外する（他問題のコード集合を渡す想定）", () => {
    // p1自身の編集: otherProblemSetsにp1が含まれていても対象から除外される
    const dup = validateNoDuplicateCodes("p1", ["0001"], [
      { problemId: "p1", codes: ["0001"] },
      { problemId: "p2", codes: ["0002"] },
    ]);
    expect(dup).toEqual([]);
  });

  it("重複が無ければ空配列", () => {
    const dup = validateNoDuplicateCodes("p3", ["0009"], [
      { problemId: "p1", codes: ["0001"] },
      { problemId: "p2", codes: ["0002"] },
    ]);
    expect(dup).toEqual([]);
  });

  it("一括有効化（bulk enabled）想定: 全問題を有効化した結果として重複を検出する", () => {
    // 一括enabledはtarget/other分けをせず、全問題をそのままacrossチェックに渡す運用を想定
    const dup = findDuplicateCodesAcrossProblems([
      { problemId: "p1", codes: ["0001"] },
      { problemId: "p2", codes: ["0001"] },
      { problemId: "p3", codes: ["0003"] },
    ]);
    expect(dup).toEqual(["0001"]);
  });
});

describe("isDisabledProblemCode（無効な問題のコードは記録しない）", () => {
  it("無効な問題にだけ存在するコードは true", () => {
    const problems = [problem({ problemId: "p1", enabled: true })];
    const patterns = [
      pattern({ problemId: "p1", patternId: "a", code: "0001" }),
      pattern({ problemId: "p2", patternId: "b", code: "9999" }),
    ];
    // p2 は enabledProblems に含まれない＝無効
    expect(isDisabledProblemCode("9999", problems, patterns)).toBe(true);
  });

  it("有効な問題に一致するコードは false（通常どおり記録・判定する）", () => {
    const problems = [problem({ problemId: "p1", enabled: true })];
    const patterns = [pattern({ problemId: "p1", code: "0001" })];
    expect(isDisabledProblemCode("0001", problems, patterns)).toBe(false);
  });

  it("どの問題にも存在しない未登録コードは false（不正解として記録し続ける）", () => {
    const problems = [problem({ problemId: "p1", enabled: true })];
    const patterns = [pattern({ problemId: "p1", code: "0001" })];
    expect(isDisabledProblemCode("1234", problems, patterns)).toBe(false);
  });

  it("無効な問題と有効な問題が同じコードを持つ場合は false（有効側への回答を優先）", () => {
    // コード重複の検証は有効な問題どうしでしか行わないため、この状態は起こりうる
    const problems = [problem({ problemId: "p1", enabled: true })];
    const patterns = [
      pattern({ problemId: "p1", patternId: "a", code: "0001" }),
      pattern({ problemId: "p2", patternId: "b", code: "0001" }),
    ];
    expect(isDisabledProblemCode("0001", problems, patterns)).toBe(false);
  });
});
