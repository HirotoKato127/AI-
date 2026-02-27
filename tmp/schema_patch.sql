CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS system_options (
    option_key VARCHAR(100) PRIMARY KEY,
    options JSONB NOT NULL DEFAULT '{"custom": [], "deleted": []}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidates (
