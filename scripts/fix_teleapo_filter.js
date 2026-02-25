const fs = require('fs');
const path = require('path');

const filePath = path.join('pages', 'teleapo', 'teleapo.js');
let content = fs.readFileSync(filePath, 'utf8');

console.log('--- normalizeCandidateTask Fragment ---');
const start = content.indexOf('function normalizeCandidateTask');
if (start !== -1) {
    console.log(content.substring(start, start + 3000));
}

console.log('--- rebuildCsTaskCandidates Fragment ---');
const start2 = content.indexOf('function rebuildCsTaskCandidates');
if (start2 !== -1) {
    console.log(content.substring(start2, start2 + 500));
}
