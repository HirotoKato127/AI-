# AWS 運用・開発ルール

> 作成日: 2026-02-26
> 対象: Agent Key ATS プロジェクト
> 目的: AWSリソースを安全・効率的に運用するためのチームルール

---

## このドキュメントの背景

2026年2月の調査で以下の問題が見つかったことをきっかけに、チーム全体で守るべきルールを策定した。

**見つかった問題:**
- Aurora Serverless v2 の消し忘れで **月$1,776 の無駄課金**
- Lambda環境変数に **DBパスワード・JWTシークレットが平文**
- 複数リージョンに **目的不明のリソース** が放置
- RDS が **パブリックアクセス有効** のまま運用

---

## 1. シークレット管理

### ✅ やるべきこと

- パスワード、APIキー、トークンは **AWS Secrets Manager** または **SSM Parameter Store** に保存する
- Lambda 関数からは `aws-sdk` でシークレットを取得する
- `.env` ファイルは **Git にコミットしない**（`.gitignore` に追記）
- シークレットは **90日ごとにローテーション** する

### ❌ やってはいけないこと

- Lambda 環境変数にパスワードを直接書く
- コード内にシークレットをハードコード
- Slack やメールでシークレットを共有する

### 具体例

```javascript
// ❌ 悪い例: Lambda環境変数に直接
const password = process.env.DB_PASSWORD; // "QgjoFpxFGJjxNwicxLUb"

// ✅ 良い例: Secrets Managerから取得
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "ap-northeast-1" });
const secret = await client.send(
  new GetSecretValueCommand({ SecretId: "agentkey/db-credentials" })
);
const { password } = JSON.parse(secret.SecretString);
```

---

## 2. リソース作成・削除のルール

### ✅ 作る前に

1. **何のために作るか** を Slack/Issue に記録する
2. **Nameタグ** を必ず付ける（`プロジェクト名-環境-用途`）
3. **リージョン** は `ap-northeast-1`（東京）に統一する（特別な理由がない限り）
4. **コスト見積もり** を事前に確認する（[AWS Pricing Calculator](https://calculator.aws/)）

### ✅ 作った後に

1. 使い終わったら **その日のうちに削除** する
1. 使い終わったら **その日のうちに削除** する
2. テスト用リソースは **最大24時間で必ず消す**
3. 月1回の **リソース棚卸し** を実施する

### ❌ やってはいけないこと

- Nameタグなしでリソースを作る（→ 後から何か分からなくなる）
- 他リージョンに勝手にリソースを作る
- Aurora Serverless など高コストなサービスをテストで放置する

### Nameタグの命名規則

```
{プロジェクト名}-{環境}-{用途}

例:
  agentkey-prod-db        → 本番DB
  agentkey-dev-db         → 開発DB
  agentkey-prod-bastion   → 本番踏み台サーバー
  test-20260226-aurora    → テスト用（日付入り）
```

---

## 3. 環境の分離（dev / staging / prod）

### 基本方針

| 環境 | 用途 | 誰がアクセスするか | 慎重さ |
|---|---|---|---|
| **prod** | 本番 | 全ユーザー | ⚠️ 最大限慎重に |
| **dev** | 開発・テスト | 開発者のみ | 普通 |
| **local** | ローカル開発 | 自分だけ | 自由 |

### ✅ ルール

1. **prod 環境のリソースは直接変更しない**（必ず dev で検証してから）
2. **prod と dev の DB は別インスタンス** にする（同じDBを共有しない）
3. Lambda 関数名は `ats-api-{環境}-{機能名}` のフォーマットで統一
4. API Gateway は環境ごとに分ける（`/dev`, `/prod`）

### ❌ やってはいけないこと

- 本番DBに直接SQLを実行する（必ずバックアップ取得後に）
- dev環境の変更を本番にデプロイせずに直接本番を修正する
- 本番と開発で同じパスワードを使う

---

## 4. データベース (RDS) の管理

### ✅ ルール

1. **パブリックアクセスは原則 `false`**
   - 外部から直接接続する場合は Bastion (踏み台) サーバー経由で
2. **Multi-AZは本番環境のみ** 有効にする（開発は不要）
3. **バックアップ保持期間**: 本番 = 7日、開発 = 1日
4. **インスタンスサイズ** は最小で始める（`db.t4g.micro` から）
5. **削除保護 (Deletion Protection)** を本番は有効にする

### セキュリティグループの設定

```
本番DB:
  - Inbound: Lambda SecurityGroup からの 5432 のみ
  - Inbound: Bastion SecurityGroup からの 5432 のみ
  - それ以外は全拒否

開発DB:
  - 同上 + 必要に応じてオフィスIPを追加
```

### コスト管理

| 項目 | 推奨設定 |
|---|---|
| Performance Insights | 無料枠（7日保持）のみ使用 |
| AWS Backup | 本番: 24時間ごと/7日保持、開発: 不要 |
| クロスリージョンバックアップ | 本番: 必要最小限、開発: 不要 |

---

## 5. Lambda 関数の管理

### ✅ ルール

1. **ランタイムは最新LTSに統一** する（現在: `nodejs20.x` 推奨）
2. **メモリは128MB** から始める（必要に応じて増やす）
3. **タイムアウトは最短** に設定する（デフォルト3秒、API系は10秒まで）
4. **環境変数にシークレットを入れない**（→ Secrets Manager を使う）
5. **VPC設定** はDBアクセスが必要な関数のみ

### デプロイ手順

```
1. ローカルでテスト
2. dev環境のLambdaにデプロイ
3. dev環境で動作確認
4. 問題なければprod環境にデプロイ
```

### ❌ やってはいけないこと

- Lambda コンソールから直接コードを編集する（必ずGit経由で）
- dev と prod で異なるコードバージョンを長期間放置する
- 不要なLambda関数を放置する

---

## 6. ネットワーク・セキュリティ

### ✅ ルール

1. **セキュリティグループは最小権限** の原則で設定する
   - 必要なポートのみ開放
   - ソースは可能な限り SecurityGroup ID で指定（IPアドレスではなく）
2. **0.0.0.0/0（全世界に公開）は原則禁止**
3. **NAT Gateway は1つだけ** で運用する（AZ冗長は本番のみ検討）
4. **VPCエンドポイント** は使用中のもののみ保持する
5. **SSL/TLS** はすべての通信で使用する

### IAM（権限管理）

1. **ルートアカウントは使用禁止**（MFA を設定）
2. **IAMユーザーは個人ごとに作成**（共有アカウント禁止）
3. **最小権限の原則** — 必要な操作のみ許可
4. **アクセスキーは90日ごとにローテーション**
5. **長期間使用していないユーザーは無効化**

---

## 7. コスト管理

### 日常ルール

1. **月1回のコストレビュー** を実施する
   - AWS Cost Explorer でサービス別コストを確認
   - 前月比で10%以上増加したサービスは原因調査
2. **予算アラート** を設定する
   - Budget を作成して、月額 **$300** を超えたらメール通知
3. **テスト用リソースは即日削除**

### 予算アラートの設定方法

```bash
aws budgets create-budget --account-id 195275648846 \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
```

### コスト削減チェックリスト（月1回）

- [ ] 全リージョンに不要なリソースがないか確認
- [ ] 未アタッチのEBSボリュームがないか確認
- [ ] 停止中のEC2にEIPが付いていないか確認
- [ ] CloudWatch ログの保持期間が適切か確認
- [ ] RDSスナップショットが溜まりすぎていないか確認
- [ ] 使っていないLambda関数がないか確認

### 確認コマンド例

```bash
# 全リージョンのEC2を確認
for region in ap-northeast-1 ap-northeast-3 ap-southeast-2; do
  echo "=== $region ==="
  aws ec2 describe-instances --region $region \
    --query "Reservations[*].Instances[*].{Name:Tags[?Key=='Name']|[0].Value,State:State.Name,Type:InstanceType}" \
    --output table
done

# 未アタッチのEBSを確認
aws ec2 describe-volumes --filters Name=status,Values=available \
  --query "Volumes[*].{ID:VolumeId,Size:Size,Region:AvailabilityZone}" \
  --output table

# RDSスナップショットの数を確認
aws rds describe-db-snapshots \
  --query "length(DBSnapshots)"
```

---

## 8. バックアップ・障害復旧

### ✅ ルール

1. **本番DBは毎日自動バックアップ**（保持期間7日）
2. 本番の重要な変更（マイグレーション等）の前には **手動スナップショット** を取得する
3. **年1回、バックアップからの復旧テスト** を実施する
4. クロスリージョンバックアップは **本番のみ**

### 障害時の対応フロー

```
1. 障害を検知（アラート or ユーザー報告）
2. 影響範囲を特定
3. 必要に応じてRDSスナップショットから復旧
4. 原因を調査・修正
5. 障害レポートを作成（日時・原因・対応・再発防止策）
```

---

## 9. デプロイ・リリース

### ✅ ルール

1. **Git のブランチ戦略** を守る
   - `main` = 本番（直接コミット禁止）
   - `develop` = 開発ブランチ
   - 機能追加は `kato_xx`, `feature/xxx` ブランチから PR を作成
2. **PRレビュー** を最低1名が実施してからマージ
3. **本番デプロイは平日日中** に実施する（金曜夕方はNG）
4. **デプロイ後の動作確認** を必ず実施する

### Lambda デプロイ手順

```bash
# 1. コードをzip化
zip -r function.zip index.mjs node_modules/

# 2. dev環境にデプロイ
aws lambda update-function-code \
  --function-name ats-api-dev-{機能名} \
  --zip-file fileb://function.zip

# 3. dev環境で動作確認

# 4. 問題なければprod環境にデプロイ
aws lambda update-function-code \
  --function-name ats-api-prod-{機能名} \
  --zip-file fileb://function.zip
```

---

## 10. モニタリング・ログ

### ✅ ルール

1. **CloudWatch ログ保持期間** は30日に設定する（無期限にしない）
2. **エラー通知** — Lambda のエラー率が5%を超えたらSlack通知
3. **コスト通知** — 月額予算を超えたらメール通知
4. **ログにセンシティブ情報を出力しない**

### ログ保持期間の設定

```bash
# 全Lambda関数のログ保持期間を30日に設定
aws logs describe-log-groups \
  --query "logGroups[?retentionInDays==null].logGroupName" \
  --output text | while read group; do
    aws logs put-retention-policy \
      --log-group-name "$group" \
      --retention-in-days 30
done
```

---

## クイックリファレンス

### これだけは覚えて

| # | ルール | なぜ |
|---|---|---|
| 1 | **パスワードは Secrets Manager に** | 平文は漏洩リスク大 |
| 2 | **テストリソースは即日削除** | Aurora放置で月$1,776の教訓 |
| 3 | **Nameタグを必ず付ける** | 後から何か分からなくなる |
| 4 | **リージョンは東京に統一** | 管理が煩雑になる |
| 5 | **月1回コストレビュー** | 異常を早期発見 |
| 6 | **RDSはパブリックアクセスOFF** | DB直接攻撃を防ぐ |
| 7 | **本番は直接変更しない** | 事故防止 |
| 8 | **PRレビュー必須** | 品質担保 |

---

## 現在の対応状況

| # | 課題 | ステータス | 担当 |
|---|---|---|---|
| 1 | Lambda環境変数のシークレット移行 | ⬜ 未着手 | |
| 2 | RDSパブリックアクセスをOFFに | ⬜ 未着手 | |
| 3 | 大阪の100GB未アタッチEBS削除 | ⬜ 未着手 | |
| 4 | シドニーの不明リソース整理 | ⬜ 未着手 | |
| 5 | 予算アラートの設定 | ⬜ 未着手 | |
| 6 | CloudWatch ログ保持期間の設定 | ⬜ 未着手 | |
| 7 | Nameタグの整備 | ⬜ 未着手 | |
| 8 | 月次コストレビューの仕組み化 | ⬜ 未着手 | |
