# マイクロサービス密度レポート（初心者向け学習版）

作成日: 2026-02-18
対象: `/Users/asyuyukiume/Projects/Agentkey`

## 0. このドキュメントの目的
この資料は、次の2つを同時に満たすために作っています。

1. このプロジェクトの「どこが複雑か」を初心者でも理解できること
2. 読みながらマイクロサービス設計の考え方を学べること

## 1. まずは超要約（3分版）
今のプロジェクトは、機能がよくできている一方で「責務の密集」が起きています。

- 1つの大きいファイルに多くの仕事が集まっている
- 同じようなAPIが複数の実装場所に存在している
- 画面コードが複数ドメインAPIを直接つないでいる

この状態は、開発速度が下がりやすく、バグの影響範囲が広がりやすいです。
そのため、機能単位で責務を分ける（= マイクロサービス思考）が有効です。

## 2. 先に覚える用語（最小セット）

- モノリス:
  アプリの多くの機能が1つの大きな実装に集まっている状態。
- サービス境界:
  「この機能はこのサービスが責任を持つ」という境目。
- 結合度:
  他機能にどれだけ依存しているか。高いほど変更が難しい。
- BFF (Backend For Frontend):
  画面ごとの都合に合わせてAPIをまとめる薄いバックエンド。
- Strangler Fig:
  既存を一気に壊さず、少しずつ新構成へ移していく移行戦略。

## 3. いまの状態を数字で見る

### 3.1 プロジェクト全体
- 分析対象（生成物・バックアップ除外）: 85 files / 43,695 LOC

### 3.2 大きいファイル（密度が高い箇所）
- `/Users/asyuyukiume/Projects/Agentkey/pages/yield/yield.js`: 6,333
- `/Users/asyuyukiume/Projects/Agentkey/dashboard.js`: 5,558
- `/Users/asyuyukiume/Projects/Agentkey/pages/candidates/candidates.js`: 5,362
- `/Users/asyuyukiume/Projects/Agentkey/pages/teleapo/teleapo.js`: 4,750
- `/Users/asyuyukiume/Projects/Agentkey/pages/referral/referral.js`: 3,894
- `/Users/asyuyukiume/Projects/Agentkey/server.js`: 1,866

読み方のポイント:
- 「行数が多い = 悪」ではありません。
- ただし、行数が多いファイルは責務が混ざりやすく、変更時の事故率が上がりやすいです。

### 3.3 API実装の重複
- Express (`/Users/asyuyukiume/Projects/Agentkey/server.js`) のルート: 29
- Vercel Functions (`/Users/asyuyukiume/Projects/Agentkey/api`) の公開パス: 13
- 同名パスの重複: 6
  - `/api/candidates`
  - `/api/members`
  - `/api/kpi/yield`
  - `/api/kpi/yield/trend`
  - `/api/kpi/yield/breakdown`
  - `/api/kpi-targets`

読み方のポイント:
- 同じAPI名が複数実装にあると、環境差で挙動がズレるリスクが増えます。

### 3.4 変更が集中している場所（2026-01-01以降）
- `/Users/asyuyukiume/Projects/Agentkey/pages/candidates/candidates.js`: 87回
- `/Users/asyuyukiume/Projects/Agentkey/scripts/router.js`: 73回
- `/Users/asyuyukiume/Projects/Agentkey/pages/referral/referral.js`: 54回
- `/Users/asyuyukiume/Projects/Agentkey/pages/teleapo/teleapo.js`: 51回
- `/Users/asyuyukiume/Projects/Agentkey/pages/yield/yield.js`: 48回

読み方のポイント:
- 変更回数が多い場所は「価値が高い」一方で「壊れやすい境界」です。

## 4. このプロジェクトの課題を初心者向けに言い換える

課題1: 実行基盤が複数あり、頭の切り替えコストが高い
- AWS API Gateway + Lambda
- Express (`server.js`)
- Vercel Functions (`api/`)

課題2: 画面がAPIを直接つなぎすぎている
- 例: `teleapo.js` は teleapo, candidates, settings を直接呼ぶ
- 例: `referral.js` は clients, kpi, candidates を直接呼ぶ

課題3: データ責務があいまい
- Candidates と Clients が更新フローで密結合
- Goal/KPIは永続化戦略が混在（RDS前提とin-memoryの併存）

## 5. サービス境界（学習用の推奨モデル）
次の8境界を「最初の設計仮説」として使うと学習しやすいです。

1. `candidate-service`
- 所有: 候補者基本情報、職歴/学歴、候補者詳細更新
- 例: `/candidates`, `/candidates/{id}`

2. `client-service`
- 所有: 紹介先企業情報、企業KPI関連
- 例: `/clients`, `/kpi/clients`

3. `kpi-service`
- 所有: 歩留まり・集計系KPI
- 例: `/kpi/yield`, `/kpi/yield/trend`

4. `goal-service`
- 所有: 目標設定（期間目標/日次目標/MS目標）
- 例: `/goal/*`, `/ms-targets`, `/important-metrics`

5. `teleapo-service`
- 所有: 架電ログと架電関連集計
- 例: `/teleapo/logs`

6. `member-auth-service`
- 所有: 認証、メンバー管理
- 例: `/auth/*`, `/members`

7. `mypage-bff`
- 所有: マイページ表示用の集約レスポンス
- 例: `/mypage`

8. `chatbot-service`
- 所有: 社内ヘルプチャット
- 既存で比較的独立

## 6. 密度評価（5段階）

評価基準:
- 機能密度: その境界が抱える責務量
- 結合密度: 他境界への依存量
- 変更密度: 修正頻度
- 運用密度: 障害時の影響の広さ

| 機能境界 | 機能密度 | 結合密度 | 変更密度 | 運用密度 | 優先度 |
|---|---:|---:|---:|---:|---|
| Yield + Goal | 5 | 5 | 4 | 5 | 最優先 |
| Candidates | 5 | 5 | 5 | 5 | 最優先 |
| Teleapo | 4 | 4 | 4 | 4 | 高 |
| Referral/Clients | 4 | 4 | 4 | 4 | 高 |
| Members/Auth | 2 | 3 | 3 | 3 | 中 |
| Mypage | 2 | 4 | 3 | 3 | 中 |
| Chatbot | 3 | 1 | 2 | 2 | 低 |

## 7. どう進めるか（実務 + 学習を両立する計画）

### Phase 0（1週間）: 境界を言語化する
やること:
- 8サービス仮説をADR/設計メモに固定
- 「どのテーブルを誰が持つか」を明記

学習ポイント:
- 「機能単位」ではなく「責任単位」で切る感覚を身につける

完了条件:
- 全APIに owner service を付けた表がある

### Phase 1（1週間）: 計測を自動化する
やること:
- CIで以下を毎回レポート
  - LOC
  - API数
  - クロス境界参照数
  - ハードコードURL数
  - 30日変更頻度

学習ポイント:
- 設計改善は主観でなく、計測値で判断する

完了条件:
- PRごとに密度レポートが出る

### Phase 2（2週間）: API経路を一本化する
やること:
- 実行基盤をまず一本化（AWS本線推奨）
- `server.js` と `api/` の重複APIを整理

学習ポイント:
- 「同じ機能を複数経路で持つ危険性」を体験的に理解する

完了条件:
- 重複6パスを1実装に統一

### Phase 3（3-6週間）: 高密度領域を分割する
やること:
- 優先順で分割
  1. Candidates
  2. Yield + Goal
  3. Teleapo / Referral
- Strangler Figで endpoint 単位移行
- contract test を追加

学習ポイント:
- 大規模改修を「小さく安全に」進める方法

完了条件:
- 分割対象ごとに旧経路停止 + 新経路安定稼働

### Phase 4（継続）: 運用品質を分離する
やること:
- サービスごとに SLI/SLO を持つ
- 障害分離テストを定期実施

学習ポイント:
- 「動く」だけでなく「運用できる」設計の重要性

完了条件:
- 1サービス障害で他が継続することを確認

## 8. 駆け出しエンジニア向けハンズオン課題

課題A（読解）:
- `server.js` から `/api/candidates` 系と `/api/clients` 系のコードを色分けする
- 目的: 責務の混ざり方を目視で理解

課題B（計測）:
- `pages/yield/yield.js` 内の `fetch` 呼び出し先を一覧化
- 目的: 画面がどれだけAPI境界をまたぐか把握

課題C（設計）:
- `candidate-service` が所有すべきテーブルを `db/schema.sql` から抽出
- 目的: API設計とデータ設計を接続して考える訓練

課題D（品質）:
- `kpi-service` の1エンドポイントに contract test を追加
- 目的: 分割後の仕様保証を学ぶ

## 9. すぐ使えるチェックリスト

- 1ファイルが 1,500行を超えていないか
- 1画面が 3境界以上のAPIを直接叩いていないか
- 同じAPIパスが複数実装に存在していないか
- owner service が未定義のテーブルがないか
- 変更頻度トップのファイルにテストがあるか

## 10. このレポートの結論
- まず分割すべきは `Candidates` と `Yield + Goal`
- 次点は `Teleapo` と `Referral/Clients`
- `Chatbot` は現時点では独立性が高く、優先度は低め

つまり「全部を同時に分ける」のではなく、
「密度が高く、変更が多く、結合が強い場所から順に分ける」が正解です。

## 11. 次に読むと理解が深まるファイル
- `/Users/asyuyukiume/Projects/Agentkey/server.js`
- `/Users/asyuyukiume/Projects/Agentkey/pages/candidates/candidates.js`
- `/Users/asyuyukiume/Projects/Agentkey/pages/yield/yield.js`
- `/Users/asyuyukiume/Projects/Agentkey/scripts/services/goalSettings.js`
- `/Users/asyuyukiume/Projects/Agentkey/db/schema.sql`
- `/Users/asyuyukiume/Projects/Agentkey/docs/API_ARCHITECTURE.md`

