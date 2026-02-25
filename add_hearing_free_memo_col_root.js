const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log("Checking if hearing_free_memo column exists in candidates table...");
        const res = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'candidates' AND column_name = 'hearing_free_memo'
        `);

        if (res.rows.length === 0) {
            console.log("Adding hearing_free_memo column to candidates table...");
            await client.query("ALTER TABLE candidates ADD COLUMN hearing_free_memo TEXT");
            console.log("Column added successfully.");
        } else {
            console.log("Column hearing_free_memo already exists.");
        }
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
