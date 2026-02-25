const fs = require('fs');
const path = require('path');

const filePath = path.join('pages', 'teleapo', 'teleapo.js');
let content = fs.readFileSync(filePath, 'utf8');

console.log('--- Fixing Corruptions ---');

// 1. Fix the double-single-quote/triple-quote syntax error from PowerShell
//     csStatus: candidate.csStatus ?? candidate.cs_status ?? '''',
content = content.replace(/csStatus: candidate\.csStatus \?\? candidate\.cs_status \?\? ['"]{2,}.*,/g, 'csStatus: candidate.csStatus ?? candidate.cs_status ?? "",');

// 2. Fix encoding corruption for "未接触"
// From inspect_lines.json: "ڐG" or similar
// I will search for the specific pattern seen in normalizeCandidateTask
content = content.replace(/phaseList\.includes\(".*"\) \|\| phaseText === ".*"\)/g, 'phaseList.includes("未接触") || phaseText === "未接触")');

// 3. Ensure the filter is correct (it seemed correct in inspect_lines but let's be sure)
content = content.replace(/\.filter\(\(c\) => c && c\.validApplication && c\.isUncontacted\);/g, '.filter((c) => c && c.validApplication && !c.csStatus);');

fs.writeFileSync(filePath, content, 'utf8');
console.log('File repaired and updated.');
