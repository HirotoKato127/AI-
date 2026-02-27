import pg from 'pg';

const ALLOWED_ORIGINS = new Set([
    'http://localhost:8000',
    'http://localhost:8001',
    'http://localhost:8081',
    'https://agent-key.pages.dev',
    'https://develop.agent-key.pages.dev',
]);

const baseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,authorization',
};

function buildHeaders(event) {
    const origin = event?.headers?.origin || event?.headers?.Origin || '';
    if (ALLOWED_ORIGINS.has(origin)) {
        return { ...baseHeaders, 'Access-Control-Allow-Origin': origin };
    }
    return baseHeaders;
}

const { Pool } = pg;
const pool = new Pool({
    host: (process.env.DB_HOST || '').trim(),
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 30000,
});

export const handler = async (event) => {
    const method = event?.requestContext?.http?.method || event?.httpMethod || 'GET';
    const headers = buildHeaders(event);
    if (method === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    let client;
    try {
        client = await pool.connect();

        if (method === 'GET') {
            const key = event?.queryStringParameters?.key;
            if (!key) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'key is required' }) };
            }

            const { rows } = await client.query(
                "SELECT options FROM system_options WHERE option_key = $1",
                [key]
            );

            const item = rows.length === 0 ? { custom: [], deleted: [] } : rows[0].options;
            return { statusCode: 200, headers, body: JSON.stringify({ item }) };
        }

        if (method === 'PUT') {
            const rawBody = event?.isBase64Encoded
                ? Buffer.from(event.body || '', 'base64').toString('utf8')
                : (event.body || '');
            const payload = JSON.parse(rawBody || '{}');
            const key = payload.key;
            const options = payload.options;

            if (!key || !options) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'key and options are required' }) };
            }

            const { rows } = await client.query(
                `
        INSERT INTO system_options (option_key, options, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (option_key)
        DO UPDATE SET options = EXCLUDED.options, updated_at = NOW()
        RETURNING *
      `,
                [key, JSON.stringify(options)]
            );

            return { statusCode: 200, headers, body: JSON.stringify({ item: rows[0].options }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

    } catch (err) {
        console.error('System Options API Error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
        };
    } finally {
        if (client) client.release();
    }
};
