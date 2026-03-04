-- ============================================================
-- Sync: clients.job_categories / clients.industry
--       <- client_job_categories + job_category_master
-- 対象: Agent Key ATS (PostgreSQL)
-- 作成日: 2026-03-04
-- ============================================================
-- 目的:
--   募集職種の正データを client_job_categories に寄せた後、
--   互換用途の legacy 列 (job_categories / industry) へ同じ文言を同期する。
--
-- 方針:
--   1) 中間テーブルから sub_category を連結
--   2) 連結結果が空なら既存 job_categories / industry を採用
--   3) 最終的に「その他（未分類）」へフォールバック
-- ============================================================

BEGIN;

WITH aggregated AS (
  SELECT
    c.id AS client_id,
    STRING_AGG(
      DISTINCT jcm.sub_category,
      ', ' ORDER BY jcm.sub_category
    ) AS recruitment_text
  FROM clients c
  LEFT JOIN client_job_categories cjc ON c.id = cjc.client_id
  LEFT JOIN job_category_master jcm ON cjc.job_category_id = jcm.id
  GROUP BY c.id
),
resolved AS (
  SELECT
    c.id AS client_id,
    COALESCE(
      NULLIF(TRIM(a.recruitment_text), ''),
      NULLIF(TRIM(c.job_categories), ''),
      NULLIF(TRIM(c.industry), ''),
      'その他（未分類）'
    ) AS recruitment_text
  FROM clients c
  LEFT JOIN aggregated a ON c.id = a.client_id
)
UPDATE clients c
SET
  job_categories = r.recruitment_text,
  industry = r.recruitment_text,
  updated_at = NOW()
FROM resolved r
WHERE c.id = r.client_id
  AND (
    COALESCE(c.job_categories, '') IS DISTINCT FROM COALESCE(r.recruitment_text, '')
    OR COALESCE(c.industry, '') IS DISTINCT FROM COALESCE(r.recruitment_text, '')
  );

COMMIT;

-- ============================================================
-- 確認クエリ（手動）
-- ============================================================
-- SELECT id, name, industry, job_categories
-- FROM clients
-- ORDER BY id
-- LIMIT 100;
