/**
 * 回答マッチングロジック＋登録時コード重複バリデーション（純粋関数）。
 * 01-api-contract.md の「回答マッチングロジック」章 1〜6 に厳密に対応する。
 * DynamoDB・HTTPに一切依存しないため、単体テストしやすい形にしてある。
 */

export interface ProblemRecord {
  problemId: string;
  label: string;
  enabled: boolean;
  createdAt: string;
}

export interface PatternRecord {
  problemId: string;
  patternId: string;
  /** 4桁ゼロ埋め文字列 */
  code: string;
  isCorrect: boolean;
  prize: number;
  note?: string;
}

/** 賞金重複加算防止の判定に必要な既存Submissionの最小情報 */
export interface ExistingSubmission {
  patternId: string | null;
}

export interface MatchResult {
  problemId: string | null;
  patternId: string | null;
  isCorrect: boolean;
  prizeAwarded: number;
}

/**
 * 回答マッチング（POST /api/submissions で使用）。
 *
 * 1. enabled=true の全問題のパターンから code 一致を探す。
 * 2. 一致0件: 未登録回答として { problemId: null, patternId: null, isCorrect: false, prizeAwarded: 0 }。
 * 3. 一致1件: そのパターンで判定。
 * 4. 一致複数件: createdAt が最も早い問題の一致を採用し、console.warn で警告。
 * 5. 賞金の重複加算防止: 当該チームの既存Submissionに同一patternIdの記録が既にあればprizeAwarded=0。
 * 6. isCorrect は一致パターンのisCorrect（一致0件はfalse）。
 *
 * @param code 入力コード
 * @param enabledProblems enabled=true の全問題
 * @param patterns 全問題の回答パターン（enabledProblemsに含まれる問題のものだけを渡してもよいし、
 *                 全件渡しても enabledProblems でフィルタするため問題ない）
 * @param existingSubmissions 当該チームの既存Submission一覧
 */
export function matchSubmission(
  code: string,
  enabledProblems: ProblemRecord[],
  patterns: PatternRecord[],
  existingSubmissions: ExistingSubmission[],
): MatchResult {
  // enabledProblems は呼び出し側で enabled=true にフィルタ済みである想定だが、
  // 純粋関数として自己完結させるためここでも enabled=true を防御的に再確認する。
  const enabledProblemIds = new Set(
    enabledProblems.filter((p) => p.enabled).map((p) => p.problemId),
  );
  const matches = patterns.filter((p) => enabledProblemIds.has(p.problemId) && p.code === code);

  if (matches.length === 0) {
    return { problemId: null, patternId: null, isCorrect: false, prizeAwarded: 0 };
  }

  let chosen = matches[0];
  if (matches.length > 1) {
    const problemById = new Map(enabledProblems.map((p) => [p.problemId, p]));
    chosen = matches.reduce((earliest, candidate) => {
      const earliestProblem = problemById.get(earliest.problemId);
      const candidateProblem = problemById.get(candidate.problemId);
      if (!earliestProblem || !candidateProblem) return earliest;
      return candidateProblem.createdAt < earliestProblem.createdAt ? candidate : earliest;
    });
    console.warn(
      `[answer-matching] コード "${code}" が複数のパターンに一致しました（patternIds: ${matches
        .map((m) => m.patternId)
        .join(", ")}）。最も早く作成された問題のパターン "${chosen.patternId}" を採用します。`,
    );
  }

  const alreadyAwarded = existingSubmissions.some((s) => s.patternId === chosen.patternId);
  const prizeAwarded = alreadyAwarded ? 0 : chosen.prize;

  return {
    problemId: chosen.problemId,
    patternId: chosen.patternId,
    isCorrect: chosen.isCorrect,
    prizeAwarded,
  };
}

/**
 * そのコードが「無効な問題にだけ存在する」かを判定する。
 *
 * true の場合、呼び出し側は回答を**記録せずに**不正解として返す。
 * 無効な問題はまだ出題されていない（あるいは締め切った）ものなので、
 * そこへの入力は「無かったこと」にするのが正しい。
 *
 * 記録してしまうと、あとでその問題を有効化したときに
 * 「同じコードの2回目以降は記録しない」という賞金の二重取り防止に引っかかり、
 * そのチームだけ永久に得点できなくなる（画面には正解と出るのに賞金が入らない）。
 * イベント途中で問題を追加投入する運用が前提なので、ここは塞いでおく必要がある。
 *
 * 有効な問題のいずれかに一致する場合は false を返す。コードの重複検証は
 * 有効な問題どうしでしか行わないため、無効な問題と有効な問題が同じコードを
 * 持つことがあり得るが、その場合は有効な問題への回答として扱う。
 */
export function isDisabledProblemCode(
  code: string,
  enabledProblems: ProblemRecord[],
  patterns: PatternRecord[],
): boolean {
  const enabledProblemIds = new Set(
    enabledProblems.filter((p) => p.enabled).map((p) => p.problemId),
  );
  const matchesEnabled = patterns.some(
    (p) => enabledProblemIds.has(p.problemId) && p.code === code,
  );
  if (matchesEnabled) return false;
  return patterns.some((p) => p.code === code);
}

/** 問題1件分のコード集合（登録時重複バリデーション用） */
export interface ProblemCodeSet {
  problemId: string;
  codes: string[];
}

/** 同一問題内でのコード重複を検出する（登録データそのものの整合性チェック） */
export function findDuplicateCodesWithinPatterns(codes: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const code of codes) {
    if (seen.has(code)) dup.add(code);
    seen.add(code);
  }
  return [...dup];
}

/**
 * 「有効化した後の有効問題集合」の中で、問題をまたいで同一コードが存在しないかを検出する。
 * 同一問題内の重複は対象外（findDuplicateCodesWithinPatternsで別途検出する）。
 */
export function findDuplicateCodesAcrossProblems(enabledSets: ProblemCodeSet[]): string[] {
  const codeToProblemIds = new Map<string, Set<string>>();
  for (const set of enabledSets) {
    const uniqueCodesInProblem = new Set(set.codes);
    for (const code of uniqueCodesInProblem) {
      const problemIds = codeToProblemIds.get(code) ?? new Set<string>();
      problemIds.add(set.problemId);
      codeToProblemIds.set(code, problemIds);
    }
  }
  const dup = new Set<string>();
  for (const [code, problemIds] of codeToProblemIds) {
    if (problemIds.size > 1) dup.add(code);
  }
  return [...dup];
}

/**
 * 問題の登録・編集時のコード重複バリデーション。重複していたコードの一覧を返す
 * （空配列なら問題なし）。
 *
 * **有効・無効を問わず、すべての問題を横断して重複を禁止する。**
 * 以前は「同時に有効な問題どうし」でしか見ていなかったが、それだと無効な状態でなら
 * 重複コードを登録できてしまい、あとでその問題を有効化しようとした瞬間に409で弾かれる。
 * イベント中に問題を追加投入する運用では、その409が「押した瞬間に初めて分かる」形になり
 * 事故になりやすい。登録時点で必ず弾いておけば、いつ有効化しても必ず通る状態を保てる。
 *
 * 同一問題内での重複（同じ問題に同じコードのパターンが2つある）も併せて検出する。
 */
export function validateNoDuplicateCodes(
  targetProblemId: string,
  targetCodes: string[],
  otherProblemSets: ProblemCodeSet[],
): string[] {
  const withinDup = findDuplicateCodesWithinPatterns(targetCodes);

  const allSets: ProblemCodeSet[] = [
    ...otherProblemSets.filter((s) => s.problemId !== targetProblemId),
    { problemId: targetProblemId, codes: targetCodes },
  ];
  const acrossDup = findDuplicateCodesAcrossProblems(allSets);

  return [...new Set([...withinDup, ...acrossDup])];
}
