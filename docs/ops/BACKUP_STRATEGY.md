# バックアップ方針（開発中にデータが飛ぶ最悪シナリオを回避する）

このリポジトリはデータストアが主に **PostgreSQL**（ローカルは `docker-compose.yml`、本番は AWS RDS/Aurora）です。
事故は「削除」「マイグレーション/スクリプトの誤実行」「Docker volume 消失」「環境変数の消失」「AWS側の設定ミス」で起きます。

## 1. 何をバックアップするか（最重要順）

1. **PostgreSQL の中身**（テーブルデータ）
2. **外部連携の秘密情報**（`.env` 相当: Kintone API token, JWT secret, DB password）
3. **アップロード/生成ファイル**（もしS3等があるなら、バケットのversioningも含める）
4. **インフラ設定**（Lambda環境変数、RDS設定、SecurityGroup 等）

このうち「1」はこのリポジトリ内のスクリプトで即時に対策できます。
「2〜4」は「Gitに入れない/Secrets Managerに入れる/管理画面設定を手順化する」が基本です。

## 2. 開発環境（ローカル）の実装方針

### 2.1 目標値（RPO/RTO）

- RPO（どれだけ巻き戻りを許容するか）: **最大 1日分**を上限（理想は数時間）
- RTO（復旧にかけて良い時間）: **15分以内**（ローカルなら）

### 2.2 方式

- **3-2-1（最低ライン）**
  - 3コピー: DB本体 + dump + オフサイト
  - 2媒体: ローカルディスク + 外部/クラウド
  - 1オフサイト: Time Machine / Dropbox / Google Drive / S3 など（どれか1つで良い）

- **pg_dump の定期取得**（custom format `.dump`）
  - `--create` を付け、復元時に DB 作り直しまでできる形にする
  - 出力先はリポジトリ外扱い（gitignore）: `.backups/db/`
  - 世代管理: **14日**保持（必要なら伸ばす）
- **復元手順も同梱**（バックアップだけだと意味がない）

実装済み:

- `/Users/asyuyukiume/Projects/Agentkey/scripts/backup/db_backup.sh`
- `/Users/asyuyukiume/Projects/Agentkey/scripts/backup/db_restore.sh`

### 2.3 実行スケジュール（例）

最低ライン:

- 平日: 1日1回（夜）
- 重要作業前: 手動で1回（例: schema変更、同期スクリプト実行前）

推奨:

- **2〜3時間に1回** + 手動（重要作業前）

#### macOS（launchd）例

`~/Library/LaunchAgents/` に plist を置いて定期実行します（内容は環境に依存するためテンプレとして運用）。

#### cron（簡易）例

`crontab -e` に追加:

```cron
0 */3 * * * /Users/asyuyukiume/Projects/Agentkey/scripts/backup/db_backup.sh >> /Users/asyuyukiume/Projects/Agentkey/.backups/backup.log 2>&1
```

## 3. 復元手順（ローカル）

1. Postgres を起動（Dockerなら `docker compose up -d db` 相当）
2. 直近の dump を指定して復元:

```bash
/Users/asyuyukiume/Projects/Agentkey/scripts/backup/db_restore.sh /Users/asyuyukiume/Projects/Agentkey/.backups/db/<file>.dump
```

注意:

- `--create`/`--clean` を使うため、**既存DBを消します**（ローカル前提）

## 4. 本番（AWS RDS/Aurora）の方針（運用面）

ローカルのpg_dumpとは別物として、AWS側は「PITR（指定時刻復元）+ スナップショット + 監視 + 復元訓練」を揃えます。

必須:

- RDS/Aurora の **自動バックアップ有効化**（retention: 7〜35日目安）
- 別リージョン（DR）へバックアップを複製
  - このシステムでは `ap-northeast-1`（東京）→ `ap-northeast-3`（大阪）を採用
- **Deletion protection** を有効化
- スナップショットを **定期作成**（日次）し、可能なら **別リージョンコピー**
- 監視:
  - バックアップ/スナップショット失敗のアラート
  - 復元手順（Runbook）を docs に残す

推奨:

- AWS Backup で計画化（保持期間、コピー、監査）
- 月1回の「別DBに復元して、最低限の整合性チェック」まで実施

### デプロイ用スクリプト

- 本番DB（RDS）へ「3時間ごとのバックアップ + 14日保持 + 大阪リージョンへの複製」を反映するスクリプト:
  - `/Users/asyuyukiume/Projects/Agentkey/scripts/ops/deploy_prod_backup_architecture.sh`
