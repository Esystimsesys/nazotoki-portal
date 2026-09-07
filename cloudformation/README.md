# CloudFormation（nazotoki-portal）

謎解きイベント用Webアプリのインフラ一式。素のCloudFormation + [rain](https://github.com/aws-cloudformation/rain) で管理する（`ekiden-portal/cloudformation` の型を踏襲。SAM不使用）。リージョンは `ap-northeast-1` のみ（テンプレート配置は `templates/apne1/`）。

ekiden-portalとの最大の違いは **Cognitoスタックが無いこと**。認証は各Lambda内の自前JWT検証（HS256、共有シークレット）で行うため、API GatewayにネイティブJWT Authorizerは付けず、全ルートを `AuthorizationType: NONE` でLambdaへ素通しする。詳細は [docs/00-design.md](../docs/00-design.md)・[docs/01-api-contract.md](../docs/01-api-contract.md) を参照。

## 構成

```text
cloudformation/
├── templates.conf              # スタック名・リージョンをデプロイ順に列挙
├── deploy.sh                   # templates.conf の順に rain deploy
├── delete.sh                   # 逆順に rain rm（フロントエンドS3バケットは事前に空にする）
├── scripts/
│   ├── build-backend.sh        # !Rain::S3 の Run から呼ばれるLambdaビルドスクリプト
│   ├── test-oidc.py             # OIDC信頼条件の回帰テスト（PyYAMLが必要）
│   └── lint.sh                 # cfn-lint（rain独自タグをダミー値に置換してから実行）
├── buildspec-backend.yaml      # 旧CodeBuild用（現行Actionsは使用しない）
├── buildspec-frontend.yaml     # CodeBuild: viteビルド → S3 sync → invalidation
└── templates/apne1/
    ├── nazotoki-cfn-dynamodb.yaml    # 4テーブル（Teams/Problems/Submissions/Admins）、全てPAY_PER_REQUEST
    ├── nazotoki-cfn-lambda-api.yaml  # Lambda 4関数 / HTTP API（Authorizerなし）/ 関数別実行ロール
    ├── nazotoki-cfn-cloudfront.yaml  # フロントエンドS3(OAC) + ディストリビューション + SPA用CF Function
    └── nazotoki-cfn-code.yaml        # CI/CD（CodeCommit + CodeBuild×2 + CodePipeline）※templates.confには含めない
```

アプリケーションスタックは3つ（`templates.conf` で管理。ekiden-portalの6スタックからCognito・独立S3スタックを省略した簡略版）:

1. `nazotoki-cfn-dynamodb` — 依存なし。
2. `nazotoki-cfn-lambda-api` — dynamodbスタックのOutputs（テーブル名/ARN）に依存。
3. `nazotoki-cfn-cloudfront` — lambda-apiスタックのOutput（`ApiDomainName`）に依存。フロントエンドバケットもこのスタックに同居させている（下記「s3⇔cloudfrontの循環回避」参照）。

加えて CI/CD スタック `nazotoki-cfn-code` があるが、これは **`templates.conf` に含めない**（下記「CI/CD」参照）。

## 前提ツール

- AWS CLI（デプロイ先アカウントで認証済み）
- [rain](https://github.com/aws-cloudformation/rain)（`brew install rain`）
- Node.js（Lambdaビルド用。`backend/` の依存を解決できること。`nodejs24.x` ランタイムに合わせ、ローカルのビルド環境もNode 24系を推奨）
- `openssl`（`JWT_SECRET` 生成用。macOS/Linux標準搭載）
- （任意）`cfn-lint` — テンプレートのlintに使用。`pip install cfn-lint` でインストール可能。

## デプロイ手順

```bash
cd cloudformation
export JWT_SECRET=$(openssl rand -hex 32)   # 推奨: 明示的に生成・保存してから実行
./deploy.sh
```

- `JWT_SECRET` を明示的に `export` しない場合、`deploy.sh` が実行のたびに新しいシークレットを自動生成して使う。**再デプロイのたびに値が変わる**と、発行済みJWT（有効期限24時間）が無効化される（実害は軽微だが、意図せぬ再ログインを避けたいなら必ず `JWT_SECRET` を固定して渡すこと）。CloudFormationのNoEchoパラメータは `describe-stacks` で読み返せないため、このスクリプト側で前回値を自動的に引き継ぐことはできない。パスワードマネージャや`.env.local`（Git管理外）などに保存して毎回同じ値を使うことを推奨する。
- 特定スタックのみ実行したい場合は `templates.conf` を参照しつつ `rain deploy` を直接叩いてもよい（各スタックが要求するパラメータは `deploy.sh` の `build_params()` を参照）。
- 削除は `./delete.sh`（逆順で `rain rm`。フロントエンドバケットを先に空にする）。

## フロントエンドのビルド・配置・invalidation

このリポジトリでは同一ドメイン配信（CloudFrontが `/api/*` をAPI Gatewayへプロキシ）を前提にしているため、`frontend/.env` の `VITE_API_BASE` は **常に `/api` 固定でよい**（バックエンドのAPI URLをフロントに渡す必要はない。CloudFrontとAPI Gatewayが同一オリジンにまとまっているため、ekiden-portalのような「APIドメインをフロントの環境変数に注入する」手順は不要）。

```bash
cd frontend
npm ci
npm run build            # VITE_API_BASE=/api（既定値）でビルド

# デプロイ済みの nazotoki-cfn-cloudfront スタックのOutputsからバケット名/ディストリビューションIDを取得
FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name nazotoki-cfn-cloudfront --region ap-northeast-1 \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" --output text)
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name nazotoki-cfn-cloudfront --region ap-northeast-1 \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)

aws s3 sync dist/ "s3://${FRONTEND_BUCKET}/" --delete
aws cloudfront create-invalidation --distribution-id "${DISTRIBUTION_ID}" --paths "/*"
```

- 公開URLは `nazotoki-cfn-cloudfront` スタックのOutput `AppUrl` で確認できる。

## 初期管理者ユーザーの投入

`nazotoki-admin-auth` Lambdaは `POST /api/admin/login` のみを提供し、管理者を作成するAPIエンドポイントは存在しない（契約上、管理者作成用ルートは無い）。初期管理者は `backend/scripts/seed.ts`（docs/01-api-contract.md 記載）をローカルから直接実行し、`nazotoki-admins` テーブルへ投入する運用にする。

```bash
cd backend
TABLE_ADMINS=nazotoki-admins npm run seed   # backend側のスクリプト・package.jsonに準拠
```

## スタック間の値の受け渡し（Outputs → Parameters 方式）

ekiden-portal同様、**クロススタック参照（Export/ImportValue）は使わない**。`deploy.sh` が既デプロイスタックのOutputsを `aws cloudformation describe-stacks` で取得し、後続スタックのParametersとして渡す。

| 受け取り側スタック | パラメータ | 供給元スタック（Output） |
| --- | --- | --- |
| lambda-api | 4テーブルの Name/Arn | dynamodb（`TeamsTableName`/`TeamsTableArn` ほか） |
| lambda-api | `JwtSecret` | `deploy.sh` 実行時の `JWT_SECRET` 環境変数（他スタックのOutputではない） |
| cloudfront | `ApiDomainName` | lambda-api |

ekiden-portalにあった cognito⇔lambda-api / cognito⇔cloudfront の値の循環（2パスデプロイが必要だった部分）は、Cognitoが無いためnazotoki-portalには存在しない。**dynamodb → lambda-api → cloudfront の単方向1パスのみ**でデプロイが完了する。

## s3⇔cloudfrontの循環回避

ekiden-portalは「フロントエンドバケットのバケットポリシーがDistribution ARNを要し、Distributionはバケットのドメイン名を要する」循環を、S3スタックとCloudFrontスタックを分けたうえでバケットポリシーだけをcloudfrontスタック側に置くことで回避していた。nazotoki-portalではそもそも独立したS3スタックを作らず、**フロントエンドバケットを`nazotoki-cfn-cloudfront`スタック自身に同居させている**ため、同一スタック内で `!Ref frontendBucket` と `!Ref distribution` を両方参照でき、循環そのものが発生しない（ekiden-portalより一段シンプル）。

## Lambdaのパッケージング（`!Rain::S3`）

ekiden-portalと同じ方式。`Code: !Rain::S3 { Path, Run, BucketProperty, KeyProperty }` を使用する。rainの仕様（cft/pkg/directives.go）では **`Run` はシェルコマンドではなく「テンプレートディレクトリからの相対パスで指す実行可能スクリプト」**で、cwd=テンプレートディレクトリ・引数なしで実行される。そのため `scripts/build-backend.sh` を1本用意し、`backend/` で `npm run build`（esbuildで各関数を `backend/functions/<name>/dist` に単一バンドル）を実行してから `Path`（各関数の `dist/`）をzip・アップロードする。

- スクリプトはディレクティブごと（関数ごと、4回）に呼ばれるが冪等（2回目以降はesbuild再実行のみ、`npm ci`/`npm install`は`node_modules`が無い初回のみ）。
- 各Lambda関数のコードディレクトリは `backend/functions/<domain>/dist` を前提にしている（`admin-auth` / `teams` / `problems` / `submissions`。物理関数名の `nazotoki-` プレフィックスを除いたドメイン名がディレクトリ名という前提。backend側の実装がこの命名と異なる場合はテンプレートの `Path` を合わせて調整すること）。

## IAMロール（関数ごとに最小権限）

ekiden-portalは全関数共通の単一実行ロールだったが、nazotoki-portalでは**関数ごとに個別の実行ロール**を作り、その関数が実際に使う環境変数のテーブルにのみ権限を絞っている（docs/01-api-contract.md の関数別env var表に対応）:

| 関数 | ロール | 権限範囲 |
| --- | --- | --- |
| `nazotoki-admin-auth` | `nazotoki-admin-auth-exec-role` | Admins テーブル + `UsernameIndex` の読み取り専用（`GetItem`/`Query`。管理者作成APIが無いため書き込み不要） |
| `nazotoki-teams` | `nazotoki-teams-exec-role` | Teams テーブル + `LoginCodeIndex` のCRUD |
| `nazotoki-problems` | `nazotoki-problems-exec-role` | Problems テーブルのCRUD（+ CSV一括取込用の `BatchWriteItem`） |
| `nazotoki-submissions` | `nazotoki-submissions-exec-role` | Submissions テーブルのCRUD、Problems/Teams テーブル（+ `LoginCodeIndex`）の読み取り専用（集計・回答マッチングに使用） |

DynamoDBの `Query` をGSIに対して実行するにはテーブルARN自体だけでなく `<TableArn>/index/*` もIAMポリシーのResourceに含める必要があるため、Teams/Adminsロールにはそれぞれ明示的に含めている。

## ルーティング上の注意（`PUT /api/admin/problems/enabled` と `{problemId}`）

`nazotoki-cfn-lambda-api.yaml` には `PUT /api/admin/problems/{problemId}/enabled`（個別切替）と `PUT /api/admin/problems/enabled`（一括切替）の両方のルートを同居させている。HTTP API（API Gateway v2）のルート解決は同じ位置にリテラルセグメントとパス変数が競合する場合、**リテラル一致を優先**する仕様のため、`enabled` という固定パスは `{problemId}` 側に吸収されず正しく一括切替Lambda呼び出しに解決される。

**2026-07-25の実デプロイで疎通確認済み**（`PUT /api/admin/problems/enabled` が200を返し、全問題が一括無効化された）。加えてLambda側（`functions/problems/index.ts`）でも一括ルートを `{problemId}` の正規表現より先に判定しているため、仮にAPI Gatewayのルート解決が期待と異なっても誤動作しない二重の防御になっている。

## cfn-lint

`!Rain::S3` はrain独自ディレクティブのためcfn-lintがYAMLタグとして解釈できない。lint時は該当ブロックをダミーの `S3Bucket`/`S3Key` に置換した一時コピーに対して実行する:

```bash
./scripts/lint.sh    # 全テンプレートを cfn-lint（rainタグのみ置換して検査）
```

現時点で全テンプレートがエラー・警告ともに0件でパスすることを確認済み（本リポジトリの検証環境: cfn-lint 1.46.0）。

## CI/CD（GitHub Actions + OIDC）

`.github/workflows/deploy.yml` が main へのpushまたは手動実行で動く。
バックエンドの型チェック・テスト → アプリのスタック更新 → フロントのビルド・S3配置・CloudFront無効化の順で実行する。
AWS認証はGitHub OIDCで、長期アクセスキーを保持しない。

### デプロイ用ロールの信頼条件

`nazotoki-cfn-code.yaml` はデプロイ用IAMロールを管理する。このスタックは
`templates.conf` に含めず、ワークステーションから個別に反映する。
**アプリの通常デプロイだけでは信頼条件の修正は反映されない。**

```bash
rain deploy -r ap-northeast-1 templates/apne1/nazotoki-cfn-code.yaml nazotoki-cfn-code
```

信頼条件は `StringEquals` で所有者・リポジトリ・mainブランチを完全一致させる。
名前末尾のワイルドカードは、別所有者や別リポジトリも許可するため使用しない。
2026-09-07にGitHub APIから確認したIDは owner `47743231`、repository `1335049150`。
同日の設定APIは `use_immutable_subject=false` を返す一方、過去の記録はID付き形式のため、
以下の2形式をそれぞれ完全一致で許可する。

- `repo:Esystimsesys/nazotoki-portal:ref:refs/heads/main`
- `repo:Esystimsesys@47743231/nazotoki-portal@1335049150:ref:refs/heads/main`

名前変更・移管・リポジトリ再作成時は、名前とIDを確認してパラメータを更新する。
反映後はmainのActionsで認証を確認する。旧版Lambdaと新版Lambdaが混在した状態で
イベント回答を受け付けないよう、回答受付を停止した状態でバックエンドを更新する。

参照: [GitHub OIDC仕様](https://docs.github.com/en/actions/reference/security/oidc)、
[AWS条件演算子](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition_operators.html)。

### JWT_SECRET

Actionsは `/nazotoki/jwt-secret` のSSM SecureStringを復号して読み込み、
`JWT_SECRET` 環境変数として `deploy.sh` に渡す。値は再デプロイ間で固定する。
未設定で手元から `deploy.sh` を実行すると新しい値が生成され、既存JWTが無効になる。

### 状態確認

```bash
gh run list --repo Esystimsesys/nazotoki-portal --workflow deploy.yml
```

### IAM権限の方針

GitHub Actionsのデプロイロールには **AdministratorAccess** を付与している。
IAM・Lambda・API Gateway・DynamoDB・CloudFrontを含むスタックを更新するため、
単一アカウントの社内イベント用システムという前提で許容している既存方針を維持する。
Lambda実行ロールは関数ごとに必要なテーブルへの権限に限定する。

OIDC条件の回帰テスト: `python3 scripts/test-oidc.py`（cloudformationディレクトリから実行）。
