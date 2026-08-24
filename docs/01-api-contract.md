# API契約・実装仕様（フロント/バック/IaC共通の正）

このドキュメントは実装時の唯一の正（source of truth）。フロントエンド・バックエンド・IaCの3者はこの契約に厳密に従うこと。設計の背景は [00-design.md](00-design.md) を参照。

---

## 共通事項

- ベースパス: すべてのAPIは `/api` プレフィックス配下（CloudFrontが `/api/*` をAPI Gatewayへプロキシ）。例: `POST /api/auth/team-login`。
- 認証: `Authorization: Bearer <JWT>` ヘッダー。JWTはHS256、共有シークレット（環境変数 `JWT_SECRET`）で署名/検証。
  - JWTペイロード: `{ role: 'team' | 'admin', teamId?: string, teamName?: string, adminId?: string, username?: string, iat, exp }`
  - 有効期限: 24時間（`exp`）。
- レスポンスは常にJSON。エラー時は `{ "error": "<message>" }` とHTTPステータス（400/401/403/404/409/500）。
- CORS: 同一オリジン配信のため本番では不要だが、ローカル開発用に全Lambdaの共通レスポンスヘッダーで `Access-Control-Allow-Origin` 等を付与してよい。
- 日時: ISO 8601文字列（例 `2026-07-24T13:05:00.000Z`）。

---

## DynamoDB テーブル（4テーブル・オンデマンド）

論理名 → 物理名は `nazotoki-<logical>`（例 `nazotoki-teams`）。Lambdaには環境変数でテーブル名を渡す。

### 1. Teams テーブル（env: `TABLE_TEAMS`）
- PK: `pk` (S) = `TEAM#<teamId>`
- 属性: `teamId` (S), `teamName` (S), `loginCode` (S, 一意), `active` (BOOL), `createdAt` (S)
- GSI: `LoginCodeIndex` — PK: `loginCode` (S)（ログイン時のコード→チーム解決に使用）

### 2. Problems テーブル（env: `TABLE_PROBLEMS`）— 問題メタ＋回答パターンを単一テーブルで保持
- PK: `pk` (S) = `PROBLEM#<problemId>`、SK: `sk` (S)
- 問題メタ行: `sk` = `META`。属性: `problemId` (S), `label` (S), `enabled` (BOOL), `createdAt` (S)
- 回答パターン行: `sk` = `PATTERN#<patternId>`。属性: `problemId` (S), `patternId` (S), `code` (S, 4桁ゼロ埋め), `isCorrect` (BOOL), `prize` (N, マイナス可), `note` (S, 任意)
- **イベント状態行**: `pk` = `EVENT`, `sk` = `STATE`（全体で1件のみ）。属性: `running` (BOOL), `startedAt` (S|NULL), `endedAt` (S|NULL), `updatedAt` (S)。行が無い場合は `running: false`（未開始）とみなす。
  - 専用テーブルを作らずここに置くのは、状態が常に1件でアクセスパターンも単純なため（テーブル・IAM・環境変数を増やすコストに見合わない）。`sk` が `META` でも `PATTERN#` 始まりでもないので、既存のScan（問題メタ行・パターン行だけを拾う）からは自然に除外される。
- データ量が小さいため、有効問題＋パターンの取得は `Scan` で可（アクセスパターンが単純）。

### 3. Submissions テーブル（env: `TABLE_SUBMISSIONS`）
- PK: `pk` (S) = `TEAM#<teamId>`、SK: `sk` (S) = `SUBMISSION#<submittedAt>#<submissionId>`
- 属性: `submissionId` (S), `teamId` (S), `code` (S), `problemId` (S|null), `patternId` (S|null), `isCorrect` (BOOL), `prizeAwarded` (N), `submittedAt` (S)

### 4. Admins テーブル（env: `TABLE_ADMINS`）
- PK: `pk` (S) = `ADMIN#<adminId>`
- 属性: `adminId` (S), `username` (S, 一意), `passwordHash` (S), `createdAt` (S)
- GSI: `UsernameIndex` — PK: `username` (S)

---

## Lambda関数（4関数・Node.js 24.x・TypeScript・esbuildバンドル）

機能ドメイン単位で分割。各関数内でHTTPメソッド/パスを見て簡易ルーティング。ハンドラは `index.handler`（API Gateway HTTP API payload format v2.0）。

| 関数（物理名） | 担当ルート | 環境変数 |
| --- | --- | --- |
| `nazotoki-admin-auth` | `POST /api/admin/login` | `TABLE_ADMINS`, `JWT_SECRET` |
| `nazotoki-teams` | `POST /api/auth/team-login`、`GET/POST /api/admin/teams`、`DELETE /api/admin/teams/{teamId}`、`POST /api/admin/teams/{teamId}/regenerate-code` | `TABLE_TEAMS`, `JWT_SECRET` |
| `nazotoki-problems` | `GET/POST /api/admin/problems`、`PUT/DELETE /api/admin/problems/{problemId}`、`PUT /api/admin/problems/{problemId}/enabled`、`PUT /api/admin/problems/enabled`（一括）、`POST /api/admin/problems/csv`、`GET /api/event`、`PUT /api/admin/event` | `TABLE_PROBLEMS`, `JWT_SECRET` |
| `nazotoki-submissions` | `POST /api/submissions`、`GET /api/admin/summary`、`GET /api/admin/teams/{teamId}/submissions` | `TABLE_SUBMISSIONS`, `TABLE_PROBLEMS`, `TABLE_TEAMS`, `JWT_SECRET` |

共通ロジックは `backend/shared/` に集約:
- `auth.ts`: JWT署名・検証、`requireAuth(event, role?)` ミドルウェア（`Authorization`検証、role不一致で403 throw）。
- `answer-matching.ts`: 回答マッチング・登録時コード重複バリデーション（下記ロジック参照）。純粋関数として単体テスト可能に。
- `dynamo.ts`: DynamoDBDocumentClient生成・共通ヘルパ。
- `http.ts`: レスポンス整形（`ok(body)`, `err(status, message)`）、イベントからのbody/パスパラメータ取得。
- `password.ts`: パスワードハッシュ化・検証（Node標準 `crypto` の scrypt を使用、外部依存を増やさない）。

依存パッケージ: `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `jsonwebtoken`（と `@types/jsonwebtoken`）, `papaparse`（CSVパース、任意）, `esbuild`, `vitest`, `typescript`。

---

## エンドポイント詳細

### 認証

**POST /api/admin/login**
- req: `{ "username": string, "password": string }`
- res 200: `{ "token": string, "admin": { "adminId": string, "username": string } }`
- res 401: 認証失敗。

**POST /api/auth/team-login**
- req: `{ "loginCode": string }`
- res 200: `{ "token": string, "team": { "teamId": string, "teamName": string } }`
- res 401: コード不一致、または `active=false`。

### チーム管理（admin）

**GET /api/admin/teams** → res 200: `{ "teams": Team[] }`
- `Team = { teamId, teamName, loginCode, active, createdAt }`

**POST /api/admin/teams**
- req: `{ "teamName": string }`
- res 201: `{ "team": Team }`（`loginCode` はサーバーが自動生成: 6桁英大文字＋数字、一意）

**DELETE /api/admin/teams/{teamId}** → res 200: `{ "ok": true }`
- 論理削除（`active=false`）。回答記録は残す。

**POST /api/admin/teams/{teamId}/regenerate-code** → res 200: `{ "team": Team }`（新 `loginCode`）

### 問題管理（admin）

**GET /api/admin/problems** → res 200: `{ "problems": Problem[] }`
- `Problem = { problemId, label, enabled, createdAt, patterns: Pattern[] }`
- `Pattern = { patternId, code, isCorrect, prize, note }`

**POST /api/admin/problems**
- req: `{ "label": string, "enabled": boolean, "patterns": { "code": string, "isCorrect": boolean, "prize": number, "note"?: string }[] }`
- res 201: `{ "problem": Problem }`
- res 409: 登録しようとしたコードが**他の問題（有効・無効を問わず）**のコードと重複（`{ "error": "...", "conflicts": string[] }`）。

**PUT /api/admin/problems/{problemId}**
- req: POSTと同じ形（全置換）。res 200: `{ "problem": Problem }`。重複時 409。

**DELETE /api/admin/problems/{problemId}** → res 200: `{ "ok": true }`（メタ行＋パターン行を物理削除）

**PUT /api/admin/problems/{problemId}/enabled**
- req: `{ "enabled": boolean }`
- res 200: `{ "problem": Problem }`。コードは登録時点で全問題を横断して一意なため、通常この操作で409にはならない（既存データに重複が残っている場合の防御としてのみ409）。

**PUT /api/admin/problems/enabled**（一括）
- req: `{ "enabled": boolean }`（全問題を一括で有効/無効）
- res 200: `{ "problems": Problem[] }`。一括有効化で重複が生じる場合は 409（どれも変更しない）。

**POST /api/admin/problems/csv**
- req: `{ "csv": string }`（本文はCSVテキスト。ヘッダ行: `問題名,コード,判定,賞金,メモ`。判定は `正解`/`不正解`。同一問題名の行はまとめて1問題に）
  - **コード列の自動採番**: コードが空欄、または `auto` / `random` / `ランダム`（大文字小文字は区別しない）の場合、サーバーが未使用の4桁を自動で割り当てる。採番時は**既存の全問題（有効・無効を問わず）のコードとCSV内で明示指定されたコード**を避ける（無効な問題のコードも避けるのは、後でその問題を有効化したときに重複エラーになるのを防ぐため）。割り当てた値はレスポンスの `problems[].patterns[].code` で確認できる。
- res 200: `{ "imported": number, "problems": Problem[] }`
- res 400: バリデーションエラー `{ "error": string, "rowErrors": { "row": number, "message": string }[] }`（重複コード・不正な行を一覧化。エラーがあれば1件も取り込まない）

### イベントの開始/終了（ゲームゲート）

問題ごとの `enabled` とは**独立した軸**。`enabled` は「その問題を出題対象に含めるか」、`running` は「いま回答を受け付ける時間帯か」を表す。

分けている理由: 全問題をあらかじめ有効にしておき開始時刻に一斉受付を始めたい一方で、特定の問題だけイベント途中から追加投入したいことがある。1つのフラグで兼ねると、開始/終了のたびに全問題の `enabled` を設定し直すことになり、「途中から出す予定だった問題」まで巻き込んで有効化されてしまう。

回答受付の判定順は **`running` → 問題ごとの `enabled`**（`running: false` なら有効な問題が何問あっても受け付けない）。

**GET /api/event**（team / admin 共通。roleは問わず有効なトークンであればよい）
- res 200: `{ "event": { "running": boolean, "startedAt": string|null, "endedAt": string|null } }`
- 参加者の回答画面が「開始までお待ちください」「イベント終了」を出すために参照する。

**PUT /api/admin/event**（admin）
- req: `{ "running": boolean }`
- res 200: `{ "event": EventState }`
- `startedAt` / `endedAt` は切り替えた側だけを更新し、もう一方は直前の値を残す（終了後も「何時に開始したか」を画面に出せるようにするため）。
- 既定は **未開始（`running: false`）**。開始は管理者の明示的な操作であるべきで、デプロイ直後に受付が開いている方が事故（開始前のフライング回答）につながるため。

### 回答（team）

**POST /api/submissions**
- req: `{ "code": string }`（4桁）
- 処理: [回答マッチングロジック](#回答マッチングロジック) に従う。
- res 200: `{ "isCorrect": boolean, "alreadyAnswered": boolean }`（**賞金額は返さない**）
  - `alreadyAnswered`: 同じ4桁を**そのチームが過去に送信済み**なら `true`。一度試した番号を打ち直したことに気づけるようにするためのフラグ。未登録コード（どの問題にも一致しない番号）も対象。他チームの回答状況は一切反映しない。
  - **`alreadyAnswered: true` のときはSubmissionレコードを作成しない**（同じ番号の記録は1チームにつき1件だけ）。賞金は重複加算防止により2回目以降どのみち0であり、同じ番号で履歴が埋まるのを防ぐため。判定結果（`isCorrect`）は通常どおり返す。この結果、`GET /admin/summary` の `submissionCount` は「試した番号の種類数」を表す。
- res 403: **イベントが開始されていない/終了している場合**（`running: false`）`{ "error": "イベントはまだ開始されていません" }` または `{ "error": "イベントは終了しました" }`（記録もしない）。問題ごとの `enabled` より先に判定する。
- res 400: 有効な問題が1件も無い場合 `{ "error": "現在受付中の問題はありません" }`（記録もしない）。

### 集計（admin）

**GET /api/admin/summary** → res 200:
```json
{
  "event": { "running": boolean, "startedAt": string|null, "endedAt": string|null },
  "ranking": [
    { "teamId": string, "teamName": string, "correctCount": number,
      "incorrectCount": number, "totalPrize": number }
  ],
  "problemStats": [
    { "problemId": string, "label": string, "enabled": boolean,
      "correctCount": number, "incorrectCount": number }
  ],
  "stats": { "teamCount": number, "submissionCount": number,
             "enabledProblemCount": number, "totalProblemCount": number,
             "maxPrize": number }
}
```
- `ranking` は `totalPrize` 降順。

**GET /api/admin/teams/{teamId}/submissions** → res 200:
```json
{
  "team": { "teamId": string, "teamName": string },
  "perProblem": [ { "problemId": string, "label": string, "solved": boolean } ],
  "log": [ { "submittedAt": string, "code": string, "isCorrect": boolean,
            "problemId": string|null, "prizeAwarded": number } ]
}
```
- `log` は新しい順。
- `perProblem` は問題ごとに「正解済みかどうか」だけを返す（問題番号の自然順）。**挑戦回数は返さない**: 参加者は問題を指定せず4桁のみを入力する仕様上、どの問題にも一致しない番号は `problemId: null` となりどの問題にも計上できないため、回数を出すと「その問題に登録されたコードを何種類踏んだか」（上限＝その問題のパターン数）にしかならず、苦戦の度合いと誤解される。実際の試行内容は `log` で確認する。

---

## 回答マッチングロジック（`answer-matching.ts`・純粋関数で単体テスト必須）

入力: 入力コード `code`、有効な全問題とパターン、当該チームの既存Submission一覧。

1. `enabled=true` の全問題のパターンから `code` 一致を探す。
2. 一致0件: 未登録回答。`{ problemId: null, patternId: null, isCorrect: false, prizeAwarded: 0 }` で記録。
3. 一致1件: そのパターンで判定。
4. 一致複数件（登録時バリデーションで通常起きない）: `createdAt` が最も早い問題の一致を採用し、`console.warn` で警告。
5. **賞金の重複加算防止**: 当該チームの既存Submissionに同一 `patternId` の記録が既にあれば `prizeAwarded = 0`（再挑戦は自由だが同一パターンの賞金は初回のみ）。初回一致なら `prizeAwarded = pattern.prize`。
6. `isCorrect` は一致パターンの `isCorrect`（一致0件はfalse）。

登録時コード重複バリデーション（`POST/PUT /problems`、一括enabled、CSV取込で使用）:
- **有効・無効を問わず全問題を横断**して、同一 `code` が複数問題に存在してはならない。違反時は 409（CSVは400・行エラー）。同一問題内の重複も不可。
- 無効な問題を対象から外していた時期があったが、その場合「無効なうちは重複コードを登録でき、有効化しようとした瞬間に初めて409で弾かれる」ことになる。イベント中に問題を追加投入する運用では事故になりやすいため、登録時点で必ず弾く方式に統一した。

---

## テスト・検証

- backend: `answer-matching.ts` の単体テスト（vitest）を必須とし、一致0/1/複数件・賞金重複加算防止・登録時重複検出を網羅。`npm test` で緑。
- backend: `npm run typecheck`（`tsc --noEmit`）が通ること。`npm run build`（esbuild で各関数を `dist/` にバンドル）が通ること。
- frontend: `npm run build`（`vite build`）が通ること。`VITE_API_BASE`（既定 `/api`）でAPIベースを切替可能に。
- 開発用: 既定管理者を投入する `scripts/seed.ts`（username: `admin` / password: `admin` 等、READMEに明記）を用意。
