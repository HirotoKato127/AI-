import pg from "pg";

// ---------------------------------------------------------
// 1. 設定・定数
// ---------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
    "http://localhost:8000",
    "http://localhost:8001",
    "http://localhost:8081",
    "https://agent-key.pages.dev",
    "https://develop.agent-key.pages.dev",
]);

const baseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,authorization",
};

function buildHeaders(event) {
    const origin = event?.headers?.origin || event?.headers?.Origin || "";
    return ALLOWED_ORIGINS.has(origin) ? { ...baseHeaders, "Access-Control-Allow-Origin": origin } : baseHeaders;
}

const { Pool } = pg;
const pool = new Pool({
    host: (process.env.DB_HOST || "").trim(),
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 5000,
});

// ---------------------------------------------------------
// 2. ヘルパー関数 (型変換)
// ---------------------------------------------------------
const toIntOrNull = (v) => (v === undefined || v === null || v === "") ? null : Math.trunc(Number(v));
const emptyToNull = (v) => (v === undefined || v === null || String(v).trim() === "") ? null : v;
const toBooleanOrNull = (v) => {
    if (v === true || v === "true" || v === 1 || v === "1") return true;
    if (v === false || v === "false" || v === 0 || v === "0") return false;
    return null;
};
const resolveUserId = (...args) => {
    for (const v of args) {
        const n = toIntOrNull(v);
        if (n !== null) return n;
    }
    return null;
};
const normalizeRole = (v) => String(v || "").trim().toLowerCase();

async function assertUserRole(client, userId, expectedRole, label) {
    if (!userId) return;
    const res = await client.query("SELECT id, name, role FROM users WHERE id = $1::int", [userId]);
    if (!res.rows.length) throw new Error(`${label}のユーザーが存在しません (ID: ${userId})`);
    if (normalizeRole(res.rows[0].role) !== normalizeRole(expectedRole)) {
        throw new Error(`${label}には role=${expectedRole} のユーザーのみ指定できます`);
    }
}

const calculateAge = (birthDate) => {
    if (!birthDate) return null;
    const date = new Date(birthDate);
    if (Number.isNaN(date.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age -= 1;
    return age;
};

async function syncNextActionDate(client, candidateId) {
    await client.query(`
    UPDATE candidates SET 
      next_action_date = (SELECT action_date FROM candidate_tasks WHERE candidate_id = $1::int AND is_completed = false ORDER BY action_date ASC LIMIT 1),
      next_action_note = (SELECT action_note FROM candidate_tasks WHERE candidate_id = $1::int AND is_completed = false ORDER BY action_date ASC LIMIT 1)
    WHERE id = $1::int`, [candidateId]);
}

// ---------------------------------------------------------
// 3. データ取得ロジック (GET)
// ---------------------------------------------------------
async function fetchCandidateDetail(client, candidateId, includeMaster = false) {
    const baseRes = await client.query(`
    SELECT
      c.*, u_ad.name AS user_advisor_name, u_pt.name AS user_partner_name,
      ca_latest.apply_route AS latest_apply_route, ca_stage.stage_list,
      ca_latest.client_name AS latest_company_name, ca_latest.job_title AS latest_job_name,
      ca_latest.stage_current AS latest_stage_current, u_call.name AS caller_name
    FROM candidates c
    LEFT JOIN users u_ad ON u_ad.id = c.advisor_user_id
    LEFT JOIN users u_pt ON u_pt.id = c.partner_user_id
    LEFT JOIN LATERAL (
      SELECT ca.client_id, cl.name AS client_name, ca.job_title, ca.apply_route, ca.stage_current, ca.updated_at, ca.created_at
      FROM candidate_applications ca LEFT JOIN clients cl ON cl.id = ca.client_id
      WHERE ca.candidate_id = c.id ORDER BY COALESCE(ca.updated_at, ca.created_at) DESC NULLS LAST LIMIT 1
    ) ca_latest ON TRUE
    LEFT JOIN LATERAL (
      SELECT caller_user_id FROM teleapo t WHERE t.candidate_id = c.id ORDER BY (t.result='通電') DESC, t.called_at DESC LIMIT 1
    ) t_last ON TRUE
    LEFT JOIN users u_call ON u_call.id = t_last.caller_user_id
    LEFT JOIN LATERAL (
        SELECT MAX(call_no) as max_call_no, BOOL_OR(result = '通電') as has_connected, BOOL_OR(result = 'SMS送信') as has_sms, MAX(CASE WHEN result = '通電' THEN called_at END) as last_connected_at
        FROM teleapo WHERE candidate_id = c.id
    ) t_stat ON TRUE
    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT ca.stage_current) AS stage_list FROM candidate_applications ca WHERE ca.candidate_id = c.id
    ) ca_stage ON TRUE
    WHERE c.id = $1::int LIMIT 1`, [candidateId]);

    if (!baseRes.rows.length) return null;
    const b = baseRes.rows[0];

    const selectionRes = await client.query(`
    SELECT COALESCE(json_agg(json_build_object(
            'id', ca.id, 'clientId', ca.client_id, 'companyName', cl.name, 'stageCurrent', ca.stage_current,
            'jobTitle', ca.job_title, 'route', ca.apply_route, 'applyRoute', ca.apply_route,
            'proposalDate', ca.proposal_date, 'recommendationDate', ca.recommended_at, 
            'firstInterviewDate', ca.first_interview_at, 'firstInterviewSetAt', ca.first_interview_set_at,
            'secondInterviewDate', ca.second_interview_at, 'secondInterviewSetAt', ca.second_interview_set_at,
            'finalInterviewDate', ca.final_interview_at, 'finalInterviewSetAt', ca.final_interview_set_at,
            'offerDate', ca.offer_at, 'offerAt', ca.offer_at, 
            'acceptanceDate', ca.offer_accepted_at, 'offerAcceptedAt', ca.offer_accepted_at,
            'onboardingDate', ca.joined_at, 'joinedAt', ca.joined_at,
            'preJoinDeclineDate', ca.pre_join_decline_at, 'preJoinDeclineReason', ca.pre_join_withdraw_reason,
            'postJoinQuitDate', ca.post_join_quit_at, 'postJoinQuitReason', ca.post_join_quit_reason,
            'declinedAfterOfferAt', ca.declined_after_offer_at, 'declinedAfterOfferReason', ca.declined_after_offer_reason,
            'earlyTurnoverAt', ca.early_turnover_at, 'earlyTurnoverReason', ca.early_turnover_reason,
            'closeExpectedDate', ca.closing_forecast_at, 'closingForecastAt', ca.closing_forecast_at,
            'selectionNote', ca.selection_note, 'feeAmount', ca.fee, 'created_at', ca.created_at
          ) ORDER BY COALESCE(ca.updated_at, ca.created_at) DESC), '[]'::json) AS selection_progress
    FROM candidate_applications ca LEFT JOIN clients cl ON cl.id = ca.client_id WHERE ca.candidate_id = $1::int`, [candidateId]);

    const tasksRes = await client.query(`SELECT id, action_date, action_note, is_completed, completed_at, created_at FROM candidate_tasks WHERE candidate_id = $1::int ORDER BY action_date DESC`, [candidateId]);
    const teleapoRes = await client.query(`SELECT t.id, t.call_no, t.called_at, t.result, t.memo, u.name AS caller_name FROM teleapo t LEFT JOIN users u ON u.id = t.caller_user_id WHERE t.candidate_id = $1::int ORDER BY t.called_at DESC`, [candidateId]);
    const moneyRes = await client.query(`
    SELECT 
      ca.id AS "applicationId", 
      cl.name AS "companyName", 
      p.fee_amount AS "feeAmount", 
      p.refund_amount AS "refundAmount", 
      p.order_date AS "orderDate", 
      p.withdraw_date AS "withdrawDate", 
      p.order_reported AS "orderReported", 
      p.refund_reported AS "refundReported",
      COALESCE(ca.joined_at::date, ca.join_date) AS "joinDate", 
      ca.pre_join_decline_at AS "preJoinWithdrawDate", 
      ca.post_join_quit_at AS "postJoinQuitDate"
    FROM candidate_applications ca LEFT JOIN placements p ON p.candidate_application_id = ca.id LEFT JOIN clients cl ON cl.id = ca.client_id
    WHERE ca.candidate_id = $1::int ORDER BY ca.created_at DESC`, [candidateId]);

    const address = [b.address_pref, b.address_city, b.address_detail].filter(Boolean).join("");
    const detail = {
        id: String(b.id), candidateName: b.name ?? "", candidateKana: b.name_kana ?? "", phone: b.phone ?? "", email: b.email ?? "",
        birthday: b.birth_date ?? null, age: calculateAge(b.birth_date) ?? b.age ?? null, gender: b.gender ?? "",
        postalCode: b.postal_code ?? "", addressPref: b.address_pref ?? "", addressCity: b.address_city ?? "", addressDetail: b.address_detail ?? "", address,
        education: b.final_education ?? "", nationality: b.nationality ?? "", japaneseLevel: b.japanese_level ?? "",
        nextActionDate: b.next_action_date ?? null, nextActionNote: b.next_action_note ?? "",
        tasks: tasksRes.rows, companyName: b.latest_company_name ?? "", jobName: b.latest_job_name ?? "",
        validApplication: Boolean(b.is_effective_application), advisorUserId: b.advisor_user_id, partnerUserId: b.partner_user_id,
        selectionProgress: selectionRes.rows[0].selection_progress || [], teleapoLogs: teleapoRes.rows, moneyInfo: moneyRes.rows,
        csSummary: { hasConnected: Boolean(b.has_connected), hasSms: Boolean(b.has_sms), callCount: b.max_call_no ?? 0, lastConnectedAt: b.last_connected_at },
        csStatus: b.cs_status ?? ""
    };

    if (includeMaster) {
        const clients = await client.query("SELECT id, name FROM clients ORDER BY name ASC");
        const users = await client.query("SELECT id, name, role FROM users ORDER BY name ASC");
        detail.masters = { clients: clients.rows, users: users.rows };
    }
    return detail;
}

// ---------------------------------------------------------
// 4. メインハンドラー (PUT & GET)
// ---------------------------------------------------------
export const handler = async (event) => {
    const method = event?.requestContext?.http?.method || event?.httpMethod || "GET";
    const headers = buildHeaders(event);
    if (method === "OPTIONS") return { statusCode: 204, headers, body: "" };

    const candidateId = toIntOrNull(event?.pathParameters?.id || event?.pathParameters?.candidateId);
    if (!candidateId) return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid ID" }) };

    let client;
    try {
        client = await pool.connect();

        if (method === "GET") {
            const data = await fetchCandidateDetail(client, candidateId, event?.queryStringParameters?.includeMaster === "true");
            return data ? { statusCode: 200, headers, body: JSON.stringify(data) } : { statusCode: 404, headers, body: "{}" };
        }

        if (method === "PUT") {
            const payload = JSON.parse(event.body || "{}");
            const detailMode = Boolean(payload.detailMode ?? payload.detail_mode);
            await client.query("BEGIN");

            try {
                if (detailMode) {
                    const advisorId = resolveUserId(payload.advisorUserId, payload.advisor_user_id);
                    const csId = resolveUserId(payload.partnerUserId, payload.partner_user_id, payload.csUserId, payload.cs_user_id);

                    // 1. 基本情報
                    if (payload.candidateName !== undefined) {
                        await assertUserRole(client, csId, "caller", "担当CS");
                        await assertUserRole(client, advisorId, "advisor", "担当アドバイザー");
                        await client.query(`
                            UPDATE candidates SET
                                updated_at=NOW(), name=$2::text, name_kana=$3::text, gender=$4::text, birth_date=$5::date,
                                phone=$6::text, email=$7::text, postal_code=$8::text, address_pref=$9::text, address_city=$10::text, address_detail=$11::text,
                                final_education=$12::text, nationality=$13::text, japanese_level=$14::text,
                                advisor_user_id=$15::int, partner_user_id=$16::int, is_effective_application=$17::boolean,
                                current_income=$18::int, desired_income=$19::int, employment_status=$20::text, skills=$21::text, personality=$22::text, work_experience=$23::text, memo=$24::text,
                                cs_status=$25::text
                            WHERE id=$1::int`, [candidateId, emptyToNull(payload.candidateName), emptyToNull(payload.candidateKana), emptyToNull(payload.gender), emptyToNull(payload.birthDate), emptyToNull(payload.phone), emptyToNull(payload.email), emptyToNull(payload.postalCode), emptyToNull(payload.addressPref), emptyToNull(payload.addressCity), emptyToNull(payload.addressDetail), emptyToNull(payload.education), emptyToNull(payload.nationality), emptyToNull(payload.japaneseLevel), advisorId, csId, toBooleanOrNull(payload.validApplication), toIntOrNull(payload.currentIncome), toIntOrNull(payload.desiredIncome), emptyToNull(payload.employmentStatus), emptyToNull(payload.skills), emptyToNull(payload.personality), emptyToNull(payload.workExperience), emptyToNull(payload.memo), emptyToNull(payload.csStatus)]);
                    }

                    // 2. タスク
                    if (toIntOrNull(payload.deleteTaskId)) await client.query(`DELETE FROM candidate_tasks WHERE id=$1::int AND candidate_id=$2::int`, [toIntOrNull(payload.deleteTaskId), candidateId]);
                    if (toIntOrNull(payload.completeTaskId)) await client.query(`UPDATE candidate_tasks SET is_completed=true, completed_at=NOW() WHERE id=$1::int AND candidate_id=$2::int`, [toIntOrNull(payload.completeTaskId), candidateId]);
                    if (emptyToNull(payload.nextActionDate) && emptyToNull(payload.nextActionNote)) {
                        await client.query(`INSERT INTO candidate_tasks (candidate_id, action_date, action_note, is_completed, created_at, updated_at) VALUES ($1::int, $2::date, $3::text, false, NOW(), NOW())`, [candidateId, payload.nextActionDate, payload.nextActionNote]);
                    }
                    await syncNextActionDate(client, candidateId);

                    // 3. 選考進捗 (全項目のDBカラム名同期 + 型キャスト + マッピング拡充)
                    const selectionPayload = payload.selectionProgress || payload.selection_progress;
                    if (Array.isArray(selectionPayload)) {
                        const keepIds = selectionPayload.map(e => toIntOrNull(e.id)).filter(id => id);
                        if (keepIds.length > 0) await client.query(`DELETE FROM candidate_applications WHERE candidate_id=$1::int AND id != ALL($2::int[])`, [candidateId, keepIds]);
                        else await client.query(`DELETE FROM candidate_applications WHERE candidate_id=$1::int`, [candidateId]);

                        for (const s of selectionPayload) {
                            const s_clientId = toIntOrNull(s.clientId || s.client_id);
                            if (!s_clientId && !s.id) continue;
                            const p = [
                                toIntOrNull(s.id),
                                s_clientId,
                                emptyToNull(s.stageCurrent || s.status),
                                emptyToNull(s.jobTitle),
                                emptyToNull(s.route || s.applyRoute),
                                emptyToNull(s.proposalDate),
                                emptyToNull(s.recommendedAt || s.recommendationDate),
                                emptyToNull(s.firstInterviewSetAt || s.firstInterviewAdjustDate || s.interviewSetupDate),
                                emptyToNull(s.firstInterviewAt || s.firstInterviewDate || s.interviewDate),
                                emptyToNull(s.secondInterviewSetAt || s.secondInterviewAdjustDate || s.secondInterviewSetupDate),
                                emptyToNull(s.secondInterviewAt || s.secondInterviewDate),
                                emptyToNull(s.finalInterviewSetAt || s.finalInterviewAdjustDate || s.finalInterviewSetupDate),
                                emptyToNull(s.finalInterviewAt || s.finalInterviewDate),
                                emptyToNull(s.offerAt || s.offerDate),
                                emptyToNull(s.offerAcceptedAt || s.offerAcceptedDate || s.acceptanceDate),
                                emptyToNull(s.joinedAt || s.joinedDate || s.onboardingDate),
                                emptyToNull(s.preJoinDeclineAt || s.preJoinDeclineDate || s.declinedDate),
                                emptyToNull(s.preJoinWithdrawReason || s.declinedReason),
                                emptyToNull(s.postJoinQuitAt || s.postJoinQuitDate || s.earlyTurnoverDate),
                                emptyToNull(s.postJoinQuitReason || s.earlyTurnoverReason),
                                emptyToNull(s.declinedAfterOfferAt || s.declinedDate),
                                emptyToNull(s.declinedAfterOfferReason || s.declinedReason),
                                emptyToNull(s.earlyTurnoverAt),
                                emptyToNull(s.earlyTurnoverReason),
                                emptyToNull(s.closingForecastAt || s.closingForecastDate || s.closeExpectedDate),
                                emptyToNull(s.selectionNote || s.note),
                                toIntOrNull(s.fee ?? s.feeAmount),
                                candidateId
                            ];
                            if (s.id) {
                                await client.query(`
                                    UPDATE candidate_applications SET 
                                        client_id=$2::int, stage_current=$3::text, job_title=$4::text, apply_route=$5::text, proposal_date=$6::date, recommended_at=$7::timestamptz,
                                        first_interview_set_at=$8::timestamptz, first_interview_at=$9::timestamptz, second_interview_set_at=$10::timestamptz, second_interview_at=$11::timestamptz,
                                        final_interview_set_at=$12::timestamptz, final_interview_at=$13::timestamptz, offer_at=$14::timestamptz, offer_accepted_at=$15::timestamptz,
                                        joined_at=$16::timestamptz, pre_join_decline_at=$17::timestamptz, pre_join_withdraw_reason=$18::text, post_join_quit_at=$19::timestamptz, post_join_quit_reason=$20::text,
                                        declined_after_offer_at=$21::timestamptz, declined_after_offer_reason=$22::text, early_turnover_at=$23::timestamptz, early_turnover_reason=$24::text,
                                        closing_forecast_at=$25::timestamptz, selection_note=$26::text, fee=$27::int, updated_at=NOW() WHERE id=$1::int AND candidate_id=$28::int`, p);
                            } else {
                                await client.query(`
                                    INSERT INTO candidate_applications (candidate_id, client_id, stage_current, job_title, apply_route, proposal_date, recommended_at, first_interview_set_at, first_interview_at, second_interview_set_at, second_interview_at, final_interview_set_at, final_interview_at, offer_at, offer_accepted_at, joined_at, pre_join_decline_at, pre_join_withdraw_reason, post_join_quit_at, post_join_quit_reason, declined_after_offer_at, declined_after_offer_reason, early_turnover_at, early_turnover_reason, closing_forecast_at, selection_note, fee, created_at, updated_at)
                                    VALUES ($28, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW(), NOW())`, p);
                            }
                        }
                    }

                    // 4. 売上・返金 (UPSERT構文の完全是正)
                    const moneyPayload = payload.moneyInfo || payload.money_info;
                    if (Array.isArray(moneyPayload)) {
                        for (const m of moneyPayload) {
                            const appId = toIntOrNull(m.applicationId || m.application_id);
                            if (!appId) continue;
                            const mv = [appId, toIntOrNull(m.feeAmount), toIntOrNull(m.refundAmount), emptyToNull(m.orderDate), emptyToNull(m.withdrawDate), toBooleanOrNull(m.orderReported), toBooleanOrNull(m.refundReported)];
                            await client.query(`
                                INSERT INTO placements (candidate_application_id, fee_amount, refund_amount, order_date, withdraw_date, order_reported, refund_reported, created_at, updated_at)
                                VALUES ($1::int, $2::int, $3::int, $4::date, $5::date, COALESCE($6::boolean, false), COALESCE($7::boolean, false), NOW(), NOW())
                                ON CONFLICT (candidate_application_id) DO UPDATE SET fee_amount=EXCLUDED.fee_amount, refund_amount=EXCLUDED.refund_amount, order_date=EXCLUDED.order_date, withdraw_date=EXCLUDED.withdraw_date, order_reported=EXCLUDED.order_reported, refund_reported=EXCLUDED.refund_reported, updated_at=NOW()`, mv);

                            const rf = String(m.refundType || "").toLowerCase();
                            const rd = emptyToNull(m.retirementDate || m.retireDate);
                            if (rf.includes("内定")) await client.query(`UPDATE candidate_applications SET pre_join_decline_at=$1::timestamptz, post_join_quit_at=NULL WHERE id=$2::int`, [rd, appId]);
                            else if (rf.includes("入社")) await client.query(`UPDATE candidate_applications SET post_join_quit_at=$1::timestamptz, pre_join_decline_at=NULL WHERE id=$2::int`, [rd, appId]);
                        }
                    }
                } else if (typeof payload.validApplication === "boolean") {
                    await client.query("UPDATE candidates SET is_effective_application = $2::boolean WHERE id = $1::int", [candidateId, payload.validApplication]);
                } else if (payload.csStatus !== undefined) {
                    await client.query("UPDATE candidates SET cs_status = $2::text, updated_at = NOW() WHERE id = $1::int", [candidateId, emptyToNull(payload.csStatus)]);
                }
                await client.query("COMMIT");
                const updated = await fetchCandidateDetail(client, candidateId);
                return { statusCode: 200, headers, body: JSON.stringify(updated) };
            } catch (err) {
                await client.query("ROLLBACK");
                throw err;
            }
        }
        return { statusCode: 405, headers, body: '{"error":"Method Not Allowed"}' };
    } catch (err) {
        console.error("LAMBDA ERROR:", err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    } finally {
        if (client) client.release();
    }
};
