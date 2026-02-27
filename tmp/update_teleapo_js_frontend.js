const fs = require('fs');
const content = fs.readFileSync('pages/teleapo/teleapo.js', 'utf8');

const replacement = `
let cachedTeleapoCsStatus = { custom: new Set(), deleted: new Set() };

async function fetchTeleapoCsStatusOptions() {
  try {
    const res = await fetch('/api/system-options?key=CS_STATUS');
    if (!res.ok) throw new Error('Failed to fetch stats');
    const data = await res.json();
    const options = data.item || { custom: [], deleted: [] };
    
    cachedTeleapoCsStatus.custom = new Set(options.custom || []);
    cachedTeleapoCsStatus.deleted = new Set(options.deleted || []);
  } catch (err) {
    console.error('CSステータスのAPI取得に失敗しました', err);
  }
}

async function saveTeleapoCsStatusOptions() {
  try {
    const payload = {
      key: 'CS_STATUS',
      options: {
        custom: Array.from(cachedTeleapoCsStatus.custom),
        deleted: Array.from(cachedTeleapoCsStatus.deleted)
      }
    };
    const res = await fetch('/api/system-options', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to save stats');
  } catch (err) {
    console.error('CSステータスのAPI登録に失敗しました', err);
  }
}

function readTeleapoCsStatusStorage() {
  // 後方互換性+同期版のためにメモリキャッシュを使用する
  return cachedTeleapoCsStatus;
}
`;

const regex = /function readTeleapoCsStatusStorage\(\) \{[\s\S]*?return \{ custom, deleted \};\r?\n\}/;
const newContent = content.replace(regex, replacement.trim());

fs.writeFileSync('pages/teleapo/teleapo.js', newContent, 'utf8');
console.log("Updated read/fetch mechanics");
