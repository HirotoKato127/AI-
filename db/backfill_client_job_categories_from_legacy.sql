-- ============================================================
-- Backfill: clients.industry / clients.job_categories
--           -> client_job_categories (募集職種に統一)
-- 対象: Agent Key ATS (PostgreSQL)
-- 作成日: 2026-03-04
-- ============================================================
-- 目的:
--   legacy列(industry, job_categories)の値を解析し、
--   client_job_categories を埋める。
--
-- 注意:
--   - 既存の client_job_categories は保持 (ON CONFLICT DO NOTHING)
--   - clients.industry / clients.job_categories は削除しない
--   - 未分類は「その他（未分類）」へフォールバック
-- ============================================================

BEGIN;

-- 0) フォールバックカテゴリを保証
INSERT INTO job_category_master (major_category, sub_category, sort_order, is_active)
VALUES ('その他', 'その他（未分類）', 999, TRUE)
ON CONFLICT (major_category, sub_category) DO NOTHING;

-- 1) 大分類→デフォルト小分類を作成（「その他◯◯」優先）
DROP TABLE IF EXISTS _major_default_sub;
CREATE TEMP TABLE _major_default_sub AS
SELECT DISTINCT ON (j.major_category)
  j.major_category,
  j.sub_category,
  j.id AS job_category_id
FROM job_category_master j
WHERE j.is_active = TRUE
ORDER BY
  j.major_category,
  CASE WHEN j.sub_category LIKE 'その他%' THEN 0 ELSE 1 END,
  j.sort_order ASC,
  j.id ASC;

-- 2) 同義語辞書（必要に応じて随時追加）
DROP TABLE IF EXISTS _job_category_alias;
CREATE TEMP TABLE _job_category_alias (
  alias_text TEXT PRIMARY KEY,
  major_category TEXT NOT NULL,
  sub_category TEXT NOT NULL
);

INSERT INTO _job_category_alias (alias_text, major_category, sub_category) VALUES
  -- IT
  ('itエンジニア', 'ITエンジニア・開発', 'その他ITエンジニア'),
  ('エンジニア', 'ITエンジニア・開発', 'その他ITエンジニア'),
  ('開発', 'ITエンジニア・開発', 'その他ITエンジニア'),
  ('se', 'ITエンジニア・開発', 'プログラマー / SE'),
  ('プログラマー', 'ITエンジニア・開発', 'プログラマー / SE'),
  ('インフラ', 'ITエンジニア・開発', 'インフラ・ネットワーク'),
  ('ネットワーク', 'ITエンジニア・開発', 'インフラ・ネットワーク'),
  ('pm', 'ITエンジニア・開発', 'PM・PLM'),
  ('データサイエンス', 'ITエンジニア・開発', 'データサイエンティスト'),
  ('ai', 'ITエンジニア・開発', 'AIエンジニア'),

  -- 営業
  ('営業', '営業', 'その他営業'),
  ('セールス', '営業', 'サービス・無形商材営業'),
  ('法人営業', '営業', 'サービス・無形商材営業'),
  ('個人営業', '営業', 'サービス・無形商材営業'),
  ('インサイドセールス', '営業', 'サービス・無形商材営業'),
  ('フィールドセールス', '営業', 'サービス・無形商材営業'),
  ('人材営業', '営業', '人材・コンサル営業'),
  ('コンサル営業', '営業', '人材・コンサル営業'),

  -- 企画・マーケ
  ('企画', '企画・マーケティング', 'その他企画・マーケティング'),
  ('マーケ', '企画・マーケティング', 'デジタルマーケティング'),
  ('マーケティング', '企画・マーケティング', 'デジタルマーケティング'),
  ('広報', '企画・マーケティング', '広報・PR'),
  ('pr', '企画・マーケティング', '広報・PR'),

  -- 管理系
  ('管理', '管理・コーポレート', 'その他管理・コーポレート'),
  ('コーポレート', '管理・コーポレート', 'その他管理・コーポレート'),
  ('人事', '管理・コーポレート', '人事・採用・労務'),
  ('採用', '管理・コーポレート', '人事・採用・労務'),
  ('労務', '管理・コーポレート', '人事・採用・労務'),
  ('経理', '管理・コーポレート', '経理・財務'),
  ('財務', '管理・コーポレート', '経理・財務'),
  ('総務', '管理・コーポレート', '総務・法務・コンプライアンス'),
  ('法務', '管理・コーポレート', '総務・法務・コンプライアンス'),

  -- コンサル
  ('コンサル', 'コンサルタント', 'その他コンサルタント'),
  ('itコンサル', 'コンサルタント', 'IT・システムコンサルタント'),
  ('戦略コンサル', 'コンサルタント', '戦略・経営コンサルタント'),

  -- クリエイティブ
  ('デザイナー', 'クリエイティブ・デザイン', 'その他クリエイティブ'),
  ('uiux', 'クリエイティブ・デザイン', 'UIUXデザイナー'),
  ('webデザイナー', 'クリエイティブ・デザイン', 'Webデザイナー'),

  -- 建設・製造・物流
  ('施工管理', '不動産・建設', '建築・施工管理'),
  ('建設', '不動産・建設', 'その他不動産・建設'),
  ('不動産', '不動産・建設', '不動産営業・仲介'),
  ('機電系エンジニア', '製造・工場・技術', '機械・電気・電子エンジニア'),
  ('製造', '製造・工場・技術', 'その他製造・技術'),
  ('物流', '物流・運輸・倉庫', 'その他物流・運輸'),
  ('倉庫', '物流・運輸・倉庫', '倉庫管理・物流スタッフ'),

  -- 汎用
  ('事務', 'カスタマーサポート・事務', '一般事務・OA事務'),
  ('カスタマーサポート', 'カスタマーサポート・事務', 'その他CS・事務'),
  ('コールセンター', 'カスタマーサポート・事務', 'コールセンターオペレーター'),
  ('販売', '販売・小売・飲食', '販売スタッフ・店員'),
  ('飲食', '販売・小売・飲食', 'その他販売・飲食'),
  ('教育', '教育・研修', 'その他教育'),
  ('金融', '金融・保険', 'その他金融・保険'),
  ('保険', '金融・保険', 'その他金融・保険'),
  ('医療', '医療・介護・福祉', 'その他医療・介護・福祉'),
  ('介護', '医療・介護・福祉', 'その他医療・介護・福祉'),
  ('その他', 'その他', 'その他（未分類）')
ON CONFLICT (alias_text) DO NOTHING;

-- 3) 解析対象文字列の作成（industry + job_categories）
DROP TABLE IF EXISTS _client_source_text;
CREATE TEMP TABLE _client_source_text AS
SELECT
  c.id AS client_id,
  COALESCE(c.industry, '') AS industry_raw,
  COALESCE(c.job_categories, '') AS job_categories_raw,
  TRIM(
    CONCAT_WS(
      ',',
      NULLIF(TRIM(COALESCE(c.industry, '')), ''),
      NULLIF(TRIM(COALESCE(c.job_categories, '')), '')
    )
  ) AS merged_text
FROM clients c;

-- 4) トークン分解
DROP TABLE IF EXISTS _client_tokens;
CREATE TEMP TABLE _client_tokens AS
SELECT DISTINCT
  s.client_id,
  TRIM(tk.token) AS token_raw,
  LOWER(TRIM(tk.token)) AS token_norm
FROM _client_source_text s
CROSS JOIN LATERAL regexp_split_to_table(
  COALESCE(s.merged_text, ''),
  '[,、/／|｜\n\r\t;；]+'
) AS tk(token)
WHERE
  TRIM(tk.token) <> ''
  AND TRIM(tk.token) NOT IN ('-', 'ー', '―', '未設定', 'なし', 'N/A', 'n/a', 'NA', 'na');

-- 5) 候補マッチ（優先度つき）
DROP TABLE IF EXISTS _token_candidate_matches;
CREATE TEMP TABLE _token_candidate_matches AS
WITH fallback AS (
  SELECT id AS fallback_job_category_id
  FROM job_category_master
  WHERE major_category = 'その他' AND sub_category = 'その他（未分類）'
  LIMIT 1
)
SELECT
  t.client_id,
  t.token_raw,
  j.id AS job_category_id,
  10 AS priority,
  'sub_exact'::TEXT AS matched_by
FROM _client_tokens t
JOIN job_category_master j
  ON j.is_active = TRUE
 AND LOWER(j.sub_category) = t.token_norm

UNION ALL

SELECT
  t.client_id,
  t.token_raw,
  m.job_category_id,
  20 AS priority,
  'major_exact'::TEXT AS matched_by
FROM _client_tokens t
JOIN _major_default_sub m
  ON LOWER(m.major_category) = t.token_norm

UNION ALL

SELECT
  t.client_id,
  t.token_raw,
  j.id AS job_category_id,
  30 AS priority,
  'alias'::TEXT AS matched_by
FROM _client_tokens t
JOIN _job_category_alias a
  ON a.alias_text = t.token_norm
JOIN job_category_master j
  ON j.is_active = TRUE
 AND j.major_category = a.major_category
 AND j.sub_category = a.sub_category

UNION ALL

SELECT
  t.client_id,
  t.token_raw,
  j.id AS job_category_id,
  40 AS priority,
  'keyword_rule'::TEXT AS matched_by
FROM _client_tokens t
JOIN LATERAL (
  SELECT
    CASE
      WHEN t.token_norm ~ '(エンジニア|program|programmer|開発|se|インフラ|ネットワーク|サーバ|ai|データサイエン)' THEN 'ITエンジニア・開発'
      WHEN t.token_norm ~ '(営業|セールス|sales|法人営業|個人営業|インサイド|フィールド)' THEN '営業'
      WHEN t.token_norm ~ '(企画|マーケ|marketing|広報|pr)' THEN '企画・マーケティング'
      WHEN t.token_norm ~ '(人事|採用|労務|経理|財務|総務|法務|管理|コーポレート)' THEN '管理・コーポレート'
      WHEN t.token_norm ~ '(コンサル|consult)' THEN 'コンサルタント'
      WHEN t.token_norm ~ '(デザイン|designer|ui|ux|webデザ)' THEN 'クリエイティブ・デザイン'
      WHEN t.token_norm ~ '(医療|看護|介護|福祉|薬剤師)' THEN '医療・介護・福祉'
      WHEN t.token_norm ~ '(金融|保険|bank|証券)' THEN '金融・保険'
      WHEN t.token_norm ~ '(不動産|建設|施工)' THEN '不動産・建設'
      WHEN t.token_norm ~ '(製造|工場|機械|電気|電子|機電)' THEN '製造・工場・技術'
      WHEN t.token_norm ~ '(物流|運輸|倉庫|ドライバー)' THEN '物流・運輸・倉庫'
      WHEN t.token_norm ~ '(販売|小売|飲食|店員)' THEN '販売・小売・飲食'
      WHEN t.token_norm ~ '(事務|カスタマー|コールセンター|サポート)' THEN 'カスタマーサポート・事務'
      WHEN t.token_norm ~ '(教育|研修|講師)' THEN '教育・研修'
      WHEN t.token_norm ~ '(士業|法律|会計|税理士|弁護士)' THEN '士業・法律・会計'
      WHEN t.token_norm ~ '(海外|グローバル|英語|翻訳|通訳)' THEN '海外・グローバル'
      ELSE NULL
    END AS major_category
) r ON r.major_category IS NOT NULL
JOIN _major_default_sub m
  ON m.major_category = r.major_category
JOIN job_category_master j
  ON j.id = m.job_category_id

UNION ALL

SELECT
  t.client_id,
  t.token_raw,
  f.fallback_job_category_id AS job_category_id,
  999 AS priority,
  'fallback'::TEXT AS matched_by
FROM _client_tokens t
CROSS JOIN fallback f;

-- 6) 1トークン1カテゴリに確定
DROP TABLE IF EXISTS _token_best_matches;
CREATE TEMP TABLE _token_best_matches AS
SELECT DISTINCT ON (client_id, token_raw)
  client_id,
  token_raw,
  job_category_id,
  matched_by,
  priority
FROM _token_candidate_matches
ORDER BY client_id, token_raw, priority ASC, job_category_id ASC;

-- 7) 中間テーブルへ反映（既存保持）
INSERT INTO client_job_categories (client_id, job_category_id)
SELECT DISTINCT
  b.client_id,
  b.job_category_id
FROM _token_best_matches b
ON CONFLICT (client_id, job_category_id) DO NOTHING;

-- 8) どれにも紐づかない企業へフォールバックを1件付与
INSERT INTO client_job_categories (client_id, job_category_id)
SELECT
  c.id AS client_id,
  j.id AS job_category_id
FROM clients c
JOIN job_category_master j
  ON j.major_category = 'その他' AND j.sub_category = 'その他（未分類）'
WHERE NOT EXISTS (
  SELECT 1
  FROM client_job_categories cjc
  WHERE cjc.client_id = c.id
)
ON CONFLICT (client_id, job_category_id) DO NOTHING;

COMMIT;

-- ============================================================
-- 実行後サマリー
-- ============================================================
-- 1) 紐づいた企業数
-- SELECT COUNT(DISTINCT client_id) AS linked_clients FROM client_job_categories;
--
-- 2) 企業ごとの紐づき件数
-- SELECT client_id, COUNT(*) AS category_count
-- FROM client_job_categories
-- GROUP BY client_id
-- ORDER BY category_count DESC, client_id ASC
-- LIMIT 50;
--
-- 3) 代表的なマッチ元確認（このセッションでのみ有効）
-- SELECT matched_by, COUNT(*) FROM _token_best_matches GROUP BY matched_by ORDER BY COUNT(*) DESC;
