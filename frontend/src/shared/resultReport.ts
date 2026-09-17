import type { Cell, Row, Sheet } from "write-excel-file/browser";
import type { ReportResponse } from "../api/types";
import { compareTeamNames, withPrizeRanks } from "./sort";

const COLORS = {
  ink: "#23193A",
  purple: "#4A2F73",
  goldSoft: "#FFF1B8",
  line: "#D9D2E3",
  green: "#DDF5E5",
  greenText: "#176B3A",
  red: "#FCE2E7",
  redText: "#A3243B",
  gray: "#EEEAF2",
  grayText: "#675E72",
  white: "#FFFFFF",
} as const;

const MONEY_FORMAT = '¥#,##0;[Red]-¥#,##0;¥0';
const DATE_TIME_FORMAT = "yyyy/mm/dd hh:mm:ss";
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1_000;

function titleRow(title: string, columnCount: number): Row {
  return [
    {
      value: title,
      columnSpan: columnCount,
      fontSize: 16,
      fontWeight: "bold",
      textColor: COLORS.ink,
      height: 28,
      alignVertical: "center",
    },
    ...Array<Cell>(Math.max(0, columnCount - 1)).fill(null),
  ];
}

function contextRow(report: ReportResponse, columnCount: number, text?: string): Row {
  return [
    {
      value: text ?? `出力日時: ${formatDateTime(report.generatedAt)}`,
      columnSpan: columnCount,
      fontSize: 9,
      fontStyle: "italic",
      textColor: COLORS.grayText,
      height: 20,
    },
    ...Array<Cell>(Math.max(0, columnCount - 1)).fill(null),
  ];
}

function headerCell(value: string): Cell {
  return {
    value,
    fontWeight: "bold",
    textColor: COLORS.white,
    backgroundColor: COLORS.purple,
    borderColor: COLORS.white,
    borderStyle: "thin",
    align: "center",
    alignVertical: "center",
    wrap: true,
    height: 30,
  };
}

function dataCell(value: string | number | Date | null, options: Partial<Exclude<Cell, string | number | Date | null | undefined>> = {}): Cell {
  return {
    value: value ?? "",
    alignVertical: "center",
    bottomBorderColor: COLORS.line,
    bottomBorderStyle: "thin",
    ...options,
  };
}

function moneyCell(value: number, options: Partial<Exclude<Cell, string | number | Date | null | undefined>> = {}): Cell {
  return dataCell(value, { type: Number, format: MONEY_FORMAT, align: "right", ...options });
}

function dateCell(value: string | null): Cell {
  if (!value) return dataCell("");
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? dataCell(value)
    // xlsx自体はタイムゾーンを持たない。write-excel-fileはUTC成分をセル値にするため、
    // サーバーのISO時刻をイベント開催地（日本時間）の壁時計へ移してから書き込む。
    : dataCell(new Date(date.getTime() + TOKYO_OFFSET_MS), {
        type: Date,
        format: DATE_TIME_FORMAT,
        align: "center",
      });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ja-JP");
}

function eventStatus(report: ReportResponse): string {
  return report.event.running ? "開催中" : report.event.endedAt ? "終了" : "開始前";
}

function resultCell(solved: boolean, wrong: boolean, earnedPrize: number): Cell {
  const amount =
    earnedPrize === 0
      ? ""
      : `\n${earnedPrize > 0 ? "+" : "-"}¥${Math.abs(earnedPrize).toLocaleString("ja-JP")}`;
  if (solved && wrong) {
    return dataCell(`正解（誤答あり）${amount}`, {
      backgroundColor: COLORS.goldSoft,
      textColor: COLORS.ink,
      align: "center",
      wrap: true,
    });
  }
  if (solved) {
    return dataCell(`正解${amount}`, {
      backgroundColor: COLORS.green,
      textColor: COLORS.greenText,
      align: "center",
      wrap: true,
    });
  }
  if (wrong) {
    return dataCell(`誤答${amount}`, {
      backgroundColor: COLORS.red,
      textColor: COLORS.redText,
      align: "center",
      wrap: true,
    });
  }
  return dataCell("未回答", {
    backgroundColor: COLORS.gray,
    textColor: COLORS.grayText,
    align: "center",
  });
}

function buildOverview(report: ReportResponse): Sheet<Blob> {
  const rows: Row[] = [
    titleRow("謎解きナイト 結果レポート", 4),
    contextRow(report, 4),
    [],
    [headerCell("大会情報"), headerCell("値"), headerCell("集計"), headerCell("値")],
    [dataCell("イベント状態"), dataCell(eventStatus(report)), dataCell("参加チーム数"), dataCell(report.stats.teamCount, { type: Number })],
    [dataCell("開始日時"), dateCell(report.event.startedAt), dataCell("有効チーム数"), dataCell(report.stats.activeTeamCount, { type: Number })],
    [dataCell("終了日時"), dateCell(report.event.endedAt), dataCell("回答したチーム数"), dataCell(report.stats.answeredTeamCount, { type: Number })],
    [dataCell("出力日時"), dateCell(report.generatedAt), dataCell("記録済み回答数"), dataCell(report.stats.submissionCount, { type: Number })],
    [dataCell(""), dataCell(""), dataCell("登録コードへの回答"), dataCell(report.stats.registeredSubmissionCount, { type: Number })],
    [dataCell(""), dataCell(""), dataCell("未登録コードへの回答"), dataCell(report.stats.unregisteredSubmissionCount, { type: Number })],
    [dataCell(""), dataCell(""), dataCell("問題数"), dataCell(report.stats.totalProblemCount, { type: Number })],
    [dataCell(""), dataCell(""), dataCell("有効な問題数"), dataCell(report.stats.enabledProblemCount, { type: Number })],
    [dataCell(""), dataCell(""), dataCell("1チーム以上が正解した問題"), dataCell(report.stats.solvedProblemCount, { type: Number })],
    [dataCell(""), dataCell(""), dataCell("全問正解時の最大賞金"), moneyCell(report.stats.maxPrize)],
    [dataCell(""), dataCell(""), dataCell("全チームの賞金合計"), moneyCell(report.stats.awardedPrize)],
    [],
    contextRow(
      report,
      4,
      "回答履歴は保存済みの回答を全件収録しています。同じ4桁コードの再入力はシステム上保存されません。",
    ),
  ];
  return {
    sheet: "大会概要",
    data: rows,
    columns: [{ width: 22 }, { width: 24 }, { width: 28 }, { width: 18 }],
    showGridLines: false,
    zoomScale: 1.1,
  };
}

function buildRanking(report: ReportResponse): Sheet<Blob> {
  const columns = [
    "順位",
    "チーム",
    "状態",
    "メモ",
    "正解回答数",
    "不正解回答数（未登録含む）",
    "正解問題数",
    "誤答問題数",
    "未登録回答数",
    "獲得賞金",
    "減点",
    "合計賞金",
    "チームID",
  ];
  const teamsById = new Map(report.teams.map((team) => [team.teamId, team]));
  const rows: Row[] = [titleRow("順位", columns.length), contextRow(report, columns.length), [], columns.map(headerCell)];

  for (const { row, rank } of withPrizeRanks(report.ranking)) {
    const team = teamsById.get(row.teamId);
    const top = rank <= 3;
    const emphasis = top ? { backgroundColor: COLORS.goldSoft, fontWeight: "bold" as const } : {};
    rows.push([
      dataCell(rank, { type: Number, align: "center", ...emphasis }),
      dataCell(row.teamName, emphasis),
      dataCell(team?.active === false ? "無効" : "有効", { align: "center", ...emphasis }),
      dataCell(team?.note ?? "", { wrap: true, ...emphasis }),
      dataCell(row.correctCount, { type: Number, align: "right", ...emphasis }),
      dataCell(row.incorrectCount, { type: Number, align: "right", ...emphasis }),
      dataCell(team?.solvedProblemCount ?? 0, { type: Number, align: "right", ...emphasis }),
      dataCell(team?.wrongProblemCount ?? 0, { type: Number, align: "right", ...emphasis }),
      dataCell(team?.unregisteredCount ?? 0, { type: Number, align: "right", ...emphasis }),
      moneyCell(team?.gainedPrize ?? 0, emphasis),
      moneyCell(team?.lostPrize ?? 0, emphasis),
      moneyCell(row.totalPrize, emphasis),
      dataCell(row.teamId, emphasis),
    ]);
  }

  return {
    sheet: "順位",
    data: rows,
    columns: [
      { width: 8 }, { width: 22 }, { width: 10 }, { width: 26 }, { width: 12 }, { width: 18 },
      { width: 12 }, { width: 12 }, { width: 14 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 38 },
    ],
    stickyRowsCount: 4,
    showGridLines: false,
    orientation: "landscape",
  };
}

function buildTeamProblemMatrix(report: ReportResponse): Sheet<Blob> {
  const teams = [...report.teams].sort(compareTeamNames);
  const rankByTeam = new Map(withPrizeRanks(report.ranking).map(({ row, rank }) => [row.teamId, rank]));
  const results = new Map<string, { solved: boolean; wrong: boolean; earnedPrize: number }>();

  for (const submission of report.submissions) {
    if (!submission.problemId) continue;
    const key = `${submission.teamId}\u0000${submission.problemId}`;
    const current = results.get(key) ?? { solved: false, wrong: false, earnedPrize: 0 };
    current.solved ||= submission.isCorrect;
    current.wrong ||= !submission.isCorrect;
    current.earnedPrize += submission.prizeAwarded;
    results.set(key, current);
  }

  const columnCount = report.problems.length + 2;
  const rows: Row[] = [
    titleRow("問題 × チーム", columnCount),
    contextRow(report, columnCount, "セル内の金額は、そのチームがその問題で実際に獲得・減点された合計です。"),
    [],
    [headerCell("順位"), headerCell("チーム"), ...report.problems.map((problem) => headerCell(problem.label))],
  ];

  for (const team of teams) {
    rows.push([
      dataCell(rankByTeam.get(team.teamId) ?? "", { align: "center" }),
      dataCell(team.teamName, { fontWeight: "bold" }),
      ...report.problems.map((problem) => {
        const result = results.get(`${team.teamId}\u0000${problem.problemId}`);
        return resultCell(result?.solved ?? false, result?.wrong ?? false, result?.earnedPrize ?? 0);
      }),
    ]);
  }

  return {
    sheet: "問題×チーム",
    data: rows,
    columns: [{ width: 8 }, { width: 22 }, ...report.problems.map(() => ({ width: 18 }))],
    stickyRowsCount: 4,
    stickyColumnsCount: 2,
    showGridLines: false,
    orientation: "landscape",
    zoomScale: 0.85,
  };
}

function buildProblemSummary(report: ReportResponse): Sheet<Blob> {
  const columns = [
    "問題",
    "状態",
    "正解チーム数",
    "誤答チーム数",
    "正解回答数",
    "不正解回答数",
    "登録済み不正解選択肢数",
    "賞金増減合計",
    "減点合計",
    "問題ID",
  ];
  const rows: Row[] = [titleRow("問題別集計", columns.length), contextRow(report, columns.length), [], columns.map(headerCell)];
  for (const problem of report.problems) {
    rows.push([
      dataCell(problem.label, { fontWeight: "bold" }),
      dataCell(problem.enabled ? "有効" : "無効", { align: "center" }),
      dataCell(problem.solvedTeamCount, { type: Number, align: "right" }),
      dataCell(problem.wrongTeamCount, { type: Number, align: "right" }),
      dataCell(problem.correctCount, { type: Number, align: "right" }),
      dataCell(problem.incorrectCount, { type: Number, align: "right" }),
      dataCell(problem.wrongChoiceCount, { type: Number, align: "right" }),
      moneyCell(problem.awardedPrize),
      moneyCell(problem.totalPenalty),
      dataCell(problem.problemId),
    ]);
  }
  return {
    sheet: "問題別集計",
    data: rows,
    columns: [
      { width: 30 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 },
      { width: 14 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 38 },
    ],
    stickyRowsCount: 4,
    showGridLines: false,
    orientation: "landscape",
  };
}

function buildSubmissionHistory(report: ReportResponse): Sheet<Blob> {
  const columns = [
    "回答日時",
    "チーム",
    "回答コード",
    "問題",
    "判定",
    "登録状況",
    "本来の賞金",
    "実加算・減算額",
    "回答メモ",
    "チームID",
    "問題ID",
    "パターンID",
  ];
  const rows: Row[] = [titleRow("回答履歴", columns.length), contextRow(report, columns.length), [], columns.map(headerCell)];
  for (const submission of report.submissions) {
    const correctStyle = submission.isCorrect
      ? { backgroundColor: COLORS.green, textColor: COLORS.greenText }
      : { backgroundColor: COLORS.red, textColor: COLORS.redText };
    rows.push([
      dateCell(submission.submittedAt),
      dataCell(submission.teamName),
      dataCell(submission.code, { type: String, format: "@", align: "center" }),
      dataCell(submission.problemLabel ?? "未登録コード"),
      dataCell(submission.isCorrect ? "正解" : "不正解", { align: "center", ...correctStyle }),
      dataCell(submission.registered ? "登録済み" : "未登録", { align: "center" }),
      submission.patternPrize === null ? dataCell("") : moneyCell(submission.patternPrize),
      moneyCell(submission.prizeAwarded),
      dataCell(submission.patternNote ?? "", { wrap: true }),
      dataCell(submission.teamId),
      dataCell(submission.problemId ?? ""),
      dataCell(submission.patternId ?? ""),
    ]);
  }
  return {
    sheet: "回答履歴",
    data: rows,
    columns: [
      { width: 20 }, { width: 22 }, { width: 12 }, { width: 30 }, { width: 10 }, { width: 12 },
      { width: 15 }, { width: 17 }, { width: 28 }, { width: 38 }, { width: 38 }, { width: 38 },
    ],
    stickyRowsCount: 4,
    showGridLines: false,
    orientation: "landscape",
  };
}

export function buildResultReportSheets(report: ReportResponse): Sheet<Blob>[] {
  return [
    buildOverview(report),
    buildRanking(report),
    buildTeamProblemMatrix(report),
    buildProblemSummary(report),
    buildSubmissionHistory(report),
  ];
}

export function resultReportFilename(now = new Date()): string {
  const part = (value: number) => String(value).padStart(2, "0");
  return `nazotoki-result-report-${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}.xlsx`;
}

/**
 * 書き出しが終わらないまま黙って止まるのを防ぐ。write-excel-file が内部で使う fflate は
 * 大きめのシートを blob: URL の Web Worker で圧縮するが、Worker の生成失敗（CSP で
 * blob: が拒否される等）は例外ではなく error イベントで通知され、fflate はそれを拾わない。
 * その場合コールバックが永久に呼ばれず、呼び出し側は「作成中」のまま固まる。
 * 実測では本番規模（回答700件超）でも1秒未満で終わるため、超過は異常とみなして失敗させる。
 */
const REPORT_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("レポートの書き出しが完了しませんでした。ページを再読み込みしてやり直してください。"));
    }, ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export async function downloadResultReport(report: ReportResponse): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await withTimeout(
    writeXlsxFile(buildResultReportSheets(report), {
      fontFamily: "Arial",
      fontSize: 10,
    }).toFile(resultReportFilename()),
    REPORT_TIMEOUT_MS,
  );
}
