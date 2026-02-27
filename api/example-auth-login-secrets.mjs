// index.mjs (Secrets Manager対応版 - auth-login の例)
// =============================================================================
// 修正ポイント:
//   ① process.env.DB_PASSWORD → Secrets Manager から取得
//   ② process.env.JWT_SECRET → Secrets Manager から取得
//   ③ Pool の作成を遅延初期化（シークレット取得後に作成）
// =============================================================================

import pg from "pg";
import crypto from "crypto";
import { getDbConfig, getJwtSecret } from "./secrets.mjs";

const { Pool } = pg;

// DB Pool は遅延初期化（初回リクエスト時に作成）
let pool = null;

async function getPool() {
    if (pool) return pool;

    // Secrets Manager からDB接続情報を取得
    const dbConfig = await getDbConfig();

    pool = new Pool({
        host: dbConfig.DB_HOST,
        port: Number(dbConfig.DB_PORT || 5432),
        database: dbConfig.DB_NAME,
        user: dbConfig.DB_USER,
        password: dbConfig.DB_PASSWORD,
        ssl: { rejectUnauthorized: false },
        max: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000,
    });

    return pool;
}

// CORS設定（これは環境変数のままでOK。秘密情報ではない）
const ALLOWED_ORIGINS = new Set([
    "http://localhost:8000",
    "http://localhost:8001",
    "http://localhost:8081",
    "https://agent-key.pages.dev",
    "https://develop.agent-key.pages.dev",
]);

const baseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,authorization",
};

const TOKEN_TTL_HOURS = Number(process.env.JWT_TTL_HOURS || 12);

function buildHeaders(event) {
    const origin = event?.headers?.origin || event?.headers?.Origin || "";
    if (ALLOWED_ORIGINS.has(origin)) {
        return { ...baseHeaders, "Access-Control-Allow-Origin": origin };
    }
    return baseHeaders;
}

function base64urlEncode(input) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function base64urlEncodeBuffer(buf) {
    return buf
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

// JWT署名もSecrets Managerから取得したシークレットを使う
async function signToken(payload) {
    const jwtSecret = await getJwtSecret();
    const header = { alg: "HS256", typ: "JWT" };
    const data = `${base64urlEncode(JSON.stringify(header))}.${base64urlEncode(JSON.stringify(payload))}`;
    const signature = base64urlEncodeBuffer(
        crypto.createHmac("sha256", jwtSecret).update(data).digest()
    );
    return `${data}.${signature}`;
}

function parseJsonBody(event) {
    if (!event?.body) return null;
    const raw = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export const handler = async (event) => {
    const method = event?.requestContext?.http?.method || event?.httpMethod || "GET";
    const headers = buildHeaders(event);
    if (method === "OPTIONS") {
        return { statusCode: 204, headers, body: "" };
    }
    if (method !== "POST") {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: "Method not allowed" }),
        };
    }

    const body = parseJsonBody(event);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "email and password are required" }),
        };
    }

    let client;
    try {
        // ← ここが変わった！ Secrets Manager経由でDB接続
        const dbPool = await getPool();
        client = await dbPool.connect();

        const result = await client.query(
            `
        SELECT id, email, name, role, is_admin
        FROM users
        WHERE email = $1
          AND password_hash = crypt($2, password_hash)
        LIMIT 1
      `,
            [email, password]
        );

        if (result.rowCount === 0) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: "Invalid credentials" }),
            };
        }

        const user = result.rows[0];
        const appRole = user.is_admin ? "admin" : "member";

        const now = Math.floor(Date.now() / 1000);
        const payload = {
            sub: user.id,
            email: user.email,
            name: user.name,
            role: appRole,
            iat: now,
            exp: now + TOKEN_TTL_HOURS * 60 * 60,
        };

        // ← ここも変わった！ JWT署名にSecrets Managerのシークレットを使用
        const token = await signToken(payload);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: appRole,
                },
            }),
        };
    } catch (err) {
        console.error("LAMBDA ERROR:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Internal server error" }),
        };
    } finally {
        if (client) client.release();
    }
};
