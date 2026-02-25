-- CSステータス変更メール通知用カラム追加
-- 二重送信防止のためのタイムスタンプカラム
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS cs_status_notify_sent_at TIMESTAMPTZ DEFAULT NULL;
