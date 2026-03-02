# Agent Key ATS データベース辞書

生成日時: 2026-03-02 18:03:34 JST
テーブル数: 32

## 目次

- [ad_details](#ad_details) — 広告媒体の契約・費用詳細
- [ats_settings](#ats_settings) — ATS外部連携設定（Kintone等）
- [candidate_app_profile_deprecated](#candidate_app_profile_deprecated) — 旧プロフィール構造の退避テーブル（非推奨）
- [candidate_applications](#candidate_applications) — 候補者ごとの応募/選考プロセス（企業別）
- [candidate_educations](#candidate_educations) — 候補者の学歴履歴
- [candidate_tasks](#candidate_tasks) — 候補者ごとの次回アクション・タスク
- [candidate_work_histories](#candidate_work_histories) — 候補者の職歴履歴
- [candidates](#candidates) — 候補者の基本情報・進捗・Kintone同期情報を保持する中核テーブル
- [clients](#clients) — 紹介先企業マスタ（契約・要件・担当連絡先）
- [goal_daily_targets](#goal_daily_targets) — 日次目標値
- [goal_settings](#goal_settings) — 目標設定の期間・対象設定
- [goal_targets](#goal_targets) — 目標値（期間単位）
- [kintone_sync_cursors](#kintone_sync_cursors) — Kintone同期カーソル（最終同期位置）
- [kintone_sync_runs](#kintone_sync_runs) — Kintone同期ジョブの実行履歴
- [kpi_targets](#kpi_targets) — KPI目標値設定
- [meeting_plans](#meeting_plans) — 面接回次ごとの予定・出席結果
- [member_requests](#member_requests) — メンバー申請/依頼データ
- [ms_daily_targets](#ms_daily_targets) — MS向け日次目標値
- [ms_period_settings](#ms_period_settings) — 指標ごとのMS対象月および集計期間
- [ms_period_targets](#ms_period_targets) — MS向け期間目標値
- [placements](#placements) — 成約/返金関連の実績情報
- [resume_documents](#resume_documents) — 候補者に紐づく提出書類メタ情報
- [screening_rules](#screening_rules) — 有効応募判定ルール（年齢/国籍/JLPT）
- [selection_progress](#selection_progress) — 選考進捗の時系列（企業名・日付・状態）
- [stamp_reads](#stamp_reads) — スタンプ既読情報
- [stamps](#stamps) — スタンプ（通知・お祝い等）
- [sync_state](#sync_state) — sync_state
- [system_options](#system_options) — システム設定オプション
- [teleapo](#teleapo) — テレアポ（架電記録）
- [user_important_metrics](#user_important_metrics) — ユーザー別の重要指標設定
- [user_profiles](#user_profiles) — ユーザープロフィール拡張情報
- [users](#users) — ユーザーマスタ（認証・権限・所属）

---

## ad_details

**説明**: 広告媒体の契約・費用詳細  
**レコード数**: 5件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | integer | × | 主キー（自動採番） | 5件(全件) | ✅ 使用中 |
| 2 | media_name | varchar(255) | × | 媒体名 | 5件(全件) | ✅ 使用中 |
| 3 | contract_start_date | date | ○ | 契約開始日 | 5件(全件) | ✅ 使用中 |
| 4 | contract_end_date | date | ○ | 契約終了日 | 2件 | ✅ 使用中 |
| 5 | contract_amount | integer | ○ | 契約金額 | 5件(全件) | ✅ 使用中 |
| 6 | amount_period | varchar(50) | ○ | 金額対象期間 | 4件 | ✅ 使用中 |
| 7 | contract_method | text | ○ | 契約形態 | 1件 | ✅ 使用中 |
| 8 | renewal_terms | text | ○ | 更新条件 | 1件 | ✅ 使用中 |
| 9 | memo | text | ○ | メモ・備考 | 1件 | ✅ 使用中 |
| 10 | created_at | timestamp with time zone | ○ | レコード作成日時 | 5件(全件) | ✅ 使用中 |
| 11 | updated_at | timestamp with time zone | ○ | レコード更新日時 | 5件(全件) | ✅ 使用中 |

---

## ats_settings

**説明**: ATS外部連携設定（Kintone等）  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | smallint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | kintone_subdomain | text | × | Kintoneサブドメイン | - | ✅ 使用中 |
| 3 | kintone_app_id | text | × | KintoneアプリID | - | ✅ 使用中 |
| 4 | kintone_api_token | text | × | Kintone APIトークン | - | ✅ 使用中 |
| 5 | created_at | timestamp with time zone | × | レコード作成日時 | - | ✅ 使用中 |
| 6 | updated_at | timestamp with time zone | × | レコード更新日時 | - | ✅ 使用中 |

---

## candidate_app_profile_deprecated

**説明**: 旧プロフィール構造の退避テーブル（非推奨）  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | candidate_id | bigint | × | 候補者ID（candidatesテーブル参照） | - | ✅ 使用中 |
| 3 | nationality | character varying | ○ | 国籍 | - | ✅ 使用中 |
| 4 | japanese_level | character varying | ○ | 日本語レベル（JLPTなど） | - | ✅ 使用中 |
| 5 | address_pref | character varying | ○ | 都道府県 | - | ✅ 使用中 |
| 6 | address_city | character varying | ○ | 市区町村 | - | ✅ 使用中 |
| 7 | address_detail | character varying | ○ | 住所詳細 | - | ✅ 使用中 |
| 8 | final_education | character varying | ○ | 最終学歴 | - | ✅ 使用中 |
| 9 | work_experience | text | ○ | 職務経験 | - | ✅ 使用中 |
| 10 | interview_memo_formatted | text | ○ | 面接メモ（整形済） | - | ❌ 未使用 |
| 11 | current_income | character varying | ○ | 現在年収 | - | ✅ 使用中 |
| 12 | desired_income | character varying | ○ | 希望年収 | - | ✅ 使用中 |
| 13 | job_search_status | text | ○ | 転職活動ステータス | - | ❌ 未使用 |
| 14 | desired_job_type | text | ○ | 希望職種 | - | ✅ 使用中 |
| 15 | desired_work_location | text | ○ | 希望勤務地 | - | ✅ 使用中 |
| 16 | reason_for_change | text | ○ | 転職理由 | - | ✅ 使用中 |
| 17 | strengths | text | ○ | 強み・アピールポイント | - | ✅ 使用中 |
| 18 | personality | text | ○ | 性格・パーソナリティ | - | ✅ 使用中 |
| 19 | carrier_summary_sheet_url | text | ○ | キャリアサマリーシートURL | - | ❌ 未使用 |
| 20 | resume_url | text | ○ | 履歴書URL | - | ❌ 未使用 |
| 21 | created_at | timestamp with time zone | × | レコード作成日時 | - | ✅ 使用中 |
| 22 | updated_at | timestamp with time zone | × | レコード更新日時 | - | ✅ 使用中 |
| 23 | job_change_axis | text | ○ | 転職軸 | - | ✅ 使用中 |
| 24 | job_change_timing | text | ○ | 転職希望時期 | - | ✅ 使用中 |
| 25 | future_vision | text | ○ | 将来ビジョン | - | ✅ 使用中 |
| 26 | recommendation_text | text | ○ | 推薦文 | - | ✅ 使用中 |
| 27 | other_selection_status | text | ○ | 他社選考状況 | - | ✅ 使用中 |
| 28 | desired_interview_dates | text | ○ | 面接希望日程 | - | ✅ 使用中 |
| 29 | mandatory_interview_items | text | ○ | 面接必須項目 | - | ✅ 使用中 |
| 30 | shared_interview_date | text | ○ | 共有面接日程 | - | ✅ 使用中 |

---

## candidate_applications

**説明**: 候補者ごとの応募/選考プロセス（企業別）  
**レコード数**: 9件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | 9件(全件) | ✅ 使用中 |
| 2 | candidate_id | bigint | × | 候補者ID（candidatesテーブル参照） (FK→candidates.id) | 9件(全件) | ✅ 使用中 |
| 3 | client_id | bigint | × | 企業ID（clientsテーブル参照） (FK→clients.id) | 9件(全件) | ✅ 使用中 |
| 4 | kintone_sub_id | text | ○ | Kintoneサブ管理ID | 空 | ❌ 未使用 |
| 5 | job_title | text | ○ | 求人タイトル | 9件(全件) | ✅ 使用中 |
| 6 | apply_route | text | ○ | 応募経路 | 9件(全件) | ✅ 使用中 |
| 7 | recommended_at | timestamp with time zone | ○ | 推薦日時 | 空 | ✅ 使用中 |
| 8 | first_interview_set_at | timestamp with time zone | ○ | 一次面接日程設定日時 | 空 | ✅ 使用中 |
| 9 | first_interview_at | timestamp with time zone | ○ | 一次面接実施日時 | 空 | ✅ 使用中 |
| 10 | second_interview_set_at | timestamp with time zone | ○ | 二次面接日程設定日時 | 空 | ✅ 使用中 |
| 11 | second_interview_at | timestamp with time zone | ○ | 二次面接実施日時 | 空 | ✅ 使用中 |
| 12 | offer_date | timestamp with time zone | ○ | 内定日 | 5件 | ✅ 使用中 |
| 13 | close_expected_at | timestamp with time zone | ○ | 成約見込日時 | 空 | ✅ 使用中 |
| 14 | offer_accept_date | timestamp with time zone | ○ | 内定承諾日 | 3件 | ✅ 使用中 |
| 15 | join_date | timestamp with time zone | ○ | 入社日 | 4件 | ✅ 使用中 |
| 16 | pre_join_withdraw_date | timestamp with time zone | ○ | 入社前辞退日 | 空 | ✅ 使用中 |
| 17 | post_join_quit_date | timestamp with time zone | ○ | 入社後退職日 | 空 | ✅ 使用中 |
| 18 | stage_current | text | ○ | 現在の選考ステージ | 9件(全件) | ✅ 使用中 |
| 19 | is_quit_30 | boolean | ○ | 30日以内退職フラグ | 空 | ✅ 使用中 |
| 20 | created_at | timestamp with time zone | × | レコード作成日時 | 9件(全件) | ✅ 使用中 |
| 21 | updated_at | timestamp with time zone | × | レコード更新日時 | 9件(全件) | ✅ 使用中 |
| 22 | selection_note | text | ○ | 選考メモ | 空 | ✅ 使用中 |
| 23 | pre_join_withdraw_reason | text | ○ | 入社前辞退理由 | 空 | ✅ 使用中 |
| 24 | post_join_quit_reason | text | ○ | 入社後退職理由 | 空 | ✅ 使用中 |
| 25 | recommendation_text | text | ○ | 推薦文 | 空 | ✅ 使用中 |
| 26 | final_interview_set_at | date | ○ | 最終面接日程設定日時 | 空 | ✅ 使用中 |
| 27 | final_interview_at | date | ○ | 最終面接実施日時 | 空 | ✅ 使用中 |
| 28 | offer_at | date | ○ | 内定日時 | 5件 | ✅ 使用中 |
| 29 | offer_accepted_at | date | ○ | 内定承諾日時 | 3件 | ✅ 使用中 |
| 30 | joined_at | date | ○ | 入社日時 | 4件 | ✅ 使用中 |
| 31 | declined_after_offer_at | date | ○ | 内定後辞退日時 | 空 | ✅ 使用中 |
| 32 | declined_after_offer_reason | text | ○ | 内定後辞退理由 | 空 | ✅ 使用中 |
| 33 | early_turnover_at | date | ○ | 早期離職日時 | 空 | ✅ 使用中 |
| 34 | early_turnover_reason | text | ○ | 早期離職理由 | 空 | ✅ 使用中 |
| 35 | closing_forecast_at | date | ○ | 成約見込日時 | 空 | ✅ 使用中 |
| 36 | fee | integer | ○ | 紹介手数料 | 空 | ✅ 使用中 |
| 37 | note | text | ○ | メモ | 空 | ✅ 使用中 |
| 38 | proposal_date | timestamp with time zone | ○ | 提案日 | 1件 | ✅ 使用中 |
| 39 | work_mode | character varying | ○ | 勤務形態 | 空 | ✅ 使用中 |
| 40 | fee_rate | character varying | ○ | 紹介手数料率 | 空 | ✅ 使用中 |
| 41 | selection_status | character varying | ○ | 選考ステータス | 空 | ✅ 使用中 |
| 42 | recommendation_at | timestamp with time zone | ○ | 推薦日時 | 空 | ✅ 使用中 |
| 43 | pre_join_decline_at | timestamp with time zone | ○ | 入社前辞退日時 | 空 | ✅ 使用中 |
| 44 | post_join_quit_at | timestamp with time zone | ○ | 入社後退職日時 | 空 | ✅ 使用中 |
| 45 | closing_plan_date | date | ○ | 成約予定日 | 空 | ✅ 使用中 |
| 46 | fee_amount | text | ○ | 紹介手数料額 | 空 | ✅ 使用中 |
| 47 | declined_reason | text | ○ | 辞退理由 | 空 | ✅ 使用中 |
| 48 | refund_amount | integer | ○ | 返金金額 | 空 | ✅ 使用中 |
| 49 | order_reported | boolean | ○ | 受注報告済みフラグ | 9件(全件) | ✅ 使用中 |
| 50 | refund_reported | boolean | ○ | 返金報告済みフラグ | 9件(全件) | ✅ 使用中 |

---

## candidate_educations

**説明**: 候補者の学歴履歴  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | candidate_id | bigint | × | 候補者ID（candidatesテーブル参照） | - | ✅ 使用中 |
| 3 | school_name | text | ○ | 学校名 | - | ✅ 使用中 |
| 4 | department | text | ○ | 学部・部署 | - | ✅ 使用中 |
| 5 | admission_date | date | ○ | 入学日 | - | ✅ 使用中 |
| 6 | graduation_date | date | ○ | 卒業日 | - | ✅ 使用中 |
| 7 | graduation_status | text | ○ | 卒業状態 | - | ✅ 使用中 |
| 8 | sequence | integer | ○ | 表示順序 | - | ✅ 使用中 |
| 9 | created_at | timestamp with time zone | × | レコード作成日時 | - | ✅ 使用中 |
| 10 | updated_at | timestamp with time zone | × | レコード更新日時 | - | ✅ 使用中 |

---

## candidate_tasks

**説明**: 候補者ごとの次回アクション・タスク  
**レコード数**: 33件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | integer | × | 主キー（自動採番） | 33件(全件) | ✅ 使用中 |
| 2 | candidate_id | integer | × | 候補者ID（candidatesテーブル参照） (FK→candidates.id) | 33件(全件) | ✅ 使用中 |
| 3 | action_date | date | ○ | アクション予定日 | 33件(全件) | ✅ 使用中 |
| 4 | action_note | text | ○ | アクション内容メモ | 27件 | ✅ 使用中 |
| 5 | is_completed | boolean | ○ | 完了フラグ | 33件(全件) | ✅ 使用中 |
| 6 | completed_at | timestamp without time zone | ○ | 完了日時 | 33件(全件) | ✅ 使用中 |
| 7 | created_at | timestamp without time zone | ○ | レコード作成日時 | 33件(全件) | ✅ 使用中 |
| 8 | updated_at | timestamp without time zone | ○ | レコード更新日時 | 33件(全件) | ✅ 使用中 |

---

## candidate_work_histories

**説明**: 候補者の職歴履歴  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | candidate_id | bigint | × | 候補者ID（candidatesテーブル参照） | - | ✅ 使用中 |
| 3 | company_name | text | ○ | 企業名・所属会社名 | - | ✅ 使用中 |
| 4 | department | text | ○ | 学部・部署 | - | ✅ 使用中 |
| 5 | position | text | ○ | 役職 | - | ✅ 使用中 |
| 6 | join_date | date | ○ | 入社日 | - | ✅ 使用中 |
| 7 | leave_date | date | ○ | 退社日 | - | ✅ 使用中 |
| 8 | is_current | boolean | ○ | 現職フラグ | - | ✅ 使用中 |
| 9 | job_description | text | ○ | 職務内容 | - | ✅ 使用中 |
| 10 | sequence | integer | ○ | 表示順序 | - | ✅ 使用中 |
| 11 | created_at | timestamp with time zone | × | レコード作成日時 | - | ✅ 使用中 |
| 12 | updated_at | timestamp with time zone | × | レコード更新日時 | - | ✅ 使用中 |

---

## candidates

**説明**: 候補者の基本情報・進捗・Kintone同期情報を保持する中核テーブル  
**レコード数**: 1,490件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | 1,490件(全件) | ✅ 使用中 |
| 2 | kintone_app_id | integer | ○ | KintoneアプリID | 空 | ✅ 使用中 |
| 3 | kintone_record_id | integer | ○ | KintoneレコードID（同期用） | 1,478件 | ✅ 使用中 |
| 4 | candidate_code | text | ○ | 候補者コード | 空 | ✅ 使用中 |
| 5 | advisor_user_id | bigint | ○ | 担当アドバイザーのユーザーID (FK→users.id) | 182件 | ✅ 使用中 |
| 6 | partner_user_id | bigint | ○ | パートナー担当のユーザーID (FK→users.id) | 271件 | ✅ 使用中 |
| 7 | name | text | × | 名前 | 1,490件(全件) | ✅ 使用中 |
| 8 | name_kana | text | ○ | 名前（カナ） | 12件 | ✅ 使用中 |
| 9 | gender | text | ○ | 性別 | 20件 | ✅ 使用中 |
| 10 | birth_date | date | ○ | 生年月日 | 6件 | ✅ 使用中 |
| 11 | age | integer | ○ | 年齢 | 1,483件 | ✅ 使用中 |
| 12 | final_education | text | ○ | 最終学歴 | 1件 | ✅ 使用中 |
| 13 | phone | text | ○ | 電話番号 | 1,480件 | ✅ 使用中 |
| 14 | email | text | ○ | メールアドレス | 1,489件 | ✅ 使用中 |
| 15 | postal_code | text | ○ | 郵便番号 | 1件 | ✅ 使用中 |
| 16 | address_pref | text | ○ | 都道府県 | 2件 | ✅ 使用中 |
| 17 | address_city | text | ○ | 市区町村 | 1件 | ✅ 使用中 |
| 18 | address_detail | text | ○ | 住所詳細 | 1件 | ✅ 使用中 |
| 19 | employment_status | text | ○ | 雇用形態・就業状況 | 19件 | ✅ 使用中 |
| 20 | current_income | text | ○ | 現在年収 | 3件 | ✅ 使用中 |
| 21 | desired_income | text | ○ | 希望年収 | 3件 | ✅ 使用中 |
| 22 | first_interview_note | text | ○ | 一次面接メモ | 2件 | ✅ 使用中 |
| 23 | career_motivation | text | ○ | キャリアモチベーション | 1件 | ✅ 使用中 |
| 24 | desired_location | text | ○ | desired location | 2件 | ✅ 使用中 |
| 25 | memo | text | ○ | メモ・備考 | 空 | ✅ 使用中 |
| 26 | new_status | text | ○ | 新ステータス | 4件 | ✅ 使用中 |
| 27 | first_schedule_fixed_at | timestamp with time zone | ○ | 初回日程確定日時 | 空 | ✅ 使用中 |
| 28 | first_contact_planned_at | timestamp with time zone | ○ | 初回コンタクト予定日 | 空 | ✅ 使用中 |
| 29 | first_contact_at | timestamp with time zone | ○ | 初回コンタクト日 | 5件 | ✅ 使用中 |
| 30 | first_interview_attended | boolean | ○ | 一次面接出席フラグ | 64件 | ✅ 使用中 |
| 31 | is_effective_application | boolean | ○ | 有効応募判定フラグ | 1,489件 | ✅ 使用中 |
| 32 | created_at | timestamp with time zone | × | レコード作成日時 | 1,490件(全件) | ✅ 使用中 |
| 33 | updated_at | timestamp with time zone | × | レコード更新日時 | 1,490件(全件) | ✅ 使用中 |
| 34 | sms_sent_flag | boolean | ○ | sms sent flag | 空 | ✅ 使用中 |
| 35 | is_connected | boolean | ○ | 接続済みフラグ | 21件 | ✅ 使用中 |
| 36 | first_call_at | timestamp without time zone | ○ | 初回架電日時 | 21件 | ✅ 使用中 |
| 37 | skills | text | ○ | スキル | 2件 | ✅ 使用中 |
| 38 | personality | text | ○ | 性格・パーソナリティ | 2件 | ✅ 使用中 |
| 39 | work_experience | text | ○ | 職務経験 | 2件 | ✅ 使用中 |
| 40 | contact_preferred_time | text | ○ | contact preferred time | 空 | ✅ 使用中 |
| 41 | mandatory_interview_items | text | ○ | 面接必須項目 | 3件 | ✅ 使用中 |
| 42 | apply_company_name | text | ○ | apply company名 | 501件 | ✅ 使用中 |
| 43 | apply_job_name | text | ○ | apply job名 | 515件 | ✅ 使用中 |
| 44 | apply_route_text | text | ○ | apply route text | 512件 | ✅ 使用中 |
| 45 | application_note | text | ○ | 応募メモ | 空 | ✅ 使用中 |
| 46 | desired_job_type | text | ○ | 希望職種 | 2件 | ✅ 使用中 |
| 47 | career_reason | text | ○ | career reason | 2件 | ✅ 使用中 |
| 48 | transfer_timing | text | ○ | transfer timing | 1件 | ✅ 使用中 |
| 49 | other_selection_status | text | ○ | 他社選考状況 | 7件 | ✅ 使用中 |
| 50 | interview_preferred_date | text | ○ | interview preferred日 | 1件 | ✅ 使用中 |
| 51 | recommendation_text | text | ○ | 推薦文 | 空 | ✅ 使用中 |
| 52 | nationality | varchar(100) | ○ | 国籍 | 5件 | ✅ 使用中 |
| 53 | japanese_level | varchar(10) | ○ | 日本語レベル（JLPTなど） | 2件 | ✅ 使用中 |
| 54 | next_action_date | date | ○ | 次回アクション日 | 空 | ✅ 使用中 |
| 55 | next_action_note | text | ○ | 次回アクションメモ | 空 | ✅ 使用中 |
| 56 | candidate_name | text | ○ | 候補者名 | 1,479件 | ✅ 使用中 |
| 57 | candidate_kana | text | ○ | 候補者名（カナ） | 空 | ✅ 使用中 |
| 58 | company_name | text | ○ | 企業名・所属会社名 | 1,479件 | ✅ 使用中 |
| 59 | job_name | text | ○ | 職種名 | 1,479件 | ✅ 使用中 |
| 60 | work_location | text | ○ | 勤務地 | 557件 | ✅ 使用中 |
| 61 | advisor_name | text | ○ | アドバイザー名 | 空 | ✅ 使用中 |
| 62 | caller_name | text | ○ | 架電担当者名 | 空 | ✅ 使用中 |
| 63 | partner_name | text | ○ | パートナー名 | 238件 | ✅ 使用中 |
| 64 | introduction_chance | text | ○ | 紹介可能性 | 空 | ✅ 使用中 |
| 65 | phase | text | ○ | 候補者フェーズ（進捗段階） | 空 | ✅ 使用中 |
| 66 | registered_date | date | ○ | 登録日 | 1,479件 | ✅ 使用中 |
| 67 | registered_at | timestamp with time zone | ○ | 登録日時 | 1,479件 | ✅ 使用中 |
| 68 | candidate_updated_at | timestamp with time zone | ○ | 候補者情報更新日時 | 空 | ✅ 使用中 |
| 69 | media_registered_at | date | ○ | 媒体登録日 | 空 | ✅ 使用中 |
| 70 | source | text | ○ | 紹介元・流入媒体 | 1,473件 | ✅ 使用中 |
| 71 | birthday | date | ○ | 生年月日 | 1,393件 | ✅ 使用中 |
| 72 | education | text | ○ | 学歴 | 空 | ✅ 使用中 |
| 73 | address | text | ○ | 住所 | 空 | ✅ 使用中 |
| 74 | city | text | ○ | 市区町村 | 空 | ✅ 使用中 |
| 75 | contact_time | text | ○ | 連絡可能時間帯 | 空 | ✅ 使用中 |
| 76 | remarks | text | ○ | 備考 | 1件 | ✅ 使用中 |
| 77 | memo_detail | text | ○ | メモ詳細 | 空 | ✅ 使用中 |
| 78 | hearing_memo | text | ○ | ヒアリングメモ | 空 | ✅ 使用中 |
| 79 | resume_status | text | ○ | 履歴書ステータス | 空 | ✅ 使用中 |
| 80 | meeting_video_url | text | ○ | 面談動画URL | 空 | ✅ 使用中 |
| 81 | resume_for_send | text | ○ | 送付用履歴書 | 空 | ✅ 使用中 |
| 82 | work_history_for_send | text | ○ | 送付用職務経歴書 | 空 | ✅ 使用中 |
| 83 | call_date | date | ○ | 架電日 | 空 | ✅ 使用中 |
| 84 | schedule_confirmed_at | date | ○ | 日程確定日 | 空 | ✅ 使用中 |
| 85 | recommendation_date | date | ○ | 推薦日 | 空 | ✅ 使用中 |
| 86 | valid_application | boolean | ○ | 有効応募フラグ | 空 | ✅ 使用中 |
| 87 | phone_connected | boolean | ○ | 電話接続済みフラグ | 空 | ✅ 使用中 |
| 88 | sms_sent | boolean | ○ | SMS送信済みフラグ | 空 | ✅ 使用中 |
| 89 | sms_confirmed | boolean | ○ | SMS確認済みフラグ | 空 | ✅ 使用中 |
| 90 | attendance_confirmed | boolean | ○ | 出席確認済みフラグ | 空 | ✅ 使用中 |
| 91 | final_result | text | ○ | 最終結果 | 空 | ✅ 使用中 |
| 92 | order_amount | text | ○ | 受注金額 | 空 | ✅ 使用中 |
| 93 | after_acceptance_job_type | text | ○ | 承諾後職種 | 空 | ✅ 使用中 |
| 94 | line_reported | boolean | ○ | LINE報告済みフラグ | 空 | ✅ 使用中 |
| 95 | personal_sheet_reflected | boolean | ○ | 個人シート反映済みフラグ | 空 | ✅ 使用中 |
| 96 | invoice_sent | boolean | ○ | 請求書送付済みフラグ | 空 | ✅ 使用中 |
| 97 | cs_valid_confirmed | boolean | ○ | CS有効確認済みフラグ | 空 | ✅ 使用中 |
| 98 | cs_connect_confirmed | boolean | ○ | CS接続確認済みフラグ | 空 | ✅ 使用中 |
| 99 | refund_retirement_date | date | ○ | 返金対象退職日 | 空 | ✅ 使用中 |
| 100 | refund_amount | text | ○ | 返金金額 | 空 | ✅ 使用中 |
| 101 | refund_report | text | ○ | 返金報告 | 空 | ✅ 使用中 |
| 102 | cs_call_attempt1 | boolean | ○ | CS架電1回目フラグ | 空 | ✅ 使用中 |
| 103 | cs_call_attempt2 | boolean | ○ | CS架電2回目フラグ | 空 | ✅ 使用中 |
| 104 | cs_call_attempt3 | boolean | ○ | CS架電3回目フラグ | 空 | ✅ 使用中 |
| 105 | cs_call_attempt4 | boolean | ○ | CS架電4回目フラグ | 空 | ✅ 使用中 |
| 106 | cs_call_attempt5 | boolean | ○ | CS架電5回目フラグ | 空 | ✅ 使用中 |
| 107 | cs_call_attempt6 | boolean | ○ | CS架電6回目フラグ | 空 | ✅ 使用中 |
| 108 | cs_call_attempt7 | boolean | ○ | CS架電7回目フラグ | 空 | ✅ 使用中 |
| 109 | cs_call_attempt8 | boolean | ○ | CS架電8回目フラグ | 空 | ✅ 使用中 |
| 110 | cs_call_attempt9 | boolean | ○ | CS架電9回目フラグ | 空 | ✅ 使用中 |
| 111 | cs_call_attempt10 | boolean | ○ | CS架電10回目フラグ | 空 | ✅ 使用中 |
| 112 | detail | jsonb | ○ | 詳細情報（JSON形式） | 空 | ✅ 使用中 |
| 113 | kintone_updated_time | timestamp with time zone | ○ | Kintone更新日時 | 1,479件 | ✅ 使用中 |
| 114 | cs_user_id | uuid | ○ | CS担当のユーザーID | 空 | ✅ 使用中 |
| 115 | final_education_detail | text | ○ | 最終学歴詳細 | 空 | ❌ 未使用 |
| 116 | job_search_status | text | ○ | 転職活動ステータス | 空 | ❌ 未使用 |
| 117 | desired_work_location | text | ○ | 希望勤務地 | 空 | ✅ 使用中 |
| 118 | reason_for_change | text | ○ | 転職理由 | 空 | ✅ 使用中 |
| 119 | strengths | text | ○ | 強み・アピールポイント | 空 | ✅ 使用中 |
| 120 | job_change_axis | text | ○ | 転職軸 | 空 | ✅ 使用中 |
| 121 | job_change_timing | text | ○ | 転職希望時期 | 空 | ✅ 使用中 |
| 122 | future_vision | text | ○ | 将来ビジョン | 1件 | ✅ 使用中 |
| 123 | desired_interview_dates | text | ○ | 面接希望日程 | 空 | ✅ 使用中 |
| 124 | shared_interview_date | text | ○ | 共有面接日程 | 空 | ✅ 使用中 |
| 125 | carrier_summary_sheet_url | text | ○ | キャリアサマリーシートURL | 空 | ❌ 未使用 |
| 126 | resume_url | text | ○ | 履歴書URL | 空 | ❌ 未使用 |
| 127 | next_action_content | text | ○ | 次回アクション内容 | 空 | ✅ 使用中 |
| 128 | cs_name | text | ○ | CS担当者名 | 265件 | ✅ 使用中 |
| 129 | cs_status | text | ○ | CSステータス | 7件 | ✅ 使用中 |
| 130 | hearing_free_memo | text | ○ | ヒアリング自由記述メモ | 2件 | ✅ 使用中 |
| 131 | has_chronic_disease | boolean | ○ | 持病有無フラグ | 6件 | ✅ 使用中 |
| 132 | chronic_disease_detail | text | ○ | 持病詳細 | 2件 | ❌ 未使用 |
| 133 | relocation_possible | boolean | ○ | 転居可否 | 6件 | ❌ 未使用 |
| 134 | relocation_impossible_reason | text | ○ | 転居不可の理由 | 2件 | ❌ 未使用 |
| 135 | personal_concerns | text | ○ | 個人的な懸念事項 | 2件 | ✅ 使用中 |
| 136 | cs_status_notify_sent_at | timestamp with time zone | ○ | cs status notify sent日時 | 2件 | ✅ 使用中 |

---

## clients

**説明**: 紹介先企業マスタ（契約・要件・担当連絡先）  
**レコード数**: 598件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | 598件(全件) | ✅ 使用中 |
| 2 | name | text | × | 名前 | 598件(全件) | ✅ 使用中 |
| 3 | industry | text | ○ | 業種 | 523件 | ✅ 使用中 |
| 4 | location | text | ○ | 所在地 | 空 | ✅ 使用中 |
| 5 | created_at | timestamp with time zone | × | レコード作成日時 | 598件(全件) | ✅ 使用中 |
| 6 | updated_at | timestamp with time zone | × | レコード更新日時 | 598件(全件) | ✅ 使用中 |
| 7 | job_categories | text | ○ | 求人カテゴリ | 1件 | ✅ 使用中 |
| 8 | planned_hires_count | integer | ○ | 採用予定人数 | 598件(全件) | ✅ 使用中 |
| 9 | salary_range | text | ○ | 給与レンジ | 空 | ✅ 使用中 |
| 10 | must_qualifications | text | ○ | 必須資格（配列） | 3件 | ✅ 使用中 |
| 11 | nice_qualifications | text | ○ | 歓迎資格（配列） | 3件 | ✅ 使用中 |
| 12 | desired_locations | text | ○ | 希望勤務地（配列） | 3件 | ✅ 使用中 |
| 13 | personality_traits | text | ○ | 求める人物像（配列） | 3件 | ✅ 使用中 |
| 14 | required_experience | text | ○ | 必要経験（配列） | 3件 | ✅ 使用中 |
| 15 | selection_note | text | ○ | 選考メモ | 空 | ✅ 使用中 |
| 16 | warranty_period | integer | ○ | 保証期間 | 595件 | ✅ 使用中 |
| 17 | contact_name | text | ○ | 企業担当者名 | 空 | ✅ 使用中 |
| 18 | contact_email | text | ○ | 企業担当者メール | 空 | ✅ 使用中 |
| 19 | fee_details | text | ○ | 紹介手数料詳細 | 空 | ✅ 使用中 |
| 20 | contract_note | text | ○ | 契約メモ | 空 | ✅ 使用中 |
| 21 | employees_count | integer | ○ | 従業員数 | 空 | ❌ 未使用 |
| 22 | fee_amount | integer | ○ | 紹介手数料額 | 空 | ✅ 使用中 |
| 23 | salary_min | integer | ○ | 最低給与 | 空 | ✅ 使用中 |
| 24 | salary_max | integer | ○ | 最高給与 | 空 | ✅ 使用中 |

---

## goal_daily_targets

**説明**: 日次目標値  
**レコード数**: 160件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | 160件(全件) | ✅ 使用中 |
| 2 | advisor_user_id | integer | × | 担当アドバイザーのユーザーID | 160件(全件) | ✅ 使用中 |
| 3 | period_id | text | × | 期間ID | 160件(全件) | ✅ 使用中 |
| 4 | target_date | date | × | 対象日 | 160件(全件) | ✅ 使用中 |
| 5 | targets | jsonb | × | 目標値セット（JSON形式） | 160件(全件) | ✅ 使用中 |
| 6 | created_at | timestamp with time zone | × | レコード作成日時 | 160件(全件) | ✅ 使用中 |
| 7 | updated_at | timestamp with time zone | × | レコード更新日時 | 160件(全件) | ✅ 使用中 |

---

## goal_settings

**説明**: 目標設定の期間・対象設定  
**レコード数**: 1件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | smallint | × | 主キー（自動採番） | 1件(全件) | ✅ 使用中 |
| 2 | evaluation_rule_type | text | × | 評価ルール種別 | 1件(全件) | ✅ 使用中 |
| 3 | evaluation_rule_options | jsonb | × | 評価ルールオプション（JSON形式） | 1件(全件) | ✅ 使用中 |
| 4 | updated_at | timestamp with time zone | × | レコード更新日時 | 1件(全件) | ✅ 使用中 |

---

## goal_targets

**説明**: 目標値（期間単位）  
**レコード数**: 19件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | 19件(全件) | ✅ 使用中 |
| 2 | scope | text | × | 範囲（全体/個人） | 19件(全件) | ✅ 使用中 |
| 3 | advisor_user_id | integer | ○ | 担当アドバイザーのユーザーID | 10件 | ✅ 使用中 |
| 4 | period_id | text | × | 期間ID | 19件(全件) | ✅ 使用中 |
| 5 | targets | jsonb | × | 目標値セット（JSON形式） | 19件(全件) | ✅ 使用中 |
| 6 | created_at | timestamp with time zone | × | レコード作成日時 | 19件(全件) | ✅ 使用中 |
| 7 | updated_at | timestamp with time zone | × | レコード更新日時 | 19件(全件) | ✅ 使用中 |

---

## kintone_sync_cursors

**説明**: Kintone同期カーソル（最終同期位置）  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | system_name | character varying | × | システム名 | - | ❌ 未使用 |
| 3 | last_kintone_record_id_synced | integer | ○ | 最終同期レコードID | - | ❌ 未使用 |
| 4 | last_sync_started_at | timestamp with time zone | ○ | 最終同期開始日時 | - | ❌ 未使用 |
| 5 | last_sync_finished_at | timestamp with time zone | ○ | 最終同期終了日時 | - | ❌ 未使用 |
| 6 | updated_at | timestamp with time zone | × | レコード更新日時 | - | ✅ 使用中 |

---

## kintone_sync_runs

**説明**: Kintone同期ジョブの実行履歴  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | system_name | character varying | × | システム名 | - | ❌ 未使用 |
| 3 | started_at | timestamp with time zone | ○ | 開始日時 | - | ❌ 未使用 |
| 4 | finished_at | timestamp with time zone | ○ | 終了日時 | - | ❌ 未使用 |
| 5 | inserted_count | integer | ○ | 挿入件数 | - | ❌ 未使用 |
| 6 | updated_count | integer | ○ | 更新件数 | - | ❌ 未使用 |
| 7 | skipped_count | integer | ○ | スキップ件数 | - | ❌ 未使用 |
| 8 | error_count | integer | ○ | エラー件数 | - | ❌ 未使用 |
| 9 | error_summary | text | ○ | エラーサマリー | - | ❌ 未使用 |
| 10 | created_at | timestamp with time zone | × | レコード作成日時 | - | ✅ 使用中 |

---

## kpi_targets

**説明**: KPI目標値設定  
**レコード数**: 51件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | integer | × | 主キー（自動採番） | 51件(全件) | ✅ 使用中 |
| 2 | target_month | varchar(7) | × | 対象月 | 51件(全件) | ✅ 使用中 |
| 3 | metric_key | varchar(50) | × | 指標キー名 | 51件(全件) | ✅ 使用中 |
| 4 | target_value | numeric | ○ | 目標値 | 51件(全件) | ✅ 使用中 |
| 5 | created_at | timestamp without time zone | ○ | レコード作成日時 | 51件(全件) | ✅ 使用中 |
| 6 | updated_at | timestamp without time zone | ○ | レコード更新日時 | 51件(全件) | ✅ 使用中 |

---

## meeting_plans

**説明**: 面接回次ごとの予定・出席結果  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | candidate_id | bigint | × | 候補者ID（candidatesテーブル参照） | - | ✅ 使用中 |
| 3 | sequence | integer | × | 表示順序 | - | ✅ 使用中 |
| 4 | planned_date | date | ○ | 予定日 | - | ✅ 使用中 |
| 5 | attendance | boolean | ○ | 出席フラグ | - | ✅ 使用中 |
| 6 | created_at | timestamp with time zone | × | レコード作成日時 | - | ✅ 使用中 |
| 7 | updated_at | timestamp with time zone | × | レコード更新日時 | - | ✅ 使用中 |

---

## member_requests

**説明**: メンバー申請/依頼データ  
**レコード数**: 60件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | 60件(全件) | ✅ 使用中 |
| 2 | name | text | × | 名前 | 60件(全件) | ✅ 使用中 |
| 3 | email | text | × | メールアドレス | 60件(全件) | ✅ 使用中 |
| 4 | role | text | × | ロール・権限 | 60件(全件) | ✅ 使用中 |
| 5 | password_hash | text | × | パスワードハッシュ値 | 60件(全件) | ✅ 使用中 |
| 6 | is_admin | boolean | ○ | 管理者フラグ | 60件(全件) | ✅ 使用中 |
| 7 | status | text | ○ | ステータス | 60件(全件) | ✅ 使用中 |
| 8 | created_at | timestamp with time zone | ○ | レコード作成日時 | 60件(全件) | ✅ 使用中 |
| 9 | updated_at | timestamp with time zone | ○ | レコード更新日時 | 60件(全件) | ✅ 使用中 |
| 10 | approval_token | text | ○ | 承認トークン | 45件 | ✅ 使用中 |
| 11 | request_type | text | ○ | リクエスト種別 | 60件(全件) | ✅ 使用中 |
| 12 | target_user_id | bigint | ○ | 対象ユーザーID | 29件 | ✅ 使用中 |

---

## ms_daily_targets

**説明**: MS向け日次目標値  
**レコード数**: 743件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | 743件(全件) | ✅ 使用中 |
| 2 | scope | text | × | 範囲（全体/個人） | 743件(全件) | ✅ 使用中 |
| 3 | department_key | text | × | 部門キー | 743件(全件) | ✅ 使用中 |
| 4 | metric_key | text | × | 指標キー名 | 743件(全件) | ✅ 使用中 |
| 5 | advisor_user_id | bigint | ○ | 担当アドバイザーのユーザーID | 585件 | ✅ 使用中 |
| 6 | period_id | text | × | 期間ID | 743件(全件) | ✅ 使用中 |
| 7 | target_date | date | × | 対象日 | 743件(全件) | ✅ 使用中 |
| 8 | target_value | numeric | × | 目標値 | 743件(全件) | ✅ 使用中 |
| 9 | created_at | timestamp with time zone | × | レコード作成日時 | 743件(全件) | ✅ 使用中 |
| 10 | updated_at | timestamp with time zone | × | レコード更新日時 | 743件(全件) | ✅ 使用中 |

---

## ms_period_settings

**説明**: 指標ごとのMS対象月および集計期間  
**レコード数**: 3件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | integer | × | 主キー（自動採番） | 3件(全件) | ✅ 使用中 |
| 2 | target_month | varchar(7) | × | 対象月 | 3件(全件) | ✅ 使用中 |
| 3 | metric_key | varchar(64) | × | 指標キー名 | 3件(全件) | ✅ 使用中 |
| 4 | start_date | date | × | 開始日 | 3件(全件) | ✅ 使用中 |
| 5 | end_date | date | × | 終了日 | 3件(全件) | ✅ 使用中 |
| 6 | created_at | timestamp with time zone | ○ | レコード作成日時 | 3件(全件) | ✅ 使用中 |
| 7 | updated_at | timestamp with time zone | ○ | レコード更新日時 | 3件(全件) | ✅ 使用中 |

---

## ms_period_targets

**説明**: MS向け期間目標値  
**レコード数**: 42件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | 42件(全件) | ✅ 使用中 |
| 2 | scope | text | × | 範囲（全体/個人） | 42件(全件) | ✅ 使用中 |
| 3 | department_key | text | × | 部門キー | 42件(全件) | ✅ 使用中 |
| 4 | metric_key | text | × | 指標キー名 | 42件(全件) | ✅ 使用中 |
| 5 | advisor_user_id | bigint | ○ | 担当アドバイザーのユーザーID | 36件 | ✅ 使用中 |
| 6 | period_id | text | × | 期間ID | 42件(全件) | ✅ 使用中 |
| 7 | target_total | numeric | × | 目標合計値 | 42件(全件) | ✅ 使用中 |
| 8 | created_at | timestamp with time zone | × | レコード作成日時 | 42件(全件) | ✅ 使用中 |
| 9 | updated_at | timestamp with time zone | × | レコード更新日時 | 42件(全件) | ✅ 使用中 |

---

## placements

**説明**: 成約/返金関連の実績情報  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | candidate_application_id | bigint | × | 候補者応募ID（candidate_applicationsテーブル参照） (FK→candidate_applications.id) | - | ✅ 使用中 |
| 3 | fee_amount | integer | ○ | 紹介手数料額 | - | ✅ 使用中 |
| 4 | refund_amount | integer | ○ | 返金金額 | - | ✅ 使用中 |
| 5 | created_at | timestamp with time zone | × | レコード作成日時 | - | ✅ 使用中 |
| 6 | updated_at | timestamp with time zone | × | レコード更新日時 | - | ✅ 使用中 |
| 7 | order_reported | boolean | ○ | 受注報告済みフラグ | - | ✅ 使用中 |
| 8 | refund_reported | boolean | ○ | 返金報告済みフラグ | - | ✅ 使用中 |
| 9 | order_date | date | ○ | 受注日 | - | ✅ 使用中 |
| 10 | withdraw_date | date | ○ | 退職日 | - | ✅ 使用中 |

---

## resume_documents

**説明**: 候補者に紐づく提出書類メタ情報  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | candidate_id | bigint | × | 候補者ID（candidatesテーブル参照） | - | ✅ 使用中 |
| 3 | label | text | ○ | ラベル名 | - | ✅ 使用中 |
| 4 | document_value | text | ○ | 書類内容・URL | - | ✅ 使用中 |
| 5 | created_at | timestamp with time zone | × | レコード作成日時 | - | ✅ 使用中 |
| 6 | updated_at | timestamp with time zone | × | レコード更新日時 | - | ✅ 使用中 |

---

## screening_rules

**説明**: 有効応募判定ルール（年齢/国籍/JLPT）  
**レコード数**: 1件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | integer | × | 主キー（自動採番） | 1件(全件) | ✅ 使用中 |
| 2 | min_age | integer | ○ | 最低年齢 | 1件(全件) | ✅ 使用中 |
| 3 | max_age | integer | ○ | 最高年齢 | 1件(全件) | ✅ 使用中 |
| 4 | allowed_jlpt_levels | text[] | ○ | 許可JLPTレベル（配列） | 1件(全件) | ✅ 使用中 |
| 5 | updated_at | timestamp with time zone | ○ | レコード更新日時 | 1件(全件) | ✅ 使用中 |
| 6 | target_nationalities | text | ○ | 対象国籍 | 1件(全件) | ✅ 使用中 |

---

## selection_progress

**説明**: 選考進捗の時系列（企業名・日付・状態）  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | candidate_id | bigint | × | 候補者ID（candidatesテーブル参照） | - | ✅ 使用中 |
| 3 | company_name | text | ○ | 企業名・所属会社名 | - | ✅ 使用中 |
| 4 | application_route | text | ○ | 応募経路 | - | ✅ 使用中 |
| 5 | recommendation_date | date | ○ | 推薦日 | - | ✅ 使用中 |
| 6 | interview_schedule_date | date | ○ | 面接日程日 | - | ✅ 使用中 |
| 7 | interview_date | date | ○ | 面接日 | - | ✅ 使用中 |
| 8 | offer_date | date | ○ | 内定日 | - | ✅ 使用中 |
| 9 | closing_plan_date | date | ○ | 成約予定日 | - | ✅ 使用中 |
| 10 | offer_accept_date | date | ○ | 内定承諾日 | - | ✅ 使用中 |
| 11 | joining_date | date | ○ | 入社日 | - | ✅ 使用中 |
| 12 | pre_join_quit_date | date | ○ | 入社前辞退日 | - | ✅ 使用中 |
| 13 | introduction_fee | text | ○ | 紹介手数料 | - | ✅ 使用中 |
| 14 | status | text | ○ | ステータス | - | ✅ 使用中 |
| 15 | note | text | ○ | メモ | - | ✅ 使用中 |
| 16 | created_at | timestamp with time zone | × | レコード作成日時 | - | ✅ 使用中 |
| 17 | updated_at | timestamp with time zone | × | レコード更新日時 | - | ✅ 使用中 |

---

## stamp_reads

**説明**: スタンプ既読情報  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | stamp_id | bigint | × | スタンプID | - | ❌ 未使用 |
| 3 | user_id | integer | ○ | ユーザーID（usersテーブル参照） | - | ✅ 使用中 |
| 4 | read_at | timestamp with time zone | ○ | 既読日時 | - | ❌ 未使用 |
| 5 | created_at | timestamp with time zone | × | レコード作成日時 | - | ✅ 使用中 |

---

## stamps

**説明**: スタンプ（通知・お祝い等）  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | user_id | integer | ○ | ユーザーID（usersテーブル参照） | - | ✅ 使用中 |
| 3 | sent_to_user_id | uuid | ○ | 送信先ユーザーID | - | ❌ 未使用 |
| 4 | read_at | timestamp with time zone | ○ | 既読日時 | - | ❌ 未使用 |
| 5 | message | text | ○ | メッセージ | - | ✅ 使用中 |
| 6 | created_at | timestamp with time zone | × | レコード作成日時 | - | ✅ 使用中 |

---

## sync_state

**説明**: sync_state  
**レコード数**: 2件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | source | text | × | 紹介元・流入媒体 | 2件(全件) | ✅ 使用中 |
| 2 | last_synced_at | timestamp with time zone | × | last synced日時 | 2件(全件) | ✅ 使用中 |

---

## system_options

**説明**: システム設定オプション  
**レコード数**: 1件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | option_key | varchar(100) | × | option key | 1件(全件) | ✅ 使用中 |
| 2 | options | jsonb | × | options | 1件(全件) | ✅ 使用中 |
| 3 | updated_at | timestamp with time zone | × | レコード更新日時 | 1件(全件) | ✅ 使用中 |

---

## teleapo

**説明**: テレアポ（架電記録）  
**レコード数**: 5件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | 5件(全件) | ✅ 使用中 |
| 2 | candidate_id | bigint | × | 候補者ID（candidatesテーブル参照） (FK→candidates.id) | 5件(全件) | ✅ 使用中 |
| 3 | call_no | integer | × | 架電回数 | 5件(全件) | ✅ 使用中 |
| 4 | called_at | timestamp with time zone | × | 架電日時 | 5件(全件) | ✅ 使用中 |
| 5 | route | text | ○ | 架電経路 | 5件(全件) | ✅ 使用中 |
| 6 | result | text | ○ | 架電結果 | 5件(全件) | ✅ 使用中 |
| 7 | created_at | timestamp with time zone | × | レコード作成日時 | 5件(全件) | ✅ 使用中 |
| 8 | caller_user_id | bigint | ○ | 架電担当ユーザーID (FK→users.id) | 5件(全件) | ✅ 使用中 |
| 9 | memo | text | ○ | メモ・備考 | 5件(全件) | ✅ 使用中 |

---

## user_important_metrics

**説明**: ユーザー別の重要指標設定  
**レコード数**: 20件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | 20件(全件) | ✅ 使用中 |
| 2 | user_id | bigint | × | ユーザーID（usersテーブル参照） | 20件(全件) | ✅ 使用中 |
| 3 | department_key | text | × | 部門キー | 20件(全件) | ✅ 使用中 |
| 4 | metric_key | text | × | 指標キー名 | 20件(全件) | ✅ 使用中 |
| 5 | created_at | timestamp with time zone | × | レコード作成日時 | 20件(全件) | ✅ 使用中 |
| 6 | updated_at | timestamp with time zone | × | レコード更新日時 | 20件(全件) | ✅ 使用中 |

---

## user_profiles

**説明**: ユーザープロフィール拡張情報  
**レコード数**: 0件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | - | ✅ 使用中 |
| 2 | user_id | uuid | × | ユーザーID（usersテーブル参照） | - | ✅ 使用中 |
| 3 | department | character varying | ○ | 学部・部署 | - | ✅ 使用中 |
| 4 | position | character varying | ○ | 役職 | - | ✅ 使用中 |
| 5 | period_start_date | date | ○ | 期間開始日 | - | ❌ 未使用 |
| 6 | period_end_date | date | ○ | 期間終了日 | - | ❌ 未使用 |
| 7 | created_by | bigint | ○ | 作成者 | - | ❌ 未使用 |
| 8 | updated_by | bigint | ○ | 更新者 | - | ❌ 未使用 |
| 9 | created_at | timestamp with time zone | × | レコード作成日時 | - | ✅ 使用中 |
| 10 | updated_at | timestamp with time zone | × | レコード更新日時 | - | ✅ 使用中 |

---

## users

**説明**: ユーザーマスタ（認証・権限・所属）  
**レコード数**: 12件

| # | カラム名 | 型 | NULL | 説明 | データ | 使用箇所 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | × | 主キー（自動採番） | 12件(全件) | ✅ 使用中 |
| 2 | name | text | × | 名前 | 12件(全件) | ✅ 使用中 |
| 3 | email | text | × | メールアドレス | 12件(全件) | ✅ 使用中 |
| 4 | role | text | × | ロール・権限 | 12件(全件) | ✅ 使用中 |
| 5 | created_at | timestamp with time zone | × | レコード作成日時 | 12件(全件) | ✅ 使用中 |
| 6 | updated_at | timestamp with time zone | × | レコード更新日時 | 12件(全件) | ✅ 使用中 |
| 7 | password_hash | text | ○ | パスワードハッシュ値 | 12件(全件) | ✅ 使用中 |
| 8 | is_admin | boolean | × | 管理者フラグ | 12件(全件) | ✅ 使用中 |
| 9 | email_verified_at | timestamp with time zone | ○ | メール確認日時 | 空 | ❌ 未使用 |
| 10 | image | text | ○ | プロフィール画像 | 空 | ❌ 未使用 |

---

## 凡例

- **NULL**: ○ = NULL許可、× = NOT NULL
- **データ**: そのカラムにNULLでないデータが入っているレコード数
  - 空 = 全レコードがNULL（データ未使用）
  - (全件) = 全レコードにデータあり
- **使用箇所**: ソースコード静的解析による検出結果
  - ✅ 使用中: いずれかのソースコードから参照が見つかった
  - ❌ 未使用: いずれのソースからも参照が見つからなかった
- FK→: 外部キー参照先
