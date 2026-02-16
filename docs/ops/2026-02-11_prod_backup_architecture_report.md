# 本番バックアップ構成 実装レポート（Agentkey）

実施日: **2026-02-11**  
対象: **本番データ消失の回避（重要度: 失うとツールとして成立しない）**

---

## 1. 結論（採用した仕様）

本番DBのバックアップは「週次スナップショットのみ」ではなく、**多層（PITR + 定期スナップショット + 別リージョン複製）**で設計・反映した。

- **頻度（スナップショット系）**: **3時間に1回**
- **保持期間**: **14日**
- **別リージョン（DR）**: `ap-northeast-1`（東京）→ `ap-northeast-3`（大阪）
- **PITR（自動バックアップ）保持**: **14日**
- **Deletion protection**: **有効**

---

## 2. 仕様の根拠（なぜこの仕様か）

### 2.1 週次バックアップだけでは弱い理由

週次のみだと、最悪で **最大7日分**のデータ消失（RPO=7日）を許容する設計になり、利用人数が1000人超の想定かつ「消失=致命」の要件に対して現実的ではない。

### 2.2 「3時間に1回 / 14日保持」の意味

- **3時間に1回**: 誤操作・バグ・同期処理の事故（データ破壊）に対して、被害を最大3時間程度に抑える狙い（RPOの上限を小さくする）。
- **14日保持**: 「気づくのが遅い事故」や「直近1〜2週間の巻き戻し」要求を現実的なコストでカバーしやすい。

### 2.3 PITR（自動バックアップ）を同時に有効化する理由

スナップショット頻度を3時間にしても、事故発生は任意の時刻で起きる。PITRがあると、保持期間内でより細かい復元ポイントを選べ、**“3時間刻み”より実務上の復旧精度が上がる**。

### 2.4 別リージョンコピー（東京→大阪）の理由

同一リージョン内だけのバックアップは、リージョン障害や広域障害に対して同時に失われ得る。東京と大阪に分けることで、DR（災害対策）の最後の逃げ道を確保する。

---

## 3. 対象（現状確認できたリソース）

AWSアカウント:

- Account: `195275648846`

DB（本番で使用しているDBインスタンス）:

- Identifier: `ats-lite-db`
- Region: `ap-northeast-1`
- Engine: `postgres`（version `17.6`）

参考: Auroraクラスター `prod-agentkey-cluster` も存在するが、運用調査メモ上は本番Lambdaが `ats-lite-db` に直結している。

---

## 4. 実装アーキテクチャ（最終形）

### 4.1 レイヤ構成

1. **RDS 自動バックアップ（PITR）**
   - 保持: 14日
   - 目的: 直近の任意時刻に戻せる（誤削除・事故対応）

2. **AWS Backup（3時間ごとのバックアッププラン）**
   - 3時間ごとにバックアップジョブを起動（スナップショット系）
   - 保持: 14日
   - 目的: 運用上のバックアップ管理を統一し、DRコピーも同時に制御

3. **AWS Backupのクロスリージョンコピー**
   - `ap-northeast-1` → `ap-northeast-3`
   - コピー先保持: 14日
   - 目的: リージョン障害/広域障害対策（DR）

4. **RDS クロスリージョン自動バックアップ複製（PITRのDR）**
   - 大阪側で自動バックアップを保持（14日）
   - 目的: DRリージョンでもPITRを可能にし、復旧の選択肢を増やす

### 4.2 スケジュールについて（AWS Backupのcron）

AWS Backupの `ScheduleExpression` はUTCベースで評価される。今回の要件は「3時間ごと」なので、UTC境界に揃っても業務上のずれは問題になりにくい（毎日決まった“時刻”が重要な要件ではない）。

---

## 5. 反映手順（デプロイ工程）

### 5.1 使用したデプロイスクリプト

- `/Users/asyuyukiume/Projects/Agentkey/scripts/ops/deploy_prod_backup_architecture.sh`

このスクリプトは以下を実行する:

- RDS: `BackupRetentionPeriod=14` + `DeletionProtection=true`（apply immediately）
- AWS Backup:
  - Vault作成（東京/大阪）
  - Backup plan作成（3時間ごと、14日保持、DRコピー）
  - Selection作成（対象リソース=RDSインスタンスARN）
  - テストバックアップジョブを起動
- RDS cross-region automated backups replication:
  - 大阪側KMSキー作成（`alias/agentkey-rds-replica`）
  - 大阪へ自動バックアップ複製を有効化（保持14日）

### 5.2 実際に作成/更新された主要リソース

RDS（東京）:

- `ats-lite-db`
  - `BackupRetentionPeriod`: **14**
  - `DeletionProtection`: **true**

AWS Backup（東京）:

- Backup vault: `agentkey-prod`
- Backup plan: `agentkey-prod-rds-3h-14d`
  - Rule: `rds-3h`
  - Schedule: `cron(0 */3 * * ? *)`
  - Lifecycle: delete after 14 days
  - CopyAction: `agentkey-prod-dr`（大阪）へコピー、delete after 14 days
- Backup selection: `agentkey-prod-rds-selection`

AWS Backup（大阪）:

- Backup vault: `agentkey-prod-dr`

RDS automated backups replication（大阪）:

- `ats-lite-db` の自動バックアップが大阪リージョンに作成され、保持 **14日**

KMS（大阪）:

- alias: `alias/agentkey-rds-replica`
  - replication用のKMSキーを新規作成して利用

---

## 6. デプロイ後の確認結果（当日時点）

### 6.1 RDS設定

`ats-lite-db`（東京）は以下になっている:

- retention: `14`
- deletionProtection: `true`

### 6.2 AWS Backupプラン

Backup plan `agentkey-prod-rds-3h-14d` に以下のルールが存在:

- rule: `rds-3h`
- schedule: `cron(0 */3 * * ? *)`
- deleteAfterDays: `14`
- copyTo（大阪vault）: `arn:aws:backup:ap-northeast-3:195275648846:backup-vault:agentkey-prod-dr`

### 6.3 大阪側のPITR（自動バックアップ複製）

大阪リージョンに `ats-lite-db` の automated backup が存在し、保持 `14日`。

### 6.4 テストバックアップジョブについて

テストジョブは起動したが、当時点ではRDSが `modifying` 状態のためリトライ待ちになっていた（= DBが `available` に戻れば進行する想定）。

---

## 7. 運用ルール（最低限）

- 復元は原則「**新規DBへ復元 → 検証 → 切替**」
  - 既存DBへ上書き復元すると、誤った復元で戻れなくなる事故が起きるため
- 月1回: 東京または大阪のバックアップから **別DBへ復元してスモークテスト**（API/主要画面）を実施
  - バックアップは「復元できて初めて価値」があるため

---

## 8. 変更ログ（リポジトリ内）

参考として、バックアップ方針は以下にも記載:

- `/Users/asyuyukiume/Projects/Agentkey/docs/ops/BACKUP_STRATEGY.md`

ローカル（開発）DBのバックアップ/復元スクリプト:

- `/Users/asyuyukiume/Projects/Agentkey/scripts/backup/db_backup.sh`
- `/Users/asyuyukiume/Projects/Agentkey/scripts/backup/db_restore.sh`

