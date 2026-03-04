/**
 * ============================================================
 * Lambda: ats-api-prod-kpi-clients
 * GET /kpi/clients        — 企業一覧＋集計（職種情報含む）
 * GET /kpi/job-ranking    — 職種別ランキング（統合ルート）
 * ============================================================
 * 改修内容:
 * - client_job_categories 中間テーブルをLEFT JOINして職種情報を返す
 * - /kpi/job-ranking ルートを追加（職種別の企業数・入社数・定着率）
 */
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

const ALLOWED_ORIGINS = new Set([
    "http://localhost:8000",
    "http://localhost:8001",
    "http://localhost:8081",
    "https://agent-key.pages.dev",
    "https://develop.agent-key.pages.dev",
]);

const baseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET"
};

function buildHeaders(event) {
    const origin = event?.headers?.origin || event?.headers?.Origin || "";
    if (ALLOWED_ORIGINS.has(origin)) {
        return { ...baseHeaders, "Access-Control-Allow-Origin": origin };
    }
    return baseHeaders;
}

/**
 * 職種別ランキングAPI
 * 大分類ごとの企業数・入社数・定着率を集計
 */
async function handleJobRanking(client, headers) {
    const query = `
    SELECT
      jcm.major_category,
      COUNT(DISTINCT cjc.client_id) AS company_count,
      COUNT(DISTINCT ca.id) FILTER (WHERE ca.join_date IS NOT NULL) AS hired_count,
      COUNT(DISTINCT ca.id) FILTER (
        WHERE ca.join_date IS NOT NULL
        AND ca.post_join_quit_date IS NOT NULL
        AND (ca.post_join_quit_date::date - ca.join_date::date) <= COALESCE(c.warranty_period, 90)
      ) AS early_quit_count,
      COUNT(DISTINCT ca.id) FILTER (WHERE ca.recommended_at IS NOT NULL) AS proposal_count,
      COUNT(DISTINCT ca.id) FILTER (WHERE ca.offer_date IS NOT NULL) AS offer_count,
      ROUND(AVG(EXTRACT(DAY FROM (ca.join_date - ca.recommended_at)))
        FILTER (WHERE ca.join_date IS NOT NULL AND ca.recommended_at IS NOT NULL), 1) AS avg_lead_time
    FROM job_category_master jcm
    LEFT JOIN client_job_categories cjc ON jcm.id = cjc.job_category_id
    LEFT JOIN clients c ON cjc.client_id = c.id
    LEFT JOIN candidate_applications ca ON c.id = ca.client_id
    WHERE jcm.is_active = TRUE
    GROUP BY jcm.major_category
    ORDER BY hired_count DESC, company_count DESC
  `;

    const { rows } = await client.query(query);

    const items = rows
        .filter(row => parseInt(row.company_count || 0) > 0)
        .map(row => {
            const hired = parseInt(row.hired_count || 0);
            const earlyQuit = parseInt(row.early_quit_count || 0);
            const retention = hired > 0 ? ((hired - earlyQuit) / hired) * 100 : 0;

            return {
                majorCategory: row.major_category,
                companyCount: parseInt(row.company_count || 0),
                hiredCount: hired,
                retentionRate: parseFloat(retention.toFixed(1)),
                proposalCount: parseInt(row.proposal_count || 0),
                offerCount: parseInt(row.offer_count || 0),
                avgLeadTime: parseFloat(row.avg_lead_time || 0),
            };
        });

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            meta: { count: items.length },
            items,
        }),
    };
}

/**
 * 企業一覧＋集計API（既存ロジック + 職種情報JOIN）
 */
async function handleClientsList(client, headers, event) {
    // フィルタ用: クエリパラメータから職種IDリスト取得
    const jobCategoryFilter = event?.queryStringParameters?.jobCategoryIds;
    const filterIds = jobCategoryFilter
        ? jobCategoryFilter.split(',').map(Number).filter(Number.isFinite)
        : [];

    let filterClause = '';
    const filterValues = [];

    if (filterIds.length > 0) {
        // 指定職種に紐づく企業のみに絞り込み
        filterClause = `
      AND c.id IN (
        SELECT DISTINCT client_id FROM client_job_categories
        WHERE job_category_id = ANY($1::int[])
      )
    `;
        filterValues.push(filterIds);
    }

    const query = `
    SELECT
      c.id,
      c.name,
      c.industry,
      c.location,
      c.job_categories,

      c.contact_name,
      c.contact_email,

      c.warranty_period,
      c.fee_details,
      c.contract_note,

      COALESCE(c.planned_hires_count, 0) AS planned_hires_count,

      c.salary_range,
      c.must_qualifications,
      c.nice_qualifications,
      c.desired_locations,
      c.personality_traits,
      c.required_experience,
      c.selection_note,

      COUNT(ca.id) FILTER (WHERE ca.recommended_at IS NOT NULL) AS proposal_count,
      COUNT(ca.id) FILTER (WHERE ca.recommended_at IS NOT NULL OR ca.stage_current = '書類選考') AS document_screening_count,
      COUNT(ca.id) FILTER (WHERE ca.first_interview_at IS NOT NULL) AS first_interview_count,
      0 AS second_interview_count,
      COUNT(ca.id) FILTER (WHERE ca.offer_date IS NOT NULL) AS offer_count,

      COUNT(ca.id) FILTER (WHERE ca.join_date IS NOT NULL) AS hired_count,
      COUNT(ca.id) FILTER (WHERE ca.pre_join_withdraw_date IS NOT NULL) AS pre_join_decline_count,
      COUNT(ca.id) FILTER (WHERE ca.stage_current IN ('不採用', '辞退', '失注', 'クローズ')) AS dropped_count,

      COUNT(ca.id) FILTER (
        WHERE ca.join_date IS NOT NULL
        AND ca.post_join_quit_date IS NOT NULL
        AND (ca.post_join_quit_date::date - ca.join_date::date) <= COALESCE(c.warranty_period, 90)
      ) AS early_quit_count,

      ROUND(AVG(EXTRACT(DAY FROM (ca.join_date - ca.recommended_at))) FILTER (WHERE ca.join_date IS NOT NULL AND ca.recommended_at IS NOT NULL), 1) AS average_lead_time,

      COALESCE(SUM(p.fee_amount), 0) AS fee_amount,
      COALESCE(SUM(p.refund_amount), 0) AS refund_amount,

      NULL AS pre_join_decline_reason

    FROM clients c
    LEFT JOIN candidate_applications ca ON c.id = ca.client_id
    LEFT JOIN placements p ON ca.id = p.candidate_application_id

    WHERE 1=1
    ${filterClause}

    GROUP BY c.id
    ORDER BY c.id ASC;
  `;

    const res = await client.query(query, filterValues);

    // ★ 企業ごとの職種情報を一括取得
    const clientIds = res.rows.map(r => r.id);
    let jobCategoriesMap = {};

    if (clientIds.length > 0) {
        const jcQuery = `
      SELECT
        cjc.client_id,
        json_agg(json_build_object(
          'id', jcm.id,
          'majorCategory', jcm.major_category,
          'subCategory', jcm.sub_category
        ) ORDER BY jcm.sort_order) AS categories
      FROM client_job_categories cjc
      JOIN job_category_master jcm ON cjc.job_category_id = jcm.id
      GROUP BY cjc.client_id
    `;
        const jcRes = await client.query(jcQuery);
        for (const row of jcRes.rows) {
            jobCategoriesMap[row.client_id] = row.categories;
        }
    }

    const items = res.rows.map(row => {
        const planned = parseInt(row.planned_hires_count || 0);
        const hired = parseInt(row.hired_count || 0);
        const earlyQuit = parseInt(row.early_quit_count || 0);
        const remaining = Math.max(0, planned - hired);

        let retention = 0;
        if (hired > 0) {
            retention = ((hired - earlyQuit) / hired) * 100;
        }

        // ★ 職種情報を追加
        const masterCategories = jobCategoriesMap[row.id] || [];
        const subCategoryNames = [...new Set(masterCategories
            .map(c => String(c?.subCategory || '').trim())
            .filter(Boolean))];
        const recruitmentText = subCategoryNames.length > 0
            ? subCategoryNames.join(', ')
            : (row.job_categories || row.industry || '-');
        // 大分類名のリストを生成（表示用）
        const majorCategoryNames = [...new Set(masterCategories.map(c => c.majorCategory))];

        return {
            id: row.id,
            name: row.name,
            // 互換維持: industryは募集職種テキストを返す
            industry: recruitmentText,
            location: row.location || '-',
            jobCategories: recruitmentText,

            // ★ 新規追加: マスター管理の職種情報
            jobCategoryMaster: masterCategories,
            jobCategoryMajors: majorCategoryNames,

            contactName: row.contact_name || '',
            contactEmail: row.contact_email || '',

            warrantyPeriod: row.warranty_period,
            feeDetails: row.fee_details || '',
            contractNote: row.contract_note || '',

            plannedHiresCount: planned,
            remainingHiringCount: remaining,
            retentionRate: parseFloat(retention.toFixed(1)),

            refundAmount: parseInt(row.refund_amount || 0),
            averageLeadTime: parseFloat(row.average_lead_time || 0),
            feeAmount: parseInt(row.fee_amount || 0),

            preJoinDeclineCount: parseInt(row.pre_join_decline_count || 0),
            preJoinDeclineReason: row.pre_join_decline_reason || '-',
            droppedCount: parseInt(row.dropped_count || 0),

            stats: {
                proposal: parseInt(row.proposal_count || 0),
                docScreen: parseInt(row.document_screening_count || 0),
                interview1: parseInt(row.first_interview_count || 0),
                interview2: parseInt(row.second_interview_count || 0),
                offer: parseInt(row.offer_count || 0),
                joined: hired,
                leadTime: parseFloat(row.average_lead_time || 0)
            },
            desiredTalent: {
                salaryRange: row.salary_range,
                mustQualifications: row.must_qualifications,
                niceQualifications: row.nice_qualifications,
                locations: row.desired_locations,
                personality: row.personality_traits,
                experiences: row.required_experience
            },
            selectionNote: row.selection_note
        };
    });

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            meta: { period: "all_time", count: items.length },
            items: items
        }),
    };
}

export const handler = async (event) => {
    const headers = buildHeaders(event);

    if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    try {
        const client = await pool.connect();

        try {
            // ★ ルーティング: pathで /kpi/job-ranking を判定
            const path = event.path || event.rawPath || event.requestContext?.http?.path || '';

            if (path.includes('job-ranking')) {
                return await handleJobRanking(client, headers);
            }

            // デフォルト: 企業一覧
            return await handleClientsList(client, headers, event);

        } finally {
            client.release();
        }

    } catch (err) {
        console.error('Database Error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message }),
        };
    }
};
