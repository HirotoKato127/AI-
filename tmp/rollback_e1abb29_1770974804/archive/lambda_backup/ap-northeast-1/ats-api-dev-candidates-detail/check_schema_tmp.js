const { Client } = require('pg');

const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        await client.connect();

        console.log('--- candidate_applications columns ---');
        const resApp = await client.query("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'candidate_applications' ORDER BY column_name");
        resApp.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type} (${r.udt_name})`));

        console.log('\n--- placements columns ---');
        const resPlace = await client.query("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'placements' ORDER BY column_name");
        resPlace.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type} (${r.udt_name})`));

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
})();
