// =============================================
// CSステータス変更メール送信 Lambda
// CSステータスが特定の値に変更されたとき、SESで通知メールを送信する
//
// トリガーステータス:
//   - "34歳以下techメール" → 34歳以下tech用テンプレート
//   - "35歳以上メール"     → 35歳以上用テンプレート
//   - "外国籍メール"       → 外国籍用テンプレート
// =============================================
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import pg from "pg";

const { Pool } = pg;

// ==========================
// 設定
// ==========================

// 送信元アドレス（SESで検証済み）
const FROM_ADDRESS = "info@masterkey-inc.com";

// SESクライアント
const ses = new SESClient({ region: "ap-northeast-1" });

// DBプール
const pool = new Pool({
    host: (process.env.DB_HOST || "").trim(),
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 30000,
});

// ==========================
// メールテンプレート定義
// CSステータス名をキーにして、件名と本文を返す
// ==========================

const MAIL_TEMPLATES = {
    "34歳以下techメール": (name) => ({
        subject: "選考に関するご案内｜MASTER key(株)",
        body: `${name}様

お世話になっております。
先程お電話させていただきました、MASTER key(株)採用担当です。
この度は、MASTER key(株)のグループ会社である、techMASTER(株)の求人にご応募いただきまして誠にありがとうございます。

弊社の求人につきまして、選考に進んでいただくためのご案内でご連絡いたしました。
お電話可能な時間につきまして、下記フォームよりご回答のほどよろしくお願いいたします！
https://timerex.net/s/masterkey.cs1015_1fe3/a6d2ef3b

お電話が難しい場合は弊社公式LINEアカウントのご登録をお願いいたします！
ご登録後、お名前（フルネーム）をお送りください。
▼公式LINEはこちら
https://liff.line.me/2002247484-Qa4V5EvK/landing?follow=%40870ykjbl&lp=pdsidB&liff_id=2002247484-Qa4V5EvK

お忙しいところ恐れ入りますが、ご対応のほど何卒よろしくお願いいたします。

MASTER key(株) 採用担当`,
    }),

    "35歳以上メール": (name) => ({
        subject: "選考に関するご案内｜MASTER key(株)",
        body: `${name}様

はじめまして。MASTER key(株)採用担当です。
この度はご応募いただきまして誠にありがとうございます。

弊社は、応募者様の方とのやりとりを公式LINEでさせていただいております。
つきましては、以下のリンクより追加いただき、フルネームをお送りください。
https://liff.line.me/2002247484-Qa4V5EvK/landing?follow=%40870ykjbl&lp=GI2hFe&liff_id=2002247484-Qa4V5EvK

大変お忙しいと存じますが、ご対応のほどよろしくお願いいたします。

MASTER key(株) 採用担当`,
    }),

    "外国籍メール": (name) => ({
        subject: "選考に関するご案内｜MASTER key(株)",
        body: `${name}様

はじめまして。MASTER key(株)採用担当です。
この度は弊社求人にご応募いただきまして誠にありがとうございます。

${name}様にはぜひ選考に進んでいただきたいと思い、ご連絡を差し上げました。

今後の流れに関しまして、弊社では応募者様の方とのやり取りを公式LINEにてさせていただいておりまして、以降のやり取りはそちらで行わせていただければと思います。

つきましては、以下のリンクよりLINEの追加をお願いいたします。
※追加後は送付されるアナウンスに沿ってご対応をお願いいたします。

https://liff.line.me/2002247484-Qa4V5EvK/landing?follow=%40870ykjbl&lp=A7UMS9&liff_id=2002247484-Qa4V5EvK

以上、お忙しいところ恐れ入りますが、ご対応のほど何卒よろしくお願いいたします。

MASTER key(株) 採用担当`,
    }),
};
// ゆらぎ対応
MAIL_TEMPLATES["34歳以下メール(tech)"] = MAIL_TEMPLATES["34歳以下techメール"];
MAIL_TEMPLATES["34歳以下メール（tech）"] = MAIL_TEMPLATES["34歳以下techメール"];

// メール送信のトリガーになるCSステータス一覧
const MAIL_TRIGGER_STATUSES = Object.keys(MAIL_TEMPLATES);

// ==========================
// メインハンドラー
// ==========================
export const handler = async (event) => {
    console.log("[CS-MAILER-DEBUG] 1. Lambda起動. Event:", JSON.stringify(event));

    const { candidateId, newStatus, oldStatus, candidateName, candidateEmail } = event;

    // 送信対象ステータスかチェック
    if (!MAIL_TRIGGER_STATUSES.includes(newStatus)) {
        console.log(`[CS-MAILER-DEBUG] 2a. 対象外ステータス: ${newStatus} (対象: ${MAIL_TRIGGER_STATUSES.join(',')}) → スキップ`);
        return { statusCode: 200, body: "対象外ステータス" };
    }
    console.log(`[CS-MAILER-DEBUG] 2b. 対象ステータス確認OK: ${newStatus}`);

    // 同じステータスへの変更はスキップ
    if (oldStatus === newStatus) {
        console.log(`[CS-MAILER-DEBUG] 3a. ステータス変更なし: ${oldStatus} → ${newStatus} → スキップ`);
        return { statusCode: 200, body: "ステータス変更なし" };
    }
    console.log(`[CS-MAILER-DEBUG] 3b. ステータス変更確認OK: ${oldStatus} → ${newStatus}`);

    try {
        // メールアドレスがない場合はスキップ
        const targetEmail = candidateEmail || event.email;
        if (!targetEmail) {
            console.log(`[CS-MAILER-DEBUG] 6a. 候補者ID ${candidateId}: 送信先メールアドレス無し → スキップ`);
            return { statusCode: 200, body: "メールアドレスなし" };
        }
        console.log(`[CS-MAILER-DEBUG] 6b. メールアドレス確認OK: ${targetEmail}`);

        const targetName = candidateName || event.name || "応募者";

        // CSステータス名でテンプレートを選択
        console.log(`[CS-MAILER-DEBUG] 8. テンプレート選択開始: ${newStatus}`);
        const templateFn = MAIL_TEMPLATES[newStatus];
        if (!templateFn) {
            console.error(`[CS-MAILER-DEBUG] 8a. 致命的エラー: テンプレート関数が見つかりません: ${newStatus}`);
            return { statusCode: 500, body: "テンプレートなし" };
        }
        const { subject, body: emailBody } = templateFn(targetName);
        console.log(`[CS-MAILER-DEBUG] 8b. テンプレート生成完了. Subject: ${subject}`);

        // SESでメール送信
        console.log(`[CS-MAILER-DEBUG] 9. SES送信準備... SendEmailCommand生成`);
        const sendCommand = new SendEmailCommand({
            Source: FROM_ADDRESS,
            Destination: { ToAddresses: [targetEmail] },
            Message: {
                Subject: { Data: subject, Charset: "UTF-8" },
                Body: {
                    Text: { Data: emailBody, Charset: "UTF-8" },
                },
            },
        });

        console.log(`[CS-MAILER-DEBUG] 10. SES送信実行 (await ses.send)`);
        const sesResponse = await ses.send(sendCommand);
        console.log(`[CS-MAILER-DEBUG] 10a. SES送信成功! Response:`, JSON.stringify(sesResponse));

        // DBへの書き込み処理（VPCに接続できない場合のタイムアウト回避のため一時的に無効化）
        /*
        console.log(`[CS-MAILER-DEBUG] 11. DB送信記録更新実行`);
        const client = await pool.connect();
        await client.query("UPDATE candidates SET cs_status_notify_sent_at = NOW() WHERE id = $1", [candidateId]);
        client.release();
        */

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "メール送信完了",
                candidateId,
                email: targetEmail,
                template: newStatus,
            }),
        };
    } catch (err) {
        console.error("[CS-MAILER-DEBUG] X. 致命的エラー発生:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};
