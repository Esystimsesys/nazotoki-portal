import { describe, expect, it } from "vitest";
import { AUTO_CODE_KEYWORDS, generateUnusedCode } from "./random-code";

describe("generateUnusedCode", () => {
  it("4桁ゼロ埋めの文字列を返す", () => {
    const code = generateUnusedCode([]);
    expect(code).toMatch(/^\d{4}$/);
  });

  it("既に使われているコードは返さない", () => {
    // 0000〜9998 を埋めておくと、残る空きは 9999 のみ
    const used = new Set<string>();
    for (let i = 0; i < 9999; i++) used.add(String(i).padStart(4, "0"));
    expect(generateUnusedCode(used)).toBe("9999");
  });

  it("空きが無い場合は null を返す（無限ループしない）", () => {
    const used = new Set<string>();
    for (let i = 0; i < 10000; i++) used.add(String(i).padStart(4, "0"));
    expect(generateUnusedCode(used)).toBeNull();
  });

  it("連続して採番しても重複しない（都度usedに加える運用を想定）", () => {
    const used = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateUnusedCode(used);
      expect(code).not.toBeNull();
      expect(used.has(code!)).toBe(false);
      used.add(code!);
    }
    expect(used.size).toBe(500);
  });
});

describe("AUTO_CODE_KEYWORDS", () => {
  it("auto / ランダム / random を自動採番として扱う", () => {
    expect(AUTO_CODE_KEYWORDS.has("auto")).toBe(true);
    expect(AUTO_CODE_KEYWORDS.has("ランダム")).toBe(true);
    expect(AUTO_CODE_KEYWORDS.has("random")).toBe(true);
    expect(AUTO_CODE_KEYWORDS.has("1234")).toBe(false);
  });
});
