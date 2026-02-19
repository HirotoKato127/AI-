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

// 有効な指標キー一覧
const VALID_METRIC_KEYS = [
    // 営業
    'new_interviews',
    'proposals',
    'recommendations',
    'interviews_scheduled',
    'interviews_held',
    'offers',
    'accepts',
    // CS
    'appointments',
    'sitting',
    // マーケ
    'valid_applications'
];

export const handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,GET,PUT"
    };

    // CORSプリフライト
    if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    let client;
    try {
        client = await pool.connect();
        const method = event.httpMethod || event.requestContext?.http?.method;

        // ==========================================================
        // GET: 指定月のMS期間設定を取得
        // URL例: /ms-period-settings?month=2026-02
        // レスポンス例: { "settings": [{ "metricKey": "proposals", "startDate": "2026-01-18", "endDate": "2026-02-19" }, ...] }
        // ==========================================================
        if (method === 'GET') {
            const month = event.queryStringParameters?.month;

            if (!month || !/^\d{4}-\d{2}$/.test(month)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: "month parameter is required (e.g., ?month=2026-02)" })
                };
            }

            const res = await client.query(
                `SELECT metric_key, start_date, end_date
         FROM ms_period_settings
         WHERE target_month = $1
         ORDER BY metric_key`,
                [month]
            );

            const settings = res.rows.map(row => ({
                metricKey: row.metric_key,
                startDate: row.start_date ? row.start_date.toISOString().slice(0, 10) : null,
                endDate: row.end_date ? row.end_date.toISOString().slice(0, 10) : null
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ month, settings })
            };
        }

        // ==========================================================
        // PUT: 指定月のMS期間設定を保存
        // Body例: {
        //   "month": "2026-02",
        //   "settings": [
        //     { "metricKey": "proposals", "startDate": "2026-01-18", "endDate": "2026-02-19" },
        //     { "metricKey": "recommendations", "startDate": "2026-01-20", "endDate": "2026-02-21" }
        //   ]
        // }
        // ==========================================================
        if (method === 'PUT') {
            const rawBody = event.isBase64Encoded
                ? Buffer.from(event.body || '', 'base64').toString('utf-8')
                : event.body;

            const body = JSON.parse(rawBody || '{}');
            const month = body.month;
            const settings = body.settings;

            if (!month || !/^\d{4}-\d{2}$/.test(month)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: "month is required in body (e.g., '2026-02')" })
                };
            }

            if (!Array.isArray(settings)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: "settings must be an array" })
                };
            }

            await client.query('BEGIN');

            try {
                for (const item of settings) {
                    const { metricKey, startDate, endDate } = item;

                    // バリデーション
                    if (!metricKey || !VALID_METRIC_KEYS.includes(metricKey)) {
                        continue; // 不明な指標キーはスキップ
                    }
                    if (!startDate || !endDate) {
                        // 日付が空の場合は削除（設定クリア）
                        await client.query(
                            `DELETE FROM ms_period_settings WHERE target_month = $1 AND metric_key = $2`,
                            [month, metricKey]
                        );
                        continue;
                    }

                    // UPSERT
                    await client.query(
                        `INSERT INTO ms_period_settings (target_month, metric_key, start_date, end_date, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (target_month, metric_key)
             DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, updated_at = NOW()`,
                        [month, metricKey, startDate, endDate]
                    );
                }

                await client.query('COMMIT');

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ message: "MS period settings saved successfully", month })
                };

            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };

    } catch (err) {
        console.error('API Error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
        };
    } finally {
        if (client) client.release();
    }
};
