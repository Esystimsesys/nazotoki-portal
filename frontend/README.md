# 謎解きナイト フロントエンド

謎解きイベント用Webアプリの参加者/管理者フロントエンド。React 19 + Vite + TypeScript + MUI + TanStack Query + React Router 構成。
API契約は [`../docs/01-api-contract.md`](../docs/01-api-contract.md) が唯一の正。

## セットアップ

```bash
cd frontend
npm install
```

## 開発起動

```bash
npm run dev
```

`http://localhost:5173` で起動する。既定では `vite.config.ts` の開発用プロキシにより `/api/*` へのリクエストは `http://localhost:3000`（バックエンドLambdaをローカル実行する場合のポート例）へ転送される。転送先を変えたい場合は環境変数 `VITE_DEV_API_PROXY_TARGET` を指定する。

バックエンドが未起動でも画面は開ける（API呼び出し失敗時はアラート表示になるだけで、画面自体はクラッシュしない作りになっている）。

## ビルド

```bash
npm run build
```

`tsc -b`（型チェック）→ `vite build` の順で実行される。`dist/` に静的ファイルが出力される（本番はCloudFront+S3で配信）。

## API接続先の切り替え

`.env.local`（`.env.local.example` をコピーして作成）で `VITE_API_BASE` を設定する。既定値は `/api`。

```
VITE_API_BASE=/api
```

CloudFront配信（`/api/*` をAPI Gatewayへプロキシ）ではこの既定値のままでよい。バックエンドを別オリジンで直接叩く場合はフルURL（例 `http://localhost:3000/api`）を指定する。

## 認証の扱い

- 参加者ログイン（`POST /api/auth/team-login`）と管理者ログイン（`POST /api/admin/login`）は完全に別トークンとして扱う（`localStorage` のキーも `nazotoki.teamToken` / `nazotoki.adminToken` で分離）。
- JWTはメモリ＋`localStorage`に保持する低セキュリティ方針（社内イベント用途のため）。ペイロードはクライアント側で署名検証せずにデコードし、`role`/`teamId`/`teamName` 等の表示情報と有効期限チェックにのみ使う（実際の検証はバックエンド `backend/shared/auth.ts` が行う）。
- ルーティングガードも participant用（`/login`, `/answer`）と admin用（`/admin/login`, `/admin/*`）で完全に分離している（`src/app/router.tsx`）。

## 画面構成

- 参加者
  - `/login`: チーム共有コード入力
  - `/answer`: 単一の回答画面（4桁テンキー、正解/不正解演出）。合計賞金・回答履歴は表示しない。
- 管理者
  - `/admin/login`: 管理者ログイン
  - `/admin/problems`: 問題一覧・新規/編集・有効/無効トグル・一括有効化/無効化・CSV取込
  - `/admin/teams`: チーム一覧・追加・削除（確認ダイアログ）・コード再発行
  - `/admin/dashboard`: ランキング・問題別サマリ・チーム詳細ドリルダウン

## ディレクトリ構成

```
src/
  api/           APIクライアント（契約の型・エンドポイント呼び出し）
  app/           テーマ・ルーター・QueryClient
  features/      画面ごとの機能単位（team-auth / admin-auth / answer / admin-problems / admin-teams / admin-dashboard）
  shared/        共通コンポーネント（NeonPanel, ConfirmDialog, ApiErrorAlert）・レイアウト・フォーマッタ
```

## 既知の割り切り（モック/契約との差分）

- 回答パターンの編集・削除はAPI契約上「問題全体をPUTで全置換」する仕様のため、モックにあった行単位の✏️/🗑️アイコンは実装せず、問題の「編集」モーダル内でパターン配列ごとまとめて編集する形にしている。
- ダッシュボードは `GET /admin/summary` の `problemStats`（問題別正誤サマリ）もモックにはないテーブルとして追加表示している（設計ドキュメントの要件に対応するため）。
- 参加者ログイン画面の `maxLength` はモックの6桁決め打ちをやや緩め（12桁）にしている。ログインコードの桁数はバックエンド仕様に依存するため。
