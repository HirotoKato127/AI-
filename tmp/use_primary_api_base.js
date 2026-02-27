const fs = require('fs');

function updateFile(file) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/'\/api\/system-options\?key=CS_STATUS'/g, '`${PRIMARY_API_BASE}/system-options?key=CS_STATUS`');
    content = content.replace(/'\/api\/system-options'/g, '`${PRIMARY_API_BASE}/system-options`');
    fs.writeFileSync(file, content, 'utf8');
    console.log("Updated", file);
}

updateFile('pages/teleapo/teleapo.js');
updateFile('pages/candidates/candidates.js');
