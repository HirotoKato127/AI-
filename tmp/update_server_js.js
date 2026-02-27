const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

const target = `  } finally {
    client.release();
  }
});

// Ensure DB migration on startup`;

const replace = `  } finally {
    client.release();
  }
});

// System Options API
app.get("/api/system-options", async (req, res) => {
  const key = req.query.key;
  if (!key) {
    res.status(400).json({ error: "keyが必要です。" });
    return;
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT options FROM system_options WHERE option_key = $1",
      [key]
    );
    if (rows.length === 0) {
      res.json({ item: { custom: [], deleted: [] } });
    } else {
      res.json({ item: rows[0].options });
    }
  } catch (error) {
    console.error("Failed to fetch system options", error);
    res.status(500).json({ error: "設定の取得に失敗しました。" });
  } finally {
    client.release();
  }
});

app.put("/api/system-options", async (req, res) => {
  const payload = req.body || {};
  const key = payload.key;
  const options = payload.options;

  if (!key || !options) {
    res.status(400).json({ error: "keyとoptionsが必要です。" });
    return;
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      \`
        INSERT INTO system_options (option_key, options, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (option_key)
        DO UPDATE SET options = EXCLUDED.options, updated_at = NOW()
        RETURNING *
      \`,
      [key, JSON.stringify(options)]
    );
    res.json({ item: rows[0].options });
  } catch (error) {
    console.error("Failed to update system options", error);
    res.status(500).json({ error: "設定の更新に失敗しました。" });
  } finally {
    client.release();
  }
});

// Ensure DB migration on startup`;

if (content.indexOf(target) === -1) {
    const t2 = target.replace(/\n/g, '\r\n');
    const r2 = replace.replace(/\n/g, '\r\n');
    if (content.indexOf(t2) === -1) {
        console.error("Could not find target to replace.");
        process.exit(1);
    } else {
        content = content.replace(t2, r2);
    }
} else {
    content = content.replace(target, replace);
}

fs.writeFileSync('server.js', content, 'utf8');
console.log("Replaced successfully.");
