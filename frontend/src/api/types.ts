// ドメイン型定義（docs/01-api-contract.md 準拠。この契約が唯一の正）

export interface Team {
  teamId: string;
  teamName: string;
  loginCode: string;
  active: boolean;
  createdAt: string;
}

export interface Pattern {
  patternId: string;
  code: string;
  isCorrect: boolean;
  prize: number;
  note?: string;
}

export interface Problem {
  problemId: string;
  label: string;
  enabled: boolean;
  createdAt: string;
  patterns: Pattern[];
}

/** POST/PUT /admin/problems のリクエストボディ（全置換） */
export interface ProblemInput {
  label: string;
  enabled: boolean;
  patterns: PatternInput[];
}

export interface PatternInput {
  code: string;
  isCorrect: boolean;
  prize: number;
  note?: string;
}

export interface AdminUser {
  adminId: string;
  username: string;
}

export interface TeamLoginResponse {
  token: string;
  team: { teamId: string; teamName: string };
}

export interface AdminLoginResponse {
  token: string;
  admin: AdminUser;
}

/** POST /submissions の応答。賞金額は返らない（参加者には正誤と回答済みかどうかのみ） */
export interface SubmissionResult {
  isCorrect: boolean;
  /** 同じ4桁を自チームが過去に送信済みなら true（他チームの状況は反映しない） */
  alreadyAnswered: boolean;
}

export interface RankingEntry {
  teamId: string;
  teamName: string;
  correctCount: number;
  incorrectCount: number;
  totalPrize: number;
}

export interface ProblemStat {
  problemId: string;
  label: string;
  enabled: boolean;
  correctCount: number;
  incorrectCount: number;
}

export interface SummaryStats {
  teamCount: number;
  submissionCount: number;
  enabledProblemCount: number;
  totalProblemCount: number;
  maxPrize: number;
}

/**
 * イベント全体の開始/終了状態。問題ごとの `enabled` とは独立した軸で、
 * `running` が false の間は有効な問題があっても回答を受け付けない。
 */
export interface EventState {
  running: boolean;
  startedAt: string | null;
  endedAt: string | null;
}

export interface SummaryResponse {
  event: EventState;
  ranking: RankingEntry[];
  problemStats: ProblemStat[];
  stats: SummaryStats;
}

/** そのチームが実際に踏んだ登録パターン1件（未登録コードは含まれない） */
export interface TeamPatternHit {
  code: string;
  isCorrect: boolean;
  /** そのパターン本来の賞金 */
  prize: number;
  /** 実際に加算された額（同一パターンの2回目以降は0） */
  prizeAwarded: number;
  note?: string;
  submittedAt: string;
}

export interface TeamSubmissionsPerProblem {
  problemId: string;
  label: string;
  enabled: boolean;
  solved: boolean;
  /** この問題で増減した賞金の合計（マイナスパターンを踏んでいれば負になりうる） */
  earnedPrize: number;
  hits: TeamPatternHit[];
}

export interface TeamSubmissionsTotals {
  solvedCount: number;
  problemCount: number;
  penaltyCount: number;
  gainedPrize: number;
  lostPrize: number;
  totalPrize: number;
}

export interface TeamSubmissionsLogEntry {
  submittedAt: string;
  code: string;
  isCorrect: boolean;
  problemId: string | null;
  prizeAwarded: number;
}

export interface TeamSubmissionsResponse {
  team: { teamId: string; teamName: string };
  totals: TeamSubmissionsTotals;
  perProblem: TeamSubmissionsPerProblem[];
  log: TeamSubmissionsLogEntry[];
}

export interface CsvImportResponse {
  imported: number;
  problems: Problem[];
}

export interface CsvRowError {
  row: number;
  message: string;
}

/** エラーレスポンス（`{ "error": "<message>" }` + 任意で conflicts / rowErrors） */
export interface ApiErrorBody {
  error: string;
  conflicts?: string[];
  rowErrors?: CsvRowError[];
}

/** JWTペイロード（docs/01-api-contract.md の共通事項参照。検証はせずクライアント側表示にのみ使う） */
export interface JwtPayload {
  role: "team" | "admin";
  teamId?: string;
  teamName?: string;
  adminId?: string;
  username?: string;
  iat: number;
  exp: number;
}
