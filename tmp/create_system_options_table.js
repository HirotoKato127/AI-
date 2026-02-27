require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgres://app:app@localhost:5433/app'
});

async function main() {
    const client = await pool.connect();
    try {
        const q = `
      CREATE TABLE IF NOT EXISTS public.system_options (
          option_key VARCHAR(100) PRIMARY KEY,
          options JSONB NOT NULL DEFAULT '{"custom": [], "deleted": []}'::jsonb,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
        await client.query(q);
        console.log("Table system_options created successfully.");
    } catch (err) {
        console.error("Query Error", err);
    } finally {
        client.release();
        pool.end();
    }
}
main();
