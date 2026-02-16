# Serverless (Lambda + RDS) 現状調査メモ (2026-02-09)

## 目的

- 50人規模利用を前提に、現状の「DB接続スロット枯渇」「タイムアウト/エラー」のリスク要因を洗い出す
- 事実ベースで、次にやるべき対策（優先順位）を決められる状態にする

## 前提

- 本番構成は Lambda + RDS のサーバーレス
- リージョンは `ap-northeast-1`
- API Gateway は HTTP API (apigatewayv2)

## まとめ（重要ポイント）

- `ats-api-prod-*` の Lambda は **全23関数が RDS単体 `ats-lite-db` に直結**している（RDS Proxy を経由していない）。
- RDS Proxy `prod-db-proxy` は存在するが、**ターゲットが UNAVAILABLE（internal error）で実運用できない状態**。
- `ats-lite-db` の CloudWatch `DatabaseConnections` は **最大 70〜73**（直近観測）まで上がっている。
- Lambda は多くが **Timeout=3秒 / Memory=128MB** で、実際に `candidates-list` で **timeout** が発生している。
- さらに深刻な運用課題として、当初 **prod の CloudWatch Logs がほぼ出ていなかった**（ロググループが 2/23 しか存在しない）。原因は IAM ロールのログ出力権限が `ats-api-dev-*` のロググループにだけ制限されていたこと。

## 1. エンドポイント/ルーティング

- API: `ats-lite-api-prod` (API ID: `st70aifr22`)
- stage: `prod`
- 例: `GET /candidates` -> Lambda `arn:aws:lambda:ap-northeast-1:195275648846:function:ats-api-prod-candidates-list`

## 2. DB構成と接続先

### 2.1 実接続先（Lambdaの環境変数）

- `ats-api-prod-*` 23関数すべてが `DB_HOST=ats-lite-db.cdiqayuosm2o.ap-northeast-1.rds.amazonaws.com`
- つまり **本番のDBアクセスは Aurora (`prod-agentkey-cluster`) ではなく、RDS単体 (`ats-lite-db`)**

### 2.2 RDS 単体インスタンス

- DB instance: `ats-lite-db` (`db.t4g.micro`, `postgres 17.6`)
- PubliclyAccessible: `True`
- PerformanceInsightsEnabled: `True`

### 2.3 Aurora / RDS Proxy

- Aurora cluster: `prod-agentkey-cluster` (`aurora-postgresql 17.4`)
- RDS Proxy: `prod-db-proxy` status `available`
- ただし proxy targets は `UNAVAILABLE`（"DBProxy Target unavailable due to an internal error"）
- CloudWatch上も proxy/aurora の接続が実質 0（使われていない/使えない）

## 3. CloudWatch（DB側）

直近2日（`2026-02-07`〜`2026-02-09`）の例:

- `DatabaseConnections` max: 70 / avg: 3.76
- `CPUUtilization` max: 8.10% / avg: 4.28%
- `FreeableMemory` min: 62,337,024 bytes / avg: 174,819,020 bytes

直近7日では `DatabaseConnections` max: 73 を観測。

## 4. Lambda（設定と症状）

### 4.1 設定の傾向

- `ats-api-prod-*` の大半が `Timeout=3` 秒、`MemorySize=128` MB
- `ReservedConcurrentExecutions` は未設定（上限の制御がない）

### 4.2 エラー率（CloudWatch Metrics, 直近7日で確認）

例（エラー率が高い順の上位）:

- `ats-api-prod-mypage`: 約 28.8%
- `ats-api-prod-kpi-ads`: 約 17.0%
- `ats-api-prod-candidates-detail`: 約 10.5%
- `ats-api-prod-candidates-list`: 約 9.6%

prod全体ではエラー率 約 6.6% 程度（概算）。

### 4.3 `candidates-list` の実ログで確認できた事象

- タイムアウト（`Status: timeout`）が発生（実行時間が 3秒で打ち切り）
- 一部で `ECONNREFUSED 127.0.0.1:5432` が出ていた
  - 通常のDB接続（RDS）であれば `127.0.0.1` にはならないため、環境変数や接続先解決の不整合があった可能性が高い

## 5. CloudWatch Logs（重要な運用課題）

### 5.1 当初の問題

- prodのロググループが **2/23 しか存在しない**状態だった
- `ats-api-prod-*` の Lambda ロールに付いている `AWSLambdaBasicExecutionRole-*` の実体がカスタムで、
  - `logs:CreateLogStream` / `logs:PutLogEvents` の Resource が **`/aws/lambda/ats-api-dev-...:*` に限定**されていた
  - その結果、prod ロググループが作られず、エラー原因の一次情報が取得できない

### 5.2 実施した対応（1の実施）

1. prod のロググループを全て作成
   - `/aws/lambda/ats-api-prod-*` を 23個揃えた
2. retention を 30日に統一
3. 各ロール（22 role）に AWS managed の `AWSLambdaBasicExecutionRole` を追加アタッチ
   - 目的: prod ロググループへの書き込み権限を確実に通す
4. `lambda invoke` により `ats-api-prod-candidates-detail` でログストリーム作成・出力を確認
   - ストリーム作成後、`START/END/REPORT` の出力が確認できた（アプリ側 `console.error` などは発生していないケース）

## 6. DB負荷の手がかり（Performance Insights）

RDS Performance Insights の `db.sql` 上位に、以下が見えている:

- `candidates detail` の `SELECT c.* FROM candidates ... LEFT JOIN ...` 系
- `candidates list` の `SELECT c.id, c.name ... FROM candidates ... ORDER BY c.created_at DESC` 系
- KPI系の `UNION ALL` を含む集計クエリ
- kintone同期と思われる `INSERT ... ON CONFLICT ... DO UPDATE` 系

注: 現時点の `db.load.avg` 上位は「見えてはいるが極端に高い」状況ではなく、タイムアウト/エラーの原因が「DBだけ」と断定はできない。

## 7. 次にやるべきこと（調査の続き = 2の実施）

ログが出る状態に直したので、次は **エラー原因の内訳をログで確定**する。

- `ats-api-prod-candidates-detail` / `ats-api-prod-candidates-list` を中心に、以下を集計
  - DB接続失敗（`ECONN*`, `timeout`, `remaining connection slots`, `too many clients` 等）
  - アプリ例外（stack trace, 500）
  - Lambda timeout（`Status: timeout`）
- 同時に、API側で「重いクエリ/広い取得」が発生していないか（ページング、カレンダー大量取得など）を突合する

## 8. RDS Proxy 導入（ats-lite-db向け）: 作業手順と入力値

この章は「Lambda + RDS 直結で接続が増えやすい」状態を、RDS Proxy で緩和するための手順メモ。

### 8.1 先に押さえるポイント（今回のつまずき所）

- RDS Proxy が Secrets Manager の DB認証情報を読むために IAM ロールが必要。
- IAM ポリシー（権限）側には通常 `Principal` は書かない（= 画面の「プリンシパル追加」は触らないのが基本）。
  - `Principal` が必要なのは「信頼ポリシー（Trust relationship）」側で、RDS Proxy サービスがロールを引き受けられるようにするため。
- `kms:Decrypt` は "Secrets Manager のシークレットが「カスタマー管理KMSキー」で暗号化されている場合のみ" 必要。
  - デフォルトの KMS キー（AWS managed の `aws/secretsmanager`）なら、通常 `kms:Decrypt` を追加しなくても動く。

### 8.2 Secrets Manager（ats-lite-db用シークレット）作成方針

- シークレット種別: 「Amazon RDS データベース」
- 対象DB: `ats-lite-db`
- 認証情報: アプリが使うDBユーザー（username/password）
  - 可能なら「アプリ専用ユーザー」を作り、権限を絞る（最小権限）。
- 暗号化キー:
  - 迷ったらデフォルト（`aws/secretsmanager`）を選ぶ（kms設定で詰まりにくい）。

### 8.3 RDS Proxy 作成画面（コンソール）: 入力値（今回の推奨）

#### A) プロキシ設定

- エンジンファミリー: `PostgreSQL`（ats-lite-db が Postgres のため）
- プロキシ識別子: 例 `prod-ats-lite-db-proxy`（環境/用途が分かる名前）
- アイドルクライアントの接続タイムアウト:
  - いったん `30分` のままでも良い（まずは導入を優先）
  - 接続が多く残り過ぎるようなら `5-10分` に短縮を検討

#### B) ターゲットグループの設定

- データベース: `ats-lite-db`
- ターゲット接続ネットワークタイプ: `IPv4`
- 接続プールの最大接続数（パーセント）:
  - いったん `80` を推奨（DBの最大接続を全部埋めないための安全マージン）
- 接続プールの最大アイドル状態の接続数（パーセント）:
  - いったん `50` を推奨（無駄にアイドルを抱え過ぎない）
- リーダーエンドポイントを含める:
  - `RDS単体` では基本不要（Aurora の reader を使うケース向け）

#### C) 認証（重要）

- デフォルト認証スキーム: `なし`（画面通りでOK）
- Identity and Access Management (IAM) ロール: `新しいロールを作成（推奨）`
- Secrets Manager のシークレット: `ats-lite-db 用に作ったシークレット` を選択
- クライアント認証タイプ: `SCRAM SHA 256`
  - Postgres 15+ などのデフォルトが SCRAM のことが多い。DB側がMD5運用なら合わせる必要あり。
- IAM 認証: `許可されていません`（まずはOFF推奨）

#### D) 追加のターゲットグループの設定

- 接続借用タイムアウト:
  - いったん `2分` のまま（画面例通り）でOK
- 初期化クエリ・オプション:
  - 基本は空欄（接続ごとに実行されるため、不要な負荷になりやすい）

#### E) 接続

- Transport Layer Security が必要:
  - 同一VPC内で完結しているなら必須にしなくても開始できる
  - ただしセキュリティ要件があるならON（クライアント側もTLS設定が必要）
- エンドポイントネットワークタイプ: `IPv4`
- サブネット:
  - Lambda が動くサブネットと同じVPC内で、最低2つ以上（複数AZ）を選択
- 既存の VPC セキュリティグループ:
  - Proxy 用の専用 SG を推奨（最初は `default` でも作れるが運用しにくい）

### 8.4 IAM ロール（RDS Proxy が使うロール）: 画面での作り方

RDS Proxy 作成画面の「新しいロールを作成（推奨）」は、基本的にそのまま作らせるのが最短。
手動で編集が必要になった場合のみ、下の内容に合わせる。

#### A) 信頼ポリシー（Trust relationship）

- 信頼されたエンティティ（サービス）: `RDS`
- JSON で見ると、概ねこうなる:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "rds.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

#### B) 権限ポリシー（Permissions policy）

最低限（推奨）:

- アクション:
  - `secretsmanager:GetSecretValue`
  - `secretsmanager:DescribeSecret`（推奨）
- リソース:
  - `ats-lite-db` のシークレット ARN に限定（最小権限）

KMS（必要な場合のみ）:

- 条件:
  - `kms:ViaService = secretsmanager.ap-northeast-1.amazonaws.com`
  - （任意）`kms:CallerAccount = 195275648846`
- アクション:
  - `kms:Decrypt`
- リソース:
  - そのシークレットに設定した KMS キー ARN

注意:

- IAM ポリシーの編集画面に「プリンシパルを追加」が出ても、通常は追加しない（空のままでOK）。
  - `Principal` が必要なのは Trust relationship 側。

### 8.5 これをやらないと Proxy が動かない（ネットワーク/SG）

RDS Proxy は IAM が正しくても、SG が通ってないと接続できず「UNAVAILABLE」になり得る。

- Lambda -> Proxy:
  - Proxy SG の inbound に、Lambda SG から `TCP 5432` を許可
- Proxy -> DB (`ats-lite-db`):
  - DB SG の inbound に、Proxy SG から `TCP 5432` を許可

上記が無いと「Proxyは作れたが疎通できない」が起きる。

### 8.6 （この環境の実値）VPC / Subnet / SG

本番 Lambda `ats-api-prod-candidates-list` の VPC 設定より:

- VPC: `vpc-0a59bf0e85ca67574`
- Lambda subnets:
  - `subnet-09878c21843bc5191` (ap-northeast-1a)
  - `subnet-0b46fa2e756e957ea` (ap-northeast-1c)
  - `subnet-073499f625497f368` (ap-northeast-1d)
- Lambda SG: `sg-0fee6a530d4feb4d1` (name: `lambda-rds-2`)

RDS `ats-lite-db` の設定より:

- DB subnets（DB subnet group）:
  - `subnet-09878c21843bc5191`, `subnet-0b46fa2e756e957ea`, `subnet-073499f625497f368`
- DB SG:
  - `sg-002327cce4a8b4ccd` (name: `rds-ats-lite-sg`)
  - `sg-0da77e96bacdd3409` (name: `rds-lambda-1`)

### 8.7 （実施結果）作成した RDS Proxy（2026-02-09）

- Proxy: `agentkey-proxy`
- Endpoint: `agentkey-proxy.proxy-cdiqayuosm2o.ap-northeast-1.rds.amazonaws.com`
- VPC: `vpc-0a59bf0e85ca67574`
- Subnets:
  - `subnet-073499f625497f368`
  - `subnet-09878c21843bc5191`
  - `subnet-0b46fa2e756e957ea`
- Proxy SG: `sg-093c19f72295dda72`（作成した専用SG）
- Auth secret: `arn:aws:secretsmanager:ap-northeast-1:195275648846:secret:prod/Agentkey/db1-PX5TAn`
- Target: `ats-lite-db`（初期状態は `PENDING_PROXY_CAPACITY` で `AVAILABLE` になるまで数分待つことがある）

### 8.8 （実施結果）Lambda の接続先切り替え（2026-02-09）

`ats-api-prod-*` 23関数の `DB_HOST` を、RDS 直結から RDS Proxy endpoint に切り替えた。

- 変更前: `ats-lite-db.cdiqayuosm2o.ap-northeast-1.rds.amazonaws.com`
- 変更後: `agentkey-proxy.proxy-cdiqayuosm2o.ap-northeast-1.rds.amazonaws.com`
- 反映スクリプト:
  - `/Users/asyuyukiume/Projects/Agentkey/scripts/switch-prod-db-host-to-proxy.sh`
- ロールバック（戻す）:
  - `/Users/asyuyukiume/Projects/Agentkey/scripts/switch-prod-db-host-to-rds.sh`

## 付録

### 生成レポートスクリプト

- `/Users/asyuyukiume/Projects/Agentkey/scripts/ops/serverless_rds_report.py`
  - API Gateway / Lambda / RDS / Proxy の状態をまとめる（Markdown出力）
