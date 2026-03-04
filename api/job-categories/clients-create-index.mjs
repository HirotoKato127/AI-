/**
 * ============================================================
 * Lambda: ats-api-prod-clients-create
 * POST /clients — 企業新規作成
 * PUT  /clients — 企業情報更新
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
    "Access-Control-Allow-Methods": "OPTIONS,POST,PUT"
};

function buildHeaders(event) {
    const origin = event?.headers?.origin || event?.headers?.Origin || "";
    if (ALLOWED_ORIGINS.has(origin)) {
        return { ...baseHeaders, "Access-Control-Allow-Origin": origin };
    }
    return baseHeaders;
}

let clientsNameUniqRelaxed = false;

function isClientsNameUniqueViolation(err) {
    if (err?.code !== '23505') return false;
    const message = String(err?.message || '').toLowerCase();
    const detail = String(err?.detail || '').toLowerCase();
    const text = `${message} ${detail}`;
    return (
        (text.includes('clients') && text.includes('name')) ||
        text.includes('clients_name') ||
        text.includes('name_key')
    );
}

async function ensureClientsNameAllowsDuplicates(client, { force = false } = {}) {
    if (clientsNameUniqRelaxed && !force) return true;

    try {
        await client.query(`
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'clients'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ~* 'UNIQUE \\(name\\)'
  LOOP
    EXECUTE format('ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;

  FOR c IN
    SELECT cls.relname AS index_name
    FROM pg_index idx
    JOIN pg_class tbl ON tbl.oid = idx.indrelid
    JOIN pg_namespace nsp ON nsp.oid = tbl.relnamespace
    JOIN pg_class cls ON cls.oid = idx.indexrelid
    WHERE nsp.nspname = 'public'
      AND tbl.relname = 'clients'
      AND idx.indisunique = true
      AND idx.indisprimary = false
      AND (
        pg_get_indexdef(idx.indexrelid) ~* '\\(name\\)'
        OR pg_get_indexdef(idx.indexrelid) ~* 'lower\\(\\(?name\\)?\\)'
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', c.index_name);
  END LOOP;
END $$;
    `);

        clientsNameUniqRelaxed = true;
        return true;
    } catch (ddlErr) {
        console.warn('Could not relax clients.name uniqueness automatically:', ddlErr?.message || ddlErr);
        return false;
    }
}

async function queryWithClientsNameRetry(client, sql, values) {
    try {
        return await client.query(sql, values);
    } catch (err) {
        if (!isClientsNameUniqueViolation(err)) throw err;

        const relaxed = await ensureClientsNameAllowsDuplicates(client, { force: true });
        if (!relaxed) throw err;

        return client.query(sql, values);
    }
}

/**
 * 中間テーブル client_job_categories を同期する
 * 既存レコードを全削除→新規INSERTの方式（職種数は少ないので問題ない）
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

    // バルクINSERT
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
    if (method !== 'POST' && method !== 'PUT') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    let client;

    try {
        const rawBody = event.isBase64Encoded
            ? Buffer.from(event.body || '', 'base64').toString('utf-8')
            : event.body;

        if (!rawBody) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Empty body" }) };
        }

        const body = JSON.parse(rawBody);

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

        const updateId = event.pathParameters?.id || body.id;

        client = await pool.connect();

        // ★ jobCategoryIds を取得（POST/PUT共通）
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

        if (updateId) {
            // === UPDATE ===
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
            addIfProvided('selection_note', ['selectionNote', 'selection_note']);
            addIfProvided('contact_name', ['contactName', 'contact_name']);
            addIfProvided('contact_email', ['contactEmail', 'contact_email']);
            addIfProvided('warranty_period', ['warrantyPeriod', 'warranty_period'], null, parseOptionalNumber);
            addIfProvided('fee_details', ['feeDetails', 'feeContract', 'fee_details']);
            addIfProvided('contract_note', ['contractNote', 'contractNotes', 'contract_note']);
            addIfProvided('salary_range', ['salaryRange'], 'salaryRange');
            addIfProvided('must_qualifications', ['mustQualifications'], 'mustQualifications');
            addIfProvided('nice_qualifications', ['niceQualifications'], 'niceQualifications');
            addIfProvided('desired_locations', ['desiredLocations', 'locations'], 'locations');
            addIfProvided('personality_traits', ['personalityTraits', 'personality'], 'personality');
            addIfProvided('required_experience', ['requiredExperience', 'experiences'], 'experiences');

            // jobCategoryIdsが来ている場合はupdatesが無くてもOK（中間テーブルだけ更新）
            if (!updates.length && !hasJobCategoryIdsField) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "No updatable fields provided" }) };
            }

            let res;
            if (updates.length > 0) {
                updates.push('updated_at = NOW()');
                values.push(updateId);

                const updateQuery = `
          UPDATE clients
          SET ${updates.join(', ')}
          WHERE id = $${values.length}
          RETURNING *;
        `;

                res = await queryWithClientsNameRetry(client, updateQuery, values);

                if (res.rows.length === 0) {
                    return { statusCode: 404, headers, body: JSON.stringify({ error: "Client not found" }) };
                }
            }

            // ★ 中間テーブルを同期
            if (hasJobCategoryIdsField) {
                await syncClientJobCategories(client, updateId, jobCategoryIds);
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    message: "Updated successfully",
                    item: res ? res.rows[0] : { id: updateId },
                    jobCategoryIds: hasJobCategoryIdsField ? jobCategoryIds : []
                })
            };
        }

        // === CREATE ===
        if (!body.name && !body.companyName) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Company name is required" }) };
        }

        const companyName = body.name || body.companyName;
        const insertQuery = `
      INSERT INTO clients (
        name, industry, location, job_categories, planned_hires_count, selection_note,
        contact_name, contact_email, warranty_period, fee_details, contract_note,
        salary_range, must_qualifications, nice_qualifications, desired_locations,
        personality_traits, required_experience,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17,
        NOW(), NOW()
      )
      RETURNING id, name, created_at;
    `;

        const insertValues = [
            companyName,
            recruitmentText ?? null,
            body.location ?? null,
            recruitmentText ?? null,
            parseOptionalNumber(body.plannedHiresCount ?? body.planned_hires_count) ?? 0,
            body.selectionNote ?? body.selection_note ?? null,
            body.contactName ?? body.contact_name ?? null,
            body.contactEmail ?? body.contact_email ?? null,
            parseOptionalNumber(body.warrantyPeriod ?? body.warranty_period),
            body.feeDetails ?? body.feeContract ?? body.fee_details ?? null,
            body.contractNote ?? body.contractNotes ?? body.contract_note ?? null,
            pickValue(['salaryRange'], 'salaryRange') ?? null,
            pickValue(['mustQualifications'], 'mustQualifications') ?? null,
            pickValue(['niceQualifications'], 'niceQualifications') ?? null,
            pickValue(['desiredLocations', 'locations'], 'locations') ?? null,
            pickValue(['personalityTraits', 'personality'], 'personality') ?? null,
            pickValue(['requiredExperience', 'experiences'], 'experiences') ?? null
        ];

        const res = await queryWithClientsNameRetry(client, insertQuery, insertValues);
        const newItem = res.rows[0];

        // ★ 新規作成後に中間テーブルを同期
        if (hasJobCategoryIdsField) {
            await syncClientJobCategories(client, newItem.id, jobCategoryIds);
        }

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                message: "Created successfully",
                id: newItem.id,
                item: newItem,
                jobCategoryIds: hasJobCategoryIdsField ? jobCategoryIds : []
            })
        };

    } catch (err) {
        console.error('API Error:', err);

        if (isClientsNameUniqueViolation(err)) {
            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({
                    error: "clients.name unique constraint is still active. Please drop unique constraint/index for clients.name."
                })
            };
        }

        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    } finally {
        if (client) client.release();
    }
};
