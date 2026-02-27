const fs = require('fs');
const path = require('path');

const targetPath = 'c:/Users/hirot/OneDrive/ドキュメント/GitHub/AI-/pages/candidates/candidates.js';
let content = fs.readFileSync(targetPath, 'utf8');

const target = `    {
      label: "CSステータス",
      value: candidate.csStatus ?? "",
      input: "select",
      options: buildCsStatusOptions(candidate.csStatus ?? ""),
      path: "csStatus",
      span: 3,
    },`;

let success = true;

const replaceTarget = (t, r, id) => {
    if (!content.includes(t)) {
        console.log(`Could not find ${id}`);
        // try replacing \n with \r\n
        const t2 = t.replace(/\n/g, '\r\n');
        const r2 = r.replace(/\n/g, '\r\n');
        if (content.includes(t2)) {
            content = content.replace(t2, r2);
            console.log(`Replaced ${id} with CRLF`);
        } else {
            console.log(`Failed to replace ${id} even with CRLF`);
            success = false;
        }
    } else {
        content = content.replace(t, r);
        console.log(`Replaced ${id}`);
    }
};

replaceTarget(target, "", "target_cs_status");

if (success) {
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log("Successfully updated candidates.js");
} else {
    process.exit(1);
}
