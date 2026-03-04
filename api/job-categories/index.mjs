/**
 * ============================================================
 * Lambda: ats-api-prod-job-categories
 * GET /job-categories — 職種マスター取得API
 * ============================================================
 * レスポンス形式:
 * {
 *   "categories": [
 *     { "major": "ITエンジニア・開発", "subs": [{ "id": 1, "name": "プログラマー / SE" }, ...] },
 *     ...
 *   ]
 * }
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

export const handler = async (event) => {
    const headers = buildHeaders(event);

    // CORS preflight
    if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    let client;
    try {
        client = await pool.connect();

        // 職種マスターを全件取得（is_active = true のみ）
        const { rows } = await client.query(`
      SELECT id, major_category, sub_category, sort_order
      FROM job_category_master
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, id ASC
    `);

        // 大分類でグルーピングしてツリー構造に変換
        const categoryMap = new Map();

        for (const row of rows) {
            const major = row.major_category;
            if (!categoryMap.has(major)) {
                categoryMap.set(major, []);
            }
            categoryMap.get(major).push({
                id: row.id,
                name: row.sub_category,
            });
        }

        // Map → Array に変換
        const categories = [];
        for (const [major, subs] of categoryMap) {
            categories.push({ major, subs });
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ categories }),
        };

    } catch (err) {
        console.error('Job Categories API Error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message }),
        };
    } finally {
        if (client) client.release();
    }
};
