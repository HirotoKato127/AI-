require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function check() {
    try {
        const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log("TABLES: " + res.rows.map(r => r.table_name).join(', '));
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}
check();
