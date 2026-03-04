/**
 * ============================================================
 * Lambda: ats-api-prod-kpi-clients-edit
 * GET  /clients/edit — 企業一覧（簡易版: id,name のみ）
 * PUT  /clients/edit — 企業情報更新
 * DELETE /clients/edit — 企業削除
 * ============================================================
 * 改修内容: jobCategoryIds 配列で中間テーブル client_job_categories を管理
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
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
};

function buildHeaders(event) {
    const origin = event?.headers?.origin || event?.headers?.Origin || "";
    if (ALLOWED_ORIGINS.has(origin)) {
        return { ...baseHeaders, "Access-Control-Allow-Origin": origin };
    }
    return baseHeaders;
}

/**
 * 中間テーブル client_job_categories を同期する
 */
async function syncClientJobCategories(dbClient, clientId, jobCategoryIds) {
    if (!Array.isArray(jobCategoryIds)) return;

    // 既存の紐づけを全削除
    await dbClient.query(
        'DELETE FROM client_job_categories WHERE client_id = $1',
        [clientId]
    );

    // 新しい紐づけをINSERT（重複排除）
    const uniqueIds = [...new Set(jobCategoryIds.filter(id => Number.isFinite(Number(id))))];
    if (uniqueIds.length === 0) return;

    const placeholders = uniqueIds.map((_, i) => `($1, $${i + 2})`).join(', ');
    const values = [clientId, ...uniqueIds.map(Number)];

    await dbClient.query(
        `INSERT INTO client_job_categories (client_id, job_category_id)
     VALUES ${placeholders}
     ON CONFLICT (client_id, job_category_id) DO NOTHING`,
        values
    );
}

function normalizeOptionalText(value) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text : null;
}

function parseJobCategoryIds(value) {
    if (Array.isArray(value)) {
        return [...new Set(value.map(Number).filter(Number.isFinite))];
    }
    if (typeof value === 'string') {
        return [...new Set(
            value
                .split(',')
                .map((part) => Number(String(part).trim()))
                .filter(Number.isFinite)
        )];
    }
    return [];
}

async function resolveRecruitmentTextFromJobCategoryIds(dbClient, jobCategoryIds = []) {
    if (!Array.isArray(jobCategoryIds) || jobCategoryIds.length === 0) return null;
    const { rows } = await dbClient.query(
        `SELECT sub_category
         FROM job_category_master
         WHERE id = ANY($1::int[])
         ORDER BY sort_order ASC, id ASC`,
        [jobCategoryIds]
    );
    const names = rows
        .map((row) => String(row?.sub_category || '').trim())
        .filter(Boolean);
    return names.length ? names.join(', ') : null;
}

export const handler = async (event) => {
    const headers = buildHeaders(event);

    const method =
        event.httpMethod ||
        event.requestContext?.http?.method ||
        event.requestContext?.httpMethod;

    if (method === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // === GET: 企業一覧（簡易版） ===
    if (method === 'GET') {
        let client;
        try {
            client = await pool.connect();
            const { rows } = await client.query(
                'SELECT id, name FROM clients ORDER BY name ASC'
            );
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(rows),
            };
        } catch (err) {
            console.error('Clients GET Error:', err);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: err.message }),
            };
        } finally {
            if (client) client.release();
        }
    }

    let client;

    try {
        const normalizeClientId = (value) => {
            const text = String(value ?? '').trim();
            if (!text) return null;
            return /^\d+$/.test(text) ? text : null;
        };
        const readRawBody = () => (event.isBase64Encoded
            ? Buffer.from(event.body || '', 'base64').toString('utf-8')
            : event.body);
        const parseBody = () => {
            const rawBody = readRawBody();
            if (!rawBody) return {};
            return JSON.parse(rawBody);
        };
        const body = parseBody();
        const rawId =
            event.pathParameters?.id ||
            event.queryStringParameters?.id ||
            body.id;
        const id = normalizeClientId(rawId);

        client = await pool.connect();

        // === DELETE ===
        if (method === 'DELETE') {
            if (!id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: "Valid company ID is required" })
                };
            }

            // 中間テーブルも一緒に削除される（ON DELETE CASCADE）
            const del = await client.query('DELETE FROM clients WHERE id = $1', [id]);
            if (del.rowCount === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: "Company not found (ID does not exist)" })
                };
            }
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: "Delete success", id: String(id) })
            };
        }

        // === PUT ===
        if (method !== 'PUT') {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: `Unsupported method: ${method}` })
            };
        }

        if (!id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Valid company ID is required" })
            };
        }

        console.log(`Updating client ID: ${id}`);

        const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
        const desiredTalent =
            hasOwn(body, 'desiredTalent') && body.desiredTalent && typeof body.desiredTalent === 'object'
                ? body.desiredTalent
                : null;
        const hasNested = (key) => Boolean(desiredTalent && hasOwn(desiredTalent, key));
        const pickValue = (keys, nestedKey) => {
            for (const key of keys) {
                if (hasOwn(body, key)) return body[key];
            }
            if (nestedKey && hasNested(nestedKey)) return desiredTalent[nestedKey];
            return undefined;
        };
        const shouldUpdate = (keys, nestedKey) => {
            if (keys.some((key) => hasOwn(body, key))) return true;
            return Boolean(nestedKey && hasNested(nestedKey));
        };
        const parseOptionalNumber = (value) => {
            if (value === undefined || value === null || value === '') return null;
            const num = Number(value);
            return Number.isFinite(num) ? num : null;
        };

        // ★ jobCategoryIds を取得
        const hasJobCategoryIdsField =
            hasOwn(body, 'jobCategoryIds') || hasOwn(body, 'job_category_ids');
        const jobCategoryIds = hasJobCategoryIdsField
            ? parseJobCategoryIds(body.jobCategoryIds ?? body.job_category_ids)
            : null;
        const recruitmentTextFromIds = hasJobCategoryIdsField
            ? await resolveRecruitmentTextFromJobCategoryIds(client, jobCategoryIds)
            : null;
        const recruitmentTextFromBody = normalizeOptionalText(
            body.jobCategories ?? body.jobTitle ?? body.job_categories ?? body.industry
        );
        const recruitmentText = recruitmentTextFromIds || recruitmentTextFromBody;

        const updates = [];
        const values = [];
        const addField = (column, value) => {
            values.push(value ?? null);
            updates.push(`${column} = $${values.length}`);
        };
        const addIfProvided = (column, keys, nestedKey, transform) => {
            if (!shouldUpdate(keys, nestedKey)) return;
            const raw = pickValue(keys, nestedKey);
            const value = transform ? transform(raw) : raw;
            addField(column, value);
        };

        addIfProvided('name', ['name', 'companyName']);
        addIfProvided('location', ['location']);
        if (hasJobCategoryIdsField || shouldUpdate(['jobCategories', 'job_categories', 'jobTitle', 'industry'])) {
            addField('job_categories', recruitmentText);
            // 互換維持: legacyカラムにも同値を格納
            addField('industry', recruitmentText);
        }
        addIfProvided('planned_hires_count', ['plannedHiresCount', 'planned_hires_count'], null, parseOptionalNumber);
        addIfProvided('salary_range', ['salaryRange'], 'salaryRange');
        addIfProvided('must_qualifications', ['mustQualifications'], 'mustQualifications');
        addIfProvided('nice_qualifications', ['niceQualifications'], 'niceQualifications');
        addIfProvided('desired_locations', ['desiredLocations', 'locations'], 'locations');
        addIfProvided('personality_traits', ['personalityTraits', 'personality'], 'personality');
        addIfProvided('required_experience', ['requiredExperience', 'experiences'], 'experiences');
        addIfProvided('selection_note', ['selectionNote']);
        addIfProvided('contact_name', ['contactName', 'contact_name']);
        addIfProvided('contact_email', ['contactEmail', 'contact_email']);
        addIfProvided('warranty_period', ['warrantyPeriod', 'warranty_period'], null, parseOptionalNumber);
        addIfProvided('fee_details', ['feeDetails', 'feeContract', 'fee_details']);
        addIfProvided('contract_note', ['contractNote', 'contractNotes', 'contract_note']);

        // jobCategoryIdsが来ている場合はupdatesが無くてもOK
        if (!updates.length && !hasJobCategoryIdsField) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "No updatable fields provided" })
            };
        }

        if (updates.length > 0) {
            updates.push('updated_at = NOW()');
            values.push(id);

            const query = `
        UPDATE clients
        SET ${updates.join(', ')}
        WHERE id = $${values.length}
        RETURNING id;
      `;

            const res = await client.query(query, values);

            if (res.rowCount === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: "Company not found (ID does not exist)" })
                };
            }
        }

        // ★ 中間テーブルを同期
        if (hasJobCategoryIdsField) {
            await syncClientJobCategories(client, id, jobCategoryIds);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: "Update success",
                id: id,
                updatedFields: body,
                jobCategoryIds: hasJobCategoryIdsField ? jobCategoryIds : []
            })
        };

    } catch (err) {
        console.error('Update Error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
        };
    } finally {
        if (client) {
            client.release();
        }
    }
};
