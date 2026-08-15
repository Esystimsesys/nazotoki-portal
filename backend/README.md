# nazotoki-portal backend

謎解きイベント用Webアプリのバックエンド（AWS Lambda / TypeScript / DynamoDB）。
実装の唯一の正は [`docs/01-api-contract.md`](../docs/01-api-contract.md)。設計背景は [`docs/00-design.md`](../docs/00-design.md)。

## 構成

```
backend/
├── shared/                  # 共通ロジック
│   ├── auth.ts              # JWT署名・検証、requireAuth(event, role?)
│   ├── answer-matching.ts   # 回答マッチング＋登録時コード重複バリデーション（純粋関数）
│   ├── answer-matching.test.ts
│   ├── dynamo.ts            # DynamoDBDocumentClient・Scan/Queryヘルパ・env取得
│   ├── http.ts               # レスポンス整形・イベントヘルパ・HttpError
│   └── password.ts          # scryptによるパスワードハッシュ化・検証
├── functions/
│   ├── admin-auth/index.ts  # POST /api/admin/login
│   ├── teams/index.ts       # チームログイン・チーム管理（admin）
│   ├── problems/index.ts    # 問題・回答パターンCRUD、CSV一括取込（admin）
│   └── submissions/index.ts # 回答受付（team）、集計・履歴（admin）
├── scripts/
│   ├── build.mjs            # esbuildで各関数をdist/index.mjsにバンドル
│   └── seed.ts               # 開発用: 既定管理者を投入
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## セットアップ

```sh
cd backend
npm install
```

## 環境変数

| 変数名 | 用途 |
| --- | --- |
| `TABLE_TEAMS` | Teamsテーブル名 |
| `TABLE_PROBLEMS` | Problemsテーブル名 |
| `TABLE_SUBMISSIONS` | Submissionsテーブル名 |
| `TABLE_ADMINS` | Adminsテーブル名 |
| `JWT_SECRET` | JWT署名用共有シークレット（HS256） |

各Lambda関数は契約ドキュメント（`docs/01-api-contract.md`）の表に従い、担当ルートに必要な環境変数のみを設定する。

## コマンド

```sh
npm run typecheck   # tsc --noEmit
npm test            # vitest run（answer-matching.ts の単体テスト）
npm run build       # esbuild で functions/*/dist/index.mjs にバンドル
```

## 開発用シード（既定管理者の投入）

Node.js 24.x はTypeScriptをネイティブに実行できるため、追加の依存（ts-node等）なしで直接実行できる。

```sh
TABLE_ADMINS=nazotoki-admins AWS_REGION=ap-northeast-1 node scripts/seed.ts
```

- 既定管理者: `username: admin` / `password: admin`
- 同名ユーザーが既に存在する場合は何もしない（重複作成を防ぐ）。
- ローカルではAWS認証情報（`AWS_PROFILE`等）とDynamoDBテーブルの存在が前提。

## 認証

- 自前JWT（HS256、`JWT_SECRET`で署名/検証）。Cognitoは使わない。
- `Authorization: Bearer <JWT>` を各Lambda内の `shared/auth.ts#requireAuth(event, role?)` で検証する。
- JWTペイロード: `{ role: 'team' | 'admin', teamId?, teamName?, adminId?, username?, iat, exp }`。有効期限24時間。
- `requireAuth` はトークン欠落/無効時に401相当、role不一致時に403相当の `HttpError` をthrowし、各ハンドラの `withErrorHandling` がレスポンスへ変換する。

## 回答マッチングロジック

`shared/answer-matching.ts` に純粋関数として実装（DynamoDB/HTTPに非依存）。

- `matchSubmission(code, enabledProblems, patterns, existingSubmissions)`: 一致0/1/複数件の判定、賞金重複加算防止。
- `validateNoDuplicateCodes(targetProblemId, targetCodes, targetEnabled, otherEnabledProblemSets)`: 登録時のコード重複バリデーション（同一問題内＋問題をまたいだ重複の両方を検出）。
- `findDuplicateCodesWithinPatterns` / `findDuplicateCodesAcrossProblems`: 上記2関数の内部でも使う個別ヘルパ（一括enabled切替・CSV取込でも直接利用）。

単体テスト（`shared/answer-matching.test.ts`）は以下を網羅する:

- 一致0件・1件・複数件（`createdAt`最速優先＋`console.warn`）
- 賞金の重複加算防止（同一patternId再一致時のprizeAwarded=0）
- 登録時コード重複バリデーション（新規登録・自問題編集の除外・一括有効化想定）

## 設計判断・契約上の補足

以下は契約ドキュメントに明記が無く、実装にあたって判断した点。

1. **CSV取込問題の`enabled`初期値**: 契約のCSVヘッダには`enabled`列が無いため、取込時は常に`enabled: true`として登録する。これにより「登録時コード重複バリデーション...CSV取込で使用」という契約の記述と整合させた（`enabled`が常にfalseなら重複検証が実質発生しないため）。
2. **CSV行番号**: `rowErrors[].row` は1行目をヘッダとして数える（先頭データ行 = 2行目）。
3. **CSV取込時の重複チェック範囲**: 取込バッチ内の重複に加え、既存の有効な問題ともコード重複が無いかを検証する（登録時バリデーションの一般ルールをCSV取込にも一貫適用）。
4. **`GET /api/admin/summary` の集計対象チーム**: 論理削除（`active: false`）されたチームも含めて全チームを集計する。設計ドキュメントに「削除済みチームの回答記録は残す」とあるため、管理者向け集計では削除後も実績が確認できることを優先した。
5. **`stats.maxPrize` の定義**: 契約に定義が無いため、「全問題（有効/無効問わず）について、正解パターンの賞金の最大値を合計した値」（＝全問正解した場合に得られる最大賞金の目安）として実装した。正解パターンが無い問題は0として扱う。
6. **`perProblem` / `problemStats` の対象**: enabled/disabledを問わず全問題を対象にした（無効化後の振り返り集計にも対応するため）。
7. **DELETE /api/admin/teams/{teamId} ・ regenerate-code の404**: 契約に404の明記は無いが、存在しないteamId指定時は404を返すようにした（他の管理系エンドポイントと一貫性を持たせるため）。
8. **CORSのOPTIONS処理**: 契約の「ローカル開発用にCORSヘッダーを付与してよい」という記述を受け、全Lambdaで`OPTIONS`メソッドに対して204（CORSヘッダー付き）を返す簡易プリフライト対応を追加した。
9. **回答コードの事前バリデーション**: `POST /api/submissions`で`code`が4桁数字の形式でない場合、契約に明記の無い400（`4桁の数字を指定してください`）を返す（契約が定義する400は「有効な問題が1件も無い場合」のみだが、明らかな不正入力を弾く防御的バリデーションとして追加。契約の200/401/400いずれの挙動とも矛盾しない）。

上記はいずれも契約と矛盾するものではなく、契約が明示していない部分を補ったものである。契約の記述と衝突する実装は無い。
