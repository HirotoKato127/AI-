const { Pool } = require("pg");
const path = require("path");
const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });

console.log("Loading .env from:", envPath);
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASSWORD is set:", !!process.env.DB_PASSWORD);

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log("Adding next_action_content column...");
        await client.query(`
      ALTER TABLE candidates 
      ADD COLUMN IF NOT EXISTS next_action_content TEXT;
    `);
        console.log("Column added successfully or already exists.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
