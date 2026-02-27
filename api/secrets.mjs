// secrets.mjs
// =============================================================================
// Secrets Manager からシークレットを取得する共通モジュール
// =============================================================================
// 
// 使い方:
//   import { getDbConfig, getJwtSecret } from "./secrets.mjs";
//
//   const dbConfig = await getDbConfig();  // DB接続情報
//   const jwtSecret = await getJwtSecret(); // JWT署名キー
//
// キャッシュ付き: 一度取得したら5分間再利用する（毎回AWSに問い合わせない）
// =============================================================================

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

// Secrets Manager クライアント（Lambdaのコンテナ再利用で使い回される）
const client = new SecretsManagerClient({ region: "ap-northeast-1" });

// キャッシュ用変数
let dbConfigCache = null;
let jwtSecretCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分間キャッシュ

/**
 * キャッシュが有効かチェック
 */
function isCacheValid() {
    return Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

/**
 * DB接続情報を取得
 * 返り値: { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT }
 */
export async function getDbConfig() {
    if (dbConfigCache && isCacheValid()) {
        return dbConfigCache;
    }

    const response = await client.send(
        new GetSecretValueCommand({ SecretId: "agentkey/prod/db-credentials" })
    );
    dbConfigCache = JSON.parse(response.SecretString);
    cacheTimestamp = Date.now();
    return dbConfigCache;
}

/**
 * JWTシークレットを取得
 * 返り値: string
 */
export async function getJwtSecret() {
    if (jwtSecretCache && isCacheValid()) {
        return jwtSecretCache;
    }

    const response = await client.send(
        new GetSecretValueCommand({ SecretId: "agentkey/prod/jwt-secret" })
    );
    const parsed = JSON.parse(response.SecretString);
    jwtSecretCache = parsed.JWT_SECRET;
    cacheTimestamp = Date.now();
    return jwtSecretCache;
}
