const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    const client = await pool.connect();
    try {
        console.log("Checking if new hearing memo columns exist in candidates table...");
        const res = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'candidates' 
      AND column_name IN (
        'has_chronic_disease', 
        'chronic_disease_detail', 
        'relocation_possible', 
        'relocation_impossible_reason', 
        'personal_concerns'
      )
    `);

        const existingColumns = res.rows.map(r => r.column_name);

        if (!existingColumns.includes('has_chronic_disease')) {
            console.log("Adding has_chronic_disease column...");
            await client.query("ALTER TABLE candidates ADD COLUMN has_chronic_disease BOOLEAN");
        }

        if (!existingColumns.includes('chronic_disease_detail')) {
            console.log("Adding chronic_disease_detail column...");
            await client.query("ALTER TABLE candidates ADD COLUMN chronic_disease_detail TEXT");
        }

        if (!existingColumns.includes('relocation_possible')) {
            console.log("Adding relocation_possible column...");
            await client.query("ALTER TABLE candidates ADD COLUMN relocation_possible BOOLEAN");
        }

        if (!existingColumns.includes('relocation_impossible_reason')) {
            console.log("Adding relocation_impossible_reason column...");
            await client.query("ALTER TABLE candidates ADD COLUMN relocation_impossible_reason TEXT");
        }

        if (!existingColumns.includes('personal_concerns')) {
            console.log("Adding personal_concerns column...");
            await client.query("ALTER TABLE candidates ADD COLUMN personal_concerns TEXT");
        }

        console.log("Successfully added the required columns.");

    } catch (err) {
        console.error("Error updating schema:", err);
    } finally {
        client.release();
        pool.end();
    }
}

main();
