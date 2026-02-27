const fs = require('fs');
let content = fs.readFileSync('pages/teleapo/teleapo.js', 'utf8');

// replace addTeleapoCsStatus
let regexAdd = /window\.addTeleapoCsStatus(?:[\s\S]*?)renderTeleapoCsStatusManager\(\);\r?\n\};/;
let newAdd = `window.addTeleapoCsStatus = async function (status) {
  const normalized = normalizeTeleapoCsStatus(status);
  if (!normalized) return;

  const options = buildTeleapoCsStatusOptions();
  if (options.includes(normalized)) {
    window.alert('このステータスは既に存在します');
    return;
  }

  const { custom, deleted } = readTeleapoCsStatusStorage();

  if (deleted.has(normalized)) {
    deleted.delete(normalized);
  } else {
    custom.add(normalized);
  }

  await saveTeleapoCsStatusOptions();
  refreshTeleapoCsStatusSelects();
  renderTeleapoCsStatusManager();
};`;

content = content.replace(regexAdd, newAdd);

// replace restoreTeleapoCsStatus
let regexRestore = /window\.restoreTeleapoCsStatus(?:[\s\S]*?)renderTeleapoCsStatusManager\(\);\r?\n\};/;
let newRestore = `window.restoreTeleapoCsStatus = async function (status) {
  const normalized = normalizeTeleapoCsStatus(status);
  if (!normalized) return;

  const { deleted } = readTeleapoCsStatusStorage();
  if (deleted.has(normalized)) {
    deleted.delete(normalized);
    await saveTeleapoCsStatusOptions();
  }

  refreshTeleapoCsStatusSelects();
  renderTeleapoCsStatusManager();
};`;

content = content.replace(regexRestore, newRestore);

// replace deleteTeleapoCsStatus
let regexDel = /window\.deleteTeleapoCsStatus(?:[\s\S]*?)renderTeleapoCsStatusManager\(\);[\s\S]*?\r?\n\};/;
let newDel = `window.deleteTeleapoCsStatus = async function (status) {
  const normalized = normalizeTeleapoCsStatus(status);
  if (!normalized) return;

  if (!window.confirm(\`「\${normalized}」を削除してもよろしいですか？\n※既に設定済みの候補者のデータには影響しません。\`)) return;

  const { custom, deleted } = readTeleapoCsStatusStorage();

  if (custom.has(normalized)) {
    custom.delete(normalized);
  } else {
    deleted.add(normalized);
  }

  await saveTeleapoCsStatusOptions();
  refreshTeleapoCsStatusSelects();
  renderTeleapoCsStatusManager();
};`;

content = content.replace(regexDel, newDel);


// We also need to call `fetchTeleapoCsStatusOptions()` somewhere during init so that it loads data from DB correctly 
let initRegex = /(async function loadTeleapoData\(\) \{[\s\S]*?)(const fetchLogs)/;
if (content.match(initRegex)) {
    content = content.replace(initRegex, `$1await fetchTeleapoCsStatusOptions();\n  $2`);
} else {
    console.error("Could not inject init");
}

fs.writeFileSync('pages/teleapo/teleapo.js', content, 'utf8');
console.log("Updated add/delete/restore/init methods");
