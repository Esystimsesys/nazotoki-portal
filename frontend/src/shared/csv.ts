import type { Problem, ProblemStat, RankingEntry } from "../api/types";

/** CSVの1セルをエスケープする（カンマ・引用符・改行を含む場合は引用符で囲む） */
function cell(value: string | number | undefined | null): string {
  const s = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 問題一覧をCSV文字列に変換する。
 *
 * 列は **CSV取込と同じ `問題名,コード,判定,賞金,メモ`** に揃えてあり、
 * 出力したファイルをそのまま取込に再利用できる（バックアップ・一括編集用）。
 * 1行=1回答パターンで、同じ問題の行は連続して並ぶ。
 */
export function problemsToCsv(problems: Problem[]): string {
  const rows = [["問題名", "コード", "判定", "賞金", "メモ"].join(",")];
  for (const p of problems) {
    for (const pt of p.patterns) {
      rows.push(
        [
          cell(p.label),
          cell(pt.code),
          cell(pt.isCorrect ? "正解" : "不正解"),
          cell(pt.prize),
          cell(pt.note),
        ].join(","),
      );
    }
  }
  return rows.join("\r\n") + "\r\n";
}

/**
 * 最終順位をCSV文字列に変換する。
 *
 * イベント終了後に結果を残すための出力（画面のスクリーンショット以外の記録手段）。
 * 賞金は符号つきの生の整数で出す。画面表示は「+¥1,500」のように整形しているが、
 * CSVは表計算ソフトで並べ替え・集計されることを前提に数値のまま置く。
 * 順位は画面と同じ「合計賞金の降順」で、同額なら同順位にはせず通し番号にする
 * （集計元の ranking が既にソート済みなので、その並びをそのまま番号にする）。
 */
export function rankingToCsv(ranking: RankingEntry[]): string {
  const rows = [["順位", "チーム名", "正解数", "不正解数", "合計賞金"].join(",")];
  ranking.forEach((r, i) => {
    rows.push(
      [
        cell(i + 1),
        cell(r.teamName),
        cell(r.correctCount),
        cell(r.incorrectCount),
        cell(r.totalPrize),
      ].join(","),
    );
  });
  return rows.join("\r\n") + "\r\n";
}

/**
 * 問題別サマリをCSV文字列に変換する。
 *
 * 「どの問題が解かれ、どの問題が誰にも解かれなかったか」を振り返るための出力。
 * 次回の難易度調整の材料になるため、有効/無効の状態も併せて残す。
 */
export function problemStatsToCsv(stats: ProblemStat[]): string {
  const rows = [["問題", "状態", "正解数", "不正解数"].join(",")];
  for (const p of stats) {
    rows.push(
      [
        cell(p.label),
        cell(p.enabled ? "有効" : "無効"),
        cell(p.correctCount),
        cell(p.incorrectCount),
      ].join(","),
    );
  }
  return rows.join("\r\n") + "\r\n";
}

/**
 * 文字列をCSVファイルとしてダウンロードさせる。
 * Excelが文字化けしないよう先頭にBOMを付ける（日本語の問題名を含むため）。
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** `nazotoki-problems-20260726-1530.csv` のような日時つきファイル名を作る */
export function timestampedFilename(prefix: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.csv`;
}
