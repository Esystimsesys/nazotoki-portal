# 全体レビュー修正 作業ログ

## 2026-09-07

- 対象: レビュー時 HEAD `32ad614`。修正ブランチ `fix/review-reliability`。
- 完了（ローカル）: 高優先度のOIDC信頼条件の限定、同時回答の二重計上防止。
- 完了（ローカル）: BatchWrite部分失敗、回答Queryページング、グラフ監視解放、イベント操作エラー表示。
- 方針: 既存回答履歴を読み続けられることを確認し、回帰テストを実施する。独立した作業は低位モデルへ委任し、親で差分を確認する。
- 未実施: コミット、push、デプロイ、本番データの変更。

### OIDC信頼条件の修正

- GitHub APIでowner ID `47743231`、repo ID `1335049150` を確認。
- OIDC設定は `use_default=true/use_immutable_subject=false`。過去のID付き形式の記録と異なるため、標準形式とID付き形式の2値を `StringEquals` で完全一致許可する。名前末尾のワイルドカードを除去。
- 古いCodePipeline手順が残っていたIaC READMEを、実装中のGitHub Actionsと個別ロール反映手順へ更新。
- 本番の信頼ポリシー更新は未実施。`nazotoki-cfn-code` は通常デプロイ対象外なので個別反映が必要。

### 委任成果の統合・検証中

- 回答の固定キー＋条件付きPut、強整合・全ページQueryを実装。旧形式履歴の互換を維持する。
- 共通BatchWrite再試行を問題登録/編集/削除・チーム完全削除・全回答削除・リセットに適用。再送上限でエラーにする。
- グラフ監視のcleanup、イベント状態不明時の操作禁止、操作失敗表示を実装。親レビューでダイアログ内のエラー表示も追加。
- 委任先が使用量上限で停止したため、残りの統合と追加検証は親が担当。途中の型エラーを修正中。

### 最終検証

- バックエンド: 型チェック・ビルド成功。既存26件＋新規8件の計34テスト成功。
  - 実ハンドラにDBモックを接続し、同時回答の加点/減点を1回に限定、異なるコードは両方受理、旧形式の2ページ目の回答も重複検出、DB障害は500になることを確認。
  - BatchWriteは25件分割、未処理項目のみ再送、上限超過で例外を確認。
- フロントエンド: lint・型チェックを含むbuild成功。既存のチャンクサイズ警告のみ。ブラウザ実機確認は未実施。
- IaC: cfn-lint 1.56.0を一時実行環境に取得し、全テンプレートのlint成功。OIDC回帰テスト成功（2形式のみ許可、別所有者・別リポジトリ・別ID・別ブランチ・PR・environmentを拒否）。
- Nodeによる共有TypeScriptヘルパーの直接import成功。リセットスクリプトの直接実行経路との互換を確認（リセット自体は実行していない）。
- 親で委任差分をレビューし、ダイアログ内の失敗表示と未知状態での確定禁止を補完。`git diff --check` 成功。
- API契約・設計のキー形式とIaCコメントを更新。既存データの移行/削除は不要。時系列はsubmittedAtでソートすることを確認。

### 反映時の注意・残作業

- コミット・push・デプロイは未実施。作業ブランチに未コミットの変更がある。
- OIDCロールは `templates.conf` 対象外。通常のActionsデプロイとは別に `nazotoki-cfn-code` の反映が必要。
- 受付を停止し、処理中の回答が完了してから新版バックエンドへ更新する。旧版の書込みと混在させない。
- 本番の既存重複は自動補正しない。デプロイ後の認証/画面確認も未実施。

### 本番反映開始（ユーザー指示）

- 本番受付は `running=false`（終了済み）。状態変更せず反映する。
- origin/mainに新規変更なしを確認。
- 修正コミット: backend `fd1c19e`、frontend `87c9d5c`、OIDC `cf7d3a0`。
- OIDCロールの変更セットを作成中。確認後に個別反映し、mainへのpushでActionsを開始する。

### OIDC反映完了・アプリデプロイ開始

- `nazotoki-cfn-code` の変更セットはロール1件のModify・Replacement=False。実行後UPDATE_COMPLETE。
- IAM GetRoleでStringEqualsの2形式が本番へ反映されたことを確認。
- mainマージコミット `42c4d2f` をoriginへpush済み。Actionsの完了を確認中。
- Actions run `34103049737`: 更新済みOIDC条件でAWS認証成功、型チェックと34テスト成功。アプリスタック更新中。

### 本番反映完了

- アプリ反映コミット: `42c4d2f`。
- GitHub Actions: https://github.com/Esystimsesys/nazotoki-portal/actions/runs/34103049737 — backend/frontendとも成功。
- 本番Lambda配布コードで固定キー・条件付きPut・強整合読取・UnprocessedItems再送を確認。LastUpdateStatus=Successful。
- `/login`、`/admin/login` は200。新しい `/assets/index-DjsCNH5_.js` 配信と状態不明表示のコードを確認。認証なし `/api/event` は401。
- CloudFront invalidation `IA7CCQQY1ZFWKPY76SN4Y8XFO7` はCompleted。
- 本番受付は反映前と同じ `running=false`、endedAt=`2026-08-25T04:00:55.295Z`。イベント・回答データの変更なし。
- 実ブラウザのログイン操作・回答送信は未実施。ActionsにNode20対象Actionの非推奨警告あり（Node24へ強制実行され、ジョブは成功）。
- 完了記録のみの追記は `[skip ci]` でコミットし、同じアプリの再デプロイを避ける。
