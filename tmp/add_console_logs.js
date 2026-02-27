const fs = require('fs');
let fileTp = 'pages/teleapo/teleapo.js';
let fileCand = 'pages/candidates/candidates.js';

let tp = fs.readFileSync(fileTp, 'utf8');
tp = tp.replace(
    "if (!res.ok) throw new Error('Failed to save stats');",
    "if (!res.ok) throw new Error('Failed to save stats');\n    console.log('[DEBUG] CSステータス選択肢の保存に成功:', payload);"
);
fs.writeFileSync(fileTp, tp, 'utf8');

let cand = fs.readFileSync(fileCand, 'utf8');
cand = cand.replace(
    "if (!res.ok) throw new Error('Failed to save stats');",
    "if (!res.ok) throw new Error('Failed to save stats');\n    console.log('[DEBUG] CSステータス選択肢の保存に成功 (candidates):', payload);"
);
fs.writeFileSync(fileCand, cand, 'utf8');

console.log("Added console.logs");
