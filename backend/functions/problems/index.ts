/**
 * nazotoki-problems
 * - GET    /api/admin/problems                問題一覧（メタ＋パターン）
 * - POST   /api/admin/problems                問題新規登録
 * - PUT    /api/admin/problems/{problemId}    問題全置換（メタ＋パターン）
 * - DELETE /api/admin/problems/{problemId}    問題削除（メタ行＋パターン行を物理削除）
 * - PUT    /api/admin/problems/{problemId}/enabled  個別有効/無効切替
 * - PUT    /api/admin/problems/enabled         一括有効/無効切替
 * - POST   /api/admin/problems/csv             CSV一括取込
 *
 * Problemsテーブルは「問題メタ行(sk=META)＋パターン行(sk=PATTERN#<patternId>)」の単一テーブル構成。
 * データ量が小さいためScanで全件取得する。
 */
import { BatchWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import Papa from "papaparse";
import { requireAuth } from "../../shared/auth";
import {
  findDuplicateCodesAcrossProblems,
  findDuplicateCodesWithinPatterns,
  validateNoDuplicateCodes,
  type ProblemCodeSet,
} from "../../shared/answer-matching";
import { ddb, requiredEnv, scanAll } from "../../shared/dynamo";
import { AUTO_CODE_KEYWORDS, generateUnusedCode } from "../../shared/random-code";
import {
  err,
  getJsonBody,
  noContent,
  ok,
  withErrorHandling,
  type ApiEvent,
  type ApiResult,
} from "../../shared/http";

interface Pattern {
  patternId: string;
  code: string;
  isCorrect: boolean;
  prize: number;
  note?: string;
}

interface Problem {
  problemId: string;
  label: string;
  enabled: boolean;
  createdAt: string;
  patterns: Pattern[];
}

interface PatternInput {
  code: string;
  isCorrect: boolean;
  prize: number;
  note?: string;
}

type WriteRequestItem =
  | { PutRequest: { Item: Record<string, unknown> } }
  | { DeleteRequest: { Key: Record<string, unknown> } };

/** DynamoDB BatchWrite（25件ずつ分割） */
async function batchWrite(tableName: string, requests: WriteRequestItem[]): Promise<void> {
  for (let i = 0; i < requests.length; i += 25) {
    await ddb().send(
      new BatchWriteCommand({ RequestItems: { [tableName]: requests.slice(i, i + 25) } }),
    );
  }
}

/** Problemsテーブルを全件Scanし、META行＋PATTERN行からProblem[]を組み立てる */
async function loadAllProblems(): Promise<Problem[]> {
  const items = await scanAll(requiredEnv("TABLE_PROBLEMS"));
  const metaByProblemId = new Map<
    string,
    { label: string; enabled: boolean; createdAt: string }
  >();
  const patternsByProblemId = new Map<string, Pattern[]>();

  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const sk = item.sk as string;
    const problemId = item.problemId as string;
    if (sk === "META") {
      metaByProblemId.set(problemId, {
        label: item.label as string,
        enabled: item.enabled as boolean,
        createdAt: item.createdAt as string,
      });
    } else if (typeof sk === "string" && sk.startsWith("PATTERN#")) {
      const list = patternsByProblemId.get(problemId) ?? [];
      list.push({
        patternId: item.patternId as string,
        code: item.code as string,
        isCorrect: item.isCorrect as boolean,
        prize: item.prize as number,
        note: item.note as string | undefined,
      });
      patternsByProblemId.set(problemId, list);
    }
  }

  const problems: Problem[] = [];
  for (const [problemId, meta] of metaByProblemId) {
    problems.push({
      problemId,
      label: meta.label,
      enabled: meta.enabled,
      createdAt: meta.createdAt,
      patterns: (patternsByProblemId.get(problemId) ?? []).sort((a, b) =>
        a.patternId.localeCompare(b.patternId),
      ),
    });
  }
  // 問題番号順（自然順）で返す。labelは「問題1「鏡の中の数字」」のような自由入力のため、
  // 数字を数値として比較しないと 問題10 が 問題2 より前に来てしまう。
  // 管理画面の一覧・ダッシュボードの問題別サマリで表示順を揃えるための共通の並び。
  return problems.sort((a, b) => {
    const byLabel = a.label.localeCompare(b.label, "ja", { numeric: true, sensitivity: "base" });
    return byLabel !== 0 ? byLabel : a.createdAt.localeCompare(b.createdAt);
  });
}

function toCodeSets(problems: Problem[]): ProblemCodeSet[] {
  return problems.map((p) => ({ problemId: p.problemId, codes: p.patterns.map((pt) => pt.code) }));
}

/** POST/PUT /problems の body.patterns をバリデーションしてパースする。不正ならnull */
function parsePatternsInput(raw: unknown): PatternInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const patterns: PatternInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { code, isCorrect, prize, note } = entry as Record<string, unknown>;
    if (typeof code !== "string" || !/^\d{4}$/.test(code)) return null;
    if (typeof isCorrect !== "boolean") return null;
    if (typeof prize !== "number" || !Number.isFinite(prize)) return null;
    if (note !== undefined && typeof note !== "string") return null;
    patterns.push({ code, isCorrect, prize, ...(note !== undefined ? { note } : {}) });
  }
  return patterns;
}

function buildPatternItems(patternsInput: PatternInput[]): Pattern[] {
  return patternsInput.map((p) => ({
    patternId: randomUUID(),
    code: p.code,
    isCorrect: p.isCorrect,
    prize: p.prize,
    ...(p.note !== undefined ? { note: p.note } : {}),
  }));
}

function patternWriteRequests(problemId: string, patterns: Pattern[]): WriteRequestItem[] {
  return patterns.map((p) => ({
    PutRequest: {
      Item: {
        pk: `PROBLEM#${problemId}`,
        sk: `PATTERN#${p.patternId}`,
        problemId,
        patternId: p.patternId,
        code: p.code,
        isCorrect: p.isCorrect,
        prize: p.prize,
        ...(p.note !== undefined ? { note: p.note } : {}),
      },
    },
  }));
}

/** GET /api/admin/problems */
async function listProblems(): Promise<ApiResult> {
  const problems = await loadAllProblems();
  return ok({ problems });
}

/** POST /api/admin/problems */
async function createProblem(event: ApiEvent): Promise<ApiResult> {
  const body = getJsonBody(event);
  const label = body?.label;
  const enabled = body?.enabled;
  const patternsInput = parsePatternsInput(body?.patterns);

  if (typeof label !== "string" || !label.trim()) return err(400, "label を指定してください");
  if (typeof enabled !== "boolean") return err(400, "enabled を指定してください");
  if (!patternsInput) {
    return err(
      400,
      "patterns の形式が不正です（code: 4桁文字列, isCorrect: boolean, prize: number が必須）",
    );
  }

  const allProblems = await loadAllProblems();
  const newProblemId = randomUUID();
  const otherEnabledSets = toCodeSets(allProblems.filter((p) => p.enabled));
  const conflicts = validateNoDuplicateCodes(
    newProblemId,
    patternsInput.map((p) => p.code),
    enabled,
    otherEnabledSets,
  );
  if (conflicts.length > 0) {
    return err(409, "有効な問題間でコードが重複しています", { conflicts });
  }

  const createdAt = new Date().toISOString();
  const patterns = buildPatternItems(patternsInput);
  const metaItem = {
    pk: `PROBLEM#${newProblemId}`,
    sk: "META",
    problemId: newProblemId,
    label: label.trim(),
    enabled,
    createdAt,
  };

  await batchWrite(requiredEnv("TABLE_PROBLEMS"), [
    { PutRequest: { Item: metaItem } },
    ...patternWriteRequests(newProblemId, patterns),
  ]);

  const problem: Problem = {
    problemId: newProblemId,
    label: metaItem.label,
    enabled,
    createdAt,
    patterns,
  };
  return ok({ problem }, 201);
}

/** PUT /api/admin/problems/{problemId}（全置換） */
async function updateProblem(event: ApiEvent, problemId: string): Promise<ApiResult> {
  const body = getJsonBody(event);
  const label = body?.label;
  const enabled = body?.enabled;
  const patternsInput = parsePatternsInput(body?.patterns);

  if (typeof label !== "string" || !label.trim()) return err(400, "label を指定してください");
  if (typeof enabled !== "boolean") return err(400, "enabled を指定してください");
  if (!patternsInput) {
    return err(
      400,
      "patterns の形式が不正です（code: 4桁文字列, isCorrect: boolean, prize: number が必須）",
    );
  }

  const allProblems = await loadAllProblems();
  const existing = allProblems.find((p) => p.problemId === problemId);
  if (!existing) return err(404, "問題が見つかりません");

  const otherEnabledSets = toCodeSets(
    allProblems.filter((p) => p.enabled && p.problemId !== problemId),
  );
  const conflicts = validateNoDuplicateCodes(
    problemId,
    patternsInput.map((p) => p.code),
    enabled,
    otherEnabledSets,
  );
  if (conflicts.length > 0) {
    return err(409, "有効な問題間でコードが重複しています", { conflicts });
  }

  const patterns = buildPatternItems(patternsInput);
  const deleteRequests: WriteRequestItem[] = existing.patterns.map((p) => ({
    DeleteRequest: { Key: { pk: `PROBLEM#${problemId}`, sk: `PATTERN#${p.patternId}` } },
  }));

  await batchWrite(requiredEnv("TABLE_PROBLEMS"), [
    ...deleteRequests,
    ...patternWriteRequests(problemId, patterns),
  ]);

  await ddb().send(
    new UpdateCommand({
      TableName: requiredEnv("TABLE_PROBLEMS"),
      Key: { pk: `PROBLEM#${problemId}`, sk: "META" },
      UpdateExpression: "SET label = :label, enabled = :enabled",
      ExpressionAttributeValues: { ":label": label.trim(), ":enabled": enabled },
    }),
  );

  const problem: Problem = {
    problemId,
    label: label.trim(),
    enabled,
    createdAt: existing.createdAt,
    patterns,
  };
  return ok({ problem });
}

/** DELETE /api/admin/problems/{problemId}（メタ行＋パターン行を物理削除） */
async function deleteProblem(problemId: string): Promise<ApiResult> {
  const allProblems = await loadAllProblems();
  const existing = allProblems.find((p) => p.problemId === problemId);
  if (!existing) return err(404, "問題が見つかりません");

  const deleteRequests: WriteRequestItem[] = [
    { DeleteRequest: { Key: { pk: `PROBLEM#${problemId}`, sk: "META" } } },
    ...existing.patterns.map((p) => ({
      DeleteRequest: { Key: { pk: `PROBLEM#${problemId}`, sk: `PATTERN#${p.patternId}` } },
    })),
  ];
  await batchWrite(requiredEnv("TABLE_PROBLEMS"), deleteRequests);
  return ok({ ok: true });
}

/** PUT /api/admin/problems/{problemId}/enabled（個別切替） */
async function setEnabled(event: ApiEvent, problemId: string): Promise<ApiResult> {
  const body = getJsonBody(event);
  const enabled = body?.enabled;
  if (typeof enabled !== "boolean") return err(400, "enabled を指定してください");

  const allProblems = await loadAllProblems();
  const existing = allProblems.find((p) => p.problemId === problemId);
  if (!existing) return err(404, "問題が見つかりません");

  const otherEnabledSets = toCodeSets(
    allProblems.filter((p) => p.enabled && p.problemId !== problemId),
  );
  const conflicts = validateNoDuplicateCodes(
    problemId,
    existing.patterns.map((p) => p.code),
    enabled,
    otherEnabledSets,
  );
  if (conflicts.length > 0) {
    return err(409, "有効な問題間でコードが重複しています", { conflicts });
  }

  await ddb().send(
    new UpdateCommand({
      TableName: requiredEnv("TABLE_PROBLEMS"),
      Key: { pk: `PROBLEM#${problemId}`, sk: "META" },
      UpdateExpression: "SET enabled = :enabled",
      ExpressionAttributeValues: { ":enabled": enabled },
    }),
  );

  return ok({ problem: { ...existing, enabled } });
}

/** PUT /api/admin/problems/enabled（一括切替。重複が生じる場合はどれも変更しない） */
async function setAllEnabled(event: ApiEvent): Promise<ApiResult> {
  const body = getJsonBody(event);
  const enabled = body?.enabled;
  if (typeof enabled !== "boolean") return err(400, "enabled を指定してください");

  const allProblems = await loadAllProblems();

  if (enabled) {
    const conflicts = findDuplicateCodesAcrossProblems(toCodeSets(allProblems));
    if (conflicts.length > 0) {
      return err(409, "有効な問題間でコードが重複しています", { conflicts });
    }
  }

  for (const p of allProblems) {
    await ddb().send(
      new UpdateCommand({
        TableName: requiredEnv("TABLE_PROBLEMS"),
        Key: { pk: `PROBLEM#${p.problemId}`, sk: "META" },
        UpdateExpression: "SET enabled = :enabled",
        ExpressionAttributeValues: { ":enabled": enabled },
      }),
    );
  }

  return ok({ problems: allProblems.map((p) => ({ ...p, enabled })) });
}

interface CsvRow {
  問題名?: string;
  コード?: string;
  判定?: string;
  賞金?: string;
  メモ?: string;
}

interface CsvEntry {
  row: number;
  label: string;
  code: string;
  isCorrect: boolean;
  prize: number;
  note?: string;
}

/**
 * POST /api/admin/problems/csv
 * ヘッダ行: 問題名,コード,判定,賞金,メモ。判定は 正解/不正解。同一問題名の行はまとめて1問題に。
 * 取込データ全体（既存の有効な問題も含む）を横断して同一コード重複を検出し、
 * 1件でもエラーがあれば1件も取り込まない。
 * 行番号は1行目をヘッダとして数える（先頭データ行 = 2行目）。
 */
async function importCsv(event: ApiEvent): Promise<ApiResult> {
  const body = getJsonBody(event);
  const csv = body?.csv;
  if (typeof csv !== "string" || !csv.trim()) return err(400, "csv を指定してください");

  const parsed = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length > 0) {
    const rowErrors = parsed.errors.map((e) => ({
      row: (e.row ?? 0) + 2,
      message: e.message,
    }));
    return err(400, "CSVの解析に失敗しました", { rowErrors });
  }

  const rowErrors: { row: number; message: string }[] = [];
  const entries: CsvEntry[] = [];

  parsed.data.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const label = row["問題名"]?.trim();
    const code = row["コード"]?.trim();
    const judge = row["判定"]?.trim();
    const prizeRaw = row["賞金"]?.trim();
    const note = row["メモ"]?.trim();

    if (!label) {
      rowErrors.push({ row: rowNumber, message: "問題名が空です" });
      return;
    }
    // コード列が空、または "auto"/"ランダム" の場合はサーバー側で未使用の
    // 4桁を自動採番する（毎回コードを考える手間を省くため）。
    // 実際の採番はこのループの後、既存コードと取込分をすべて把握してから行う。
    const isAuto = !code || AUTO_CODE_KEYWORDS.has(code.toLowerCase());
    if (!isAuto && !/^\d{4}$/.test(code)) {
      rowErrors.push({
        row: rowNumber,
        message: `コードは4桁の数字、または空欄/auto（自動採番）で指定してください: "${code}"`,
      });
      return;
    }
    if (judge !== "正解" && judge !== "不正解") {
      rowErrors.push({ row: rowNumber, message: `判定は 正解/不正解 のいずれかで指定してください: "${judge ?? ""}"` });
      return;
    }
    const prize = Number(prizeRaw);
    if (!prizeRaw || !Number.isFinite(prize)) {
      rowErrors.push({ row: rowNumber, message: `賞金が不正です: "${prizeRaw ?? ""}"` });
      return;
    }

    entries.push({
      row: rowNumber,
      label,
      // 自動採番の行はいったん空にしておき、後段でまとめて採番する
      code: isAuto ? "" : code,
      isCorrect: judge === "正解",
      prize,
      note: note || undefined,
    });
  });

  if (rowErrors.length > 0) {
    return err(400, "CSVの取り込みに失敗しました", { rowErrors: rowErrors.sort((a, b) => a.row - b.row) });
  }

  // 自動採番: 既存の全問題（有効・無効を問わず）とCSVで明示指定されたコードを避けて
  // 未使用の4桁を割り当てる。無効な問題のコードも避けるのは、あとでその問題を
  // 有効化したときに重複エラーになるのを防ぐため。
  const autoEntries = entries.filter((e) => !e.code);
  if (autoEntries.length > 0) {
    const takenForAuto = new Set<string>();
    for (const p of await loadAllProblems()) {
      for (const pat of p.patterns) takenForAuto.add(pat.code);
    }
    for (const e of entries) {
      if (e.code) takenForAuto.add(e.code);
    }
    for (const e of autoEntries) {
      const generated = generateUnusedCode(takenForAuto);
      if (!generated) {
        return err(400, "自動採番できる未使用のコードが残っていません");
      }
      takenForAuto.add(generated);
      e.code = generated;
    }
  }

  // 同一問題名の行をまとめる（登場順を維持）
  const labelOrder: string[] = [];
  const entriesByLabel = new Map<string, CsvEntry[]>();
  for (const entry of entries) {
    if (!entriesByLabel.has(entry.label)) {
      labelOrder.push(entry.label);
      entriesByLabel.set(entry.label, []);
    }
    entriesByLabel.get(entry.label)!.push(entry);
  }

  // 同一問題内のコード重複
  for (const [label, group] of entriesByLabel) {
    const dup = new Set(findDuplicateCodesWithinPatterns(group.map((g) => g.code)));
    for (const g of group) {
      if (dup.has(g.code)) {
        rowErrors.push({ row: g.row, message: `コード "${g.code}" が問題「${label}」内で重複しています` });
      }
    }
  }

  // 取込バッチ内で問題をまたいだコード重複（CSVで新規作成される問題はenabled:trueとして扱う）
  const batchSets: ProblemCodeSet[] = [...entriesByLabel.entries()].map(([label, group]) => ({
    problemId: label,
    codes: group.map((g) => g.code),
  }));
  const acrossDup = new Set(findDuplicateCodesAcrossProblems(batchSets));
  for (const entry of entries) {
    if (acrossDup.has(entry.code)) {
      rowErrors.push({ row: entry.row, message: `コード "${entry.code}" が複数の問題にまたがって重複しています` });
    }
  }

  // 既存の有効な問題とのコード重複（CSV取込問題は登録と同時に有効化される想定のため）
  const existingProblems = await loadAllProblems();
  const existingEnabledCodeToLabel = new Map<string, string>();
  for (const p of existingProblems) {
    if (!p.enabled) continue;
    for (const pat of p.patterns) existingEnabledCodeToLabel.set(pat.code, p.label);
  }
  for (const entry of entries) {
    const conflictLabel = existingEnabledCodeToLabel.get(entry.code);
    if (conflictLabel) {
      rowErrors.push({
        row: entry.row,
        message: `コード "${entry.code}" は既に有効な問題「${conflictLabel}」で使用されています`,
      });
    }
  }

  if (rowErrors.length > 0) {
    const unique = new Map(rowErrors.map((e) => [`${e.row}:${e.message}`, e]));
    return err(400, "CSVの取り込みに失敗しました", {
      rowErrors: [...unique.values()].sort((a, b) => a.row - b.row),
    });
  }

  // バリデーション済み: 新しい問題として登録する（CSV取込は有効=trueで登録する）
  const baseTime = Date.now();
  const writeRequests: WriteRequestItem[] = [];
  const problems: Problem[] = [];

  labelOrder.forEach((label, index) => {
    const group = entriesByLabel.get(label)!;
    const problemId = randomUUID();
    // 登場順を安定させるため1msずつずらす（同一labelOrder内での取込順序を保持する目的）
    const createdAt = new Date(baseTime + index).toISOString();
    const patterns = buildPatternItems(
      group.map((g) => ({ code: g.code, isCorrect: g.isCorrect, prize: g.prize, note: g.note })),
    );

    writeRequests.push({
      PutRequest: {
        Item: { pk: `PROBLEM#${problemId}`, sk: "META", problemId, label, enabled: true, createdAt },
      },
    });
    writeRequests.push(...patternWriteRequests(problemId, patterns));

    problems.push({ problemId, label, enabled: true, createdAt, patterns });
  });

  await batchWrite(requiredEnv("TABLE_PROBLEMS"), writeRequests);

  return ok({ imported: problems.length, problems });
}

export const handler = async (event: ApiEvent): Promise<ApiResult> =>
  withErrorHandling(async () => {
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === "OPTIONS") return noContent();

    requireAuth(event, "admin");

    if (method === "GET" && path === "/api/admin/problems") return listProblems();
    if (method === "POST" && path === "/api/admin/problems") return createProblem(event);
    if (method === "POST" && path === "/api/admin/problems/csv") return importCsv(event);
    // 一括enabled切替は個別/problems/{problemId}の正規表現より先に判定する必要がある
    // （"enabled" という文字列がproblemIdとして誤って一致するのを防ぐため）
    if (method === "PUT" && path === "/api/admin/problems/enabled") return setAllEnabled(event);

    const enabledMatch = path.match(/^\/api\/admin\/problems\/([^/]+)\/enabled$/);
    if (method === "PUT" && enabledMatch) {
      return setEnabled(event, decodeURIComponent(enabledMatch[1]));
    }

    const idMatch = path.match(/^\/api\/admin\/problems\/([^/]+)$/);
    if (method === "PUT" && idMatch) return updateProblem(event, decodeURIComponent(idMatch[1]));
    if (method === "DELETE" && idMatch) return deleteProblem(decodeURIComponent(idMatch[1]));

    return err(404, "ルートが見つかりません");
  });
