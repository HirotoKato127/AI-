-- ============================================================
-- Audit: 募集職種統一の確認クエリ
-- 対象: Agent Key ATS (PostgreSQL)
-- 作成日: 2026-03-04
-- ============================================================

-- 1) クライアント総数 / 職種紐づき済み数
SELECT
  (SELECT COUNT(*) FROM clients) AS total_clients,
  (SELECT COUNT(DISTINCT client_id) FROM client_job_categories) AS linked_clients;

-- 2) client_job_categories が未紐づきの企業
SELECT
  c.id,
  c.name,
  c.industry,
  c.job_categories
FROM clients c
WHERE NOT EXISTS (
  SELECT 1
  FROM client_job_categories cjc
  WHERE cjc.client_id = c.id
)
ORDER BY c.id
LIMIT 100;

-- 3) 募集職種テキスト(job_categories)が空の企業
SELECT
  id,
  name,
  industry,
  job_categories
FROM clients
WHERE NULLIF(TRIM(COALESCE(job_categories, '')), '') IS NULL
ORDER BY id
LIMIT 100;

-- 4) 企業ごとの職種一覧（目視確認）
SELECT
  c.id,
  c.name,
  c.job_categories,
  STRING_AGG(jcm.sub_category, ', ' ORDER BY jcm.sub_category) AS linked_sub_categories
FROM clients c
LEFT JOIN client_job_categories cjc ON c.id = cjc.client_id
LEFT JOIN job_category_master jcm ON cjc.job_category_id = jcm.id
GROUP BY c.id, c.name, c.job_categories
ORDER BY c.id
LIMIT 200;
